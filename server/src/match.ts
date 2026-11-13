import { ARENAS, populate } from "@gloop/shared/arenas.ts";
import * as binary from "@gloop/shared/codec/binary.ts";
import type { CodecName } from "@gloop/shared/codec/codec.ts";
import { jsonCodec } from "@gloop/shared/codec/codec.ts";
import type { EntityId, Seq, Tick } from "@gloop/shared/ids.ts";
import { seq, tick } from "@gloop/shared/ids.ts";
import type { EntitySnap, InputRecord, NetEvent, Snapshot } from "@gloop/shared/protocol.ts";
import {
  assertNever,
  ShipFlag,
  TICK_DT,
  TICK_RATE,
  unpackButtons,
} from "@gloop/shared/protocol.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import type { AnyEntity } from "@gloop/shared/sim/kinds.ts";
import { Ship } from "@gloop/shared/sim/ship.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";
import { World } from "@gloop/shared/sim/world.ts";
import type { PlayerInput } from "./bot.ts";
import { metrics } from "./metrics.ts";
import type { Deliver, Player, Room } from "./rooms.ts";

const MAX_QUEUE = 8;
const MAX_INPUTS_PER_TICK = 4;

interface Entry {
  readonly player: Player;
  readonly ship: Ship;
  readonly codec: CodecName;
  readonly send: Deliver;
  readonly queue: InputRecord[];
  lastSeq: Seq;
  received: number;
}

export interface MatchStats {
  readonly room: string;
  readonly tick: number;
  readonly players: number;
  readonly entities: number;
  readonly tickMs: { readonly p50: number; readonly p99: number; readonly max: number };
  readonly intervalMs: { readonly mean: number; readonly jitter: number };
}

function flagsOf(ship: Ship): number {
  let flags = 0;
  if (ship.thrust) flags |= ShipFlag.thrust;
  if (ship.dead) flags |= ShipFlag.dead;
  if (ship.effects.has("shield")) flags |= ShipFlag.shield;
  if (ship.effects.has("rapid")) flags |= ShipFlag.rapid;
  if (ship.effects.has("homing")) flags |= ShipFlag.homing;
  if (ship.beaming) flags |= ShipFlag.pull;
  if (ship.warpIn > 0) flags |= ShipFlag.warp;
  if (!ship.inputDriven) flags |= ShipFlag.bot;
  return flags;
}

function snapshotOf(e: AnyEntity): EntitySnap | null {
  const base = { id: e.id, x: e.pos.x, y: e.pos.y };
  switch (e.kind) {
    case "ship":
      return {
        ...base,
        kind: "ship",
        vx: e.vel.x,
        vy: e.vel.y,
        angle: e.angle,
        hp: e.hp,
        flags: flagsOf(e),
        score: Math.min(e.score, 0xffff),
        respawn: e.dead ? Math.max(0, Math.ceil(e.respawnIn * 10)) : 0,
        ability: e.ability,
        charge: Math.min(255, Math.ceil((e.ability === "gravity" ? e.charge : e.warpIn) * 10)),
      };
    case "missile":
      return { ...base, kind: "missile", vx: e.vel.x, vy: e.vel.y, owner: e.ownerId, type: e.type };
    case "bullet":
      return { ...base, kind: "bullet", vx: e.vel.x, vy: e.vel.y, owner: e.ownerId, shot: e.shot };
    case "asteroid":
      return {
        ...base,
        kind: "asteroid",
        angle: e.angle,
        radius: Math.round(e.radius),
        hunter: e.hunter,
      };
    case "pickup":
      return { ...base, kind: "pickup", type: e.type };
    case "well":
      return {
        ...base,
        kind: "well",
        vx: e.vel.x,
        vy: e.vel.y,
        angle: e.angle,
        type: e.type,
        mass: Math.min(0xffff, Math.round(e.mass * 10)),
      };
    case "explosion":
      return null;
    default:
      return assertNever(e);
  }
}

