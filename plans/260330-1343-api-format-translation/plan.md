---
name: API Format Translation (Anthropic ↔ OpenAI ↔ Google)
status: pending
priority: high
branch: feat/multi-agent-orchestrator
date: 2026-03-30
blockedBy: []
blocks: []
---

# API Format Translation

> Enable multi-agent orchestrator to call provider APIs directly with automatic format translation between Anthropic, OpenAI, and Google API formats.

## Why This Is Needed

Currently `AgentChatBridge` uses `ILanguageModelsService.sendChatRequest()` which only works for providers registered as VS Code language model providers (via extensions). Providers added through our **Providers UI** (API keys) need direct HTTP calls with format-specific payloads. Without this, provider rotation across different API formats is impossible.

## Architecture

```
AgentChatBridge._sendLlmRequest()
  │
  ├─ VS Code model available? → ILanguageModelsService.sendChatRequest()
  │
  └─ Direct provider? → DirectProviderClient
       ├─ ApiFormatTranslator.toProviderFormat(messages, 'anthropic')
       ├─ HTTP POST to provider.baseUrl
       ├─ ApiFormatTranslator.fromProviderResponse(response, 'anthropic')
       └─ Stream as AsyncIterable<string>
```

## Phases

| # | Phase | Priority | Effort |
|---|-------|----------|--------|
| 1 | [API Format Translator](phase-01-api-format-translator.md) | P0 | M |
| 2 | [Direct Provider Client](phase-02-direct-provider-client.md) | P0 | M |

## Key Decisions

1. **Two paths**: VS Code language model service (extensions) OR direct HTTP (our provider accounts)
2. **Single translator class** with `toX()` / `fromX()` methods per format
3. **Streaming**: All 3 APIs support SSE streaming — use `IRequestService` for HTTP
4. **Quota headers**: Extract rate-limit headers from HTTP responses per format
