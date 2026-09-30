# Single-attempt workbench fetch

`IFetchService` is a local HTTP executor for callers, such as the portable GitHub
engine, that own retries, redirects, admission, deadlines, and response-byte
limits. It is separate from `IRequestService.request`: it does not inherit that
API's buffering, application retries, network logging, or web-to-remote fallback.

## Bindings

- **Desktop:** the engine remains in the workbench. A pull-based `FetchChannel`
  delegates individual wire attempts to `NodeFetchService` in the main process.
  The reusable executor and channel live in this platform folder, not in the
  workbench registration. The same executor can be hosted elsewhere later.
- **Web:** `BrowserFetchService` uses browser fetch. Browser/OS trust, CORS, exposed
  headers, and opaque manual redirects still apply. JavaScript cannot install CAs
  or configure the browser's proxy or connection-level retries. There is no
  application retry or automatic remote fallback in this binding.
- **Standalone Agent Host:** keeps its independently injected proxy-resolver
  fetch; it does not depend on either workbench binding.

Desktop uses Undici's lower-level `request` with the existing
`@vscode/proxy-agent` routing, authentication and certificate helpers. It disables
connection-level replay and exposes every final HTTP response, including 421,
without fetch's automatic redispatch. Compressed response bodies are decoded
incrementally, including error bodies used for rate-limit handling. Electron
`session.fetch` rejects manual redirects, and `net.request` can transparently
replay a POST after a server consumes the upload and closes without a response.
Neither behavior is suitable for the engine's attempt budget or mutations.

## Proxy and certificate compatibility

Desktop reuses the proxy-agent resolution order, including its loopback bypass:
`http.noProxy`/`NO_PROXY`, `http.proxy`/proxy environment variables, then the
existing Electron session's system/PAC lookup. These are **local-machine**
settings and services even when a remote workspace is open. No request moves
between machines after a failure. System/PAC answers are invalidated when a
network-interface change is detected, checked at
`http.experimental.networkInterfaceCheckInterval` (300 seconds by default).

This reuses the shared Node helper, not the entire Chromium proxy stack:

- SOCKS4/SOCKS4a proxies are not supported by its fetch dispatcher. HTTP(S) and
  SOCKS5 use the existing helper.
- Native NTLM authentication, including Windows Negotiate-to-NTLM fallback, is
  not supported.
- A PAC result is reduced to one route; ordered proxy failover lists are not
  preserved. A failed connection is reported, not replayed on another route.

These are compatibility differences from the former renderer binding, not
promises of full Chromium proxy parity. They need shared-helper support if
required; this binding does not add a separate proxy resolver or auth stack.

Proxy authentication uses the existing host Basic/Kerberos lookup services.
`http.proxyAuthorization`, when set, is applied to the proxy CONNECT request,
not the origin request. A rejected configured authorization is not repeatedly
resent. `http.proxyKerberosServicePrincipal` continues to apply through the
existing host Kerberos lookup.

With `http.systemCertificates` enabled, the existing host certificate loader
adds OS certificates, honoring `http.systemCertificatesNode`. Node's configured
default CA set is retained when adding those certificates. Supported Node CA
environment configuration belongs to that runtime, not to the browser. This is
not a new trust store and does not install or modify OS certificates.

Verification and hostname checking remain enabled by default. The executor does
not translate `http.proxyStrictSSL: false` into a verification bypass or retry
with weaker TLS settings. Extension-specific switches (`http.proxySupport`,
`http.fetchAdditionalSupport`, and the experimental global TLS patch) do not
disable or select this core executor. It does not reproduce Chromium-specific
certificate exceptions, and does not promise identical trust decisions in every
Node, Electron, browser, and remote environment.

## Request lifetime

- Each desktop invocation permits one origin attempt. Proxy authentication
  negotiation happens before an origin request; the engine owns application
  retries. The web binding cannot make the same guarantee about browser-internal
  network retries.
- Redirects are manual. Origin credentials are supplied explicitly by the
  caller; cookies and ambient origin credentials are not added.
- Response headers are returned without buffering the response body. IPC pulls
  at most 64 KiB per read, with no eager client-side prefetch.
- The response subscription owns the native request through body consumption.
  Abort, body cancellation, IPC disconnection, and renderer termination release
  it. Callers must consume or cancel every response, including discarded redirects
  and retry responses.
- Request uploads are buffered; this is not a streaming-upload API.
- Neither the channel nor proxy diagnostics log request URLs, signed redirect
  targets, credentials, response headers, or response bodies. Network failures
  expose only bounded error codes.

This binding does not add engine retry budgets, API response limits, or deadlines;
those remain engine responsibilities and can evolve independently.

## Focused tests

Run the request and GitHub binding tests with fresh transpiled output:

```powershell
npm run transpile-client
.\scripts\test.bat `
  --run src\vs\platform\request\test\common\fetchIpc.test.ts `
  --run src\vs\platform\request\test\browser\fetchService.test.ts `
  --run src\vs\platform\request\test\node\fetchService.test.ts `
  --run src\vs\platform\request\test\electron-main\fetchIpc.test.ts `
  --run src\vs\platform\github\test\node\githubFetch.test.ts `
  --run src\vs\workbench\services\github\test\browser\githubService.test.ts `
  --run src\vs\platform\github\test\node\githubTransport.test.ts `
  --run src\vs\platform\github\test\node\githubService.test.ts `
  --run src\vs\base\parts\ipc\test\common\ipc.test.ts

npm run test-node -- `
  --run src\vs\platform\request\test\node\fetchService.test.ts `
  --run src\vs\platform\github\test\node\githubFetch.test.ts
```

The real-wire tests also run in Node. They verify that neither a GET nor a fully
consumed POST is repeated after the server closes without sending a response or
returns HTTP 421, including on a warmed keep-alive connection. They cover
streaming decompression, cancellation, and the engine's decoded-byte limit.
