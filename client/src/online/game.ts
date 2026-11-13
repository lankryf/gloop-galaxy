import { decodeSnapshot } from "@gloop/shared/codec/binary.ts";
import { codecFor } from "@gloop/shared/codec/codec.ts";
import type { EntityId, Seq } from "@gloop/shared/ids.ts";
import { seq as toSeq } from "@gloop/shared/ids.ts";
import { Pool, removeWhere } from "@gloop/shared/pool.ts";
import type {
  EntitySnap,
  NetEvent,
  ServerMessageOf,
  ShipSnap,
  Snapshot,
} from "@gloop/shared/protocol.ts";
import { assertNever, packButtons, ShipFlag, TICK_DT } from "@gloop/shared/protocol.ts";
import { ARENA, outside } from "@gloop/shared/sim/arena.ts";
import { BULLET } from "@gloop/shared/sim/bullet.ts";
import { Explosion } from "@gloop/shared/sim/explosion.ts";
import { gravityAt } from "@gloop/shared/sim/gravity.ts";
import { MISSILE } from "@gloop/shared/sim/missile.ts";
import { createRng } from "@gloop/shared/sim/random.ts";
import type { Controls, MovedShip } from "@gloop/shared/sim/ship.ts";
import { BEAM_CHARGE, SHIP, WARP_DELAY, WARP_DISTANCE } from "@gloop/shared/sim/ship.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";
import { WELLS } from "@gloop/shared/sim/well.ts";
import type { Theme } from "../assets/manifest.ts";
import { messageOf } from "../assets/retry.ts";
import type { Audio } from "../audio.ts";
import type { NetOptions } from "../experiments.ts";
import { PICKUP_NAMES } from "../hud.ts";
import type { Input } from "../input.ts";
import type { Loop, LoopStats } from "../loop.ts";
import { createLoop } from "../loop.ts";
import type { Connection } from "../net/connection.ts";
import type { Percentiles } from "../perf.ts";
import { measure, measures, Samples } from "../perf.ts";
import { Blast, drawBlast, drawWarpCharge } from "../render/blast.ts";
import { Camera } from "../render/camera.ts";
import type { View } from "../render/canvas.ts";
import type { ScoreRow, ShipPose, Sprites, Status } from "../render/draw.ts";
import {
  drawAsteroid,
  drawBullet,
  drawCachedBackground,
  drawCourse,
  drawDust,
  drawExplosion,
  drawForming,
  drawMissile,
  drawName,
  drawPickup,
  drawPull,
  drawScores,
  drawShield,
  drawShip,
  drawShipHp,
  drawStatus,
  drawWell,
  hudLines,
  lerp,
  rayToEdge,
  shipFrame,
} from "../render/draw.ts";
import { Minimap } from "../render/minimap.ts";
import { TextPanel } from "../render/panel.ts";
import { debug } from "../ui/debug.ts";
import { SnapshotBuffer } from "./interpolation.ts";
import type { Netgraph } from "./netgraph.ts";
import { createNetgraph } from "./netgraph.ts";
import type { MovingWell, PendingInput } from "./prediction.ts";
import { bodyAt, Predictor, pullAt, toWellField } from "./prediction.ts";
import { WorkerDecoder } from "./worker-decoder.ts";

const REDUNDANCY = 3;
const DRAW_ORDER: readonly EntitySnap["kind"][] = [
  "well",
  "dust",
  "pickup",
  "asteroid",
  "bullet",
  "missile",
  "ship",
];
const HUD_REFRESH_MS = 250;
const WELL_MARGIN = 900;
const PICKUP_RADIUS = 18;
const ENTITY_MARGIN = 120;
const isFinished = (e: { readonly alive: boolean }) => !e.alive;
const isExpired = (e: { readonly ttl: number }) => e.ttl <= 0;
const isDone = (b: Blast) => b.done;

function skillOf(ship: ShipSnap): { skill: string; skillFraction: number } {
  const left = ship.charge / 10;
  if (ship.flags & ShipFlag.warp)
    return { skill: `ВАРП через ${left.toFixed(1)} с`, skillFraction: 1 - left / WARP_DELAY };
  if (!ship.ability) return { skill: "скіла немає", skillFraction: 0 };
  if (ship.ability === "gravity")
    return { skill: `ПРОМІНЬ ${left.toFixed(1)} с [тримай E]`, skillFraction: left / BEAM_CHARGE };
  return { skill: `${PICKUP_NAMES[ship.ability]} [E]`, skillFraction: 1 };
}

