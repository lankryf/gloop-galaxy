import type { ArenaRules } from "@gloop/shared/arenas.ts";
import { populate } from "@gloop/shared/arenas.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import { MISSILE } from "@gloop/shared/sim/missile.ts";
import type { Controls } from "@gloop/shared/sim/ship.ts";
import {
  BEAM_CHARGE,
  HEAT,
  SHIP,
  Ship,
  WARP_DELAY,
  WARP_DISTANCE,
} from "@gloop/shared/sim/ship.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";
import { World } from "@gloop/shared/sim/world.ts";
import type { Theme } from "./assets/manifest.ts";
import type { Audio } from "./audio.ts";
import type { GameExperiment } from "./experiments.ts";
import type { Hud } from "./hud.ts";
import { createHud, PICKUP_NAMES } from "./hud.ts";
import type { Input } from "./input.ts";
import type { Loop, LoopStats } from "./loop.ts";
import { createLoop } from "./loop.ts";
import { Blast, drawBlast, drawWarpCharge } from "./render/blast.ts";
import { Camera } from "./render/camera.ts";
import type { View } from "./render/canvas.ts";
import type { Sprites } from "./render/draw.ts";
import {
  drawAsteroid,
  drawBullet,
  drawCachedBackground,
  drawCourse,
  drawDust,
  drawExplosion,
  drawForming,
  drawHud,
  drawMissile,
  drawPickup,
  drawPull,
  drawShield,
  drawShip,
  drawShipHp,
  drawStatus,
  drawWell,
  interpolate,
  interpolateShip,
  shipFrame,
} from "./render/draw.ts";
import { debug } from "./ui/debug.ts";

export interface OfflineOptions {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: View;
  readonly input: Input;
  readonly audio: Audio | null;
  readonly sprites: Sprites;
  readonly theme: Theme;
  readonly rules: ArenaRules;
  readonly pilot: string;
  readonly experiment: GameExperiment;
}

