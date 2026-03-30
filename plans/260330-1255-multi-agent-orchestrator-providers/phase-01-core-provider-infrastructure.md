# Phase 1: Core Provider Infrastructure

## Context Links
- [VS Code Chat Infrastructure Report](../reports/researcher-260330-1255-vscode-chat-infrastructure.md)
- [Reference Repos Analysis](../reports/researcher-260330-1255-reference-repos-analysis.md)
- [ILanguageModelsConfigurationService](../../src/vs/workbench/contrib/chat/common/languageModelsConfiguration.ts)
- [Language Models Service](../../src/vs/workbench/contrib/chat/common/languageModels.ts)

## Overview
- **Priority**: P0 (foundation for everything)
- **Status**: implemented
- **Description**: Build the core provider registry, account management, and model-provider compatibility mapping

## Key Insights
- VS Code already has `ILanguageModelsConfigurationService` with provider group CRUD (add/update/remove)
- Configuration stored in `chatLanguageModels.json` — we extend this pattern
- 9Router uses tiered fallback (subscription → cheap → free) — adopt for rotation
- Cockpit stores account data locally per platform — adopt local-first approach

## Requirements

### Functional
- Register/unregister AI providers (Anthropic, OpenAI, Google, OpenRouter, etc.)
- Multiple accounts (API keys / OAuth tokens) per provider
- Model-provider compatibility map (which providers support which models)
- Provider health tracking (quota remaining, reset time, error state)
- Account credential secure storage via VS Code's SecretStorage API

### Non-Functional
- Provider data persisted across sessions
- Credentials never stored in plaintext
- Extensible — new providers addable without core changes

## Architecture

### Service Interfaces

```typescript
// src/vs/workbench/contrib/multiAgent/common/provider-registry.ts

interface IProviderAccount {
  id: string;
  providerId: string;
  label: string;           // user-friendly name
  authType: 'apiKey' | 'oauth';
  isActive: boolean;
  quotaRemaining?: number;
  quotaResetAt?: number;   // timestamp
  lastError?: { code: number; message: string; retryAt: number };
  priority: number;        // 0 = primary, higher = fallback
  costPer1MTokens?: number;
}

interface IProviderDefinition {
  id: string;              // 'anthropic', 'openai', 'google', etc.
  name: string;
  baseUrl: string;
  supportedModels: string[];
  authMethods: ('apiKey' | 'oauth')[];
  apiFormat: 'openai' | 'anthropic' | 'google';  // for format translation
}

interface IModelDefinition {
  id: string;              // 'claude-sonnet-4-20250514'
  family: string;          // 'claude-sonnet-4'
  displayName: string;
  capabilities: string[];  // 'vision', 'code', 'reasoning', 'tools'
  compatibleProviders: string[];  // provider IDs
  maxContextTokens: number;
}

interface IMultiAgentProviderService {
  // Provider CRUD
  getProviders(): readonly IProviderDefinition[];
  registerProvider(provider: IProviderDefinition): void;
  removeProvider(providerId: string): void;

  // Account management
  getAccounts(providerId: string): readonly IProviderAccount[];
  addAccount(account: Omit<IProviderAccount, 'id'>): Promise<IProviderAccount>;
  updateAccount(accountId: string, updates: Partial<IProviderAccount>): Promise<void>;
  removeAccount(accountId: string): Promise<void>;

  // Model-provider mapping
  getModels(): readonly IModelDefinition[];
  getCompatibleProviders(modelId: string): readonly IProviderDefinition[];
  getCompatibleModels(providerId: string): readonly IModelDefinition[];

  // Health & quota
  getAccountHealth(accountId: string): IProviderAccount;
  markAccountDegraded(accountId: string, error: { code: number; message: string }): void;
  resetAccountHealth(accountId: string): void;

  // Events
  readonly onDidChangeProviders: Event<void>;
  readonly onDidChangeAccounts: Event<string>;  // providerId
  readonly onDidChangeHealth: Event<string>;     // accountId
}
```

### Data Storage

```
~/.vscode/
  └── multiAgentProviders.json     # Provider definitions + account metadata
  # Credentials stored via ISecretStorageService (OS keychain)
```

### Built-in Providers (shipped with defaults)

```json
[
  { "id": "anthropic", "name": "Anthropic", "baseUrl": "https://api.anthropic.com", "supportedModels": ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"], "authMethods": ["apiKey"], "apiFormat": "anthropic" },
  { "id": "openai", "name": "OpenAI", "baseUrl": "https://api.openai.com/v1", "supportedModels": ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"], "authMethods": ["apiKey"], "apiFormat": "openai" },
  { "id": "google", "name": "Google AI", "baseUrl": "https://generativelanguage.googleapis.com", "supportedModels": ["gemini-2.5-pro", "gemini-2.5-flash"], "authMethods": ["apiKey"], "apiFormat": "google" },
  { "id": "openrouter", "name": "OpenRouter", "baseUrl": "https://openrouter.ai/api/v1", "supportedModels": ["claude-opus-4", "claude-sonnet-4", "gpt-4o", "gemini-2.5-pro"], "authMethods": ["apiKey"], "apiFormat": "openai" }
]
```

## Related Code Files

### Files to Create
- `src/vs/workbench/contrib/multiAgent/common/provider-registry.ts` — IMultiAgentProviderService interface
- `src/vs/workbench/contrib/multiAgent/common/provider-registry-impl.ts` — Implementation
- `src/vs/workbench/contrib/multiAgent/common/model-provider-map.ts` — Built-in model/provider definitions
- `src/vs/workbench/contrib/multiAgent/common/provider-account-storage.ts` — Persistence layer

### Files to Reference (read-only)
- `src/vs/workbench/contrib/chat/common/languageModelsConfiguration.ts` — Existing provider group pattern
- `src/vs/workbench/contrib/chat/common/languageModels.ts` — Model registration pattern
- `src/vs/platform/secrets/common/secrets.ts` — ISecretStorageService

## Implementation Steps

1. Create `src/vs/workbench/contrib/multiAgent/` directory structure (common/, browser/)
2. Define `IMultiAgentProviderService` interface in `provider-registry.ts`
3. Define `IProviderAccount`, `IProviderDefinition`, `IModelDefinition` types
4. Implement `MultiAgentProviderService` class extending `Disposable`
   - Inject `ISecretStorageService` for credential storage
   - Inject `IStorageService` for account metadata persistence
   - Inject `IFileService` for config file management
5. Create `model-provider-map.ts` with built-in provider/model definitions
6. Create `provider-account-storage.ts` for JSON persistence
7. Register service as singleton via `registerSingleton(IMultiAgentProviderService, ...)`
8. Write unit tests for provider CRUD and model-provider mapping

## Todo List
- [ ] Create directory structure
- [ ] Define service interfaces and types
- [ ] Implement MultiAgentProviderService
- [ ] Implement credential storage (SecretStorage)
- [ ] Implement account metadata persistence
- [ ] Create built-in provider/model definitions
- [ ] Register singleton service
- [ ] Unit tests

## Success Criteria
- Can add/remove providers and accounts programmatically
- Credentials stored securely in OS keychain
- Model-provider compatibility queries work correctly
- Account health tracking (quota, errors) functional
- Service available via DI throughout VS Code

## Security Considerations
- API keys NEVER in plaintext config files — always `ISecretStorageService`
- OAuth tokens auto-refreshed before expiry
- Account metadata (non-secret) in user settings directory
- No credentials logged or telemetried
