---
name: Unit Tests for Multi-Agent Services
status: pending
priority: low
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Unit Tests for Multi-Agent Services

> Add unit tests for core multiAgent services using VS Code's test framework (Mocha + assert + mock)

## Test Framework
- **Style**: `suite('Name', () => { test('case', () => {...}) })`
- **Assertions**: Node `assert` module
- **Mocks**: `mock<IService>()` from `base/test/common/mock.js`
- **Services**: `NullLogService`, `TestStorageService`, `TestSecretStorageService`
- **Disposables**: `ensureNoDisposablesAreLeakedInTestSuite()`
- **Location**: `src/vs/workbench/contrib/multiAgent/test/common/`

## Test Files to Create

| File | Service | Priority | Key Tests |
|------|---------|----------|-----------|
| `multiAgentProviderService.test.ts` | MultiAgentProviderServiceImpl | P0 | Provider CRUD, account CRUD, model-provider mapping, quota updates |
| `agentLaneService.test.ts` | AgentLaneServiceImpl | P0 | Definition CRUD, state transitions, spawn/terminate, validation |
| `providerRotationService.test.ts` | ProviderRotationServiceImpl | P1 | Account selection by strategy, exhaustion marking, usage stats |
| `apiFormatTranslator.test.ts` | ApiFormatTranslator | P1 | Message conversion (3 formats), SSE parsing, quota extraction |
| `orchestratorService.test.ts` | OrchestratorServiceImpl | P2 | Task lifecycle, decomposition, dependency scheduling |

## Test Cases per File

### multiAgentProviderService.test.ts (~15 tests)
- Built-in providers loaded on init
- Register/remove custom provider
- Add/update/remove account
- Model-provider compatibility queries
- Quota update + health tracking
- Mark degraded + reset
- Persistence (store/load)
- Events fired on changes

### agentLaneService.test.ts (~15 tests)
- Built-in agents loaded
- Add/update/remove custom definition
- Cannot remove built-in
- Spawn agent instance
- Max concurrent limit enforced
- Valid state transitions accepted
- Invalid state transitions rejected
- Assign task with state guard
- Complete task
- Terminate cleans up
- Model-provider validation
- Persistence of definitions

### providerRotationService.test.ts (~10 tests)
- Priority strategy: returns lowest priority account
- Round-robin strategy: cycles through accounts
- Cost-optimized strategy: returns cheapest
- Exhausted accounts skipped
- Auto-refresh resets expired exhaustions
- Usage stats aggregation
- Rotation event fired

### apiFormatTranslator.test.ts (~12 tests)
- Anthropic request format (system as top-level)
- OpenAI request format (system as message)
- Google request format (systemInstruction)
- Anthropic SSE chunk parsing
- OpenAI SSE chunk parsing
- Google SSE chunk parsing
- [DONE] marker handling
- Quota extraction from Anthropic headers
- Quota extraction from OpenAI headers
- Empty/malformed chunk handling

### orchestratorService.test.ts (~8 tests)
- Submit task creates entry
- Default decomposition creates plan→code→test
- Delegate assigns agents
- Execute respects dependencies
- Cancel propagates to sub-tasks
- Failed dependency cancels dependents

## Implementation Pattern

```typescript
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';

suite('MultiAgentProviderService', () => {
    const store = new DisposableStore();

    setup(() => { ... });
    teardown(() => store.clear());

    ensureNoDisposablesAreLeakedInTestSuite();

    test('registers built-in providers on init', () => {
        const service = createService();
        assert.ok(service.getProvider('anthropic'));
        assert.ok(service.getProvider('openai'));
    });
});
```

## Run Command
```bash
# Run specific test file
npx mocha src/vs/workbench/contrib/multiAgent/test/common/multiAgentProviderService.test.ts
```
