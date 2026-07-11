# Single-Iframe Electron Webviews Without Service Workers

## Summary

- Add an experimental Electron-only loader selected with `"enabledApiProposals": ["webviewNoServiceWorker"]`.
- Use exactly one iframe loading `vscode-webview://<extension-id>/<instance-id>/index.html`.
- Use the normalized extension ID as the readable authority and the existing webview handle/iframe ID as the instance ID. These are routing identifiers, not secrets.
- Sandbox the iframe with `allow-scripts` and conditional forms/downloads/pointer-lock permissions, but never `allow-same-origin`.
- Keep the existing service-worker implementation unchanged for non-opted extensions and VS Code for the Web.

## Identity and security boundaries

- Register each `<extension-id>/<instance-id>` pair with its owning workbench window and iframe.
- Validate every document and resource request against that registration, its requesting frame, and the instance's current `localResourceRoots`.
- Do not authorize from CORS, `Origin`, or identifier secrecy. Opaque sandbox frames serialize their origin as `null`.
- Reject cross-extension and cross-instance document navigations and resource requests, including instances owned by the same extension.
- Revoke registrations and cancel outstanding work when an iframe or owning window is disposed.

## Document and API loading

- Enable the loader only when the proposal is granted and the UI client is Electron.
- In the workbench renderer, transform dynamic `webview.html`, inject default styles and a static hashed bootstrap, extract its CSP, and register the current document with Electron main before navigation.
- Navigate the single iframe directly to the currently registered document at a stable, query-free URL. Re-register and navigate on HTML changes, and queue messages while a new document handshakes.
- The bootstrap installs `acquireVsCodeApi`, owns a `MessageChannel`, preserves state and messaging semantics, and handles themes, focus, keyboard, drag/drop, links, and load events.
- Validate the handshake with `event.source`, instance ID, and an injected per-navigation generation value rather than URL parameters or `event.origin`.

## Protocol and resources

- In experimental mode, make `asWebviewUri` return resources below `vscode-webview://<extension-id>/<instance-id>/_vscode/resource/...`; preserve source paths, queries, and fragments. Keep HTTP(S) and legacy behavior unchanged.
- Extend the existing Electron protocol handler to serve registered documents and authorized resources for `GET` and `HEAD` only.
- Load ordinary local files beneath the extension's own canonical directory directly in Electron main with `net.fetch`. Keep the renderer bridge for remote and virtual providers, additional resource roots, ranges, conditional requests, and fallback compatibility.
- Preserve current status, MIME, ETag, range, media, and port-mapping behavior without Cache Storage.
- Decode resource URIs once, reject malformed/traversal inputs, enforce `localResourceRoots`, and use canonical real paths where the provider supports them.

## CSP

- Require one non-empty extension-authored CSP meta tag, remove it from the document, and return it as a response header.
- Add the exact bootstrap hash. When extension scripts are disabled, add an enforcement policy allowing only the bootstrap.
- Fail closed for missing or ambiguous CSP; do not silently fall back.
- Add `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, appropriate CORS/CORP headers, and `Cache-Control: no-store` for HTML.

## Compatibility and tests

- Leave legacy extensions, browser clients, internal webviews, and notebook renderers unchanged.
- Treat origin-bound storage and service workers as unsupported in the opaque-origin experimental mode; persistent state uses the VS Code API.
- Add a minimal built-in extension with one command, a panel, stylesheet, image, API message round trip, and persisted visible state.
- Add unit coverage for gating, URL parsing, CSP transformation, registrations and ownership, document updates, cancellation, root containment, symlink escape, ranges, CORS, and headers.
- Add Electron coverage for the single iframe, readable URL, opaque sandbox, API behavior, resources, remote/virtual providers, port mapping, cross-instance denial, absence of worker/cache activity, and legacy compatibility.
- Begin with a feasibility check for opaque custom-protocol documents, response-header CSP, parent messaging, modules, fonts, media, and fetch. Do not reintroduce the second iframe or `allow-same-origin` if a Chromium limitation is found.
