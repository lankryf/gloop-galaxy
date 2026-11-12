import { z } from "zod";
import type { EntityId, Seq, Tick } from "./ids.ts";
import { isEntityId, isSeq, isTick } from "./ids.ts";
import type { Result } from "./result.ts";
import { fail, ok } from "./result.ts";
import type { PickupType } from "./sim/pickup.ts";
import { PICKUP_TYPES } from "./sim/pickup.ts";
import type { Controls } from "./sim/ship.ts";
import type { WellType } from "./sim/well.ts";
import { WELL_TYPES } from "./sim/well.ts";

export const PROTOCOL_VERSION = 0;
export const BINARY_VERSION = 1;
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const MAX_MESSAGE_BYTES = 2048;

export const CloseCode = {
  normal: 1000,
  goingAway: 1001,
  badMessage: 4000,
  joinTimeout: 4001,
  rateLimited: 4002,
  roomFull: 4003,
  noRoom: 4004,
  heartbeat: 4005,
  slowClient: 4006,
};

export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  CloseCode.badMessage,
  CloseCode.roomFull,
  CloseCode.noRoom,
]);

export const ShipFlag = { thrust: 1, dead: 2, shield: 4, rapid: 8, homing: 16, bot: 32 };

const BUTTONS: readonly (keyof Controls)[] = ["thrust", "left", "right", "fire"];
export const MAX_BUTTONS = (1 << BUTTONS.length) - 1;

export function packButtons(input: Controls): number {
  let bits = 0;
  BUTTONS.forEach((name, i) => {
    if (input[name]) bits |= 1 << i;
  });
  return bits;
}

export function unpackButtons(bits: number): Controls {
  return {
    thrust: (bits & 1) !== 0,
    left: (bits & 2) !== 0,
    right: (bits & 4) !== 0,
    fire: (bits & 8) !== 0,
  };
}

export const EntityIdSchema = z.custom<EntityId>(
  (v) => typeof v === "number" && isEntityId(v),
  "bad entity id",
);
export const SeqSchema = z.custom<Seq>((v) => typeof v === "number" && isSeq(v), "bad seq");
export const TickSchema = z.custom<Tick>((v) => typeof v === "number" && isTick(v), "bad tick");
const PickupTypeSchema = z.enum(PICKUP_TYPES);
const WellTypeSchema = z.enum(WELL_TYPES);
const Num = z.number().refine(Number.isFinite, "must be finite");

export const InputRecordSchema = z.object({
  seq: SeqSchema,
  buttons: z.number().int().min(0).max(MAX_BUTTONS),
});
export type InputRecord = z.infer<typeof InputRecordSchema>;

