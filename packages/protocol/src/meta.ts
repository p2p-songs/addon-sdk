/** Catalog + Meta resources (Plan §8). Content types: artist/album/track/playlist. */
import { z } from "zod";
import {
  artistIdSchema,
  releaseIdSchema,
  recordingIdSchema,
  trackIdSchema,
  isrcIdSchema,
  playlistIdSchema,
} from "./ids.js";
import { httpsUrlSchema } from "./url.js";

export const CONTENT_TYPES = ["artist", "album", "track", "playlist"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const contentTypeSchema = z.enum(CONTENT_TYPES);

/**
 * Identity per content type — a `track` content item is identified by the
 * recording (its streamable identity), by MBID or ISRC. This is the pairing the
 * discriminated unions below enforce so a type can never carry a foreign id
 * (e.g. an `album` with a recording id). See audit A-004.
 */
const trackContentIdSchema = z.union([recordingIdSchema, isrcIdSchema]);

/** Fields common to every meta item, independent of type. */
const metaBaseFields = {
  name: z.string(),
  /** Cover art / artwork URL (https). */
  poster: httpsUrlSchema.optional(),
  description: z.string().optional(),
};

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

/**
 * A lightweight item as returned in a catalog listing. A discriminated union on
 * `type`: each branch pins `id` to that type's identity namespace, so a
 * contradictory pair (e.g. `type:"artist"` with a recording id) is rejected.
 */
export const metaPreviewSchema = z.discriminatedUnion("type", [
  z.object({ ...metaBaseFields, type: z.literal("artist"), id: artistIdSchema }).passthrough(),
  z.object({ ...metaBaseFields, type: z.literal("album"), id: releaseIdSchema }).passthrough(),
  z.object({ ...metaBaseFields, type: z.literal("track"), id: trackContentIdSchema }).passthrough(),
  z.object({ ...metaBaseFields, type: z.literal("playlist"), id: playlistIdSchema }).passthrough(),
]);

export type MetaPreview = z.infer<typeof metaPreviewSchema>;

/** Detail-only fields shared by all types. */
const metaDetailFields = {
  ...metaBaseFields,
  artistName: z.string().optional(),
  releaseDate: z.string().optional(),
};
/** A track listing (only album/playlist carry one). */
const tracksField = { tracks: z.array(albumTrackSchema).optional() };

/**
 * Full metadata for a single item. Same type→identity discrimination as the
 * preview; album/playlist additionally carry a `tracks` listing.
 */
export const metaDetailSchema = z.discriminatedUnion("type", [
  z.object({ ...metaDetailFields, type: z.literal("artist"), id: artistIdSchema }).passthrough(),
  z.object({ ...metaDetailFields, ...tracksField, type: z.literal("album"), id: releaseIdSchema }).passthrough(),
  z.object({ ...metaDetailFields, type: z.literal("track"), id: trackContentIdSchema }).passthrough(),
  z.object({ ...metaDetailFields, ...tracksField, type: z.literal("playlist"), id: playlistIdSchema }).passthrough(),
]);

export type MetaDetail = z.infer<typeof metaDetailSchema>;

export const catalogResponseSchema = z
  .object({ metas: z.array(metaPreviewSchema) })
  .passthrough();
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const metaResponseSchema = z
  .object({ meta: metaDetailSchema })
  .passthrough();
export type MetaResponse = z.infer<typeof metaResponseSchema>;
