# Plan 29 iter 4 - MCP resolution + API auth: HTTP-level verification

The proxy (`scripts/lwd-anthropic-proxy.js`) was run on port 8090 with the demo MCP config, and a tiny
offline MCP server (`scripts/lwd-demo-mcp-server.js`, serving rows from `scripts/lwd-demo-mcp-data.json`)
was spawned by the proxy on demand. This proves the `mcp` source kind resolves a real value end to end and
that an authenticated `api` source works without the secret ever reaching the caller - both at the seam the
renderer actually calls (the same trust boundary as the model calls, decision 14).

Start:

```
LWD_PROXY_PORT=8090 LWD_MCP_CONFIG="$(pwd)/scripts/lwd-demo-mcp.json" node scripts/lwd-anthropic-proxy.js
$ curl -s http://127.0.0.1:8090/healthz
{"ok":true,"backend":"anthropic"}
```

## Test A - the demo MCP server speaks stdio JSON-RPC (initialize + tools/call)

Piping two newline-delimited JSON-RPC messages straight into the server:

```
$ printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query","arguments":{}}}' \
  | node scripts/lwd-demo-mcp-server.js
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"lwd-demo-mcp","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"period\":\"2026-W24\",\"total\":128000,\"won\":47,\"open\":88}"}],"isError":false}}
```

## Test B - the proxy /mcp/resolve route resolves a real value and reuses the server

The proxy spawns the configured `demo` server, does the `initialize` handshake, calls `tools/call`, and
extracts the requested `field`. The second call reuses the already-spawned server.

```
$ curl -s -X POST http://127.0.0.1:8090/mcp/resolve -H 'content-type: application/json' \
    -d '{"server":"demo","tool":"query","field":"total"}'
{"value":"128,000","raw":"{\"period\":\"2026-W24\",\"total\":128000,\"won\":47,\"open\":88}"}

$ curl -s -X POST http://127.0.0.1:8090/mcp/resolve -H 'content-type: application/json' \
    -d '{"server":"demo","tool":"query","field":"won"}'
{"value":"47","raw":"{\"period\":\"2026-W24\",\"total\":128000,\"won\":47,\"open\":88}"}
```

`bind:pipeline@mcp:demo.query/total` therefore resolves to `128,000` through the proxy - the value a
document's bound figure shows.

## Test C - a down / unknown server degrades to a structured error (flagged stale, not a toast)

```
$ curl -s -X POST http://127.0.0.1:8090/mcp/resolve -H 'content-type: application/json' \
    -d '{"server":"missing","tool":"query","field":"total"}'
{"error":{"type":"mcp_error","message":"no MCP server \"missing\" configured in .../scripts/lwd-demo-mcp.json"}}

$ curl -s -X POST http://127.0.0.1:8090/mcp/resolve -H 'content-type: application/json' \
    -d '{"server":"demo","tool":"nope"}'
{"error":{"type":"mcp_error","message":"unknown tool: nope"}}
```

The service treats a missing `value` / an `error` as unresolved: the binding keeps its placeholder and flags
stale, the document still renders (covered by the unit test "a down mcp server leaves the binding
unresolved ... and the document still renders").

## Test D - API auth: the secret is injected server-side and never leaves the proxy

A secret is stored via the proxy CLI into `~/.abstract/secrets.json` (0600), keyed by name:

```
$ node scripts/lwd-anthropic-proxy.js set-secret demo-token "sk-secret-12345"
[lwd-proxy] stored secret "demo-token" in /Users/.../.abstract/secrets.json (0600)
$ ls -l ~/.abstract/secrets.json
-rw-------  1 user  staff  38  secrets.json
```

A local echo API returns whatever `Authorization` header it received. The renderer calls the proxy's
`/proxy/fetch` route naming ONLY the secret (`"auth":"demo-token"`) - never its value:

```
$ curl -s -X POST http://127.0.0.1:8090/proxy/fetch -H 'content-type: application/json' \
    -d '{"url":"http://127.0.0.1:8099/data","auth":"demo-token"}'
{"stars":4021,"received_auth":"Bearer sk-secret-12345"}

$ curl -s -X POST http://127.0.0.1:8090/proxy/fetch -H 'content-type: application/json' \
    -d '{"url":"http://127.0.0.1:8099/data"}'
{"stars":4021,"received_auth":null}
```

The upstream received `Bearer sk-secret-12345` although the caller sent only the name `demo-token`; with no
`auth` named, no header is injected. The secret value exists only in `~/.abstract/secrets.json` and the
proxy process - never in the request body, the renderer, or the lock. The unit test "an authenticated api
source resolves via the proxy and the secret VALUE never leaves the proxy" asserts the renderer sends only
the clean URL + the secret name.

## What is verified at the seam vs. in-app

The MCP stdio spawn and the credential injection happen in the proxy (the web build cannot spawn a process
or hold a credential - by design). These are therefore verified at the HTTP seam the renderer calls
(above) plus the service-side unit tests that drive the `mcp`/`api-auth` branches through a stubbed proxy
response. A full desktop in-app pass (a document bound to `bind:pipeline@mcp:demo.query/total` rendering
`128,000`, and source-peek showing the MCP payload) reuses exactly this seam; it was not driven through the
packaged Electron build here (chrome-devtools is browser-bound, matching the decision-71 precedent for
desktop-only spawn paths). The gap is the packaged-desktop click-through only; the resolution path itself is
proven end to end above.