function statusOf(ship: ShipSnap): Status {
  return {
    hp: ship.hp,
    maxHp: SHIP.maxHp,
    overheal: SHIP.maxHp * SHIP.overheal,
    heat: ship.heat,
    overheated: (ship.flags & ShipFlag.overheated) !== 0,
    cooling: ship.cooling,
    effects: [
      ship.flags & ShipFlag.shield ? "щит" : "",
      ship.flags & ShipFlag.rapid ? "швидкий вогонь" : "",
      ship.stealth ? "невидимка" : "",
    ]
      .filter(Boolean)
      .join(" · "),
    ...skillOf(ship),
  };
}

interface LocalBullet {
  shot: Seq;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  prevX: number;
  prevY: number;
}

interface Popup {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  ttl: number;
}

export interface OnlineOptions {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: View;
  readonly input: Input;
  readonly audio: Audio | null;
  readonly sprites: Sprites;
  readonly theme: Theme;
  readonly connection: Connection;
  readonly welcome: ServerMessageOf<"welcome">;
  readonly options: NetOptions;
}

export interface OnlineGame {
  readonly loop: Loop;
  readonly predictor: Predictor;
  readonly buffer: SnapshotBuffer;
  readonly netgraph: Netgraph;
  readonly shipId: EntityId;
  readonly measures: () => Record<string, Percentiles>;
  readonly decoding: () => Record<string, Percentiles>;
  stop(): void;
}

const isAlive = (ship: ShipSnap | null): ship is ShipSnap =>
  ship !== null && (ship.flags & ShipFlag.dead) === 0;

