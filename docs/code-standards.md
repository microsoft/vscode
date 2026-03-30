# Code Standards & Codebase Structure

**Last Updated**: 2025-12-28
**Version**: 2.2.0-beta.4
**Applies To**: All code within ClaudeKit Engineer project

## Overview

This document defines coding standards, file organization patterns, naming conventions, and best practices for ClaudeKit Engineer. All code must adhere to these standards to ensure consistency, maintainability, and quality.

## Core Development Principles

### YAGNI (You Aren't Gonna Need It)
- Avoid over-engineering and premature optimization
- Implement features only when needed
- Don't build infrastructure for hypothetical future requirements
- Start simple, refactor when necessary

### KISS (Keep It Simple, Stupid)
- Prefer simple, straightforward solutions
- Avoid unnecessary complexity
- Write code that's easy to understand and modify
- Choose clarity over cleverness

### DRY (Don't Repeat Yourself)
- Eliminate code duplication
- Extract common logic into reusable functions/modules
- Use composition and abstraction appropriately
- Maintain single source of truth

## File Organization Standards

### Directory Structure

```
project-root/
├── .claude/                    # Claude Code configuration
│   ├── agents/                # Agent definitions (*.md)
│   ├── command-archive/       # Archived legacy command definitions
│   ├── commands/              # Reserved compatibility directory (can be empty)
│   ├── hooks/                # Git hooks and scripts
│   ├── skills/               # Reusable knowledge modules
│   │   └── [skill-name]/     # Individual skill directories
│   │       ├── SKILL.md      # Skill definition
│   │       └── references/   # Supporting materials
│   └── rules/                # Development rules and protocols
├── .github/                   # GitHub-specific files
│   └── workflows/            # CI/CD workflows
├── docs/                      # Project documentation
│   ├── research/             # Research reports
│   └── *.md                  # Core documentation files
├── guide/                     # User guides
├── plans/                     # Implementation plans
│   ├── reports/              # Agent communication reports
│   └── templates/            # Plan templates
├── src/                       # Source code (if applicable)
├── tests/                     # Test suites (if applicable)
├── .gitignore                # Git ignore patterns
├── CLAUDE.md                 # Claude-specific instructions
├── README.md                 # Project overview
├── package.json              # Node.js dependencies
└── LICENSE                   # License file
```

### File Naming Conventions

**Agent Definitions** (`.claude/agents/`):
- Format: `[agent-name].md`
- Use kebab-case: `code-reviewer.md`, `docs-manager.md`
- Descriptive, role-based names
- Examples: `planner.md`, `tester.md`, `git-manager.md`

**Legacy Command Archive** (`.claude/command-archive/`):
- Read-only historical command files moved during command-to-skill migration
- Keep original kebab-case filenames for traceability
- Do not add new runtime features here
- Add new capabilities as skills in `.claude/skills/`

**Skills** (`.claude/skills/`):
- Format: `[skill-name]/SKILL.md`
- Use kebab-case for directory names
- Main file always named `SKILL.md`
- Supporting files in `references/` or `scripts/`
- Examples:
  - `better-auth/SKILL.md`
  - `cloudflare-workers/SKILL.md`
  - `mongodb/SKILL.md`

**Documentation** (`docs/`):
- Format: `[document-purpose].md`
- Use kebab-case with descriptive names
- Examples:
  - `project-overview-pdr.md`
  - `codebase-summary.md`
  - `code-standards.md`
  - `system-architecture.md`

**Reports** (`plans/<plan-name>/reports/`):
- Format: `{date}-from-[agent]-to-[agent]-[task]-report.md`
- Use date prefix for chronological sorting (format from `$CK_PLAN_DATE_FORMAT`)
- Clear source and destination agents
- Examples:
  - `251026-from-planner-to-main-auth-implementation-report.md`
  - `251026-from-tester-to-debugger-test-failures-report.md`

