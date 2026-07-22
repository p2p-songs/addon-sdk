/** node:http adapter over {@link createRouter} (PROTOCOL.md §1). */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRouter, type RouterOptions } from "./router.js";
import type { AddonInterface } from "./types.js";

export interface ServeOptions extends RouterOptions {
  /** Port to listen on (default 7000). */
  port?: number;
  /** Hostname/interface to bind (default "127.0.0.1"). */
  hostname?: string;
  /** Log the install URL on start (default true). */
  log?: boolean;
}

export interface AddonServer {
  /** The manifest URL to install. */
  url: string;
  port: number;
  /** Stop the server. */
  close: () => Promise<void>;
}

/** Serve an addon over HTTP. Resolves once listening. */
export function serveHTTP(addon: AddonInterface, options: ServeOptions = {}): Promise<AddonServer> {
  const port = options.port ?? 7000;
  const hostname = options.hostname ?? "127.0.0.1";
  const router = createRouter(addon, options);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    router({ method: req.method ?? "GET", url: req.url ?? "/", headers: req.headers })
      .then((r) => {
        res.writeHead(r.status, r.headers);
        res.end(r.body);
      })
      .catch((err: unknown) => {
        // The router resolves for all normal errors; this only fires on an
        // adapter-level failure. Report to diagnostics, return an opaque body —
        // the error may contain a configured credential (audit A-005).
        options.onError?.(err, { path: req.url ?? "" });
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" });
        res.end(JSON.stringify({ err: "internal error" }));
      });
  });

  return new Promise<AddonServer>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, hostname, () => {
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      const url = `http://${hostname}:${boundPort}/manifest.json`;
      if (options.log !== false) {
        // eslint-disable-next-line no-console
        console.log(`${addon.manifest.name} listening — install: ${url}`);
      }
      resolve({
        url,
        port: boundPort,
        close: () =>
          new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
  });
}
