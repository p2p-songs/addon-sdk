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
 *
 * `playlist:<token>` is the one content id with no MusicBrainz entity behind
 * it: a playlist has no canonical cross-addon identity (MusicBrainz supplies
 * none, ISRC identifies recordings). It is therefore an **addon-scoped opaque
 * token** — the addon that emits it is the one that resolves its `/meta`. The
 * distinct scheme keeps it from ever being confused with a recording/release.
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

/**
 * Playlist id: `playlist:` + an addon-scoped opaque token. Starts with an
 * alphanumeric; may contain `. _ ~ -` (addons namespace with dots, e.g.
 * `playlist:charts.trending-2026`). No colon, so it never looks like an MBID.
 */
export const PLAYLIST_ID_RE = /^playlist:[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

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
/** A recording as identified by ISRC (secondary to `mbid:recording:`). */
export const isrcIdSchema = z.string().regex(ISRC_ID_RE, "expected isrc:<code>").brand<"IsrcId">();
/** An addon-scoped opaque playlist id. */
export const playlistIdSchema = z
  .string()
  .regex(PLAYLIST_ID_RE, "expected playlist:<token>")
  .brand<"PlaylistId">();

export type ArtistId = z.infer<typeof artistIdSchema>;
export type ReleaseId = z.infer<typeof releaseIdSchema>;
export type RecordingId = z.infer<typeof recordingIdSchema>;
export type TrackId = z.infer<typeof trackIdSchema>;
export type IsrcId = z.infer<typeof isrcIdSchema>;
export type PlaylistId = z.infer<typeof playlistIdSchema>;

/** Any entity-typed MBID string. */
export const mbidSchema = z.string().regex(MBID_RE, "expected mbid:<entity>:<uuid>");
/** Any accepted content id: an entity-typed MBID, an ISRC, or a playlist id. */
export const anyIdSchema = z.union([
  mbidSchema,
  z.string().regex(ISRC_ID_RE, "expected isrc:<code>"),
  z.string().regex(PLAYLIST_ID_RE, "expected playlist:<token>"),
]);

// --- Parsed forms ---

export type ParsedMbid = { scheme: "mbid"; entity: MbidEntity; uuid: string };
export type ParsedIsrc = { scheme: "isrc"; code: string };
export type ParsedPlaylist = { scheme: "playlist"; token: string };
export type ParsedId = ParsedMbid | ParsedIsrc | ParsedPlaylist;

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

/** Parse any accepted content id (MBID, ISRC, or playlist); throws {@link ProtocolError} if malformed. */
export function parseId(id: string): ParsedId {
  if (id.startsWith("isrc:")) {
    if (!ISRC_ID_RE.test(id)) {
      throw new ProtocolError(`invalid ISRC id ${JSON.stringify(id)}`);
    }
    return { scheme: "isrc", code: id.slice("isrc:".length) };
  }
  if (id.startsWith("playlist:")) {
    if (!PLAYLIST_ID_RE.test(id)) {
      throw new ProtocolError(`invalid playlist id ${JSON.stringify(id)}`);
    }
    return { scheme: "playlist", token: id.slice("playlist:".length) };
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

export function isPlaylistId(id: string): boolean {
  return PLAYLIST_ID_RE.test(id);
}

export function isEntity(id: string, entity: MbidEntity): boolean {
  return mbidRegexFor(entity).test(id);
}
