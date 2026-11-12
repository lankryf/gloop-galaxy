import * as binary from "@gloop/shared/codec/binary.js";
import * as json from "@gloop/shared/codec/json.js";
import {
  EventName,
  Kind,
  PICKUPS,
  packButtons,
  ShipFlag,
  SWALLOWED,
  TICK_DT,
  WELL_TYPES,
} from "@gloop/shared/protocol.js";
import { ARENA, wrap } from "@gloop/shared/sim/arena.js";
import { BULLET } from "@gloop/shared/sim/bullet.js";
import { Explosion } from "@gloop/shared/sim/explosion.js";
import { gravityAt } from "@gloop/shared/sim/gravity.js";
import { createRng } from "@gloop/shared/sim/random.js";
import { SHIP } from "@gloop/shared/sim/ship.js";
import { Vector2 } from "@gloop/shared/sim/vector.js";
import { WELLS } from "@gloop/shared/sim/well.js";
import { createLoop } from "../loop.js";
import { beginFrame } from "../render/canvas.js";
import {
  drawAsteroid,
  drawBackground,
  drawBullet,
  drawExplosion,
  drawHud,
  drawName,
  drawPickup,
  drawShield,
  drawShip,
  drawWell,
  lerpWrapped,
} from "../render/draw.js";
import { SnapshotBuffer } from "./interpolation.js";
import { createNetgraph } from "./netgraph.js";
import { Predictor } from "./prediction.js";

const REDUNDANCY = 3;

