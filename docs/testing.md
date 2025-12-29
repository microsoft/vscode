# Testing Guide

## Overview

Logos uses a multi-layer testing strategy:
- **Unit Tests**: Jest for TypeScript, pytest for Python
- **E2E Tests**: Playwright for browser-based tests
- **Integration Tests**: Service-level integration

## Quick Start

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
cd e2e && npm test

# Run specific test file
npm test -- src/__tests__/chat/ChatPanel.test.tsx
```

## Unit Tests

### Structure

```
src/
├── chat/
│   └── __tests__/
│       ├── ChatPanel.test.tsx
│       ├── MessageInput.test.tsx
│       └── MarkdownRenderer.test.tsx
├── workspace-ca/
│   └── __tests__/
│       ├── ProjectAnalyzer.test.ts
│       └── SuggestionEngine.test.ts
└── d3n/
    └── __tests__/
        ├── D3NClient.test.ts
        └── ARIAClient.test.ts
```

### Writing Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';

describe('ChatPanel', () => {
  it('should send message on button click', async () => {
    const onSend = jest.fn();
    render(<ChatPanel onSend={onSend} />);

    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, 'Hello');

    const button = screen.getByRole('button', { name: /send/i });
    await userEvent.click(button);

    expect(onSend).toHaveBeenCalledWith('Hello', []);
  });
});
```

### Mocking

```typescript
// Mock D3N client
jest.mock('../d3n/client', () => ({
  getD3NClient: () => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'Mocked response',
      tierUsed: 2,
    }),
  }),
}));

// Mock VSCode API
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
  },
  workspace: {
    getConfiguration: () => ({
      get: jest.fn().mockReturnValue('default'),
    }),
  },
}), { virtual: true });
```

## E2E Tests

### Setup

```bash
cd e2e
npm install
npx playwright install --with-deps
```

### Running

```bash
# Run all tests
npm test

# Run in headed mode
npm run test:headed

# Run with debug
npm run test:debug

# Run specific file
npx playwright test tests/chat.spec.ts
```

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]');
  });

  test('should send message', async ({ page }) => {
    // Open chat
    await page.keyboard.press('Meta+Shift+L');

    // Type message
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Hello world');

    // Send
    await page.keyboard.press('Meta+Enter');

    // Verify
    await expect(page.locator('[data-testid="message-user"]'))
      .toContainText('Hello world');
  });
});
```

### Test Data Attributes

Use `data-testid` for reliable selectors:

```tsx
<button data-testid="send-button">Send</button>
<div data-testid="message-list">...</div>
<input data-testid="message-input" />
```

## Python Tests

### Setup

```bash
cd ../d3n-core
pip install -e ".[dev]"
```

### Running

```bash
# Run Logos agent tests
pytest tests/agents/logos -v

# Run with coverage
pytest tests/agents/logos --cov=d3n_core/agents/logos

# Run specific test
pytest tests/agents/logos/test_routing_policies.py::TestLogosRoutingPolicy -v
```

### Writing Python Tests

```python
import pytest
from d3n_core.agents.logos import ConductorBinding

class TestConductorBinding:
    @pytest.fixture
    def conductor(self):
        return ConductorBinding()

    def test_tier_selection(self, conductor):
        tier = conductor.select_tier("simple task")
        assert tier == 1

    def test_delegation(self, conductor):
        delegate = conductor.should_delegate("fix this bug")
        assert delegate == "logos.swe"
```

## Integration Tests

### D3N Integration

```typescript
// tests/integration/d3n.test.ts
import { D3NClient } from '../src/d3n/client';

describe('D3N Integration', () => {
  const client = new D3NClient({
    endpoint: process.env.D3N_ENDPOINT || 'http://localhost:8080',
    apiKey: process.env.D3N_API_KEY || 'test-key',
  });

  it('should invoke agent', async () => {
    const result = await client.invoke({
      agentId: 'logos.conductor',
      query: 'Hello',
    });

    expect(result.content).toBeDefined();
    expect(result.tierUsed).toBeGreaterThanOrEqual(1);
  });
});
```

## Coverage

### Viewing Coverage

```bash
npm run test:coverage

# Open report
open coverage/lcov-report/index.html
```

### Coverage Requirements

| Category | Minimum |
|----------|---------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

## CI Integration

Tests run automatically on:
- Every push to `main`/`develop`
- Every pull request

See `.github/workflows/ci.yml` for configuration.

## Debugging Tests

### Jest

```bash
# Debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Playwright

```bash
# Debug mode
PWDEBUG=1 npx playwright test

# UI mode
npx playwright test --ui
```

## Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **One assertion per test when possible**
4. **Use fixtures for setup/teardown**
5. **Mock external dependencies**
6. **Keep tests fast (< 100ms per unit test)**
7. **Use data-testid for E2E selectors**

