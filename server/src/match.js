import { ARENAS } from "@gloop/shared/arenas.js";
import * as binary from "@gloop/shared/codec/binary.js";
import * as json from "@gloop/shared/codec/json.js";
import {
  EventType,
  Kind,
  PICKUPS,
  ShipFlag,
  SWALLOWED,
  TICK_DT,
  TICK_RATE,
  unpackButtons,
  WELL_TYPES,
} from "@gloop/shared/protocol.js";
import { ARENA } from "@gloop/shared/sim/arena.js";
import { Asteroid } from "@gloop/shared/sim/asteroid.js";
import { Pickup } from "@gloop/shared/sim/pickup.js";
import { Ship } from "@gloop/shared/sim/ship.js";
import { Vector2 } from "@gloop/shared/sim/vector.js";
import { GravityWell } from "@gloop/shared/sim/well.js";
import { World } from "@gloop/shared/sim/world.js";

const MAX_QUEUE = 8;
const MAX_INPUTS_PER_TICK = 4;

function flagsOf(ship) {
  let flags = 0;
  if (ship.thrust) flags |= ShipFlag.thrust;
  if (ship.dead) flags |= ShipFlag.dead;
  if (ship.effects.has("shield")) flags |= ShipFlag.shield;
  if (ship.effects.has("rapid")) flags |= ShipFlag.rapid;
  if (ship.effects.has("homing")) flags |= ShipFlag.homing;
  if (!ship.inputDriven) flags |= ShipFlag.bot;
  return flags;
}

