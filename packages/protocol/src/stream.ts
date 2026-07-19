/** Stream resource — the shapes an addon returns from `/stream` (Plan §8). */
import { z } from "zod";
import { httpsUrlSchema } from "./url.js";

/**
 * behaviorHints, including the OPTIONAL link-expiry hint for resolved
 * (debrid/CDN) URLs. Expiry is a hint only — the player's correctness
 * guarantee is re-resolve-on-failure, never trust in this field (Plan §8;
 * player ARCHITECTURE §5/§5a). At most one of expiresAt / maxAgeSeconds.
 */
export const streamBehaviorHintsSchema = z
  .object({
    /** Album grouping for gapless auto-advance, e.g. `mbid:release:<uuid>`. */
    bingeGroup: z.string().optional(),
    filename: z.string().optional(),
    /** File size in bytes. */
    videoSize: z.number().int().nonnegative().optional(),
    /** true if the URL is not directly playable in a browser (non-HTTPS / non-web format). */
    notWebReady: z.boolean().optional(),
    /** Absolute UTC ISO-8601 instant the `url` stops working. */
    expiresAt: z.string().datetime().optional(),
    /** Seconds of validity from the moment of the response. */
    maxAgeSeconds: z.number().int().positive().optional(),
  })
  .passthrough()
  .refine((h) => !(h.expiresAt !== undefined && h.maxAgeSeconds !== undefined), {
    message: "set at most one of behaviorHints.expiresAt / maxAgeSeconds",
    path: ["expiresAt"],
  });

export type StreamBehaviorHints = z.infer<typeof streamBehaviorHintsSchema>;

const INFOHASH_RE = /^[0-9a-fA-F]{40}$/;

/**
 * A single stream. Must carry exactly one source:
 * - `url` — a direct, resolved link (what `stream-legal` / `stream-debrid` emit);
 * - `ytId` — an official YouTube embed (what `stream-ytmusic` emits);
 * - `infoHash` (+ optional `fileIdx`) — a torrent pointer. Allowed by the
 *   protocol for Stremio parity / the optional local-torrent fallback, but no
 *   reference addon emits one (they resolve server-side first).
 */
export const streamSchema = z
  .object({
    url: httpsUrlSchema.optional(),
    ytId: z.string().optional(),
    infoHash: z.string().regex(INFOHASH_RE, "expected a 40-char hex infoHash").optional(),
    fileIdx: z.number().int().nonnegative().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    behaviorHints: streamBehaviorHintsSchema.optional(),
  })
  .passthrough()
  .refine((s) => [s.url, s.ytId, s.infoHash].filter((v) => v !== undefined).length === 1, {
    message: "a stream must carry exactly one source: url, ytId, or infoHash",
  })
  .refine((s) => s.fileIdx === undefined || s.infoHash !== undefined, {
    message: "fileIdx is only valid alongside infoHash",
    path: ["fileIdx"],
  });

export type Stream = z.infer<typeof streamSchema>;

export const streamResponseSchema = z
  .object({
    streams: z.array(streamSchema),
    cacheMaxAge: z.number().int().nonnegative().optional(),
    staleRevalidate: z.number().int().nonnegative().optional(),
    staleError: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type StreamResponse = z.infer<typeof streamResponseSchema>;
