import type { ArenaRules } from "@gloop/shared/arenas.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import { Asteroid } from "@gloop/shared/sim/asteroid.ts";
import { Pickup } from "@gloop/shared/sim/pickup.ts";
import type { Controls } from "@gloop/shared/sim/ship.ts";
import { Ship } from "@gloop/shared/sim/ship.ts";
import { Vector2 } from "@gloop/shared/sim/vector.ts";
import { GravityWell } from "@gloop/shared/sim/well.ts";
import { World } from "@gloop/shared/sim/world.ts";
import type { Theme } from "./assets/manifest.ts";
import type { Audio } from "./audio.ts";
import type { GameExperiment } from "./experiments.ts";
import type { Hud } from "./hud.ts";
import { createHud } from "./hud.ts";
import type { Input } from "./input.ts";
import type { Loop, LoopStats } from "./loop.ts";
import { createLoop } from "./loop.ts";
import type { View } from "./render/canvas.ts";
import { beginFrame } from "./render/canvas.ts";
import type { Sprites } from "./render/draw.ts";
import {
  drawAsteroid,
  drawBackground,
  drawBullet,
  drawExplosion,
  drawHud,
  drawPickup,
  drawShield,
  drawShip,
  drawWell,
  interpolate,
  interpolateShip,
} from "./render/draw.ts";

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

  for (const config of rules.wells) world.spawn(GravityWell.fromConfig(config));
  const start = experiment.probe
    ? { x: ARENA.width / 2, y: ARENA.height / 2 }
    : world.findSafeSpot(40, ARENA);
  const ship = world.spawn(new Ship({ pos: new Vector2(start.x, start.y), name: pilot }));
  const dummySpot = world.findSafeSpot(40, ARENA);
  const dummy = world.spawn(
    new Ship({ pos: new Vector2(dummySpot.x, dummySpot.y), angle: 0, name: "dummy" }),
  );
  dummy.controls = { thrust: true, left: true, right: false, fire: false };
  for (let i = 0; i < rules.asteroids; i++) world.spawn(Asteroid.random(world.rng, ARENA, world));
  for (let i = 0; i < rules.pickups; i++) world.spawn(Pickup.random(world, ARENA));

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
    };
  }

  function simulate(dt: number): void {
    ship.controls = readControls();
    world.step(dt);
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

    beginFrame(ctx, view);
    drawBackground(ctx, ARENA, theme);
    for (const w of world.ofKind("well")) drawWell(ctx, w, interpolate(w, alpha, ARENA), now);
    for (const p of world.ofKind("pickup")) drawPickup(ctx, p, sprites);
    for (const a of world.ofKind("asteroid")) {
      drawAsteroid(ctx, a, interpolate(a, alpha, ARENA), sprites);
    }
    for (const b of world.ofKind("bullet")) drawBullet(ctx, interpolate(b, alpha, ARENA), sprites);
    for (const s of world.ofKind("ship")) {
      if (s.dead) continue;
      const p = interpolateShip(s, alpha, ARENA);
      drawShip(ctx, p, now, s === ship, sprites);
      if (s.effects.has("shield")) drawShield(ctx, p);
    }
    for (const e of world.ofKind("explosion")) drawExplosion(ctx, e);
    hud.drawWorld(ctx);

    drawHud(ctx, view, stats, [
      `jitter   ${stats.jitter.toFixed(2)} ms`,
      `entities ${world.size}`,
      `pilot    ${ship.name}`,
      `score    ${ship.score}`,
      `effects  ${[...ship.effects.keys()].join(", ") || "-"}`,
      `hp       ${ship.hp}${ship.dead ? ` (respawn ${ship.respawnIn.toFixed(1)}s)` : ""}`,
      experiment.name ? `exp      ${experiment.name}` : "",
    ]);
    hud.drawScreen(ctx, view);
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
