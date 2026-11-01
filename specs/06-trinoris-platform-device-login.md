# 06 — Trinoris platform device login

## Goal

Integrate the Trinoris platform account flow into the focused Code OSS build. Replace the product's own **Sign in / Login to Trinoris** entry points with the platform device-authorization flow used by `@trinoris/artifact-cli`, while preserving VS Code's general authentication-provider system for extensions and other independent identity providers.

This is a design specification. It does not add credentials or call platform endpoints.

## Launcher flow reviewed

The launcher spec `trinoris-launcher/specs/29-artifact-cli-device-auth-release.md` establishes these relevant properties:

- Device authorization is initiated through the Control Tower guest/device channel and bound to a specific operation and release intent.
- The user sees the complete verification URI and user-facing code, then approves in a browser while the client polls at the server-provided cadence.
- Device code, access token, and refresh token must not be printed.
- Bearer tokens stay in process memory and are not written to disk or passed in command-line flags.
- The authorization is narrowly scoped to the intended operation, project, app, and artifact digests; it is not a general-purpose identity token.
- The launcher flow does not cache platform tokens between invocations.

That flow is suitable for a VS Code **platform-specific authentication provider** only if the platform offers an authorization scope intended for interactive IDE sessions. The artifact-release scope must not be reused as a general editor login.

## VS Code integration boundary

VS Code has an authentication service with registered providers, accounts, sessions, provider login actions, and account activity UI. The integration should add a Trinoris provider through this service and route Trinoris-owned sign-in actions to it. Do not replace the authentication service itself or suppress sign-in actions owned by GitHub, Microsoft, Azure, or third-party extensions.

The phrase “replace Sign In/Login of VS Code to the platform” is interpreted as replacing the branded product's platform-account login surfaces. It does **not** mean changing all VS Code authentication providers. Product-specific entry points to inventory include Accounts menu actions, welcome/onboarding prompts, platform-owned commands, and any Trinoris feature that requires a platform session. Each should link to the same device-flow command and provider.

### Top-left Accounts control

The requested UI is the **Accounts activity control in the workbench title bar / global activity area** (`AccountsActivityActionViewItem` in `src/vs/workbench/browser/parts/globalCompositeBar.ts`, placed by `titlebarPart.ts`). Its menu is shared by multiple providers, so replacing the whole control would remove unrelated extension sign-in and account actions.

For the Trinoris-focused product:

- When signed out of Trinoris, the top-left Accounts menu presents **Sign in to Trinoris** as the primary product account action and starts the device flow.
- When signed in, it shows the Trinoris account label and **Sign out of Trinoris**.
- Keep other registered providers available under their own provider/account labels. Never relabel a GitHub, Microsoft, Azure, or extension account as a Trinoris account.
- Remove or retarget only product-owned “Sign in to VS Code / Sign in to Sync Settings” prompts if their intended service is being migrated. Settings Sync currently discovers authentication providers; it must not silently use a Trinoris session unless a compatible sync backend and scopes are explicitly implemented.
- Preserve Accounts menu visibility, activity badges, extension authentication prompts, and account-management commands. Provider-specific sign-in actions route through the `trinoris` provider.

Acceptance for the top-left control: the signed-out menu has an unambiguous **Sign in to Trinoris** action; choosing it opens device authorization; approval updates the account label/menu; sign-out clears only the Trinoris session; and other provider actions remain functional.

## UX specification

### Entry points

- Accounts menu: **Sign in to Trinoris** when signed out; account label and **Sign out** when signed in.
- Command Palette: **Trinoris: Sign In** and **Trinoris: Sign Out**.
- Any platform-owned feature requiring authentication opens the same flow and supplies a clear reason, such as “Sign in to publish this artifact.”
- Do not replace unrelated provider actions or show a generic “Sign in to VS Code” CTA that implies the Trinoris session authenticates extensions.

### Device flow

1. User selects **Sign in to Trinoris**. The provider requests a device authorization from the platform's documented IDE login endpoint.
2. Show a focused dialog/webview with verification URL, short user code, copy buttons, expiry countdown, and **Open Browser** action. Explain that approval happens on the Trinoris platform.
3. Poll only at the server-provided interval, with bounded backoff for `slow_down`, cancellation, and expiry handling. Do not poll faster than instructed.
4. On approval, exchange device grant for a scoped IDE session. Show signed-in account label and completion; remove the user code from UI state.
5. On denial, timeout, network failure, or cancellation, show a specific retry option and do not leave a partial account/session.

Opening the external verification URI must use VS Code's opener service. Validate the URI scheme and expected platform origin before opening. Never accept a browser redirect containing a bearer token as the primary flow; completion should be confirmed through the back-channel poll or a platform-documented secure callback.

## Provider and token model

