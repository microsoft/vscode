# Phase 6: Provider Rotation & Quota Tracking

## Context Links
- [9Router Reference](../reports/researcher-260330-1255-reference-repos-analysis.md)
- [Multi-Agent Patterns](../reports/researcher-260330-1255-multi-agent-orchestrator-patterns.md)
- Phase 1: [Core Provider Infrastructure](phase-01-core-provider-infrastructure.md)
- Phase 3: [Agent System Core](phase-03-agent-system-core.md)

## Overview
- **Priority**: P1
- **Status**: implemented
- **Description**: Implement automatic provider/account rotation when quota exceeded, real-time quota tracking, and format translation between provider APIs

## Key Insights
- 9Router's three-tier fallback: subscription → cheap → free
- Rotation must be transparent to agents — same model, different provider/account
- Format translation needed between OpenAI, Anthropic, Google API formats
- Quota tracking via HTTP response headers (x-ratelimit-remaining, etc.)

## Requirements

### Functional
- Auto-rotate to next account when current account hits quota (HTTP 429/503)
- Rotation within same provider first (account rotation), then cross-provider fallback
- Format translation: convert requests/responses between API formats transparently
- Real-time quota extraction from API response headers
- Quota reset timer tracking per account
- Cost estimation per request (input + output tokens × cost per 1M)
- Usage statistics: tokens used, cost, requests per account/provider/agent

### Non-Functional
- Rotation latency < 500ms (transparent to agent)
- No request data lost during rotation (retry with new account)
- Quota data persisted across sessions

## Architecture

### Rotation Service

```typescript
// src/vs/workbench/contrib/multiAgent/common/provider-rotation-service.ts

interface IProviderRotationService {
  // Core rotation
  getNextAccount(modelId: string, providerIds: string[]): IProviderAccount | undefined;
  markAccountExhausted(accountId: string, retryAfter?: number): void;
  reportUsage(accountId: string, usage: ITokenUsage): void;

  // Format translation
  translateRequest(request: IChatRequest, targetFormat: ApiFormat): ITranslatedRequest;
  translateResponse(response: IProviderResponse, sourceFormat: ApiFormat): IChatResponse;

  // Quota tracking
  getQuotaStatus(accountId: string): IQuotaStatus;
  getProviderQuotaSummary(providerId: string): IProviderQuotaSummary;
  getAllQuotaSummaries(): readonly IProviderQuotaSummary[];

  // Usage stats
  getUsageStats(filter?: { agentId?: string; providerId?: string; period?: 'hour' | 'day' | 'week' }): IUsageStats;

  // Events
  readonly onDidRotate: Event<{ fromAccountId: string; toAccountId: string; reason: string }>;
  readonly onDidUpdateQuota: Event<string>;  // accountId
}

type ApiFormat = 'openai' | 'anthropic' | 'google';

interface IQuotaStatus {
  accountId: string;
  remaining: number;        // tokens or requests remaining
  limit: number;            // total quota
  resetAt: number;          // timestamp
  percentUsed: number;      // 0-100
  isExhausted: boolean;
}

interface IProviderQuotaSummary {
  providerId: string;
  providerName: string;
  totalAccounts: number;
  activeAccounts: number;
  exhaustedAccounts: number;
  aggregateQuotaPercent: number;  // weighted average
  nextResetAt: number;
}

interface ITokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;    // USD
  timestamp: number;
}

interface IUsageStats {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<string, { tokens: number; cost: number; requests: number }>;
  byAgent: Record<string, { tokens: number; cost: number; requests: number }>;
}
```

### Rotation Algorithm

```
Agent requests model "claude-sonnet-4" with providers ["anthropic", "openrouter"]
  │
  ├─ 1. Get accounts for "anthropic" sorted by priority
  │   ├─ Account A (priority 0): quota 45% → USE THIS
  │   ├─ Account B (priority 1): quota 100%
  │   └─ Account C (priority 2): quota 2% (degraded)
  │
  ├─ 2. Send request via Account A
  │   ├─ Success → extract quota from headers → update
  │   └─ 429/503 → mark exhausted → ROTATE
  │
  ├─ 3. Rotate: try Account B (same provider)
  │   ├─ Success → continue
  │   └─ 429/503 → mark exhausted → try Account C
  │
  ├─ 4. All "anthropic" accounts exhausted
  │   └─ Cross-provider fallback → "openrouter"
  │
  ├─ 5. Get accounts for "openrouter"
  │   ├─ Translate request to OpenAI format (openrouter uses OpenAI-compatible API)
  │   └─ Send request → translate response back
  │
  └─ 6. All providers exhausted
      └─ Queue task until earliest reset time OR report error
```

