/**
 * Entity-typed MusicBrainz identifiers — the p2p-songs ID scheme (Plan §8).
 *
 * IDs are `mbid:<entity>:<uuid>`. We do NOT synthesize composite IDs like
 * `release-mbid:track-number`: MusicBrainz track *position* is scoped to a
 * medium (disc), so multi-disc albums collide, and track numbers can be free
 * text (vinyl `A4`). See audit A-003. Every entity MusicBrainz gives an MBID
 * for is addressed by that MBID directly.
 *
 * - `mbid:recording:<uuid>` — the song/audio itself; identity shared across
 *   every release it appears on. THIS is the streamable / cache / dedup unit.
 * - `mbid:track:<uuid>` — a recording as it appears on one release+medium;
 *   carries disc/position identity natively. Album context only — never the
 *   thing a stream is resolved against.
 * - `mbid:release:<uuid>` — an album (a specific release).
 * - `mbid:artist:<uuid>`.
 *
 * `isrc:<code>` is a secondary id form.
 */
import { z } from "zod";
import { ProtocolError } from "./errors.js";

export const MBID_ENTITIES = ["artist", "release", "recording", "track"] as const;
export type MbidEntity = (typeof MBID_ENTITIES)[number];

/** Canonical MusicBrainz UUID (lowercase 8-4-4-4-12 hex). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `mbid:<entity>:<uuid>` for any of the four entities. */
export const MBID_RE =
  /^mbid:(artist|release|recording|track):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** ISRC id form: `isrc:` + 2-letter country + 3 alnum registrant + 7 digits (year+designation). */
export const ISRC_ID_RE = /^isrc:[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;

function mbidRegexFor(entity: MbidEntity): RegExp {
  return new RegExp(
    `^mbid:${entity}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
  );
}

// --- Branded string schemas (an entity-specific id is not interchangeable) ---

export const artistIdSchema = z
  .string()
  .regex(mbidRegexFor("artist"), "expected mbid:artist:<uuid>")
  .brand<"ArtistId">();
export const releaseIdSchema = z
  .string()
  .regex(mbidRegexFor("release"), "expected mbid:release:<uuid>")
  .brand<"ReleaseId">();
export const recordingIdSchema = z
  .string()
  .regex(mbidRegexFor("recording"), "expected mbid:recording:<uuid>")
  .brand<"RecordingId">();
export const trackIdSchema = z
  .string()
  .regex(mbidRegexFor("track"), "expected mbid:track:<uuid>")
  .brand<"TrackId">();

export type ArtistId = z.infer<typeof artistIdSchema>;
export type ReleaseId = z.infer<typeof releaseIdSchema>;
export type RecordingId = z.infer<typeof recordingIdSchema>;
export type TrackId = z.infer<typeof trackIdSchema>;

/** Any entity-typed MBID string. */
export const mbidSchema = z.string().regex(MBID_RE, "expected mbid:<entity>:<uuid>");
/** Any accepted id: an entity-typed MBID or an ISRC. */
export const anyIdSchema = z.union([mbidSchema, z.string().regex(ISRC_ID_RE, "expected isrc:<code>")]);

// --- Parsed forms ---

export type ParsedMbid = { scheme: "mbid"; entity: MbidEntity; uuid: string };
export type ParsedIsrc = { scheme: "isrc"; code: string };
export type ParsedId = ParsedMbid | ParsedIsrc;

/** Parse an entity-typed MBID; throws {@link ProtocolError} if malformed. */
export function parseMbid(id: string): ParsedMbid {
  const m = MBID_RE.exec(id);
  if (!m) {
    throw new ProtocolError(
      `invalid MBID id ${JSON.stringify(id)} (expected mbid:<entity>:<uuid>)`,
    );
  }
  return { scheme: "mbid", entity: m[1] as MbidEntity, uuid: m[2]! };
}

/** Parse any accepted id (MBID or ISRC); throws {@link ProtocolError} if malformed. */
export function parseId(id: string): ParsedId {
  if (id.startsWith("isrc:")) {
    if (!ISRC_ID_RE.test(id)) {
      throw new ProtocolError(`invalid ISRC id ${JSON.stringify(id)}`);
    }
    return { scheme: "isrc", code: id.slice("isrc:".length) };
  }
  return parseMbid(id);
}

/** Non-throwing variant. */
export function safeParseId(id: string): ParsedId | undefined {
  try {
    return parseId(id);
  } catch {
    return undefined;
  }
}

/** Build an entity-typed MBID string; throws if the UUID is not canonical. */
export function formatMbid(entity: MbidEntity, uuid: string): string {
  const lower = uuid.toLowerCase();
  if (!UUID_RE.test(lower)) {
    throw new ProtocolError(`invalid MusicBrainz UUID ${JSON.stringify(uuid)}`);
  }
  return `mbid:${entity}:${lower}`;
}

export function isMbid(id: string): boolean {
  return MBID_RE.test(id);
}

export function isEntity(id: string, entity: MbidEntity): boolean {
  return mbidRegexFor(entity).test(id);
}
