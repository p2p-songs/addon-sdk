/**
 * `/configure` round-trip (PROTOCOL.md §7).
 *
 * An addon that needs per-user settings (e.g. `stream-debrid`: debrid
 * credentials, indexer choices) carries them **in the manifest URL path**, not
 * in cookies or a server-side account. The configured install URL is
 * `https://addon.example/<encoded-config>/manifest.json`, and the same
 * `<encoded-config>` segment prefixes that install's resource routes. The
 * config never leaves the URL — this is what keeps a debrid key on the user's
 * own device rather than on an operator's server.
 *
 * Encoding is base64url of the JSON config, chosen so the segment is a single
 * path-safe token with no `/` (which would split the route) and no `=` padding.
 */
export type AddonConfig = Record<string, unknown>;

/** The path segments the router owns; a leading segment outside this set is treated as config. */
export const RESERVED_ROOT_SEGMENTS = new Set([
  "manifest.json",
  "configure",
  "catalog",
  "meta",
  "stream",
  "lyrics",
]);

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Encode a config object into a single path-safe URL segment. */
export function encodeConfig(config: AddonConfig): string {
  return toBase64Url(Buffer.from(JSON.stringify(config), "utf8"));
}

/**
 * Decode a config segment back to an object. Returns `undefined` for anything
 * that is not a valid base64url-encoded JSON object (so a malformed or
 * non-config leading segment is simply treated as "no config").
 */
export function decodeConfig(segment: string): AddonConfig | undefined {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as AddonConfig;
  } catch {
    return undefined;
  }
}