const NAME = /^[\p{L}\p{N}_ .-]{1,16}$/u;
const base = { v: z.literal(PROTOCOL_VERSION) };

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("join"),
    room: z.string().min(1).max(32),
    name: z.string().regex(NAME, "name must be 1-16 letters or digits"),
    codec: z.enum(["json", "binary"]).optional(),
  }),
  z.object({ ...base, type: z.literal("chat"), text: z.string().min(1).max(200) }),
  z.object({ ...base, type: z.literal("leave") }),
  z.object({
    ...base,
    type: z.literal("input"),
    inputs: z.array(InputRecordSchema).min(1).max(16),
  }),
  z.object({ ...base, type: z.literal("ping"), t: Num }),
  z.object({
    ...base,
    type: z.literal("netsim"),
    lag: z.number().int().min(0).max(1000),
    jitter: z.number().int().min(0).max(1000),
    drop: z.number().min(0).max(0.5),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

const ShipSnapSchema = z.object({
  kind: z.literal("ship"),
  id: EntityIdSchema,
  x: Num,
  y: Num,
  vx: Num,
  vy: Num,
  angle: Num,
  hp: z.number().int().min(0).max(255),
  flags: z.number().int().min(0).max(255),
  score: z.number().int().min(0).max(0xffff),
  respawn: z.number().int().min(0).max(255),
});
const BulletSnapSchema = z.object({
  kind: z.literal("bullet"),
  id: EntityIdSchema,
  x: Num,
  y: Num,
  vx: Num,
  vy: Num,
  owner: EntityIdSchema,
  shot: SeqSchema,
});
const AsteroidSnapSchema = z.object({
  kind: z.literal("asteroid"),
  id: EntityIdSchema,
  x: Num,
  y: Num,
  angle: Num,
  radius: z.number().int().min(0).max(255),
  hunter: z.boolean(),
});
const PickupSnapSchema = z.object({
  kind: z.literal("pickup"),
  id: EntityIdSchema,
  x: Num,
  y: Num,
  type: PickupTypeSchema,
});
const WellSnapSchema = z.object({
  kind: z.literal("well"),
  id: EntityIdSchema,
  x: Num,
  y: Num,
  vx: Num,
  vy: Num,
  angle: Num,
  type: WellTypeSchema,
  timeLeft: z.number().int().min(0).max(0xffff),
});
export const EntitySnapSchema = z.discriminatedUnion("kind", [
  ShipSnapSchema,
  BulletSnapSchema,
  AsteroidSnapSchema,
  PickupSnapSchema,
  WellSnapSchema,
]);
export type EntitySnap = z.infer<typeof EntitySnapSchema>;
export type ShipSnap = z.infer<typeof ShipSnapSchema>;
export type WellSnap = z.infer<typeof WellSnapSchema>;

const at = { x: Num, y: Num };
export const NetEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fired"), ...at, shipId: EntityIdSchema }),
  z.object({
    type: z.literal("hit"),
    ...at,
    target: z.enum(["asteroid", "ship"]),
    shipId: EntityIdSchema.nullable(),
  }),
  z.object({ type: z.literal("exploded"), ...at, size: Num }),
  z.object({
    type: z.literal("scored"),
    ...at,
    shipId: EntityIdSchema,
    points: z.number().int().min(0),
  }),
  z.object({ type: z.literal("pickup"), ...at, shipId: EntityIdSchema, pickup: PickupTypeSchema }),
  z.object({
    type: z.literal("swallowed"),
    ...at,
    what: z.enum(["bullet", "asteroid", "ship"]),
    shipId: EntityIdSchema.nullable(),
  }),
  z.object({ type: z.literal("collapsed"), ...at }),
]);
export type NetEvent = z.infer<typeof NetEventSchema>;

export const SnapshotSchema = z.object({
  tick: TickSchema,
  ack: SeqSchema,
  entities: z.array(EntitySnapSchema),
  events: z.array(NetEventSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

const RoomInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  arena: z.string(),
  players: z.number().int(),
  maxPlayers: z.number().int(),
});
export type RoomInfo = z.infer<typeof RoomInfoSchema>;

export const NetsimSchema = z.object({
  lag: z.number().min(0).max(1000),
  jitter: z.number().min(0).max(1000),
  drop: z.number().min(0).max(0.5),
});
export type NetsimSettings = z.infer<typeof NetsimSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("welcome"),
    you: z.string(),
    shipId: EntityIdSchema,
    room: RoomInfoSchema,
    codec: z.enum(["json", "binary"]),
    tickRate: z.number().int().positive(),
    netsim: NetsimSchema,
  }),
  z.object({
    ...base,
    type: z.literal("roster"),
    players: z.array(z.object({ id: z.string(), name: z.string(), shipId: EntityIdSchema })),
  }),
  z.object({
    ...base,
    type: z.literal("chat"),
    from: z.string(),
    name: z.string(),
    text: z.string(),
    t: z.number(),
  }),
  z.object({ ...base, type: z.literal("error"), code: z.number().int(), message: z.string() }),
  z.object({ ...base, type: z.literal("pong"), t: Num }),
  z.object({ ...base, type: z.literal("netsim"), ...NetsimSchema.shape }),
  z.object({ ...base, type: z.literal("shutdown") }),
  z.object({ ...base, type: z.literal("snapshot"), ...SnapshotSchema.shape }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage["type"];
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;

type Payload<T extends ServerMessageType> = Omit<ServerMessageOf<T>, "v" | "type">;

export function encodeServerMessage<T extends ServerMessageType>(
  type: T,
  payload: Payload<T>,
): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, type, ...payload });
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid message";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function parseJson(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return fail("invalid JSON");
  }
}

export function parseClientMessage(text: string): Result<ClientMessage> {
  if (text.length > MAX_MESSAGE_BYTES) return fail("message too large");
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const result = ClientMessageSchema.safeParse(parsed.value);
  return result.success ? ok(result.data) : fail(firstIssue(result.error));
}

export function parseServerMessage(text: string): Result<ServerMessage> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const result = ServerMessageSchema.safeParse(parsed.value);
  return result.success ? ok(result.data) : fail(firstIssue(result.error));
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

export type { PickupType, WellType };
