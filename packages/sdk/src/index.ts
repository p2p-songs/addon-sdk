/**
 * @p2p-songs/addon-sdk — build a p2p-songs addon: declare a manifest, register
 * typed resource handlers, serve them over a CORS'd HTTP router with a
 * `/configure` round-trip. The music equivalent of stremio-addon-sdk.
 *
 * Spec: ../../docs/PROTOCOL.md · Contract types: `@p2p-songs/protocol`.
 */
export { AddonBuilder } from "./builder.js";
export { AddonError } from "./errors.js";
export { createRouter } from "./router.js";
export type { Router, RouterRequest, RouterResponse, RouterOptions } from "./router.js";
export { serveHTTP } from "./serve.js";
export type { ServeOptions, AddonServer } from "./serve.js";
export { encodeConfig, decodeConfig, RESERVED_ROOT_SEGMENTS } from "./config.js";
export type { AddonConfig } from "./config.js";
export { parseExtra, stringifyExtra } from "./extra.js";
export type { Extra } from "./extra.js";
export { renderConfigurePage } from "./configure-page.js";
export type {
  AddonInterface,
  AddonHandlers,
  HandlerContext,
  ResourceArgs,
  StreamArgs,
  LyricsArgs,
  CatalogHandler,
  MetaHandler,
  StreamHandler,
  LyricsHandler,
} from "./types.js";

/** Re-export the wire contract so addon authors need only one dependency. */
export * from "@p2p-songs/protocol";
