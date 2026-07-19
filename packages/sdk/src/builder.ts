/**
 * `addonBuilder` — declare a manifest, register resource handlers, get a
 * servable interface. The music equivalent of stremio-addon-sdk's builder.
 *
 *     const builder = new AddonBuilder({ id: "…", version: "0.1.0", … });
 *     builder.defineStreamHandler(async ({ recordingId }) => ({ streams: [] }));
 *     serveHTTP(builder.getInterface(), { port: 7000 });
 */
import { manifestSchema, type Manifest, type Resource } from "@p2p-songs/protocol";
import { ZodError } from "zod";
import { AddonError } from "./errors.js";
import type {
  AddonHandlers,
  AddonInterface,
  CatalogHandler,
  MetaHandler,
  StreamHandler,
  LyricsHandler,
} from "./types.js";

export class AddonBuilder {
  readonly manifest: Manifest;
  private readonly handlers: AddonHandlers = {};

  constructor(manifest: unknown) {
    const parsed = manifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new AddonError(`invalid manifest: ${formatIssues(parsed.error)}`);
    }
    this.manifest = parsed.data;
  }

  private define<K extends Resource>(resource: K, handler: AddonHandlers[K]): this {
    if (!this.manifest.resources.includes(resource)) {
      throw new AddonError(
        `defined a ${resource} handler, but "${resource}" is not in the manifest's resources`,
      );
    }
    if (this.handlers[resource]) {
      throw new AddonError(`a ${resource} handler is already defined`);
    }
    this.handlers[resource] = handler;
    return this;
  }

  defineCatalogHandler(handler: CatalogHandler): this {
    return this.define("catalog", handler);
  }
  defineMetaHandler(handler: MetaHandler): this {
    return this.define("meta", handler);
  }
  defineStreamHandler(handler: StreamHandler): this {
    return this.define("stream", handler);
  }
  defineLyricsHandler(handler: LyricsHandler): this {
    return this.define("lyrics", handler);
  }

  /** Freeze into a servable interface. Every declared resource must have a handler. */
  getInterface(): AddonInterface {
    const missing = this.manifest.resources.filter((r) => !this.handlers[r]);
    if (missing.length > 0) {
      throw new AddonError(
        `manifest declares resources [${missing.join(", ")}] with no handler defined`,
      );
    }
    const handlers: AddonHandlers = { ...this.handlers };
    const manifest = this.manifest;
    return {
      manifest,
      handlers,
      hasHandler: (resource) => Boolean(handlers[resource]),
    };
  }
}

function formatIssues(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
