<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Copilot Connectors

Copilot Connectors are discovered and managed through the GitHub Copilot Connectors API ([request adapter](common/copilotConnectorsRequestService.ts)). Discovery and enterprise policy display work with any GitHub session. Connecting, disconnecting, and MCP reconciliation of a connector require a token with `write:plugin_gateway_connections` ([`copilotConnectorsScope`](common/copilotConnectorsRequestService.ts)). Without it, requests fail with `403 insufficient_scope`.

## Shared GitHub sign-in scopes

The GitHub authentication provider matches sessions by their **exact** scope set. Only consumers that request identical scopes share one session. Starting with VS Code 1.143, the shared GitHub sign-in scope set includes the connectors scope:

```text
read:user user:email repo workflow write:plugin_gateway_connections
```

A user who completes a new standard GitHub sign-in can therefore connect a connector without another prompt. The Copilot Connectors service and the Agent Host already prefer a same-account session that carries the scope, so its token reaches connection requests and connector MCP reconciliation.

### Sessions that predate the change

Existing sessions created with `read:user user:email repo workflow` remain valid. Updating VS Code must not force anyone to sign in again:

- The default account matches sessions by subset against every `defaultChatAgent.providerScopes` entry, so older sessions are still recognized.
- Consumers that look sessions up by exact scope set first silently try the shared set, then the previous set. They create a new session with the shared set only when neither exists.
- Consumers that require a superset of `providerScopes[0]` exclude the connectors scope ([`withoutCopilotConnectorsScope`](common/copilotConnectorsRequestService.ts)) when they check an existing session.
- When a user with an older session connects a connector, the Copilot Connectors service upgrades that session on demand by requesting its existing scopes plus `write:plugin_gateway_connections`. That produces the shared set.

## Affected consumers

| Consumer | Where the scopes are defined | Status |
|---|---|---|
| VS Code default account and chat sign-in | `defaultChatAgent.providerScopes[0]` in `product.json`, plus the distro product configuration | Updated here; the distro mixin must match |
| GitHub Copilot (built-in) | [`GITHUB_SCOPE_ALIGNED`](../../../../extensions/copilot/src/platform/authentication/common/authentication.ts) | Updated here, with `GITHUB_SCOPE_ALIGNED_LEGACY` fallback |
| GitHub (built-in Git integration) | [`auth.ts`](../../../../extensions/github/src/auth.ts) | Updated here, with silent legacy fallback |
| Cloud sandbox and Mission Control | [`cloudSandboxApiService.ts`](../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxApiService.ts), [`missionControlSharingService.ts`](../../workbench/contrib/chat/browser/remoteAgentHost/missionControlSharingService.ts) | Updated here; the connectors scope is optional for existing sessions |
| GitHub Pull Requests | `GitHub.vscode-pull-request-github` | Must request the shared set |
| GitHub Repositories | `GitHub.remotehub` | Must request the shared set |
| Live Share | `MS-vsliveshare.vsliveshare` | Must request the shared set |
| Codespaces and github.dev seeded session | Embedder-provided session in the Codespaces and vscode.dev hosts | Must seed a session with the shared set |

## Rollout sequencing

1. Land the VS Code change, including the matching distro `providerScopes` update, in a single Insiders build. New sign-ins in VS Code, Copilot, and the GitHub extension then share a session with the connectors scope. Older sessions keep working through the fallbacks above.
2. Update the Codespaces and github.dev seeded session to the shared set. Until then, seeded sessions behave like older sessions: they keep working, and connecting a connector upgrades them on demand.
3. Release GitHub Pull Requests, GitHub Repositories, and Live Share updates that request the shared set. Each should silently fall back to the previous set before creating a session, and pin `engines.vscode` to `^1.143.0` so that it never asks for a scope set the installed VS Code does not share. Until a consumer updates, it keeps its own session with the previous scopes and may prompt once after a user signs in for the first time with the shared set.
