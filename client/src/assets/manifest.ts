import { z } from "zod";

const FrameSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Frame = z.infer<typeof FrameSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  sprites: z.record(
    z.string(),
    z.object({ url: z.string(), frames: z.record(z.string(), FrameSchema) }),
  ),
  arenas: z.record(z.string(), z.string()),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const ThemeSchema = z.object({
  name: z.string(),
  background: z.tuple([z.string(), z.string()]),
  tile: z.string().optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;
