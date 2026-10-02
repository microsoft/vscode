<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Direct fetch helpers

The `createFetch` helpers return ordinary fetch functions for callers that own application retries, deadlines, response limits and redirect handling. They are not services, do not replace global fetch, and do not use `IRequestService.request` or fetch IPC.

- [Common](common/fetch.ts): wraps a supplied fetch, or the runtime's fetch by default. Requests require HTTP(S), omit ambient origin credentials, and expose redirects for the caller to handle. Explicit authorization headers and no-referrer policies are preserved.
- [Node](node/fetch.ts): lazily applies `@vscode/proxy-agent` to the runtime's fetch, using host proxy, Basic/Kerberos and certificate lookup callbacks and local-machine configuration.
- [Electron utility process](electron-utility/fetch.ts): supplies native-host networking with a utility-process proxy lookup that does not depend on a renderer window.

Standard fetch owns connection pools, HTTP 421 recovery, streaming decompression and response objects. There is no custom Undici request path, retry interceptor or decompression adapter. One fetch invocation can therefore produce more than one physical attempt. Callers must consume or cancel every response; abort signals govern request and body cancellation.

## Proxy and certificate behavior

Node routing follows the proxy helper's precedence and loopback bypass: `http.noProxy`/`NO_PROXY`, configured/environment proxies, then host system/PAC lookup. Network-interface changes invalidate cached system routes at `http.experimental.networkInterfaceCheckInterval`. Configuration comes from local-user/default values, not remote-workspace settings.

`http.proxyAuthorization` is supplied to proxy CONNECT requests rather than the origin and is not repeatedly resent after rejection. Kerberos uses the existing host lookup. With `http.systemCertificates` enabled, additional host certificates honor `http.systemCertificatesNode` and retain Node's default CA set.

Certificate and hostname verification remain enabled by default. `http.proxyStrictSSL: false` is not translated into a verification bypass or weaker-TLS retry. Extension-specific proxy/fetch switches do not select this core helper. Proxy diagnostics do not include URLs, credentials or response bodies.

The helper does not promise full Chromium parity: SOCKS4/4a, native NTLM, ordered PAC failover and Chromium certificate exceptions are not reproduced. Browser use retains browser/OS networking, CORS and opaque manual-redirect limitations.
