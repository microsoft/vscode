---
description: Architecture documentation for VS Code AI Customization view. Use when working in `src/vs/workbench/contrib/chat/browser/aiCustomization`
applyTo: 'src/vs/platform/agentHost/**'
---

# Agent Host

The agent host communicates via the Agent Host Protocol. The specification for this lives in a directory `../agent-host-protocol` as a sibling of the VS Code directory.

If this directory doesn't exist, you should use the "ask questions" tool to ask the user if they want to clone `git@github.com:microsoft/agent-host-protocol.git` to that directory. After doing so, you should also prompt the user to add `file:///<path/to/agent-host-protocol>/plugins/copilot-plugin` as a plugin in their `chat.pluginLocations` settings.

## Overall Protocol

The sessions process is a portable, standalone server that multiple clients can connect to. Clients see a synchronized view of sessions and can send commands that are reflected back as state-changing actions. The protocol is designed around four requirements:

1. **Synchronized multi-client state** — an immutable, redux-like state tree mutated exclusively by actions flowing through pure reducers. While there is the option to implement functionality via imperative commands, we ALWAYS prefer to model features as pure state and actions.
2. **Lazy loading** — clients subscribe to state by URI and load data on demand. The session list is fetched imperatively. Large content (images, long tool outputs) is stored by reference and fetched separately.
3. **Write-ahead with reconciliation** — clients optimistically apply their own actions locally, then reconcile when the server echoes them back alongside any concurrent actions from other clients or the server itself.
4. **Forward-compatible versioning** — newer clients can connect to older servers. A single protocol version number maps to a capabilities object; clients check capabilities before using features.

See the agent host protocol documentation for more details.

## Service Placement

The Agent Host uses one `ServiceCollection` and one `InstantiationService`, with
three construction categories:

1. **Bootstrap instances** belong in `agentHostBootstrap.ts` only when they need
   runtime or environment values, asynchronous construction, an
   entry-point-selected implementation, or must exist before the instantiation
   service.
2. **Shared orchestration services** belong in `agentServiceComposition.ts` when
   every Agent Host entry point uses the same synchronous implementation, all
   dependencies are registered services, and construction does not start
   process-level behavior.
3. **Runtime activation** belongs in the entry point for transports, provider
   registration, recurring schedulers, process listeners, and other behavior
   that starts or stops with the process.

Place a service based on its construction requirements and lifetime, not based
on which existing service consumes it. Do not add a public service getter or a
post-construction setter merely to cross these categories. If a dependency
crosses categories, first consider extracting a smaller bootstrap foundation or
passing an explicit runtime input to the composition root.

## End to End Testing

You can run `node ./scripts/code-agent-host.js` to start an agent host. If you pass `--enable-mock-agent`, then the `ScriptedMockAgent` will be used.

By default this will listen on `ws://127.0.0.1:8081`. You can then use the `ahp-websocket` client, when available, to connect to and communicate with it.

## Learnings

- Provider-owned session configuration inheritance must be selected by the owning `IAgent`; `AgentService` only orchestrates transfer and must not encode provider-specific configuration keys.
