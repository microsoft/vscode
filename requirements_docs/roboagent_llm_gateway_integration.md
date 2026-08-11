# RoboAgent LLM Gateway Integration (implemented 2026-07-27)

Chat in the IDE now gets its models from the RoboAgent LLM gateway
(`https://www.roboticscorner.tech/roboagent/api/llm`) using the user's
RoboAgent (Supabase) sign-in. No GitHub/Copilot account is required. Users
that sign in via **RoboAgent: Log In** see the gateway's models (currently
DeepSeek V4 Pro; more via the server-side `LLM_MODELS` env) in the chat model
picker under the **RoboAgent** vendor, with full agent mode: streaming, tool
calling, and token accounting.

## How it works

```
chat UI → Copilot participant → RoboAgentLMProvider → OpenAIEndpoint
        → POST https://www.roboticscorner.tech/roboagent/api/llm/chat
          Authorization: Bearer <Supabase access token>
```

The gateway is OpenAI-compatible; the server attaches the actual provider key
(platform key with per-plan daily allowance, or the user's own BYOK key from
the dashboard). Provider keys never reach the IDE.

## Changes in this repo

### Core (src/vs)
- `platform/roboagentAuth/common/roboagentAuthService.ts` — new
  `getAccessToken()` on `IRoboAgentAuthMainService`.
- `platform/roboagentAuth/electron-main/roboagentAuthMainService.ts` — impl:
  tracks `_accessTokenExpiresAt`, refreshes when missing/near expiry
  (`TOKEN_REFRESH_MARGIN_MS`), returns undefined when signed out.
- `workbench/contrib/roboagent/browser/roboagentAuthCommands.ts` — new
  programmatic commands `roboagent.getAccessToken` / `roboagent.getAuthSession`
  (CommandsRegistry, hidden from the palette) bridging the main-process auth
  service to extension-host code.

### Vendored Copilot extension (extensions/copilot)
- `src/extension/byok/vscode-node/roboAgentProvider.ts` — **new**. Language-
  model provider `roboagent`: lists models from `GET /api/llm/models`, chats
  through `OpenAIEndpoint` pointed at `/api/llm/chat`, token fetched fresh per
  request via `roboagent.getAccessToken`. No stored API key.
- `src/extension/byok/vscode-node/byokContribution.ts` — registers the
  RoboAgent provider **unconditionally** (the stock BYOK providers stay gated
  on a Copilot token).
- `package.json` — vendor `roboagent` added to `languageModelChatProviders`;
  the `gitHubLoginFailed` welcome panel is disabled (`when: false`).
- Four patches so chat works with zero GitHub auth:
  1. `conversation/vscode-node/conversationFeature.ts` — activates
     unconditionally (was: only when a Copilot token appears; without it the
     default participant never registered and every request failed with
     "No default agent registered").
  2. `conversation/vscode-node/chatParticipants.ts` `switchToBaseModel` —
     non-copilot vendors bail before the `copilot-base` endpoint lookup that
     requires a Copilot token.
  3. `prompt/node/chatMLFetcher.ts` — the Copilot token is now optional
     (only used for username scrubbing / CAPI fallback).
  4. `prompt/vscode-node/endpointProviderImpl.ts` — `'copilot-base'` family
     lookups fall back to a synthetic tokenizer-only endpoint when no Copilot
     token exists (prompt-tsx rendering asks for it even on BYOK requests).

GitHub-authenticated users are unaffected: every patch keeps the original
path when a Copilot token is present.

## Build & test (dev machine)

```bash
nvm use            # 22.22.1
npm install
npm run watch      # includes watch-copilot
./scripts/code.sh
```

Test matrix:
1. Launch with NO GitHub sign-in → run **RoboAgent: Log In** → open chat →
   the model picker shows "DeepSeek V4 Pro" under RoboAgent → send a message
   → streamed reply.
2. Agent mode with a tool-using prompt → tool calls execute (gateway relays
   `tools`/`tool_calls`).
3. Sign out of RoboAgent → request fails with "Sign in to RoboAgent…".
4. Signed into GitHub Copilot too → Copilot models still work side by side.
5. After ~1h idle (token expiry) → next chat still works (auto-refresh).

Server-side counterpart lives in `roboagentweb` (`app/api/llm/*`,
`lib/roboagent/{llm,providers}.ts`); per-user turns land in
`roboagent_usage_events` and show on the dashboard.
