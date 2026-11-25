---
description: Rules for moving resource URIs between Agent Host clients and hosts. Use when reading or writing URIs in Agent Host Protocol requests, actions, state, attachments, or customizations.
applyTo: "src/vs/platform/agentHost/browser/**,src/vs/platform/agentHost/common/**,src/vs/workbench/services/agentHost/**,src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/**,src/vs/workbench/contrib/chat/browser/remoteAgentHost/**,src/vs/workbench/contrib/chat/common/agentHost*.ts,src/vs/workbench/contrib/terminal/browser/agentHost*.ts,src/vs/sessions/contrib/providers/agentHost/**,src/vs/sessions/contrib/providers/remoteAgentHost/**"
---

# Agent Host URI spaces

Agent Host Protocol URIs are plain strings, so the type system cannot tell whose filesystem a value names. Every URI belongs to exactly one space:

- **Host space**: what the agent host uses on its own machine, usually `file:`. Protocol state, actions, and requests carry host-space values.
- **Client space**: what this window uses to display, compare, open, or read the resource.

The owning connection's `resourceUris` mapper (`IAgentHostResourceUriMapper`) is the only conversion between them:

| Connection | Client space | Host space |
|---|---|---|
| Local agent host | `file:///p` | `file:///p` (identity) |
| Remote agent host | `vscode-agent-host://<connection authority>/p?_ah=…` | the wrapped URI, e.g. `file:///p` |
| Editor remote (SSH, WSL, containers, tunnels) | `vscode-remote://<remote authority>/p` | `file:///p` |

## Rules

1. **Convert once, at the boundary.** Use `resourceUris.toAgentHost` when putting a value into a request, action, or payload, and `resourceUris.fromAgentHost` when reading a value from state or a notification for display, comparison, or filesystem access. Keep stored protocol values in host space.
2. **Never translate inside a transport.** Transports carry packets unchanged; consumers map values where they produce or consume them.
3. **Don't hard-code a connection kind.** Don't call `fromAgentHostUri`/`toAgentHostUri` on connection resources, and don't special-case `vscode-remote` because some other layer may have mapped a value. `local/code-agent-host-uri-mapping` enforces this in `src/vs/workbench` and `src/vs/sessions`; disable it only with a reason when the value is not a connection resource, such as an Agent Host filesystem or content URI.
4. **Compare like with like.** Compare host-space URIs with host-space roots, and client-space URIs with client-space roots.
5. **A mapper owns only its own connection.** `toAgentHost` unwraps only its connection's `vscode-agent-host` authority. Another connection's resource is never a path on this host.

## Who wrote the URI decides its space

The publisher of a container does not decide the space of everything inside it:

- A container published by a client (it has a `clientId`) carries that client's URI. Use it as-is only when `clientId === connection.clientId`. Another client's container URI is opaque: show the entry, but never read, expand, or open it from this window.
- `children` are always authored by the host, which parses its own materialized copy, so map them with `fromAgentHost`, even for this client's plugins.
- Use `getAgentHostCustomizationUri` for customization URIs, and `toAgentHostClientCustomization` when publishing client plugins.

## Resources the host reads back from the client

Client plugins and resource attachments are client-owned. When the connection maps one to a host `file:` URI, send that so the host uses the file in place: send attachments as `file:`, and publish plugins as `vscode-agent-host-file:` with their `id` unchanged. Otherwise send the client URI unchanged: the client's implicit read grant is keyed by that exact URI, and the host reads it back through reverse resource requests.

## Testing

- Don't test URI behavior only with the identity mapper. When both spaces are identical, a missing conversion still passes.
- Loop over `agentHostConnectionKinds` from `src/vs/platform/agentHost/test/common/testAgentHostResourceUriMappers.ts`. Its strict mapper throws when given a URI already in the target space, so it catches missing and doubled conversions.
- A new mapper must pass the contract suite in `src/vs/platform/agentHost/test/common/agentHostResourceUriMapper.test.ts`.
- For flows where the host reads client resources, assert that the URI the host requests matches the client's grant.