Implement a provider ID such as `trinoris` using VS Code's `IAuthenticationService.registerAuthenticationProvider` contract. Expose a human-readable account identity and session scopes consistent with the platform. Use the provider's secure secret-storage integration for any refresh credential only if the platform's IDE-session contract requires persistence and security review approves it. Otherwise keep access/refresh material in memory and reauthenticate after restart, matching the launcher’s current conservative behavior.

Tokens must be audience-restricted to Trinoris APIs and must not be shared with arbitrary extensions. Never place tokens in settings, workspace files, `.trinoris/`, logs, telemetry, command arguments, URLs, handoff notes, or environment variables. Logs may include request IDs and coarse state transitions only. Logout revokes the platform session when supported and clears provider session/secret state.

Feature operations request least-privilege scopes at use time where supported. Device login establishes a platform session; it does not itself authorize every project, tenant, feature, release, upload, or publish operation. The server remains the authorization authority.

## Architecture

```text
Accounts / command / Trinoris feature
               │
               ▼
VS Code IAuthenticationService
               │ provider id: trinoris
               ▼
Trinoris AuthenticationProvider
  ├── Device Authorization client
  ├── platform endpoint/configuration
  ├── polling, cancellation, expiry
  └── secure in-memory/secret-storage session handling
               │ HTTPS
               ▼
Trinoris Control Tower device-auth API
```

Separate components:

- **Provider** implements VS Code account/session lifecycle and emits account/session change events.
- **Device-flow controller** owns one cancellable attempt, validates response shape, respects polling interval/expiry, and prevents duplicate concurrent login attempts.
- **Platform client** owns HTTPS requests, endpoint allow-list, timeouts, response bounds, and error mapping. Endpoint configuration must come from trusted product configuration, not workspace settings.
- **Product integration** replaces only Trinoris-owned login commands and prompts, and requests a provider session for platform actions.

Prefer a first-party optional `trinorisAuth` contribution/provider in the focused build. Do not couple it to Copilot Chat or the coordination panel. If implemented as a separately installed extension, its full extension ID and dependencies must be explicitly declared and explicitly installed.

## Configuration and environments

- Production platform origin is product-level configuration, signed/reviewed with the build; never allow a workspace to redirect login/token traffic.
- Development/test origins require an explicit development build setting and must be visibly distinguishable.
- Support desktop first. Web builds need a separate review of browser popup behavior, CORS, storage, and cross-origin polling before claiming support.
- Offline or unavailable platform: leave editor and terminal usable; show sign-in as unavailable with retry/status, never block workspace startup.

## Security and privacy requirements

- TLS only; validate hostname against the configured origin and do not follow redirects to an unapproved host for token-bearing requests.
- Validate device authorization responses and cap code lengths, intervals, response size, and total flow duration.
- Protect against CSRF and login substitution using the server-defined device grant, client identifier, and any nonce/state required by the platform contract.
- Do not log device code, user code if treated as secret by the server, access/refresh tokens, authorization headers, or PII beyond the approved account label.
- Do not open or trust arbitrary URLs returned by an untrusted response; accept verification URL only from configured platform hosts.
- Cancellation stops polling and drops temporary codes. Expiry/denial clears the attempt state.
- Keep extension authentication isolation intact: provider scopes, session lookup, and consent prompts remain provider-specific.

## Failure and account behavior

Represent signed-out, requesting, awaiting approval, polling, signed-in, denied, expired, cancelled, network error, and service error as distinct states. Prevent two overlapping device flows for the same provider. If multiple accounts are supported, use VS Code's account picker and never silently switch an account during a protected action. If a session expires, ask the provider to reauthenticate; never retry a privileged write invisibly after login without re-confirming the operation intent.

## Open platform contract questions

These must be answered by the launcher/platform API before implementation:

1. Is there a dedicated IDE/editor device-auth client and scope, separate from artifact release authorization?
2. What exact start, poll, cancel, expiry, and token-exchange endpoints and response schemas are supported?
3. What is the token audience, lifetime, refresh/revocation behavior, and approved storage policy?
4. Which user identity claims may VS Code display, and is multi-account login supported?
5. Are device codes considered secrets, and what rate limits/lockout rules apply?
6. What redirect, CORS, popup, and storage constraints apply to a web build?

The launcher spec currently documents an operation-bound artifact publishing flow, not sufficient evidence of a reusable IDE login contract. Implementation must not reinterpret that narrow flow as general platform login.

## Acceptance criteria

- Trinoris-owned Sign In actions use the provider's device flow; unrelated VS Code auth providers remain available and unchanged.
- Device flow follows the server polling cadence and handles approval, denial, cancellation, expiry, and errors.
- No device/access/refresh token is written to workspace files, command lines, logs, or telemetry.
- Restart behavior matches the approved platform session storage contract.
- A Trinoris session does not imply authorization for every platform operation; server authorization remains enforced.
- Editor startup and local coding remain usable when the platform is offline or the user is signed out.
- Desktop and web support are declared separately until each environment passes its auth flow review.