**Plans** (`plans/`):
- Format: `{date}-[feature-name]-plan.md`
- Use date prefix for version tracking (format from `$CK_PLAN_DATE_FORMAT`)
- Descriptive feature names in kebab-case
- Examples:
  - `251026-user-authentication-plan.md`
  - `251026-database-migration-plan.md`

**Research Reports** (`plans/<plan-name>/research/`):
- Format: `{date}-[research-topic].md`
- Date prefix for tracking (format from `$CK_PLAN_DATE_FORMAT`)
- Clear topic description
- Examples:
  - `251026-oauth2-implementation-strategies.md`
  - `251026-performance-optimization-techniques.md`

## File Size Management

### Hard Limits
- **Maximum file size**: 500 lines of code
- Files exceeding 500 lines MUST be refactored
- Exception: Auto-generated files (with clear marking)

### Refactoring Strategies

**When file exceeds 500 lines**:
1. **Extract Utility Functions**: Move to separate `utils/` directory
2. **Component Splitting**: Break into smaller, focused components
3. **Service Classes**: Extract business logic to dedicated services
4. **Module Organization**: Group related functionality into modules

**Example Refactoring**:
```
Before:
user-service.js (750 lines)

After:
services/
├── user-service.js (200 lines)      # Core service
├── user-validation.js (150 lines)   # Validation logic
└── user-repository.js (180 lines)   # Database operations
utils/
└── password-hasher.js (80 lines)    # Utility functions
```

## Naming Conventions

### Variables & Functions

**JavaScript/TypeScript**:
- **Variables**: camelCase
  ```javascript
  const userName = 'John Doe';
  const isAuthenticated = true;
  ```

- **Functions**: camelCase
  ```javascript
  function calculateTotal(items) { }
  const getUserById = (id) => { };
  ```

- **Classes**: PascalCase
  ```javascript
  class UserService { }
  class AuthenticationManager { }
  ```

- **Constants**: UPPER_SNAKE_CASE
  ```javascript
  const MAX_RETRY_COUNT = 3;
  const API_BASE_URL = 'https://api.example.com';
  ```

- **Private Members**: Prefix with underscore
  ```javascript
  class Database {
    _connectionPool = null;
    _connect() { }
  }
  ```

### Files & Directories

**Source Files**:
- **JavaScript/TypeScript**: kebab-case
  ```
  user-service.js
  authentication-manager.ts
  api-client.js
  ```

- **React Components**: PascalCase
  ```
  UserProfile.jsx
  AuthenticationForm.tsx
  NavigationBar.jsx
  ```

- **Test Files**: Match source file name + `.test` or `.spec`
  ```
  user-service.test.js
  authentication-manager.spec.ts
  ```

**Directories**: kebab-case
```
src/
├── components/
├── services/
├── utils/
├── api-clients/
└── test-helpers/
```

### API Design

**REST Endpoints**:
- Use kebab-case for URLs
- Plural nouns for collections
- Resource IDs in path parameters

```
GET    /api/users
GET    /api/users/:id
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
GET    /api/users/:userId/posts
```

**Request/Response Fields**:
- Use camelCase for JSON properties
```json
{
  "userId": 123,
  "userName": "john_doe",
  "emailAddress": "john@example.com",
  "isVerified": true,
  "createdAt": "2025-10-26T00:00:00Z"
}
```

## Code Style Guidelines

### General Formatting

**Indentation**:
- Use 2 spaces (not tabs)
- Consistent indentation throughout file
- No trailing whitespace

**Line Length**:
- Preferred: 80-100 characters
- Hard limit: 120 characters
- Break long lines logically

**Whitespace**:
- One blank line between functions/methods
- Two blank lines between classes
- Space after keywords: `if (`, `for (`, `while (`
- No space before function parentheses: `function name(`

### Comments & Documentation

