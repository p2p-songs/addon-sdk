/** Catalog + Meta resources (Plan §8). Content types: artist/album/track/playlist. */
import { z } from "zod";
import { anyIdSchema, recordingIdSchema, trackIdSchema } from "./ids.js";

export const CONTENT_TYPES = ["artist", "album", "track", "playlist"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const contentTypeSchema = z.enum(CONTENT_TYPES);

/** A lightweight item as returned in a catalog listing. */
export const metaPreviewSchema = z
  .object({
    id: anyIdSchema,
    type: contentTypeSchema,
    name: z.string(),
    /** Cover art / artwork URL. */
    poster: z.string().url().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export type MetaPreview = z.infer<typeof metaPreviewSchema>;

/**
 * One entry in an album/playlist's track listing. Carries both the
 * streamable identity (recordingId) and the album-context identity
 * (trackId + disc/position) — the recording/track split (Plan §8).
 */
export const albumTrackSchema = z
  .object({
    recordingId: recordingIdSchema,
    trackId: trackIdSchema.optional(),
    title: z.string(),
    /** 1-based disc (medium) number; a multi-disc album has >1. */
    disc: z.number().int().positive().optional(),
    /** Track position/number as shown (may be free text, e.g. vinyl "A4"). */
    position: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    artistName: z.string().optional(),
  })
  .passthrough();

export type AlbumTrack = z.infer<typeof albumTrackSchema>;

/** Full metadata for a single item. */
export const metaDetailSchema = metaPreviewSchema
  .extend({
    artistName: z.string().optional(),
    releaseDate: z.string().optional(),
    /** For album/playlist types: the ordered track listing. */
    tracks: z.array(albumTrackSchema).optional(),
  })
  .passthrough();

export type MetaDetail = z.infer<typeof metaDetailSchema>;

export const catalogResponseSchema = z
  .object({ metas: z.array(metaPreviewSchema) })
  .passthrough();
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const metaResponseSchema = z
  .object({ meta: metaDetailSchema })
  .passthrough();
export type MetaResponse = z.infer<typeof metaResponseSchema>;