### Format Translation Layer

```typescript
// src/vs/workbench/contrib/multiAgent/common/api-format-translator.ts

class ApiFormatTranslator {
  // Convert from internal format to provider-specific format
  toAnthropicFormat(messages: IChatMessage[], options: IRequestOptions): AnthropicRequest;
  toOpenAIFormat(messages: IChatMessage[], options: IRequestOptions): OpenAIRequest;
  toGoogleFormat(messages: IChatMessage[], options: IRequestOptions): GoogleRequest;

  // Convert from provider response to internal format
  fromAnthropicResponse(response: AnthropicResponse): IChatResponsePart[];
  fromOpenAIResponse(response: OpenAIResponse): IChatResponsePart[];
  fromGoogleResponse(response: GoogleResponse): IChatResponsePart[];

  // Handle streaming responses
  createStreamAdapter(format: ApiFormat): IStreamTranslator;
}
```

### Quota Extraction from Headers

```typescript
// Extract quota info from HTTP response headers
function extractQuotaFromHeaders(headers: Headers, format: ApiFormat): Partial<IQuotaStatus> {
  switch (format) {
    case 'anthropic':
      return {
        remaining: parseInt(headers.get('anthropic-ratelimit-tokens-remaining') || '0'),
        limit: parseInt(headers.get('anthropic-ratelimit-tokens-limit') || '0'),
        resetAt: new Date(headers.get('anthropic-ratelimit-tokens-reset') || '').getTime(),
      };
    case 'openai':
      return {
        remaining: parseInt(headers.get('x-ratelimit-remaining-tokens') || '0'),
        limit: parseInt(headers.get('x-ratelimit-limit-tokens') || '0'),
        resetAt: Date.now() + parseInt(headers.get('x-ratelimit-reset-tokens') || '0') * 1000,
      };
    case 'google':
      // Google uses different header patterns
      return {};
  }
}
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/common/provider-rotation-service.ts` — IProviderRotationService
- `src/vs/workbench/contrib/multiAgent/common/provider-rotation-service-impl.ts` — Implementation
- `src/vs/workbench/contrib/multiAgent/common/api-format-translator.ts` — Format translation
- `src/vs/workbench/contrib/multiAgent/common/quota-tracker.ts` — Quota extraction + persistence
- `src/vs/workbench/contrib/multiAgent/common/usage-statistics.ts` — Usage aggregation

### Files to Reference
- `src/vs/workbench/contrib/chat/common/languageModels.ts` — sendChatRequest pattern
- Phase 1 provider service for account data

## Implementation Steps

1. Implement `QuotaTracker` — extract quota from HTTP headers, persist across sessions
2. Implement `ApiFormatTranslator` — bidirectional translation for 3 API formats
   - Message format conversion (system/user/assistant roles)
   - Tool call format translation
   - Streaming response adaptation
3. Implement `ProviderRotationService`:
   - Account selection: priority-sorted, skip exhausted
   - Same-provider rotation first, then cross-provider
   - Retry logic with translated request format
   - Event emission on rotation events
4. Implement `UsageStatistics` — aggregate token/cost data by provider, agent, time period
5. Integrate rotation service with AgentChatBridge (Phase 3)
   - Intercept sendChatRequest calls
   - Route through rotation service instead of direct provider
6. Update quota dashboard (Phase 2) to consume rotation events
7. Unit tests for rotation algorithm, format translation, quota extraction

## Todo List
- [ ] Implement QuotaTracker with header extraction
- [ ] Implement ApiFormatTranslator (3 formats)
- [ ] Implement ProviderRotationService
- [ ] Implement UsageStatistics aggregation
- [ ] Integrate with AgentChatBridge
- [ ] Wire quota events to dashboard UI
- [ ] Unit tests for rotation and format translation

## Success Criteria
- Automatic rotation on 429/503 — transparent to agent
- Correct format translation between all 3 API formats
- Quota extracted from response headers and displayed in dashboard
- Usage stats accurate per provider/agent/time period
- Rotation latency < 500ms
- No request data lost during rotation

## Security Considerations
- API keys used only in HTTP headers, never logged
- Rotation events log account IDs, never credentials
- Usage data does not contain request/response content