export function startGame({
  ctx,
  view,
  input,
  audio,
  sprites,
  theme,
  rules,
  pilot,
  experiment,
}: OfflineOptions): {
  world: World;
  hud: Hud;
  loop: Loop;
  ship: Ship;
} {
  const world = new World({ seed: rules.seed });
  const hud = createHud(world.events);
  const camera = new Camera(ARENA);

  populate(world, rules);
  const start = experiment.probe
    ? { x: ARENA.width / 2, y: ARENA.height / 2 }
    : world.findSafeSpot(40, ARENA);
  const ship = world.spawn(new Ship({ pos: new Vector2(start.x, start.y), name: pilot }));
  const dummySpot = world.findSafeSpot(40, ARENA);
  const dummy = world.spawn(
    new Ship({ pos: new Vector2(dummySpot.x, dummySpot.y), angle: 0, name: "dummy" }),
  );
  dummy.controls = { thrust: true, left: true, right: false, fire: false };

  audio?.listen(world.events, { ownId: () => ship.id });

  let simTime = 0;
  let frameCount = 0;
  let reported = false;

  function readControls(): Controls {
    if (experiment.controls) return experiment.controls(simTime);
    return {
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
      use: input.isDown("KeyE"),
      boost: input.isDown("ShiftLeft") || input.isDown("ShiftRight"),
    };
  }

  let wasDead = false;
  let blasts: Blast[] = [];
  let lastFrame = performance.now();
  world.events.on("exploded", ({ x, y, size }) => {
    if (size >= 5) blasts.push(new Blast(x, y, MISSILE.nuke.blast, "nuke", Math.random));
  });
  world.events.on("collapsed", ({ x, y, range }) => {
    blasts.push(new Blast(x, y, range, "collapse", Math.random));
  });
  world.events.on("warped", ({ x, y, arrive }) => {
    blasts.push(new Blast(x, y, 140, arrive ? "warpIn" : "warpOut", Math.random));
  });

  function simulate(dt: number): void {
    ship.controls = readControls();
    world.step(dt);
    if (ship.dead && !wasDead) audio?.play("lose", { volume: 0.8 });
    wasDead = ship.dead;
    hud.update(dt);
    simTime += dt;
    input.endStep();

    if (experiment.probe && !reported && simTime >= 5 - 1e-9) {
      reported = true;
      console.log(
        `probe t=${simTime.toFixed(4)} x=${ship.pos.x.toFixed(3)} y=${ship.pos.y.toFixed(3)} steps=${loop.stats.totalSteps + 1}`,
      );
    }
  }

  function render(alpha: number, stats: LoopStats): void {
    frameCount++;
    experiment.beforeRender(frameCount);
    const now = performance.now();

    if (!ship.dead) {
      const me = interpolateShip(ship, alpha);
      camera.follow(me.x, me.y);
    }
    camera.begin(ctx, view);
    drawCachedBackground(ctx, ARENA, view, theme, sprites, camera);
    camera.border(ctx);
    for (const w of world.ofKind("well")) {
      const p = interpolate(w, alpha);
      if (!camera.place(p.x, p.y, 520)) continue;
      drawWell(ctx, w, p, now, sprites);
    }
    for (const d of world.ofKind("dust")) {
      const p = interpolate(d, alpha);
      if (!camera.place(p.x, p.y)) continue;
      drawDust(ctx, p, d.id, now, sprites);
    }
    for (const p of world.ofKind("pickup")) {
      if (!camera.place(p.pos.x, p.pos.y)) continue;
      drawPickup(ctx, p, sprites);
    }
    for (const a of world.ofKind("asteroid")) {
      const p = interpolate(a, alpha);
      if (!camera.place(p.x, p.y)) continue;
      drawAsteroid(ctx, a, p, sprites);
      drawForming(ctx, p, a.radius, a.formingProgress, now);
    }
    for (const b of world.ofKind("bullet")) {
      const p = interpolate(b, alpha);
      if (!camera.place(p.x, p.y)) continue;
      drawBullet(ctx, p, sprites, b.ownerId === ship.id);
    }
    for (const m of world.ofKind("missile")) {
      if (m.type === "nuke") drawCourse(ctx, m.pos.x, m.pos.y, m.vel.angle(), ARENA, now);
    }
    if (!ship.dead)
      drawCourse(
        ctx,
        ship.pos.x,
        ship.pos.y,
        ship.angle,
        ARENA,
        now,
        ship.ability === "nuke" ? 0.5 : 0.22,
      );
    for (const m of world.ofKind("missile")) {
      const p = interpolate(m, alpha);
      if (!camera.place(p.x, p.y)) continue;
      drawMissile(
        ctx,
        { x: p.x, y: p.y, angle: Math.atan2(m.vel.y, m.vel.x), type: m.type },
        now,
        sprites,
      );
    }
    for (const s of world.ofKind("ship")) {
      if (s.dead) continue;
      const p = interpolateShip(s, alpha);
      if (!camera.place(p.x, p.y)) continue;
      if (s.beaming) drawPull(ctx, p, now);
      if (s.warpIn > 0)
        drawWarpCharge(ctx, p.x, p.y, p.angle, 1 - s.warpIn / WARP_DELAY, WARP_DISTANCE, now);
      drawShip(
        ctx,
        p,
        now,
        s === ship,
        sprites,
        shipFrame(s.id, s === ship, s !== ship),
        s.heat / HEAT.max,
      );
      if (s !== ship) drawShipHp(ctx, p.x, p.y, s.hp, SHIP.maxHp);
      if (s.effects.has("shield")) drawShield(ctx, p, sprites);
    }
    for (const e of world.ofKind("explosion")) {
      if (!camera.place(e.pos.x, e.pos.y)) continue;
      drawExplosion(ctx, e);
    }
    const frameSeconds = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    for (const b of blasts) {
      b.update(frameSeconds);
      if (camera.place(b.x, b.y, b.radius)) drawBlast(ctx, b);
    }
    blasts = blasts.filter((b) => !b.done);
    hud.drawWorld(ctx);

    if (debug.on)
      drawHud(ctx, view, stats, [
        `jitter   ${stats.jitter.toFixed(2)} ms`,
        `entities ${world.size}`,
        `pilot    ${ship.name}`,
        `score    ${ship.score}`,
        `effects  ${[...ship.effects.keys()].join(", ") || "-"}`,
        `skill    ${
          ship.warpIn > 0
            ? `warp ${ship.warpIn.toFixed(1)}s`
            : ship.ability === "gravity"
              ? `beam ${ship.charge.toFixed(1)}s [hold E]`
              : ship.ability
                ? `${ship.ability} [E]`
                : "-"
        }`,
        `hp       ${ship.hp}${ship.dead ? ` (respawn ${ship.respawnIn.toFixed(1)}s)` : ""}`,
        experiment.name ? `exp      ${experiment.name}` : "",
      ]);
    hud.drawScreen(ctx, view);
    if (!ship.dead) {
      drawStatus(
        ctx,
        view,
        {
          hp: ship.hp,
          maxHp: SHIP.maxHp,
          overheal: SHIP.maxHp * SHIP.overheal,
          heat: ship.heat,
          overheated: ship.overheated,
          cooling: ship.coolFor > 0,
          effects: [...ship.effects.keys()].map((e) => PICKUP_NAMES[e].toLowerCase()).join(" · "),
          skill:
            ship.warpIn > 0
              ? `ВАРП через ${ship.warpIn.toFixed(1)} с`
              : ship.ability
                ? PICKUP_NAMES[ship.ability]
                : "скіла немає",
          skillFraction:
            ship.warpIn > 0
              ? 1 - ship.warpIn / WARP_DELAY
              : ship.ability === "gravity"
                ? ship.charge / BEAM_CHARGE
                : ship.ability
                  ? 1
                  : 0,
        },
        now,
      );
    }
  }

  const loop = createLoop({
    simulate,
    render,
    scheduler: experiment.scheduler,
    fixedStep: experiment.fixedStep,
  });
  loop.start();

  if (experiment.probe) {
    setInterval(() => {
      const s = loop.stats;
      console.log(
        `stats steps/s=${s.stepsPerSecond} frames/s=${s.framesPerSecond} frame=${s.frameTime.toFixed(2)} jitter=${s.jitter.toFixed(2)} worst=${s.worstInterval.toFixed(1)}`,
      );
    }, 1000);
  }

  return { world, hud, loop, ship };
}