export function snapshotEntities(world: World): EntitySnap[] {
  const out: EntitySnap[] = [];
  for (const e of world) {
    if (!e.alive) continue;
    const snap = snapshotOf(e);
    if (snap) out.push(snap);
  }
  return out;
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

export class Match {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #nextTickAt = 0;
  #events: NetEvent[] = [];
  #durations: number[] = [];
  #intervals: number[] = [];
  #lastTickAt = 0;
  readonly room: Room;
  readonly world: World;
  readonly players = new Map<string, Entry>();
  readonly bots = new Map<string, PlayerInput>();
  tick: Tick = tick(0);

  constructor({ room }: { room: Room }) {
    const arena = ARENAS[room.arena];
    this.room = room;
    this.world = new World({ seed: arena.seed });
    populate(this.world, arena);
    const spot = this.world.findSafeSpot(40, ARENA);
    const dummy = this.world.spawn(
      new Ship({ pos: new Vector2(spot.x, spot.y), angle: 0, name: "манекен" }),
    );
    dummy.controls = { thrust: true, left: true, right: false, fire: false };
    this.#listen();
  }

  #listen(): void {
    const events = this.world.events;
    const push = (event: NetEvent) => this.#events.push(event);
    events.on("fired", (d) => push({ type: "fired", x: d.x, y: d.y, shipId: d.shipId }));
    events.on("hit", (d) =>
      push({ type: "hit", x: d.x, y: d.y, target: d.target, shipId: d.shipId ?? null }),
    );
    events.on("exploded", (d) => push({ type: "exploded", x: d.x, y: d.y, size: d.size }));
    events.on("scored", (d) =>
      push({ type: "scored", x: d.x, y: d.y, shipId: d.shipId, points: d.points }),
    );
    events.on("pickup", (d) =>
      push({ type: "pickup", x: d.x, y: d.y, shipId: d.shipId, pickup: d.type }),
    );
    events.on("swallowed", (d) =>
      push({ type: "swallowed", x: d.x, y: d.y, what: d.kind, shipId: d.shipId ?? null }),
    );
    events.on("collapsed", (d) => push({ type: "collapsed", x: d.x, y: d.y, range: d.range }));
    events.on("warped", (d) =>
      push({ type: "warped", x: d.x, y: d.y, shipId: d.shipId, arrive: d.arrive }),
    );
    events.on("ability", (d) =>
      push({ type: "ability", x: d.x, y: d.y, shipId: d.shipId, ability: d.ability }),
    );
  }

  addPlayer(player: Player, { codec, send }: { codec: CodecName; send: Deliver }): EntityId {
    const spot = this.world.findSafeSpot(40, ARENA);
    const ship = this.world.spawn(
      new Ship({ pos: new Vector2(spot.x, spot.y), name: player.name, inputDriven: true }),
    );
    this.players.set(player.id, {
      player,
      ship,
      codec,
      send,
      queue: [],
      lastSeq: seq(0),
      received: 0,
    });
    return ship.id;
  }

  addBot(player: Player, bot: PlayerInput): EntityId {
    this.bots.set(player.id, bot);
    return this.addPlayer(player, { codec: "binary", send: () => {} });
  }

  removePlayer(playerId: string): void {
    this.bots.delete(playerId);
    const entry = this.players.get(playerId);
    if (!entry) return;
    entry.ship.alive = false;
    this.players.delete(playerId);
  }

  receiveInputs(playerId: string, inputs: readonly InputRecord[]): void {
    const entry = this.players.get(playerId);
    if (!entry) return;
    for (const input of inputs) {
      if (input.seq <= entry.received) continue;
      entry.received = input.seq;
      entry.queue.push(input);
    }
    while (entry.queue.length > MAX_QUEUE) {
      const dropped = entry.queue.shift();
      if (dropped) entry.lastSeq = dropped.seq;
    }
  }

  start(): void {
    this.#running = true;
    this.#nextTickAt = performance.now();
    this.#lastTickAt = this.#nextTickAt;
    this.#schedule();
  }

  stop(): void {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule(): void {
    this.#nextTickAt += 1000 / TICK_RATE;
    const wait = Math.max(0, this.#nextTickAt - performance.now());
    this.#timer = setTimeout(() => this.#onTick(), wait);
  }

  #onTick(): void {
    const started = performance.now();
    this.#intervals.push(started - this.#lastTickAt);
    this.#lastTickAt = started;
    if (started - this.#nextTickAt > 1000) this.#nextTickAt = started;

    this.step();

    const duration = performance.now() - started;
    this.#durations.push(duration);
    metrics.tickSeconds.observe(duration / 1000);
    if (this.#durations.length > 300) this.#durations.shift();
    if (this.#intervals.length > 300) this.#intervals.shift();
    if (this.#running) this.#schedule();
  }

  step(): void {
    for (const [id, bot] of this.bots) {
      const ship = this.players.get(id)?.ship;
      if (ship) this.receiveInputs(id, [bot.think(this.world, ship)]);
    }
    for (const entry of this.players.values()) {
      for (let n = 0; n < MAX_INPUTS_PER_TICK; n++) {
        const input = entry.queue.shift();
        if (!input) break;
        entry.lastSeq = input.seq;
        entry.ship.steer(unpackButtons(input.buttons), TICK_DT, this.world, input.seq);
      }
    }
    this.world.step(TICK_DT);
    this.tick = tick(this.tick + 1);
    this.#broadcast();
  }

  #broadcast(): void {
    const snapshot: Snapshot = {
      tick: this.tick,
      ack: seq(0),
      entities: snapshotEntities(this.world),
      events: this.#events,
    };
    this.#events = [];
    let encoded: ArrayBuffer | null = null;
    for (const [id, entry] of this.players) {
      if (this.bots.has(id)) continue;
      if (entry.codec === "json") {
        entry.send(jsonCodec.encodeSnapshot({ ...snapshot, ack: entry.lastSeq }), {
          kind: "snapshot",
        });
        continue;
      }
      encoded ??= binary.encodeSnapshot(snapshot);
      const copy = encoded.slice(0);
      binary.setAck(copy, entry.lastSeq);
      entry.send(copy, { kind: "snapshot" });
    }
  }

  stats(): MatchStats {
    const durations = [...this.#durations].sort((a, b) => a - b);
    const intervals = this.#intervals;
    const count = intervals.length || 1;
    const mean = intervals.reduce((a, b) => a + b, 0) / count;
    const jitter = Math.sqrt(intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / count);
    return {
      room: this.room.id,
      tick: this.tick,
      players: this.players.size,
      entities: this.world.size,
      tickMs: {
        p50: Number(percentile(durations, 0.5).toFixed(3)),
        p99: Number(percentile(durations, 0.99).toFixed(3)),
        max: Number((durations.at(-1) ?? 0).toFixed(3)),
      },
      intervalMs: { mean: Number(mean.toFixed(2)), jitter: Number(jitter.toFixed(2)) },
    };
  }
}
