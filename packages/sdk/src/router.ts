/**
 * Framework-agnostic request router (PROTOCOL.md §1, §5, §6). Maps a
 * `{ method, url }` to a `{ status, headers, body }` with no dependency on any
 * particular server — `serveHTTP` is a thin node:http adapter over this, and
 * tests drive it directly.
 *
 * Security posture (this is the credential-carrying trust boundary every addon
 * inherits — audit A-005):
 * - A request whose path carries a leading config segment is **secret-bearing**
 *   (the segment encodes the user's debrid credential). Its manifest, configure,
 *   and resource responses are always `Cache-Control: no-store, private` — never
 *   shared/public caching, regardless of a handler's cache hints.
 * - Client error bodies are **opaque** (a stable `err` string, never a handler
 *   or provider exception message, which can contain the credential). Diagnostics
 *   go only to the opt-in `onError` hook, whose implementer is responsible for
 *   redaction.
 * - A malformed config prefix is a 400, not a silent downgrade to unconfigured;
 *   `configurationRequired` addons fail **closed** (handler never runs without a
 *   valid config).
 * - Route content types are validated (stream/lyrics require `track`); malformed
 *   percent-encoding becomes a controlled 400, never an escaped `URIError`.
 */
import {
  catalogResponseSchema,
  metaResponseSchema,
  streamResponseSchema,
  lyricsResponseSchema,
  streamRequestSchema,
  lyricsRequestSchema,
  contentTypeSchema,
  isEntity,
  isPlaylistId,
  ISRC_ID_RE,
  type ContentType,
} from "@p2p-songs/protocol";
import type { ZodTypeAny } from "zod";
import { decodeConfig, RESERVED_ROOT_SEGMENTS, type AddonConfig } from "./config.js";
import { parseExtra } from "./extra.js";
import { renderConfigurePage } from "./configure-page.js";
import type { AddonInterface, ResourceArgs, StreamArgs, LyricsArgs } from "./types.js";

export interface RouterRequest {
  method: string;
  /** Request path (with optional query), e.g. `/stream/track/mbid%3Arecording%3A….json`. */
  url: string;
  /**
   * Request headers, if the adapter has them. Optional: the router's behaviour
   * is determined by method and path alone, and only the Private Network Access
   * preflight (below) consults these. Names are matched case-insensitively.
   */
  headers?: Record<string, string | string[] | undefined>;
}

export interface RouterResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface RouterErrorContext {
  /** The resource being served, if the failure occurred during dispatch. */
  resource?: string;
  /** The request path (may contain a config segment — treat as secret-bearing). */
  path: string;
}