**File Headers** (Optional but recommended):
```javascript
/**
 * User Service
 *
 * Handles user authentication, registration, and profile management.
 *
 * @module services/user-service
 * @author ClaudeKit
 * @version 1.0.0
 */
```

**Function Documentation**:
```javascript
/**
 * Authenticates a user with email and password
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<User>} Authenticated user object
 * @throws {AuthenticationError} If credentials are invalid
 */
async function authenticateUser(email, password) {
  // Implementation
}
```

**Inline Comments**:
- Explain WHY, not WHAT
- Complex logic requires explanation
- TODO comments include assignee and date
```javascript
// TODO(john, 2025-10-26): Optimize this query for large datasets
const users = await db.query('SELECT * FROM users');

// Cache miss - fetch from database
const user = await fetchUserFromDB(userId);
```

### Error Handling

**Always Use Try-Catch**:
```javascript
async function processPayment(orderId) {
  try {
    const order = await getOrder(orderId);
    const payment = await chargeCard(order.total);
    await updateOrderStatus(orderId, 'paid');
    return payment;
  } catch (error) {
    logger.error('Payment processing failed', { orderId, error });
    throw new PaymentError('Failed to process payment', { cause: error });
  }
}
```

**Error Types**:
- Create custom error classes for domain errors
- Include context and cause
- Provide actionable error messages

```javascript
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
```

**Error Logging**:
- Log errors with context
- Use appropriate log levels
- Never expose sensitive data in logs

```javascript
logger.error('Database query failed', {
  query: sanitizeQuery(query),
  params: sanitizeParams(params),
  error: error.message
});
```

## Security Standards

### Input Validation

**Validate All Inputs**:
```javascript
function createUser(userData) {
  // Validate required fields
  if (!userData.email || !userData.password) {
    throw new ValidationError('Email and password required');
  }

  // Sanitize inputs
  const email = sanitizeEmail(userData.email);
  const password = userData.password; // Never log passwords

  // Validate formats
  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }
}
```

### Sensitive Data Handling

**Never Commit Secrets**:
- Use environment variables for API keys, credentials
- Add `.env*` to `.gitignore`
- Use secret management systems in production

**Never Log Sensitive Data**:
```javascript
// BAD
logger.info('User login', { email, password }); // Never log passwords

// GOOD
logger.info('User login', { email }); // OK to log email
```

**Sanitize Database Queries**:
```javascript
// Use parameterized queries
const user = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// Never concatenate user input
// BAD: const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

## Testing Standards

### Test File Organization

```
tests/
├── unit/              # Unit tests
│   ├── services/
│   └── utils/
├── integration/       # Integration tests
│   └── api/
├── e2e/              # End-to-end tests
└── fixtures/         # Test data
```

### Test Naming

```javascript
describe('UserService', () => {
  describe('authenticateUser', () => {
    it('should return user when credentials are valid', async () => {
      // Test implementation
    });

    it('should throw AuthenticationError when password is incorrect', async () => {
      // Test implementation
    });

    it('should throw ValidationError when email is missing', async () => {
      // Test implementation
    });
  });
});
```

### Test Coverage Requirements

- **Unit tests**: > 80% code coverage
- **Integration tests**: Critical user flows
- **E2E tests**: Happy paths and edge cases
- **Error scenarios**: All error paths tested

### Test Best Practices

- **Arrange-Act-Assert** pattern
- **Independent tests** (no test dependencies)
- **Descriptive test names** (behavior, not implementation)
- **Test one thing** per test
- **Use fixtures** for complex test data
- **Mock external dependencies**

## Git Standards

### Commit Messages

**Format**: Conventional Commits
```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature (minor version bump)
- `fix`: Bug fix (patch version bump)
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `style`: Code style changes

**Examples**:
```
feat(auth): add OAuth2 authentication support

Implements OAuth2 flow with Google and GitHub providers.
Includes token refresh and revocation.

Closes #123

---

fix(api): resolve timeout in database queries

Optimized slow queries and added connection pooling.

---

docs: update installation guide with Docker setup
```