export function startOnlineGame({
  ctx,
  view,
  input,
  audio,
  sprites,
  theme,
  connection,
  welcome,
  options,
}: OnlineOptions): OnlineGame {
  const codec = codecFor(welcome.codec);
  const tickMs = 1000 / welcome.tickRate;
  let myShip: EntityId = welcome.shipId;
  const buffer = new SnapshotBuffer({ tickMs, delayMs: options.delayMs });
  const predictor = new Predictor({ dt: TICK_DT });
  const netgraph = createNetgraph();
  const rng = createRng(99);
  const explosions: Explosion[] = [];
  const explosionPool = new Pool(() => new Explosion({ pos: new Vector2(), rng }), 8);
  const popups: Popup[] = [];
  const blasts: Blast[] = [];

  function warpCharge(p: ShipPose, charge: number, now: number): void {
    drawWarpCharge(ctx, p.x, p.y, p.angle, 1 - charge / 10 / WARP_DELAY, WARP_DISTANCE, now);
  }
  const releaseExplosion = (e: Explosion) => explosionPool.release(e);
  netgraph.stats.codec = welcome.codec;
  netgraph.stats.prediction = options.prediction;
  netgraph.stats.netsim = welcome.netsim;
  netgraph.stats.delayMs = options.delayMs;

  let names = new Map<EntityId, string>();
  let seq = 0;
  let me: ShipSnap | null = null;
  let wells: MovingWell[] = [];
  let cooldown = 0;
  let wasDead = false;
  const localBullets: LocalBullet[] = [];
  const bulletPool = new Pool<LocalBullet>(
    () => ({ shot: toSeq(0), x: 0, y: 0, vx: 0, vy: 0, ttl: 0, prevX: 0, prevY: 0 }),
    16,
  );
  const releaseBullet = (b: LocalBullet) => bulletPool.release(b);
  const clearBullets = () => removeWhere(localBullets, () => true, releaseBullet);
  const seenShots = new Set<number>();

  function readControls(): Controls {
    const use = input.isDown("KeyE");
    const beam = use && me?.ability === "gravity" && me.charge > 0;
    return {
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: !beam && (input.isDown("ArrowLeft") || input.isDown("KeyA")),
      right: !beam && (input.isDown("ArrowRight") || input.isDown("KeyD")),
      fire: input.isDown("Space"),
      use,
      boost:
        (input.isDown("ShiftLeft") || input.isDown("ShiftRight")) &&
        !(me && me.flags & ShipFlag.overheated),
    };
  }

  const setNames = (roster: ServerMessageOf<"roster">) => {
    names = new Map(roster.players.map((p) => [p.shipId, p.name]));
  };

  connection.events.on("welcome", (msg) => {
    myShip = msg.shipId;
    predictor.reset();
    clearBullets();
  });
  connection.events.on("roster", setNames);
  if (connection.lastRoster) setNames(connection.lastRoster);
  connection.events.on("pong", ({ t }) => {
    const sample = performance.now() - t;
    netgraph.stats.rtt =
      netgraph.stats.rtt === 0 ? sample : netgraph.stats.rtt * 0.8 + sample * 0.2;
  });
  connection.events.on("netsim", ({ lag, jitter, drop }) => {
    netgraph.stats.netsim = { lag, jitter, drop };
  });

  function popup(text: string, x: number, y: number, ttl = 1.4): void {
    popups.push({ text, x, y, ttl });
  }

  function handleEvent(ev: NetEvent): void {
    switch (ev.type) {
      case "fired":
        if (ev.shipId !== myShip || !options.prediction) {
          audio?.play("shoot", { volume: ev.shipId === myShip ? 0.5 : 0.2 });
        }
        return;
      case "hit":
        audio?.play("hit", { volume: 0.6 });
        return;
      case "exploded":
        if (ev.size >= 5) {
          blasts.push(new Blast(ev.x, ev.y, MISSILE.nuke.blast, "nuke", Math.random));
          audio?.play("explosion", { volume: 1, rate: 0.6 });
          return;
        }
        explosions.push(
          explosionPool.acquire().reset({ pos: new Vector2(ev.x, ev.y), rng, size: ev.size }),
        );
        audio?.play("explosion", { volume: Math.min(1, 0.4 + ev.size * 0.3) });
        return;
      case "scored":
        if (ev.shipId === myShip) popup(`+${ev.points}`, ev.x, ev.y, 1);
        return;
      case "pickup":
        audio?.play("pickup", { volume: 0.7 });
        if (ev.shipId === myShip) popup(PICKUP_NAMES[ev.pickup], ev.x, ev.y);
        return;
      case "swallowed":
        if (ev.what !== "bullet") audio?.play("explosion", { volume: 0.9, rate: 0.45 });
        if (ev.shipId === myShip && ev.what === "ship") popup("НЯМ!", ev.x, ev.y);
        return;
      case "collapsed":
        blasts.push(new Blast(ev.x, ev.y, ev.range, "collapse", Math.random));
        audio?.play("explosion", { volume: 1, rate: 0.3 });
        return;
      case "formed":
        explosions.push(
          explosionPool.acquire().reset({
            pos: new Vector2(ev.x, ev.y),
            rng,
            size: ev.radius / 30,
            color: "#c98b5a",
          }),
        );
        popup("НОВА ПЛАНЕТА!", ev.x, ev.y, 2);
        audio?.play("explosion", { volume: 0.8, rate: 0.5 });
        return;
      case "warped":
        blasts.push(new Blast(ev.x, ev.y, 140, ev.arrive ? "warpIn" : "warpOut", Math.random));
        if (ev.arrive)
          audio?.play("ability", { volume: ev.shipId === myShip ? 0.7 : 0.3, rate: 1.5 });
        return;
      case "ability":
        audio?.play("ability", { volume: ev.shipId === myShip ? 0.8 : 0.4 });
        if (ev.shipId === myShip) popup(PICKUP_NAMES[ev.ability], ev.x, ev.y);
        return;
      default:
        assertNever(ev);
    }
  }

  function onSnapshot(snapshot: Snapshot, size: number): void {
    const now = performance.now();
    if (!buffer.push(snapshot, now)) return;
    netgraph.stats.snapshotBytes = size;
    me = null;
    wells = [];
    const shots = new Set<number>();
    for (const e of snapshot.entities) {
      if (e.kind === "ship" && e.id === myShip) me = e;
      else if (e.kind === "well") wells.push(toWellField(e));
      else if (e.kind === "asteroid") wells.push(bodyAt(e.x, e.y, e.radius));
      else if (e.kind === "pickup") wells.push(bodyAt(e.x, e.y, PICKUP_RADIUS));
      else if (e.kind === "ship" && e.flags & ShipFlag.pull) wells.push(pullAt(e.x, e.y, e.angle));
      else if (e.kind === "bullet" && e.owner === myShip) {
        shots.add(e.shot);
        seenShots.add(e.shot);
      }
    }

    const dead = me !== null && (me.flags & ShipFlag.dead) !== 0;
    if (dead && !wasDead) audio?.play("lose", { volume: 0.8 });
    wasDead = dead;
    if (!isAlive(me)) {
      predictor.reset();
      clearBullets();
    } else if (options.prediction) {
      const ship = me;
      measure("reconcile", () => predictor.reconcile(ship, snapshot.ack, wells));
      netgraph.stats.correction = predictor.lastCorrection;
    } else {
      predictor.trim(snapshot.ack);
    }

    removeWhere(localBullets, (b) => !shots.has(b.shot) && seenShots.has(b.shot), releaseBullet);
    for (const ev of snapshot.events) handleEvent(ev);
  }

  const workerDecoder = options.worker ? new WorkerDecoder(onSnapshot) : null;
  const directDecode = new Samples();
  const camera = new Camera(ARENA);
  const minimap = new Minimap(ARENA);

  connection.events.on("binary", (data) => {
    if (workerDecoder) {
      workerDecoder.decode(data);
      return;
    }
    try {
      const started = performance.now();
      const snapshot = measure("decode", () => decodeSnapshot(data));
      directDecode.push(performance.now() - started);
      onSnapshot(snapshot, data.byteLength);
    } catch (error: unknown) {
      console.warn("bad snapshot", messageOf(error));
    }
  });
  connection.events.on("snapshot", (msg) => {
    onSnapshot(
      { tick: msg.tick, ack: msg.ack, entities: msg.entities, events: msg.events },
      JSON.stringify(msg).length,
    );
  });

  function spawnLocalBullet(state: MovedShip, shot: Seq): void {
    const nose = Vector2.fromAngle(state.angle, SHIP.radius + 8);
    const vel = Vector2.fromAngle(state.angle, BULLET.speed);
    const x = state.x + nose.x;
    const y = state.y + nose.y;
    const b = bulletPool.acquire();
    b.shot = shot;
    b.x = x;
    b.y = y;
    b.prevX = x;
    b.prevY = y;
    b.vx = state.vx + vel.x;
    b.vy = state.vy + vel.y;
    b.ttl = BULLET.ttl;
    localBullets.push(b);
    audio?.play("shoot", { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
  }

  function stepLocalBullets(): void {
    for (const b of localBullets) {
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += b.vx * TICK_DT;
      b.y += b.vy * TICK_DT;
      if (outside(b.x, b.y, BULLET.radius)) b.ttl = 0;
      const { ax, ay } = gravityAt(b.x, b.y, wells);
      b.vx += ax * TICK_DT;
      b.vy += ay * TICK_DT;
      b.ttl -= TICK_DT;
    }
    removeWhere(localBullets, isExpired, releaseBullet);
  }

  function simulate(): void {
    const controls = readControls();
    seq += 1;
    const entry: PendingInput = { seq: toSeq(seq), controls, buttons: packButtons(controls) };

    if (options.prediction && isAlive(me)) {
      predictor.apply(entry, wells);
      cooldown = Math.max(0, cooldown - TICK_DT);
      if (controls.fire && cooldown === 0 && predictor.state && !(me.flags & ShipFlag.overheated)) {
        spawnLocalBullet(predictor.state, entry.seq);
        cooldown = me.flags & ShipFlag.rapid ? SHIP.rapidCooldown : SHIP.fireCooldown;
      }
    } else {
      predictor.pending.push(entry);
    }
    stepLocalBullets();

    const recent = predictor.pending
      .slice(-REDUNDANCY)
      .map(({ seq: s, buttons }) => ({ seq: s, buttons }));
    if (recent.length === 0) recent.push({ seq: entry.seq, buttons: entry.buttons });
    connection.sendRaw(codec.encodeInput(recent));
    input.endStep();
  }

  let lastFrame = performance.now();
  let window1s = {
    at: lastFrame,
    in: connection.bytesIn,
    out: connection.bytesOut,
    samples: 0,
    starved: 0,
  };

  function updateNetgraph(now: number): void {
    if (now - window1s.at >= 1000) {
      const seconds = (now - window1s.at) / 1000;
      netgraph.stats.bytesInPerSec = (connection.bytesIn - window1s.in) / seconds;
      netgraph.stats.bytesOutPerSec = (connection.bytesOut - window1s.out) / seconds;
      netgraph.stats.maxCorrection = Math.max(0, ...predictor.corrections.slice(-30));
      const samples = buffer.samples - window1s.samples;
      netgraph.stats.starved =
        samples > 0 ? (100 * (buffer.starved - window1s.starved)) / samples : 0;
      window1s = {
        at: now,
        in: connection.bytesIn,
        out: connection.bytesOut,
        samples: buffer.samples,
        starved: buffer.starved,
      };
    }
    netgraph.stats.pending = predictor.pending.length;
    netgraph.stats.history = predictor.corrections;
    netgraph.stats.snapshotAge = buffer.latest
      ? now - buffer.lastReceivedAt + netgraph.stats.rtt / 2
      : 0;
    netgraph.stats.delayMs = buffer.delayMs;
  }

  const ownScratch = { x: 0, y: 0, angle: 0, thrust: false };
  const otherScratch = { x: 0, y: 0, angle: 0, thrust: false };
  const bulletScratch = { x: 0, y: 0, angle: 0 };

  function ownPose(alpha: number, ship: ShipSnap): ShipPose {
    const s = predictor.state;
    if (!options.prediction || !s) {
      ownScratch.x = ship.x;
      ownScratch.y = ship.y;
      ownScratch.angle = ship.angle;
      ownScratch.thrust = (ship.flags & ShipFlag.thrust) !== 0;
      return ownScratch;
    }
    const prev = predictor.previous ?? s;
    ownScratch.x = lerp(prev.x, s.x, alpha) + predictor.offset.x;
    ownScratch.y = lerp(prev.y, s.y, alpha) + predictor.offset.y;
    ownScratch.angle = s.angle;
    ownScratch.thrust = s.thrust;
    return ownScratch;
  }

  function drawEntity(e: EntitySnap, now: number): void {
    switch (e.kind) {
      case "well": {
        const config = WELLS[e.type];
        drawWell(
          ctx,
          {
            id: e.id,
            type: e.type,
            range: (config.range * e.radius) / config.radius,
            radius: e.radius,
            mass: e.mass / 10,
            capacity: config.capacity,
          },
          e,
          now,
          sprites,
        );
        return;
      }
      case "pickup":
        drawPickup(ctx, { pos: e, type: e.type, age: now / 1000 + e.id, radius: 18 }, sprites);
        return;
      case "asteroid":
        drawAsteroid(ctx, e, e, sprites);
        drawForming(ctx, e, e.radius, e.forming / 100, now);
        return;
      case "bullet":
        if (!(options.prediction && e.owner === myShip)) {
          bulletScratch.x = e.x;
          bulletScratch.y = e.y;
          bulletScratch.angle = Math.atan2(e.vy, e.vx);
          drawBullet(ctx, bulletScratch, sprites, e.owner === myShip);
        }
        return;
      case "missile":
        drawMissile(
          ctx,
          { x: e.x, y: e.y, angle: Math.atan2(e.vy, e.vx), type: e.type },
          now,
          sprites,
        );
        return;
      case "ship": {
        if (e.id === myShip || e.flags & ShipFlag.dead) return;
        const p = otherScratch;
        p.x = e.x;
        p.y = e.y;
        p.angle = e.angle;
        p.thrust = (e.flags & ShipFlag.thrust) !== 0;
        if (e.flags & ShipFlag.pull) drawPull(ctx, p, now);
        if (e.flags & ShipFlag.warp) warpCharge(p, e.charge, now);
        drawShip(
          ctx,
          p,
          now,
          false,
          sprites,
          shipFrame(e.id, false, (e.flags & ShipFlag.bot) !== 0),
          e.heat / 100,
        );
        drawShipHp(ctx, p.x, p.y, e.hp, SHIP.maxHp);
        if (e.flags & ShipFlag.shield) drawShield(ctx, p, sprites);
        drawName(
          ctx,
          names.get(e.id) ?? (e.flags & ShipFlag.bot ? "манекен" : "?"),
          p.x,
          p.y,
          false,
        );
        return;
      }
      case "dust":
        drawDust(ctx, e, e.id, now, sprites);
        return;
      default:
        assertNever(e);
    }
  }

  const hud = new TextPanel({
    width: 220,
    lineHeight: 18,
    font: "14px ui-monospace, Menlo, monospace",
    color: "#8dff3a",
    padding: 10,
  });
  let hudAt = Number.NEGATIVE_INFINITY;

  function buildHud(stats: LoopStats): string[] {
    return hudLines(stats, [
      `build    ${__APP_VERSION__} ${__COMMIT__}`,
      `tick     ${buffer.latest?.tick ?? 0}`,
      `entities ${buffer.latest?.entities.length ?? 0}`,
    ]);
  }

  function scoreRows(entities: readonly EntitySnap[]): ScoreRow[] {
    const rows: ScoreRow[] = [];
    for (const e of entities) {
      if (e.kind !== "ship") continue;
      const name = names.get(e.id);
      if (!name) continue;
      rows.push({ name, score: e.score, own: e.id === myShip });
    }
    return rows.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function drawRespawn(ship: ShipSnap): void {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.font = "bold 28px sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1a0b26";
    ctx.fillStyle = "#ff7ad9";
    const text = `Повернення через ${(ship.respawn / 10).toFixed(1)} с`;
    ctx.strokeText(text, view.width / 2, view.height / 2 - 60);
    ctx.fillText(text, view.width / 2, view.height / 2 - 60);
    ctx.textAlign = "start";
  }

  function drawMinimap(entities: readonly EntitySnap[], pose: ShipPose | null): void {
    minimap.begin(ctx, view);
    for (const e of entities) {
      switch (e.kind) {
        case "well":
          minimap.dot(
            ctx,
            e,
            e.type === "blackhole" ? 3 : 5,
            e.type === "blackhole" ? "#ffb347" : "#a868c8",
          );
          minimap.ring(
            ctx,
            e,
            WELLS[e.type].range,
            e.type === "blackhole" ? "rgba(199, 125, 255, 0.5)" : "rgba(168, 104, 200, 0.35)",
          );
          break;
        case "asteroid":
          minimap.dot(ctx, e, 1.5, "#8a7d99");
          break;
        case "pickup":
          minimap.dot(ctx, e, 2, "#ffd84d");
          break;
        case "ship":
          if (e.id !== myShip && !(e.flags & ShipFlag.dead) && !e.stealth)
            minimap.dot(ctx, e, 3, "#ff9f1c");
          break;
        case "missile":
          minimap.dot(ctx, e, e.type === "nuke" ? 3 : 2, "#ff4f4f");
          if (e.type === "nuke") {
            const angle = Math.atan2(e.vy, e.vx);
            const length = rayToEdge(e.x, e.y, angle, ARENA);
            minimap.course(
              ctx,
              e,
              { x: e.x + Math.cos(angle) * length, y: e.y + Math.sin(angle) * length },
              "rgba(255, 210, 63, 0.8)",
            );
          }
          break;
        case "bullet":
        case "dust":
          break;
        default:
          assertNever(e);
      }
    }
    if (pose) {
      const length = rayToEdge(pose.x, pose.y, pose.angle, ARENA);
      minimap.course(
        ctx,
        pose,
        { x: pose.x + Math.cos(pose.angle) * length, y: pose.y + Math.sin(pose.angle) * length },
        me?.ability === "nuke" ? "rgba(255, 210, 63, 0.95)" : "rgba(141, 255, 58, 0.6)",
      );
    }
    if (pose) minimap.dot(ctx, pose, 3.5, "#8dff3a");
    const self = me;
    if (pose && self && self.flags & ShipFlag.warp) {
      minimap.target(
        ctx,
        pose,
        {
          x: pose.x + Math.cos(pose.angle) * WARP_DISTANCE,
          y: pose.y + Math.sin(pose.angle) * WARP_DISTANCE,
        },
        performance.now(),
      );
    }
    minimap.viewport(ctx, camera);
  }

  function render(alpha: number, stats: LoopStats): void {
    const now = performance.now();
    const frameSeconds = (now - lastFrame) / 1000;
    lastFrame = now;
    predictor.decay(frameSeconds);
    updateNetgraph(now);

    const sampled = buffer.sample(now);
    const self = me;
    const pose = isAlive(self) ? ownPose(alpha, self) : null;
    if (pose) camera.follow(pose.x, pose.y);
    camera.begin(ctx, view);
    drawCachedBackground(ctx, ARENA, view, theme, sprites, camera);
    camera.border(ctx);
    for (const e of sampled.entities) {
      if (e.kind === "missile" && e.type === "nuke")
        drawCourse(ctx, e.x, e.y, Math.atan2(e.vy, e.vx), ARENA, now);
    }
    if (pose)
      drawCourse(
        ctx,
        pose.x,
        pose.y,
        pose.angle,
        ARENA,
        now,
        self?.ability === "nuke" ? 0.5 : 0.22,
      );
    for (const kind of DRAW_ORDER) {
      const margin = kind === "well" ? WELL_MARGIN : ENTITY_MARGIN;
      for (const e of sampled.entities) {
        if (e.kind !== kind || !camera.place(e.x, e.y, margin)) continue;
        drawEntity(e, now);
      }
    }
    for (const b of localBullets) {
      bulletScratch.x = lerp(b.prevX, b.x, alpha);
      bulletScratch.y = lerp(b.prevY, b.y, alpha);
      bulletScratch.angle = Math.atan2(b.vy, b.vx);
      if (!camera.place(bulletScratch.x, bulletScratch.y)) continue;
      drawBullet(ctx, bulletScratch, sprites);
    }

    if (isAlive(self) && pose) {
      if (self.flags & ShipFlag.pull) drawPull(ctx, pose, now);
      if (self.flags & ShipFlag.warp) warpCharge(pose, self.charge, now);
      if (self.stealth) ctx.globalAlpha = 0.55;
      drawShip(ctx, pose, now, true, sprites, "player", self.heat / 100);
      ctx.globalAlpha = 1;
      if (self.flags & ShipFlag.shield) drawShield(ctx, pose, sprites);
      drawName(ctx, names.get(myShip) ?? "ти", pose.x, pose.y, true);
    }

    for (const e of explosions) {
      e.update(frameSeconds);
      if (!camera.place(e.pos.x, e.pos.y)) continue;
      drawExplosion(ctx, e);
    }
    removeWhere(explosions, isFinished, releaseExplosion);
    for (const b of blasts) {
      b.update(frameSeconds);
      if (camera.place(b.x, b.y, b.radius)) drawBlast(ctx, b);
    }
    removeWhere(blasts, isDone);
    ctx.textAlign = "center";
    for (const p of popups) {
      p.ttl -= frameSeconds;
      if (!camera.place(p.x, p.y)) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.ttl * 2));
      ctx.font = "bold 26px sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#1a0b26";
      ctx.fillStyle = "#8dff3a";
      ctx.strokeText(p.text, p.x, p.y - (1.4 - p.ttl) * 40);
      ctx.fillText(p.text, p.x, p.y - (1.4 - p.ttl) * 40);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
    removeWhere(popups, isExpired);

    const scoresBottom = drawScores(ctx, view, scoreRows(sampled.entities));
    if (debug.on) {
      if (now - hudAt >= HUD_REFRESH_MS) {
        hud.update(buildHud(stats), view.dpr);
        hudAt = now;
      }
      const top = scoresBottom + 10;
      ctx.fillStyle = "rgba(20, 8, 36, 0.7)";
      ctx.fillRect(10, top, hud.style.width, hud.height + 10);
      hud.draw(ctx, 10, top);
      if (options.netgraph) netgraph.draw(ctx, view);
    }
    drawMinimap(sampled.entities, pose);
    if (isAlive(self)) drawStatus(ctx, view, statusOf(self), now);
    else if (self) drawRespawn(self);
  }

  const pinger = window.setInterval(() => connection.send("ping", { t: performance.now() }), 1000);
  const listeners = new AbortController();

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "F2") {
        e.preventDefault();
        connection.send("netsim", netgraph.nextPreset());
      } else if (e.code === "BracketLeft") {
        buffer.delayMs = Math.max(0, buffer.delayMs - 16);
      } else if (e.code === "BracketRight") {
        buffer.delayMs = Math.min(500, buffer.delayMs + 16);
      }
    },
    { signal: listeners.signal },
  );

  const loop = createLoop({
    step: TICK_DT,
    simulate: () => measure("simulate", simulate),
    render: (alpha, stats) => measure("render", () => render(alpha, stats)),
  });
  loop.start();
  return {
    loop,
    predictor,
    buffer,
    netgraph,
    measures,
    stop() {
      loop.stop();
      clearInterval(pinger);
      listeners.abort();
      workerDecoder?.stop();
    },
    decoding: () =>
      workerDecoder
        ? {
            mainThread: workerDecoder.mainThread.percentiles(),
            latency: workerDecoder.latency.percentiles(),
          }
        : { mainThread: directDecode.percentiles(), latency: directDecode.percentiles() },
    get shipId() {
      return myShip;
    },
  };
}
