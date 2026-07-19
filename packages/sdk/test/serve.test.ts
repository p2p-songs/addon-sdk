import { describe, it, expect, afterEach } from "vitest";
import { AddonBuilder, serveHTTP, type AddonServer } from "../src/index.js";

const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// A complete "hello world" stream addon, served over real HTTP.
function helloWorld() {
  return new AddonBuilder({
    id: "com.p2p-songs.hello",
    version: "0.1.0",
    name: "Hello",
    description: "A minimal stream addon",
    resources: ["stream"],
    types: ["track"],
    idPrefixes: ["mbid:recording:"],
  })
    .defineStreamHandler(() => ({ streams: [{ url: "https://cdn.example/song.flac", name: "FLAC" }] }))
    .getInterface();
}

let server: AddonServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("serveHTTP (node:http)", () => {
  it("serves manifest + a resolved stream over HTTP", async () => {
    server = await serveHTTP(helloWorld(), { port: 0, log: false });
    const base = new URL(server.url).origin;

    const manifest = await fetch(`${base}/manifest.json`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("access-control-allow-origin")).toBe("*");
    expect((await manifest.json()).name).toBe("Hello");

    const stream = await fetch(`${base}/stream/track/${encodeURIComponent(REC)}.json`);
    expect(stream.status).toBe(200);
    const body = await stream.json();
    expect(body.streams[0].url).toBe("https://cdn.example/song.flac");
  });
});