**Rules**:
- Subject line: imperative mood, lowercase, no period
- Max 72 characters for subject
- Blank line between subject and body
- Body: explain WHY, not WHAT
- Footer: reference issues, breaking changes
- No AI attribution or signatures

### Branch Naming

**Format**: `type/description`

**Types**:
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test improvements

**Examples**:
```
feature/oauth-authentication
fix/database-connection-timeout
refactor/user-service-cleanup
docs/api-reference-update
test/integration-test-suite
```

### Pre-Commit Checklist

- ✅ No secrets or credentials
- ✅ No debug code or console.logs
- ✅ All tests pass locally
- ✅ Code follows style guidelines
- ✅ No linting errors
- ✅ Files under 500 lines
- ✅ Conventional commit message

## Documentation Standards

### Code Documentation

**Self-Documenting Code**:
- Clear variable and function names
- Logical code organization
- Minimal comments needed

**When to Comment**:
- Complex algorithms or business logic
- Non-obvious optimizations
- Workarounds for bugs/limitations
- Public API functions
- Configuration options

### Markdown Documentation

**Structure**:
```markdown
# Document Title

Brief overview paragraph

## Section 1

Content with examples

## Section 2

More content

## See Also

- [Related Doc](./related.md)
```

**Formatting**:
- Use ATX-style headers (`#`, `##`, `###`)
- Code blocks with language specification
- Tables for structured data
- Lists for sequential items
- Links for cross-references

**Code Blocks**:
````markdown
```javascript
function example() {
  return 'example';
}
```
````

## Agent-Specific Standards

### Agent Definition Files

**Frontmatter**:
```yaml
---
name: agent-name
description: Brief description of agent purpose and when to use it
mode: subagent | all
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
---
```

**Required Sections**:
1. Agent role and responsibilities
2. Core capabilities
3. Workflow process
4. Output requirements
5. Quality standards
6. Communication protocols

### Command Definition Files

**Frontmatter**:
```yaml
---
name: command-name
description: What this command does
---
```

**Argument Handling**:
- `$ARGUMENTS` - All arguments as single string
- `$1`, `$2`, `$3` - Individual positional arguments

**Example**:
```markdown
---
name: plan
description: Create implementation plan for given task
---

Planning task: $ARGUMENTS

Using planner agent to research and create comprehensive plan for: $1
```

### Skill Definition Files

**Structure**:
```markdown
# Skill Name

Guide for using [Technology] - brief description

## When to Use

- List of use cases
- Scenarios where skill applies

## Core Concepts

Key concepts and terminology

## Implementation Guide

Step-by-step instructions

## Examples

Practical examples

## Best Practices

Recommendations and tips

## Common Pitfalls

Mistakes to avoid

## Resources

- Official docs
- Tutorials
- References
```

## Hook Implementation Standards

### Scout Block Hook Architecture

**Cross-Platform Design Pattern**:
- **Dispatcher Pattern**: Single Node.js entry point delegates to platform-specific implementations
- **Platform Detection**: Use `process.platform` for automatic selection
- **Security-First**: Input validation, sanitized errors, safe execution

**File Organization**:
```
.claude/hooks/
└── scout-block.cjs       # Pure Node.js hook (cross-platform)
```

**Implementation Requirements**:
- **Pure Node.js** (`scout-block.cjs`):
  - Read stdin synchronously, validate JSON structure
  - Modular internals in `scout-block/` directory
  - Pattern matching via `pattern-matcher.cjs` with `.ckignore` support
  - Path extraction via `path-extractor.cjs`
  - Rich error messages via `error-formatter.cjs`
  - Broad pattern detection via `broad-pattern-detector.cjs`
  - Exit codes: 0 = allow, 2 = block/error

