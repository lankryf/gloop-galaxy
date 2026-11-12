import { createHud } from "./hud.js";
import { createLoop } from "./loop.js";
import { beginFrame } from "./render/canvas.js";
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
} from "./render/draw.js";
import { ARENA } from "./sim/arena.js";
import { Asteroid } from "./sim/asteroid.js";
import { Pickup } from "./sim/pickup.js";
import { Ship } from "./sim/ship.js";
import { Vector2 } from "./sim/vector.js";
import { GravityWell } from "./sim/well.js";
import { World } from "./sim/world.js";

export function startGame({ ctx, view, input, audio, sprites, arena, pilot, experiment = {} }) {
  const world = new World({ seed: arena.seed });
  const hud = createHud(world);

  const ship = world.spawn(
    new Ship({ pos: new Vector2(ARENA.width / 2, ARENA.height / 2), name: pilot }),
  );
  const dummy = world.spawn(new Ship({ pos: new Vector2(300, 200), angle: 0, name: "dummy" }));
  dummy.controls = { thrust: true, left: true, right: false, fire: false };
  for (const config of arena.wells ?? []) world.spawn(GravityWell.fromConfig(config));
  for (let i = 0; i < arena.asteroids; i++) world.spawn(Asteroid.random(world.rng, ARENA, world));
  for (let i = 0; i < arena.pickups; i++) world.spawn(Pickup.random(world, ARENA));

  audio?.listen(world, { ownId: () => ship.id });

  let simTime = 0;
  let frameCount = 0;
  let reported = false;

  function readControls() {
    if (experiment.controls) return experiment.controls(simTime);
    return {
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
    };
  }

  function simulate(dt) {
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

  function render(alpha, stats) {
    frameCount++;
    experiment.beforeRender?.(frameCount);
    const now = performance.now();

    beginFrame(ctx, view);
    drawBackground(ctx, ARENA, arena);
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
    scheduler: experiment.scheduler ?? "raf",
    fixedStep: experiment.fixedStep ?? true,
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
