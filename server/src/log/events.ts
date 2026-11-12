import { z } from "zod";

const base = { t: z.number(), room: z.string() };

export const MatchEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("join"), player: z.string(), name: z.string() }),
  z.object({ ...base, type: z.literal("leave"), player: z.string(), reason: z.string() }),
  z.object({ ...base, type: z.literal("chat"), player: z.string(), text: z.string() }),
  z.object({ ...base, type: z.literal("end") }),
]);

export type MatchEvent = z.infer<typeof MatchEventSchema>;