export function snapshotEntities(world) {
  const out = [];
  for (const e of world) {
    if (!e.alive) continue;
    const base = { id: e.id, x: e.pos.x, y: e.pos.y };
    switch (e.kind) {
      case "ship":
        out.push({
          ...base,
          kind: Kind.ship,
          vx: e.vel.x,
          vy: e.vel.y,
          angle: e.angle,
          hp: e.hp,
          flags: flagsOf(e),
          score: Math.min(e.score, 0xffff),
          respawn: e.dead ? Math.max(0, Math.ceil(e.respawnIn * 10)) : 0,
        });
        break;
      case "bullet":
        out.push({
          ...base,
          kind: Kind.bullet,
          vx: e.vel.x,
          vy: e.vel.y,
          owner: e.ownerId,
          shot: e.shot,
        });
        break;
      case "asteroid":
        out.push({
          ...base,
          kind: Kind.asteroid,
          angle: e.angle,
          radius: Math.round(e.radius),
          hunter: Boolean(e.hunter),
        });
        break;
      case "pickup":
        out.push({ ...base, kind: Kind.pickup, type: PICKUPS.indexOf(e.type) });
        break;
      case "well":
        out.push({
          ...base,
          kind: Kind.well,
          vx: e.vel.x,
          vy: e.vel.y,
          angle: e.angle,
          type: WELL_TYPES.indexOf(e.type),
          timeLeft: Math.min(
            0xffff,
            Math.max(0, Math.round(Number.isFinite(e.timeLeft) ? e.timeLeft * 10 : 0xffff)),
          ),
        });
        break;
    }
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export class Match {
  #timer = null;
  #nextTickAt = 0;
  #events = [];
  #durations = [];
  #intervals = [];
  #lastTickAt = 0;

  constructor({ room, logger }) {
    const arena = ARENAS[room.arena] ?? ARENAS.nebula;
    this.room = room;
    this.logger = logger;
    this.tick = 0;
    this.players = new Map();
    this.world = new World({ seed: arena.seed });
    this.#populate(arena);
    this.#listen();
  }

  #populate(arena) {
    const world = this.world;
    for (const config of arena.wells) world.spawn(GravityWell.fromConfig(config));
    for (let i = 0; i < arena.asteroids; i++) world.spawn(Asteroid.random(world.rng, ARENA, world));
    for (let i = 0; i < arena.pickups; i++) world.spawn(Pickup.random(world, ARENA));
    const spot = world.findSafeSpot(40, ARENA);
    const dummy = world.spawn(
      new Ship({ pos: new Vector2(spot.x, spot.y), angle: 0, name: "манекен" }),
    );
    dummy.controls = { thrust: true, left: true, right: false, fire: false };
  }

  #listen() {
    const add = (type, map) => {
      this.world.addEventListener(type, (e) => {
        const d = e.detail;
        this.#events.push({ type: EventType[type], x: d.x ?? 0, y: d.y ?? 0, ...map(d) });
      });
    };
    add("fired", (d) => ({ a: d.shipId, b: 0 }));
    add("hit", (d) => ({ a: d.shipId ?? 0, b: d.target === "ship" ? 1 : 0 }));
    add("exploded", (d) => ({ a: 0, b: Math.min(255, Math.round(d.size * 10)) }));
    add("scored", (d) => ({ a: d.shipId, b: Math.min(255, Math.round(d.points / 10)) }));
    add("pickup", (d) => ({ a: d.shipId, b: PICKUPS.indexOf(d.type) }));
    add("swallowed", (d) => ({ a: d.shipId ?? 0, b: SWALLOWED.indexOf(d.kind) }));
    add("collapsed", () => ({ a: 0, b: 0 }));
  }

  addPlayer(player, { codec = "binary", send }) {
    const spot = this.world.findSafeSpot(40, ARENA);
    const ship = this.world.spawn(
      new Ship({ pos: new Vector2(spot.x, spot.y), name: player.name, inputDriven: true }),
    );
    this.players.set(player.id, { player, ship, codec, send, queue: [], lastSeq: 0, received: 0 });
    return ship;
  }

  removePlayer(playerId) {
    const entry = this.players.get(playerId);
    if (!entry) return;
    entry.ship.alive = false;
    this.players.delete(playerId);
  }

  receiveInputs(playerId, inputs) {
    const entry = this.players.get(playerId);
    if (!entry) return;
    for (const input of inputs) {
      if (input.seq <= entry.received) continue;
      entry.received = input.seq;
      entry.queue.push(input);
    }
    while (entry.queue.length > MAX_QUEUE) entry.lastSeq = entry.queue.shift().seq;
  }

  start() {
    this.#nextTickAt = performance.now();
    this.#lastTickAt = this.#nextTickAt;
    this.#schedule();
  }

  stop() {
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #schedule() {
    this.#nextTickAt += 1000 / TICK_RATE;
    const wait = Math.max(0, this.#nextTickAt - performance.now());
    this.#timer = setTimeout(() => this.#onTick(), wait);
  }

  #onTick() {
    const started = performance.now();
    this.#intervals.push(started - this.#lastTickAt);
    this.#lastTickAt = started;
    if (started - this.#nextTickAt > 1000) this.#nextTickAt = started;

    this.step();

    this.#durations.push(performance.now() - started);
    if (this.#durations.length > 300) this.#durations.shift();
    if (this.#intervals.length > 300) this.#intervals.shift();
    if (this.#timer !== null) this.#schedule();
  }

  step() {
    for (const entry of this.players.values()) {
      for (let n = 0; n < MAX_INPUTS_PER_TICK && entry.queue.length > 0; n++) {
        const input = entry.queue.shift();
        entry.lastSeq = input.seq;
        entry.ship.steer(unpackButtons(input.buttons), TICK_DT, this.world, input.seq);
      }
    }
    this.world.step(TICK_DT);
    this.tick += 1;
    this.#broadcast();
  }

  #broadcast() {
    const snapshot = {
      tick: this.tick,
      ack: 0,
      entities: snapshotEntities(this.world),
      events: this.#events,
    };
    this.#events = [];
    let encoded = null;
    for (const entry of this.players.values()) {
      if (entry.codec === "json") {
        entry.send(json.encodeSnapshot({ ...snapshot, ack: entry.lastSeq }), { kind: "snapshot" });
        continue;
      }
      encoded ??= binary.encodeSnapshot(snapshot);
      const copy = encoded.slice(0);
      binary.setAck(copy, entry.lastSeq);
      entry.send(copy, { kind: "snapshot" });
    }
  }

  get stats() {
    const durations = [...this.#durations].sort((a, b) => a - b);
    const intervals = [...this.#intervals];
    const mean = intervals.reduce((a, b) => a + b, 0) / (intervals.length || 1);
    const jitter = Math.sqrt(
      intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / (intervals.length || 1),
    );
    return {
      room: this.room.id,
      tick: this.tick,
      players: this.players.size,
      entities: this.world.size,
      tickMs: {
        p50: +percentile(durations, 0.5).toFixed(3),
        p99: +percentile(durations, 0.99).toFixed(3),
        max: +(durations.at(-1) ?? 0).toFixed(3),
      },
      intervalMs: { mean: +mean.toFixed(2), jitter: +jitter.toFixed(2) },
    };
  }
}
