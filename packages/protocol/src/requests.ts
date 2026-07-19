/**
 * Request contracts. `stream` and `lyrics` are requested against a
 * `mbid:recording:<uuid>` (the streamable unit); optional album context
 * (`mbid:track:` / `mbid:release:`) lets an addon prefer the exact pressing
 * and, for `stream-debrid`, deterministically pick the right file inside a
 * multi-track album torrent (Plan §2a, §8).
 */
import { z } from "zod";
import { recordingIdSchema, trackIdSchema, releaseIdSchema } from "./ids.js";

export const streamRequestSchema = z
  .object({
    /** The song to resolve — the streamable / cache / dedup key. */
    recordingId: recordingIdSchema,
    /** Album context: which pressing + disc/position. Optional. */
    trackId: trackIdSchema.optional(),
    /** Album grouping. Optional. */
    releaseId: releaseIdSchema.optional(),
  })
  .passthrough();

export type StreamRequest = z.infer<typeof streamRequestSchema>;

export const lyricsRequestSchema = z
  .object({
    recordingId: recordingIdSchema,
    trackId: trackIdSchema.optional(),
  })
  .passthrough();

export type LyricsRequest = z.infer<typeof lyricsRequestSchema>;
