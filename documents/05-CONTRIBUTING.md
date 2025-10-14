# Contributing to Specter IDE

Thank you for your interest in contributing to Specter! This document provides guidelines and information for contributors.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Process](#development-process)
4. [Coding Standards](#coding-standards)
5. [Commit Guidelines](#commit-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Testing](#testing)
8. [Documentation](#documentation)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for everyone. We pledge to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, intimidation, or discrimination in any form
- Offensive comments related to identity or background
- Publishing others' private information without permission
- Any conduct that would be inappropriate in a professional setting

### Reporting

Report violations to: conduct@bugb.com

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

1. **Read the documentation:**
   - [README](../README.md)
   - [Setup Guide](03-SETUP.md)
   - [Development Guide](02-DEVELOPMENT.md)

2. **Set up development environment:**
   ```bash
   git clone https://github.com/BugB-Tech/bsurf_b2c.git
   cd bsurf_b2c
   npm install
   npm run watch
   ```

3. **Join the community:**
   - Discord: https://discord.gg/specter
   - GitHub Discussions: https://github.com/BugB-Tech/bsurf_b2c/discussions

### Finding Issues to Work On

1. **Check the issue tracker:**
   - https://github.com/BugB-Tech/bsurf_b2c/issues
   
2. **Look for good first issues:**
   - Label: `good first issue`
   - Label: `help wanted`
   - Label: `beginner-friendly`

3. **Ask questions:**
   - Comment on the issue before starting work
   - Join #contributors channel on Discord

---

## Development Process

### 1. Fork and Branch

```bash
# Fork the repository on GitHub first

# Clone your fork
git clone https://github.com/YOUR-USERNAME/bsurf_b2c.git
cd bsurf_b2c

# Add upstream remote
git remote add upstream https://github.com/BugB-Tech/bsurf_b2c.git

# Create feature branch
git checkout -b bugb/feature/your-feature-name
```

### 2. Make Changes

```bash
# Start watch mode
npm run watch

# Make your changes in:
# - src/vs/workbench/contrib/specter/
# - src/vs/workbench/services/specter/

# Test your changes
./scripts/code.sh
```

### 3. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with conventional commits format
git commit -m "feat: add your feature description"
```

### 4. Push and Create PR

```bash
# Push to your fork
git push origin bugb/feature/your-feature-name

# Create Pull Request on GitHub
```

---

## Coding Standards

### TypeScript Style Guide

#### Naming Conventions

```typescript
// Classes: PascalCase
class WorkflowGenerator { }

// Interfaces: IPascalCase (with I prefix)
interface IAgentService { }

// Functions and methods: camelCase
function generateWorkflow() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Private members: _prefixed
private _internalState: string;
```

#### Code Organization

```typescript
// 1. Imports (external first, then internal)
import * as vscode from 'vscode';
import { IAgentService } from 'vs/workbench/services/specter/common/agentService';

// 2. Interfaces and types
interface WorkflowOptions {
  tools: string[];
  target: string;
}

// 3. Constants
const DEFAULT_TIMEOUT = 30000;

// 4. Class definition
export class WorkflowService {
  // Public properties
  public readonly name: string;
  
  // Private properties
  private _state: WorkflowState;
  
  // Constructor
  constructor() { }
  
  // Public methods
  public async execute(): Promise<void> { }
  
  // Private methods
  private validateInput(): boolean { }
}
```

#### Best Practices

**1. Use async/await instead of promises:**
```typescript
// Good
async function fetchData(): Promise<Data> {
  const result = await api.get('/data');
  return result.data;
}

// Avoid
function fetchData(): Promise<Data> {
  return api.get('/data').then(result => result.data);
}
```

**2. Use optional chaining:**
```typescript
// Good
const value = obj?.property?.nestedProperty;

// Avoid
const value = obj && obj.property && obj.property.nestedProperty;
```

**3. Use nullish coalescing:**
```typescript
// Good
const config = userConfig ?? defaultConfig;

// Avoid
const config = userConfig !== null && userConfig !== undefined 
  ? userConfig 
  : defaultConfig;
```

**4. Proper error handling:**
```typescript
// Good
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof NetworkError) {
    // Handle network error
  } else {
    // Handle other errors
  }
}

// Avoid
try {
  await riskyOperation();
} catch (error) {
  console.log('Error:', error);
}
```

### File Structure

```typescript
// src/vs/workbench/contrib/specter/browser/views/chatPanel.ts

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BugB-Tech. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./chatPanel';  // CSS imports first
import * as vscode from 'vscode';
import { Disposable } from 'vs/base/common/lifecycle';

/**
 * Chat panel for security workflow generation
 */
export class ChatPanel extends Disposable {
  // Implementation
}
```

### Comments and Documentation

```typescript
/**
 * Generates a security testing workflow based on user prompt
 * @param prompt Natural language description of security test
 * @param options Optional configuration for workflow generation
 * @returns Promise resolving to generated workflow plan
 * @throws {InvalidPromptError} If prompt is empty or invalid
 * @example
 * ```typescript
 * const plan = await generateWorkflow('Check Redis vulnerability', {
 *   tools: ['nmap', 'certxgen'],
 *   target: '192.168.1.100'
 * });
 * ```
 */
async function generateWorkflow(
  prompt: string,
  options?: WorkflowOptions
): Promise<WorkflowPlan> {
  // Implementation
}
```

---

## Commit Guidelines

### Conventional Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| **feat** | New feature | `feat: add workflow graph visualization` |
| **fix** | Bug fix | `fix: resolve notebook execution timeout` |
| **docs** | Documentation | `docs: update setup guide` |
| **style** | Code style (no logic change) | `style: format agent service` |
| **refactor** | Code refactoring | `refactor: simplify workflow generator` |
| **perf** | Performance improvement | `perf: optimize graph rendering` |
| **test** | Adding tests | `test: add tests for marketplace service` |
| **chore** | Build/tool changes | `chore: update dependencies` |
| **ci** | CI/CD changes | `ci: add GitHub Actions workflow` |

### Commit Examples

**Good commits:**
```bash
feat(agent): add support for self-hosted LLMs

Implements Ollama integration for users who want to run
LLMs locally instead of using cloud APIs.

Closes #123
```

```bash
fix(graph): prevent node overlap in workflow visualization

Nodes were overlapping when workflows had many steps.
Updated layout algorithm to prevent this.

Fixes #456
```

**Bad commits:**
```bash
# Too vague
git commit -m "fix stuff"

# No type
git commit -m "updated code"

# No description
git commit -m "feat: "
```

### Commit Body Guidelines

- Use imperative mood: "add" not "added" or "adds"
- Wrap at 72 characters
- Explain what and why, not how
- Reference related issues

---

## Pull Request Process

### Before Creating PR

- [ ] Code follows style guide
- [ ] All tests pass: `npm test`
- [ ] No console.log or debugging code
- [ ] Documentation updated if needed
- [ ] Commit messages follow guidelines
- [ ] Branch is up to date with `bugb`

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issue
Closes #123

## Testing
How to test these changes:
1. Step 1
2. Step 2
3. Expected result

## Screenshots (if applicable)
[Add screenshots here]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Code follows style guide
```

### PR Review Process

1. **Automated checks run:**
   - TypeScript compilation
   - ESLint
   - Tests
   - Build verification

2. **Code review:**
   - At least one approval required
   - Address feedback
   - Update PR as needed

3. **Merge:**
   - Squash and merge (preferred)
   - Rebase and merge (for clean history)
   - Never merge with failing checks

### Responding to Feedback

```markdown
# Good response:
"Good catch! Updated in commit abc123."

# Good response:
"I kept X as-is because Y. Happy to discuss further."

# Avoid:
"Whatever, it works fine."
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "AgentService"

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

**Location:** `src/vs/workbench/contrib/specter/**/*.test.ts`

**Example:**

```typescript
import * as assert from 'assert';
import { AgentService } from 'vs/workbench/services/specter/common/agent/agentService';

suite('AgentService', () => {
  
  suite('generateWorkflow', () => {
    
    test('should generate valid workflow plan', async () => {
      // Arrange
      const agent = new AgentService();
      const prompt = 'Check Redis vulnerability on 192.168.1.100';
      
      // Act
      const plan = await agent.generateWorkflow(prompt);
      
      // Assert
      assert.ok(plan);
      assert.ok(plan.steps.length > 0);
      assert.strictEqual(plan.target, '192.168.1.100');
    });
    
    test('should throw on empty prompt', async () => {
      const agent = new AgentService();
      
      await assert.rejects(
        async () => await agent.generateWorkflow(''),
        { name: 'InvalidPromptError' }
      );
    });
  });
});
```

### Test Coverage Goals

- **Unit tests:** 80%+ coverage
- **Integration tests:** Key workflows
- **E2E tests:** Critical user paths

---

## Documentation

### Code Documentation

```typescript
/**
 * Service for generating security testing workflows
 * 
 * This service uses LLMs to convert natural language descriptions
 * into executable Python notebooks with security testing workflows.
 * 
 * @example
 * ```typescript
 * const service = new WorkflowService();
 * const notebook = await service.generate('Test Redis');
 * await service.execute(notebook);
 * ```
 */
export class WorkflowService {
  // ...
}
```

### Documentation Files

Update relevant docs when making changes:

- **README.md** - If adding user-facing features
- **02-DEVELOPMENT.md** - If changing architecture
- **03-SETUP.md** - If changing setup process
- **API docs** - If changing public APIs

### Writing Good Documentation

**Do:**
- Use clear, concise language
- Provide examples
- Explain "why" not just "what"
- Keep it up to date

**Don't:**
- Assume knowledge
- Use jargon without explanation
- Forget to update after changes
- Write only "what" the code does

---

## Special Considerations

### Security Contributions

If your contribution involves security features:

1. **No malicious code:** Obviously
2. **Safety first:** Add authorization checks
3. **Privacy:** Don't log sensitive data
4. **Validation:** Always validate inputs
5. **Audit trail:** Log security-relevant actions

### Performance Contributions

If optimizing performance:

1. **Benchmark:** Prove improvement with numbers
2. **Document:** Explain optimization approach
3. **Test:** Ensure no regressions
4. **Profile:** Use profiling tools

---

## Recognition

Contributors will be:

- Listed in [Contributors section](../README.md#contributors)
- Mentioned in release notes
- Eligible for swag (T-shirts, stickers)
- Invited to contributor calls

Top contributors may be invited to become maintainers.

---

## Questions?

- **Discord:** #contributors channel
- **Email:** dev@bugb.com
- **GitHub Discussions:** Ask questions publicly

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

*Contributing Guide Version: 1.0*  
*Last Updated: October 13, 2025*  
*Maintained by: BugB-Tech Team*