export interface RouterOptions {
  /** Render the `/configure` HTML page. Defaults to a built-in page. */
  configureHTML?: (ctx: { config?: AddonConfig; manifest: AddonInterface["manifest"] }) => string;
  /**
   * Optional diagnostics sink for server-side failures. Receives the raw error
   * (which MAY contain the configured credential) — the implementer is
   * responsible for redaction before logging. The SDK never logs errors itself,
   * and never sends error detail to the client.
   */
  onError?: (err: unknown, ctx: RouterErrorContext) => void;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/** Caching policy for responses whose request URL carries a secret config segment. */
const NO_STORE: Record<string, string> = { "Cache-Control": "no-store, private" };

/**
 * Private Network Access: a page on a public origin that fetches an addon on
 * loopback or a LAN address must first pass a preflight that Chrome answers
 * only if the response opts in with this header.
 *
 * That pairing is not an edge case — it is the deployment we want most. An
 * addon holding the user's debrid key is best run on the user's own machine
 * (`http://127.0.0.1:7003`), and a hosted player is still an ordinary public
 * origin, so every request it makes to that addon is a public→private one.
 * Without this header the browser blocks it and reports a bare CORS failure
 * that looks like an addon bug.
 *
 * Granting it is not a new exposure: the addon already answers any origin
 * (`Access-Control-Allow-Origin: *`) because it serves public catalogue data,
 * and its credential-bearing routes are guarded by an unguessable config
 * segment, not by who is asking. This only restores that same policy for a
 * caller the browser would otherwise pre-emptively refuse.
 */
const PNA_REQUEST_HEADER = "access-control-request-private-network";
const PNA_RESPONSE_HEADER: Record<string, string> = { "Access-Control-Allow-Private-Network": "true" };

/** Case-insensitive single-value header lookup over an adapter's header bag. */
function header(headers: RouterRequest["headers"], name: string): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

/** Raised for malformed input that must surface as a controlled 400. */
class BadRequestError extends Error {}

export type Router = (req: RouterRequest) => Promise<RouterResponse>;

/** Build a router for a servable addon interface. */
export function createRouter(addon: AddonInterface, options: RouterOptions = {}): Router {
  const configureHTML = options.configureHTML ?? renderConfigurePage;
  const configurationRequired = addon.manifest.behaviorHints?.configurationRequired === true;

  function json(status: number, value: unknown, extraHeaders?: Record<string, string>): RouterResponse {
    return {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
      body: JSON.stringify(value),
    };
  }

  return async function route(req: RouterRequest): Promise<RouterResponse> {
    const path = req.url.split("?", 1)[0]!;

    // Whether this request carries a secret config segment governs the caching
    // policy for *every* response below — including OPTIONS and method rejection.
    // Must be computed BEFORE any early return so no secret-bearing path can be
    // answered with a cacheable response (audit A-006).
    const segmentsAll = path.split("/").filter((s) => s.length > 0);
    const hasConfigSegment = segmentsAll.length > 0 && !RESERVED_ROOT_SEGMENTS.has(segmentsAll[0]!);
    const cachePolicy = hasConfigSegment ? NO_STORE : undefined;

    const method = req.method.toUpperCase();
    if (method === "OPTIONS") {
      // Opt in only when asked, so the header appears on the preflight that
      // needs it rather than on every response.
      const pna = header(req.headers, PNA_REQUEST_HEADER) === "true" ? PNA_RESPONSE_HEADER : undefined;
      return { status: 204, headers: { ...CORS_HEADERS, ...pna, ...cachePolicy }, body: "" };
    }
    if (method !== "GET") return json(405, { err: "method not allowed" }, cachePolicy);

    try {
      let config: AddonConfig | undefined;
      let configMalformed = false;
      let segments = segmentsAll;
      if (hasConfigSegment) {
        config = decodeConfig(segments[0]!);
        // A leading config segment that doesn't decode is malformed. We reject it
        // (rather than silently downgrade to "unconfigured") — but only once we
        // know it prefixes a real route, so a lone junk segment stays a 404.
        configMalformed = config === undefined;
        segments = segments.slice(1);
      }
      const notFound = () => json(404, { err: "not found" }, cachePolicy);
      const badConfig = () => json(400, { err: "invalid configuration" }, cachePolicy);

      if (segments.length === 0) return notFound();
      const head = segments[0]!;

      if (head === "manifest.json" && segments.length === 1) {
        if (configMalformed) return badConfig();
        // Unconfigured manifest is public; a configured (secret-bearing) one is not.
        return json(200, addon.manifest, cachePolicy ?? cacheControl({ cacheMaxAge: 3600 }));
      }
      if (head === "configure" && segments.length === 1) {
        if (configMalformed) return badConfig();
        // The configure page may echo the config back into the form — never cache it.
        return {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8", ...NO_STORE },
          body: configureHTML({ config, manifest: addon.manifest }),
        };
      }

      // Resource routes: <resource>/<type>/<id>.json  (+ optional /<extra>.json)
      const parsed = parseResourcePath(segments);
      if (!parsed) return notFound();
      const { resource, type: rawType, id, extra: extraSeg } = parsed;

      if (!addon.hasHandler(resource)) return notFound();
      if (configMalformed) return badConfig();

      // Fail closed: a configuration-required addon must never run a handler
      // without a valid decoded config (else it could fall back to operator creds).
      if (configurationRequired && config === undefined) {
        return json(400, { err: "configuration required" }, cachePolicy);
      }

      const extra = parseExtra(extraSeg);
      const handlers = addon.handlers;

      try {
        switch (resource) {
          case "catalog": {
            const type = requireContentType(rawType);
            if (!type) return json(404, { err: "not found" }, cachePolicy);
            const args: ResourceArgs = { type, id, extra, config };
            return validated(catalogResponseSchema, await handlers.catalog!(args), cachePolicy);
          }
          case "meta": {
            const type = requireContentType(rawType);
            // Validate the route type ↔ id identity on the *input* side, mirroring
            // the discriminated response schema — a contradictory pair (e.g.
            // /meta/artist/mbid:recording:…) is a 404, never a handler call
            // (audit A-006).
            if (!type || !metaIdMatchesType(type, id)) return json(404, { err: "not found" }, cachePolicy);
            const args: ResourceArgs = { type, id, extra, config };
            return validated(metaResponseSchema, await handlers.meta!(args), cachePolicy);
          }
          case "stream": {
            if (rawType !== "track") return json(404, { err: "not found" }, cachePolicy);
            const reqParse = streamRequestSchema.safeParse({
              recordingId: id,
              ...(extra.trackId ? { trackId: extra.trackId } : {}),
              ...(extra.releaseId ? { releaseId: extra.releaseId } : {}),
            });
            if (!reqParse.success) return json(400, { err: "invalid stream request" }, cachePolicy);
            const args: StreamArgs = { type: "track", config, ...reqParse.data };
            return validated(streamResponseSchema, await handlers.stream!(args), cachePolicy);
          }
          case "lyrics": {
            if (rawType !== "track") return json(404, { err: "not found" }, cachePolicy);
            const reqParse = lyricsRequestSchema.safeParse({
              recordingId: id,
              ...(extra.trackId ? { trackId: extra.trackId } : {}),
            });
            if (!reqParse.success) return json(400, { err: "invalid lyrics request" }, cachePolicy);
            const args: LyricsArgs = { type: "track", config, ...reqParse.data };
            return validated(lyricsResponseSchema, await handlers.lyrics!(args), cachePolicy);
          }
        }
      } catch (err) {
        // Handler threw: report to diagnostics, return an opaque body (the
        // exception message can contain the configured credential).
        options.onError?.(err, { resource, path });
        return json(500, { err: `${resource} handler failed` }, cachePolicy);
      }
    } catch (err) {
      // Malformed percent-encoding (from an id or the extra segment) is a
      // controlled 400, never an escaped URIError / 500.
      if (err instanceof BadRequestError || err instanceof URIError) {
        return json(400, { err: "bad request" }, cachePolicy);
      }
      // Unexpected router-level failure: opaque body, diagnostics to the hook.
      options.onError?.(err, { path });
      return json(500, { err: "internal error" }, cachePolicy);
    }
  };

  /** Validate a handler's response against its protocol schema; a failure is an addon bug → opaque 500. */
  function validated(schema: ZodTypeAny, result: unknown, cachePolicy: Record<string, string> | undefined): RouterResponse {
    const parsed = schema.safeParse(result);
    if (!parsed.success) {
      options.onError?.(parsed.error, { path: "" });
      return json(500, { err: "addon returned an invalid response" }, cachePolicy);
    }
    return json(200, parsed.data, cachePolicy ?? cacheControl(parsed.data));
  }
}

interface ParsedResourcePath {
  resource: "catalog" | "meta" | "stream" | "lyrics";
  type: string;
  id: string;
  extra?: string;
}

const RESOURCE_NAMES = new Set(["catalog", "meta", "stream", "lyrics"]);

function parseResourcePath(segments: string[]): ParsedResourcePath | undefined {
  const [resource, ...rest] = segments;
  if (!resource || !RESOURCE_NAMES.has(resource)) return undefined;
  const last = rest[rest.length - 1];
  if (!last || !last.endsWith(".json")) return undefined;

  if (rest.length === 2) {
    // <type>/<id>.json
    return {
      resource: resource as ParsedResourcePath["resource"],
      type: rest[0]!,
      id: safeDecode(stripJson(rest[1]!)),
    };
  }
  if (rest.length === 3) {
    // <type>/<id>/<extra>.json
    return {
      resource: resource as ParsedResourcePath["resource"],
      type: rest[0]!,
      id: safeDecode(rest[1]!),
      extra: stripJson(rest[2]!),
    };
  }
  return undefined;
}

/** `decodeURIComponent` that converts malformed input into a controlled 400. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new BadRequestError("malformed percent-encoding");
  }
}

function stripJson(s: string): string {
  return s.slice(0, -".json".length);
}

function requireContentType(type: string): ContentType | undefined {
  const parsed = contentTypeSchema.safeParse(type);
  return parsed.success ? parsed.data : undefined;
}

/** Does a `meta` route's content type agree with its id's namespace? (Input mirror of the response schema.) */
function metaIdMatchesType(type: ContentType, id: string): boolean {
  switch (type) {
    case "artist":
      return isEntity(id, "artist");
    case "album":
      return isEntity(id, "release");
    case "track":
      return isEntity(id, "recording") || ISRC_ID_RE.test(id);
    case "playlist":
      return isPlaylistId(id);
  }
}

function cacheControl(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object") return {};
  const v = value as { cacheMaxAge?: unknown; staleRevalidate?: unknown; staleError?: unknown };
  const parts: string[] = [];
  if (typeof v.cacheMaxAge === "number") parts.push("public", `max-age=${v.cacheMaxAge}`);
  if (typeof v.staleRevalidate === "number") parts.push(`stale-while-revalidate=${v.staleRevalidate}`);
  if (typeof v.staleError === "number") parts.push(`stale-if-error=${v.staleError}`);
  return parts.length > 0 ? { "Cache-Control": parts.join(", ") } : {};
}
