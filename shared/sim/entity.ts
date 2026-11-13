import type { EntityId } from "../ids.ts";
import type { AnyEntity, EntityKind } from "./kinds.ts";
import { Vector2 } from "./vector.ts";
import type { World } from "./world.ts";

export type Behavior = (entity: AnyEntity, world: World, dt: number) => void;

export interface EntityInit {
  readonly pos?: Vector2;
  readonly vel?: Vector2;
  readonly angle?: number;
  readonly radius?: number;
}

export abstract class Entity {
  #id: EntityId | 0 = 0;
  abstract readonly kind: EntityKind;
  pos: Vector2;
  vel: Vector2;
  angle: number;
  radius: number;
  alive = true;
  collidable: boolean;
  prevPos: Vector2;
  prevAngle: number;
  readonly behaviors: Behavior[] = [];

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 0,
  }: EntityInit = {}) {
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.collidable = radius > 0;
    this.prevPos = pos;
    this.prevAngle = angle;
  }

  get hasId(): boolean {
    return this.#id !== 0;
  }

  get id(): EntityId {
    if (this.#id === 0) throw new Error("Entity has not been spawned yet");
    return this.#id;
  }

  assignId(id: EntityId): void {
    if (this.#id !== 0) throw new Error(`Entity already has id ${this.#id}`);
    this.#id = id;
  }

  remember(): void {
    this.prevPos = this.pos;
    this.prevAngle = this.angle;
  }

  update(dt: number, _world: World): void {
    this.pos = this.pos.add(this.vel.scale(dt));
  }

  settle(): void {}
}
