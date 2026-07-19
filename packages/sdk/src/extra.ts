/**
 * The optional trailing `<extra>` route segment (PROTOCOL.md §5): a single
 * URL-encoded `key=value&key=value` string, e.g. `genre%3Drock%26skip%3D100`.
 * Carries catalog filters (search/genre/skip) and, for stream/lyrics, the
 * album-context ids (`trackId`, `releaseId`).
 */
export type Extra = Record<string, string>;

/** Parse an `<extra>` path segment into a flat record. Unknown keys are preserved. */
export function parseExtra(segment: string | undefined): Extra {
  if (!segment) return {};
  const params = new URLSearchParams(decodeURIComponent(segment));
  const out: Extra = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

/** Inverse of {@link parseExtra} — build an `<extra>` segment from a record. */
export function stringifyExtra(extra: Extra): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) params.append(k, v);
  return encodeURIComponent(params.toString());
}
