/**
 * Default `/configure` page. A self-contained HTML form that encodes a JSON
 * config into a base64url segment (in the browser) and shows the resulting
 * install URL `…/<encoded-config>/manifest.json` — the client side of the
 * round-trip in `config.ts`. Addons override this via `RouterOptions.configureHTML`.
 */
import type { AddonConfig } from "./config.js";
import type { Manifest } from "@p2p-songs/protocol";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function renderConfigurePage(ctx: { config?: AddonConfig; manifest: Manifest }): string {
  const name = escapeHtml(ctx.manifest.name);
  const current = escapeHtml(JSON.stringify(ctx.config ?? {}, null, 2));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Configure ${name}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  textarea { width: 100%; min-height: 10rem; font-family: ui-monospace, monospace; }
  code { word-break: break-all; }
  button { padding: .5rem 1rem; font: inherit; }
  .out { margin-top: 1rem; padding: .75rem; background: #f4f4f5; border-radius: .5rem; }
</style>
</head>
<body>
<h1>Configure ${name}</h1>
<p>Edit the JSON configuration, then generate your personal install URL. The
configuration is encoded into the URL — it is not stored on any server.</p>
<textarea id="cfg" spellcheck="false" aria-label="JSON configuration">${current}</textarea>
<p><button id="go" type="button">Generate install URL</button></p>
<div class="out" id="out" hidden>
  <div><strong>Install URL:</strong></div>
  <code id="url"></code>
</div>
<script>
  function base64url(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  }
  document.getElementById("go").addEventListener("click", function () {
    var raw = document.getElementById("cfg").value;
    var cfg;
    try { cfg = JSON.parse(raw); } catch (e) { alert("Invalid JSON: " + e.message); return; }
    var seg = base64url(JSON.stringify(cfg));
    var origin = location.origin;
    var url = origin + "/" + seg + "/manifest.json";
    document.getElementById("url").textContent = url;
    document.getElementById("out").hidden = false;
  });
</script>
</body>
</html>`;
}
