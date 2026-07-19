/** Handler + interface types (PROTOCOL.md §5). */
import type {
  Manifest,
  Resource,
  ContentType,
  CatalogResponse,
  MetaResponse,
  StreamResponse,
  LyricsResponse,
  StreamRequest,
  LyricsRequest,
} from "@p2p-songs/protocol";
import type { AddonConfig } from "./config.js";
import type { Extra } from "./extra.js";

/** Common context every handler receives. `config` is the decoded `/configure` value, if any. */
export interface HandlerContext {
  /** Decoded per-install configuration, or `undefined` if the install is unconfigured. */
  config?: AddonConfig;
}

/**
 * Args for catalog/meta — `id` is the catalog id or content id from the route.
 * The router has already validated `type` is a protocol content type.
 */
export interface ResourceArgs extends HandlerContext {
  type: ContentType;
  id: string;
  extra: Extra;
}

/**
 * Args for stream/lyrics — keyed by recording (the streamable unit). The router
 * has already validated `type` is `track`, `recordingId` is an `mbid:recording:`
 * id, and pulled the optional album context out of `<extra>`.
 */
export interface StreamArgs extends HandlerContext, StreamRequest {
  type: "track";
}
export interface LyricsArgs extends HandlerContext, LyricsRequest {
  type: "track";
}

export type CatalogHandler = (args: ResourceArgs) => Promise<CatalogResponse> | CatalogResponse;
export type MetaHandler = (args: ResourceArgs) => Promise<MetaResponse> | MetaResponse;
export type StreamHandler = (args: StreamArgs) => Promise<StreamResponse> | StreamResponse;
export type LyricsHandler = (args: LyricsArgs) => Promise<LyricsResponse> | LyricsResponse;

export interface AddonHandlers {
  catalog?: CatalogHandler;
  meta?: MetaHandler;
  stream?: StreamHandler;
  lyrics?: LyricsHandler;
}

/**
 * The built, servable addon: a validated manifest plus its registered handlers.
 * Consumed by {@link import("./router.js").createRouter} / `serveHTTP`.
 */
export interface AddonInterface {
  readonly manifest: Manifest;
  readonly handlers: Readonly<AddonHandlers>;
  hasHandler(resource: Resource): boolean;
}