function toWellField(e) {
  const config = WELLS[WELL_TYPES[e.type]];
  return {
    x: e.x,
    y: e.y,
    vx: e.vx,
    vy: e.vy,
    radius: config.radius,
    range: config.range,
    strength: config.strength,
  };
}

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
}) {
  const codec = welcome.codec === "json" ? json : binary;
  const tickMs = 1000 / welcome.tickRate;
  let myShip = welcome.shipId;
  const buffer = new SnapshotBuffer({ tickMs, delayMs: options.delayMs });
  const predictor = new Predictor({ dt: TICK_DT });
  const netgraph = createNetgraph();
  const fx = { rng: createRng(99), explosions: [], popups: [] };
  netgraph.stats.codec = welcome.codec;
  netgraph.stats.prediction = options.prediction;
  netgraph.stats.netsim = welcome.netsim;
  netgraph.stats.delayMs = options.delayMs;

  let names = new Map();
  let seq = 0;
  let me = null;
  let wells = [];
  let cooldown = 0;
  let localBullets = [];
  const seenShots = new Set();

  function readControls() {
    return {
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
    };
  }

  connection.addEventListener("welcome", (e) => {
    myShip = e.detail.shipId;
    predictor.reset();
    localBullets = [];
  });
  connection.addEventListener("roster", (e) => {
    names = new Map(e.detail.players.map((p) => [p.shipId, p.name]));
  });
  if (connection.last.get("roster")) {
    names = new Map(connection.last.get("roster").players.map((p) => [p.shipId, p.name]));
  }
  connection.addEventListener("pong", (e) => {
    const sample = performance.now() - e.detail.t;
    netgraph.stats.rtt =
      netgraph.stats.rtt === 0 ? sample : netgraph.stats.rtt * 0.8 + sample * 0.2;
  });
  connection.addEventListener("netsim", (e) => {
    netgraph.stats.netsim = e.detail;
  });

  function onSnapshot(snapshot, size) {
    const now = performance.now();
    if (!buffer.push(snapshot, now)) return;
    netgraph.stats.snapshotBytes = size;
    me = snapshot.entities.find((e) => e.id === myShip) ?? null;
    wells = snapshot.entities.filter((e) => e.kind === Kind.well).map(toWellField);

    const alive = me && (me.flags & ShipFlag.dead) === 0;
    if (!alive) {
      predictor.reset();
      localBullets = [];
    } else if (options.prediction) {
      predictor.reconcile(me, snapshot.ack, wells);
      netgraph.stats.correction = predictor.lastCorrection;
    }

    const shots = new Set();
    for (const e of snapshot.entities) {
      if (e.kind === Kind.bullet && e.owner === myShip) {
        shots.add(e.shot);
        seenShots.add(e.shot);
      }
    }
    localBullets = localBullets.filter((b) => shots.has(b.shot) || !seenShots.has(b.shot));

    for (const ev of snapshot.events) handleEvent(ev);
  }

  function handleEvent(ev) {
    const type = EventName[ev.type];
    const pos = new Vector2(ev.x, ev.y);
    switch (type) {
      case "fired":
        if (ev.a !== myShip || !options.prediction)
          audio?.play("shoot", { volume: ev.a === myShip ? 0.5 : 0.2 });
        break;
      case "hit":
        audio?.play("hit", { volume: 0.6 });
        break;
      case "exploded":
        fx.explosions.push(new Explosion({ pos, rng: fx.rng, size: ev.b / 10 }));
        audio?.play("explosion", { volume: Math.min(1, 0.4 + (ev.b / 10) * 0.3) });
        break;
      case "scored":
        if (ev.a === myShip) fx.popups.push({ text: `+${ev.b * 10}`, x: ev.x, y: ev.y, ttl: 1 });
        break;
      case "pickup":
        audio?.play("pickup", { volume: 0.7 });
        if (ev.a === myShip)
          fx.popups.push({ text: PICKUPS[ev.b].toUpperCase(), x: ev.x, y: ev.y, ttl: 1.4 });
        break;
      case "swallowed":
        if (SWALLOWED[ev.b] !== "bullet") audio?.play("explosion", { volume: 0.9, rate: 0.45 });
        if (ev.a === myShip && SWALLOWED[ev.b] === "ship")
          fx.popups.push({ text: "НЯМ!", x: ev.x, y: ev.y, ttl: 1.4 });
        break;
      case "collapsed":
        audio?.play("explosion", { volume: 1, rate: 0.3 });
        break;
    }
  }

  connection.addEventListener("binary", (e) => {
    try {
      onSnapshot(binary.decodeSnapshot(e.detail), e.detail.byteLength);
    } catch (error) {
      console.warn("bad snapshot", error.message);
    }
  });
  connection.addEventListener("snapshot", (e) => {
    onSnapshot(json.decodeSnapshot(e.detail), JSON.stringify(e.detail).length);
  });

  function spawnLocalBullet(state, shot) {
    const nose = Vector2.fromAngle(state.angle, SHIP.radius + 8);
    const vel = Vector2.fromAngle(state.angle, BULLET.speed);
    localBullets.push({
      shot,
      x: state.x + nose.x,
      y: state.y + nose.y,
      vx: state.vx + vel.x,
      vy: state.vy + vel.y,
      ttl: BULLET.ttl,
      prevX: 0,
      prevY: 0,
    });
    audio?.play("shoot", { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
  }

  function stepLocalBullets() {
    for (const b of localBullets) {
      b.prevX = b.x;
      b.prevY = b.y;
      b.x = wrap(b.x + b.vx * TICK_DT, ARENA.width);
      b.y = wrap(b.y + b.vy * TICK_DT, ARENA.height);
      const { ax, ay } = gravityAt(b.x, b.y, wells);
      b.vx += ax * TICK_DT;
      b.vy += ay * TICK_DT;
      b.ttl -= TICK_DT;
    }
    localBullets = localBullets.filter((b) => b.ttl > 0);
  }

  function simulate() {
    const controls = readControls();
    seq += 1;
    const entry = { seq, controls, buttons: packButtons(controls) };
    const alive = me && (me.flags & ShipFlag.dead) === 0;

    if (options.prediction && alive) {
      predictor.apply(entry, wells);
      cooldown = Math.max(0, cooldown - TICK_DT);
      if (controls.fire && cooldown === 0 && predictor.state) {
        spawnLocalBullet(predictor.state, seq);
        cooldown = me.flags & ShipFlag.rapid ? SHIP.rapidCooldown : SHIP.fireCooldown;
      }
    } else {
      predictor.pending.push(entry);
      if (predictor.pending.length > 60) predictor.pending.shift();
    }
    stepLocalBullets();

    const recent = predictor.pending
      .slice(-REDUNDANCY)
      .map(({ seq: s, buttons }) => ({ seq: s, buttons }));
    if (recent.length === 0) recent.push({ seq, buttons: entry.buttons });
    connection.sendRaw(codec.encodeInput(recent));
    input.endStep();
  }

  let lastFrame = performance.now();
  let lastBytes = { at: performance.now(), in: connection.bytesIn, out: connection.bytesOut };

  function render(alpha, stats) {
    const now = performance.now();
    const frameSeconds = (now - lastFrame) / 1000;
    lastFrame = now;
    predictor.decay(frameSeconds);

    if (now - lastBytes.at >= 1000) {
      const seconds = (now - lastBytes.at) / 1000;
      netgraph.stats.bytesInPerSec = (connection.bytesIn - lastBytes.in) / seconds;
      netgraph.stats.bytesOutPerSec = (connection.bytesOut - lastBytes.out) / seconds;
      netgraph.stats.maxCorrection = Math.max(0, ...predictor.corrections.slice(-30));
      lastBytes = { at: now, in: connection.bytesIn, out: connection.bytesOut };
    }
    netgraph.stats.pending = predictor.pending.length;
    netgraph.stats.history = predictor.corrections;
    netgraph.stats.snapshotAge = buffer.latest
      ? now - buffer.lastReceivedAt + netgraph.stats.rtt / 2
      : 0;
    netgraph.stats.delayMs = buffer.delayMs;

    const view2 = buffer.sample(now);
    beginFrame(ctx, view);
    drawBackground(ctx, ARENA, theme);

    for (const e of view2.entities) {
      if (e.kind === Kind.well) {
        const type = WELL_TYPES[e.type];
        const config = WELLS[type];
        drawWell(
          ctx,
          { type, range: config.range, radius: config.radius, timeLeft: e.timeLeft / 10 },
          e,
          now,
        );
      }
    }
    for (const e of view2.entities) {
      if (e.kind === Kind.pickup) {
        drawPickup(
          ctx,
          { pos: e, type: PICKUPS[e.type], age: now / 1000 + e.id, radius: 18 },
          sprites,
        );
      } else if (e.kind === Kind.asteroid) {
        drawAsteroid(ctx, e, e, sprites);
      } else if (e.kind === Kind.bullet && !(options.prediction && e.owner === myShip)) {
        drawBullet(ctx, { x: e.x, y: e.y, angle: Math.atan2(e.vy, e.vx) }, sprites);
      }
    }
    for (const b of localBullets) {
      drawBullet(
        ctx,
        {
          x: lerpWrapped(b.prevX || b.x, b.x, alpha, ARENA.width),
          y: lerpWrapped(b.prevY || b.y, b.y, alpha, ARENA.height),
          angle: Math.atan2(b.vy, b.vx),
        },
        sprites,
      );
    }
    for (const e of view2.entities) {
      if (e.kind !== Kind.ship || e.id === myShip || e.flags & ShipFlag.dead) continue;
      const p = { x: e.x, y: e.y, angle: e.angle, thrust: (e.flags & ShipFlag.thrust) !== 0 };
      drawShip(ctx, p, now, false, sprites);
      if (e.flags & ShipFlag.shield) drawShield(ctx, p);
      drawName(ctx, names.get(e.id) ?? (e.flags & ShipFlag.bot ? "манекен" : "?"), p.x, p.y, false);
    }

    if (me && (me.flags & ShipFlag.dead) === 0) {
      let p;
      if (options.prediction && predictor.state) {
        const s = predictor.state;
        const prev = predictor.previous ?? s;
        p = {
          x: wrap(lerpWrapped(prev.x, s.x, alpha, ARENA.width) + predictor.offset.x, ARENA.width),
          y: wrap(lerpWrapped(prev.y, s.y, alpha, ARENA.height) + predictor.offset.y, ARENA.height),
          angle: s.angle,
          thrust: s.thrust,
        };
      } else {
        p = { x: me.x, y: me.y, angle: me.angle, thrust: (me.flags & ShipFlag.thrust) !== 0 };
      }
      drawShip(ctx, p, now, true, sprites);
      if (me.flags & ShipFlag.shield) drawShield(ctx, p);
      drawName(ctx, names.get(myShip) ?? "ти", p.x, p.y, true);
    }

    for (const e of fx.explosions) {
      e.update(frameSeconds);
      drawExplosion(ctx, e);
    }
    fx.explosions = fx.explosions.filter((e) => e.alive);
    ctx.textAlign = "center";
    for (const p of fx.popups) {
      p.ttl -= frameSeconds;
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
    fx.popups = fx.popups.filter((p) => p.ttl > 0);

    const effects = [];
    if (me?.flags & ShipFlag.shield) effects.push("shield");
    if (me?.flags & ShipFlag.rapid) effects.push("rapid");
    if (me?.flags & ShipFlag.homing) effects.push("homing");
    const scores = view2.entities
      .filter((e) => e.kind === Kind.ship && !(e.flags & ShipFlag.bot))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((e) => `${(names.get(e.id) ?? "?").padEnd(10).slice(0, 10)} ${e.score}`);
    drawHud(ctx, view, stats, [
      `tick     ${buffer.latest?.tick ?? 0}`,
      `hp       ${me ? (me.flags & ShipFlag.dead ? `0 (respawn ${(me.respawn / 10).toFixed(1)}s)` : me.hp) : "-"}`,
      `effects  ${effects.join(", ") || "-"}`,
      "",
      ...scores,
    ]);
    if (options.netgraph) netgraph.draw(ctx, view);
  }

  setInterval(() => connection.send("ping", { t: performance.now() }), 1000);

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "F2") {
      e.preventDefault();
      connection.send("netsim", netgraph.nextPreset());
    } else if (e.code === "BracketLeft") {
      buffer.delayMs = Math.max(0, buffer.delayMs - 16);
    } else if (e.code === "BracketRight") {
      buffer.delayMs = Math.min(500, buffer.delayMs + 16);
    } else if (e.code === "F3") {
      e.preventDefault();
      options.netgraph = !options.netgraph;
    }
  });

  const loop = createLoop({ step: TICK_DT, simulate, render });
  loop.start();
  return { loop, predictor, buffer, netgraph };
}
