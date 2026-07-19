/**
 * Framework-agnostic request router (PROTOCOL.md §1, §5, §6). Maps a
 * `{ method, url }` to a `{ status, headers, body }` with no dependency on any
 * particular server — `serveHTTP` is a thin node:http adapter over this, and
 * tests drive it directly.
 *
 * Responsibilities: CORS on every response, `OPTIONS` preflight, stripping the
 * optional leading `/configure` config segment, routing the manifest + resource
 * routes, keying stream/lyrics by recording (validated against the protocol
 * request schemas), validating each handler's response against the protocol
 * response schemas, and mapping cache hints to `Cache-Control`.
 */
import {
  catalogResponseSchema,
  metaResponseSchema,
  streamResponseSchema,
  lyricsResponseSchema,
  streamRequestSchema,
  lyricsRequestSchema,
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
}

export interface RouterResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface RouterOptions {
  /** Render the `/configure` HTML page. Defaults to a built-in page. */
  configureHTML?: (ctx: { config?: AddonConfig; manifest: AddonInterface["manifest"] }) => string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export type Router = (req: RouterRequest) => Promise<RouterResponse>;

/** Build a router for a servable addon interface. */
export function createRouter(addon: AddonInterface, options: RouterOptions = {}): Router {
  const configureHTML = options.configureHTML ?? renderConfigurePage;

  function json(status: number, value: unknown, extraHeaders?: Record<string, string>): RouterResponse {
    return {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
      body: JSON.stringify(value),
    };
  }
  const notFound = () => json(404, { err: "not found" });

  return async function route(req: RouterRequest): Promise<RouterResponse> {
    const method = req.method.toUpperCase();
    if (method === "OPTIONS") return { status: 204, headers: CORS_HEADERS, body: "" };
    if (method !== "GET") return json(405, { err: "method not allowed" });

    const path = req.url.split("?", 1)[0]!;
    let segments = path.split("/").filter((s) => s.length > 0);

    // Strip the optional leading config segment (any non-reserved first segment).
    let config: AddonConfig | undefined;
    if (segments.length > 0 && !RESERVED_ROOT_SEGMENTS.has(segments[0]!)) {
      config = decodeConfig(segments[0]!);
      segments = segments.slice(1);
    }

    if (segments.length === 0) return notFound();
    const head = segments[0]!;

    if (head === "manifest.json" && segments.length === 1) {
      return json(200, addon.manifest, cacheControl({ cacheMaxAge: 3600 }));
    }
    if (head === "configure" && segments.length === 1) {
      return {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
        body: configureHTML({ config, manifest: addon.manifest }),
      };
    }

    // Resource routes: <resource>/<type>/<id>.json  (+ optional /<extra>.json)
    const parsed = parseResourcePath(segments);
    if (!parsed) return notFound();
    const { resource, type, id, extra: extraSeg } = parsed;

    if (!addon.hasHandler(resource)) return notFound();
    const extra = parseExtra(extraSeg);
    const handlers = addon.handlers;

    try {
      switch (resource) {
        case "catalog": {
          const args: ResourceArgs = { type, id, extra, config };
          return validated(catalogResponseSchema, await handlers.catalog!(args), "catalog", json);
        }
        case "meta": {
          const args: ResourceArgs = { type, id, extra, config };
          return validated(metaResponseSchema, await handlers.meta!(args), "meta", json);
        }
        case "stream": {
          const reqParse = streamRequestSchema.safeParse({
            recordingId: id,
            ...(extra.trackId ? { trackId: extra.trackId } : {}),
            ...(extra.releaseId ? { releaseId: extra.releaseId } : {}),
          });
          if (!reqParse.success) return json(400, { err: "invalid stream request", detail: issues(reqParse.error) });
          const args: StreamArgs = { type, config, ...reqParse.data };
          return validated(streamResponseSchema, await handlers.stream!(args), "stream", json);
        }
        case "lyrics": {
          const reqParse = lyricsRequestSchema.safeParse({
            recordingId: id,
            ...(extra.trackId ? { trackId: extra.trackId } : {}),
          });
          if (!reqParse.success) return json(400, { err: "invalid lyrics request", detail: issues(reqParse.error) });
          const args: LyricsArgs = { type, config, ...reqParse.data };
          return validated(lyricsResponseSchema, await handlers.lyrics!(args), "lyrics", json);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(500, { err: `${resource} handler failed`, detail: message });
    }
  };
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
      id: decodeURIComponent(stripJson(rest[1]!)),
    };
  }
  if (rest.length === 3) {
    // <type>/<id>/<extra>.json
    return {
      resource: resource as ParsedResourcePath["resource"],
      type: rest[0]!,
      id: decodeURIComponent(rest[1]!),
      extra: stripJson(rest[2]!),
    };
  }
  return undefined;
}

function stripJson(s: string): string {
  return s.slice(0, -".json".length);
}

/** Validate a handler's response against its protocol schema; a failure is an addon bug → 500. */
function validated(
  schema: ZodTypeAny,
  result: unknown,
  resource: string,
  json: (status: number, value: unknown, extra?: Record<string, string>) => RouterResponse,
): RouterResponse {
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    return json(500, { err: `addon returned an invalid ${resource} response`, detail: issues(parsed.error) });
  }
  return json(200, parsed.data, cacheControl(parsed.data));
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

function issues(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