**Security Standards**:
```javascript
// Input validation
if (!hookInput || hookInput.trim().length === 0) {
  console.error('ERROR: Empty input');
  process.exit(2);
}

// JSON structure validation
const data = JSON.parse(hookInput);
if (!data.tool_input || typeof data.tool_input.command !== 'string') {
  console.error('ERROR: Invalid JSON structure');
  process.exit(2);
}
```

**Testing Standards**:
- Test both allowed and blocked patterns
- Validate error handling (invalid JSON, empty input, missing fields)
- Cross-platform test coverage
- Clear pass/fail indicators

## Configuration File Standards

### package.json

**Required Fields**:
- name, version, description
- repository (with URL)
- author, license
- engines (Node version >= 18.0.0)
- scripts (test, lint, etc.)

**Best Practices**:
- Use semantic versioning
- Specify exact dependency versions for stability
- Include keywords for discoverability
- Use `files` field to control published content
- Specify minimum Node.js version (18.0.0+)

### .gitignore

**Standard Exclusions**:
```
# Dependencies
node_modules/
package-lock.json (for libraries)

# Environment
.env
.env.*
!.env.example

# Build outputs
dist/
build/
*.log

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
*.test.js.snap

# Temporary
tmp/
temp/
*.tmp
```

## Performance Standards

### Code Performance

**Optimization Priorities**:
1. Correctness first
2. Readability second
3. Performance third (when needed)

**Common Optimizations**:
- Use appropriate data structures
- Avoid unnecessary loops
- Cache expensive computations
- Lazy load when possible
- Debounce/throttle frequent operations

**Example**:
```javascript
// Cache expensive operations
const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

const expensiveCalculation = memoize((n) => {
  // Complex calculation
  return result;
});
```

### File I/O

- Use async operations
- Stream large files
- Batch writes when possible
- Clean up file handles

## Quality Assurance

### Code Review Checklist

**Functionality**:
- ✅ Implements required features
- ✅ Handles edge cases
- ✅ Error handling complete
- ✅ Input validation present

**Code Quality**:
- ✅ Follows naming conventions
- ✅ Adheres to file size limits
- ✅ DRY principle applied
- ✅ KISS principle followed
- ✅ Well-structured and organized

**Security**:
- ✅ No hardcoded secrets
- ✅ Input sanitization
- ✅ Proper authentication/authorization
- ✅ Secure dependencies

**Testing**:
- ✅ Unit tests included
- ✅ Integration tests for flows
- ✅ Edge cases tested
- ✅ Error paths covered

**Documentation**:
- ✅ Code comments where needed
- ✅ API documentation updated
- ✅ README updated if needed
- ✅ Changelog entry added

## Enforcement

### Automated Checks

**Pre-Commit**:
- Commitlint (conventional commits)
- Secret scanning
- File size validation

**Pre-Push**:
- Linting (ESLint, Prettier)
- Unit tests
- Type checking

**CI/CD**:
- All tests
- Build verification
- Coverage reports
- Security scans

### Manual Review

**Code Review Focus**:
- Architecture and design decisions
- Complex logic correctness
- Security implications
- Performance considerations
- Maintainability and readability

## Exceptions

**When to Deviate**:
- Performance-critical code (document reasons)
- External library constraints
- Generated code (mark clearly)
- Legacy code (plan refactoring)

**Documentation Required**:
```javascript
/**
 * EXCEPTION: File exceeds 500 lines
 * REASON: Critical performance optimization requires monolithic structure
 * TODO: Refactor when performance is no longer critical
 * DATE: 2025-10-26
 */
```

## References

### Internal Documentation
- [Project Overview PDR](./project-overview-pdr.md)
- [Codebase Summary](./codebase-summary.md)
- [System Architecture](./system-architecture.md)

### External Standards
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

### Related Projects
- [Claude Code Documentation](https://docs.claude.com/)
- [Open Code Documentation](https://opencode.ai/docs)

## Unresolved Questions

None. All code standards are well-defined and documented.
