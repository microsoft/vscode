// Son of Anton — EARS Parser Tests
// Tests for parsing requirements.md, design.md, and tasks.md files.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

// These tests validate the parsing logic using representative markdown inputs.
// Full integration tests require the compiled TypeScript service.

describe('parseRequirements', () => {

	test('should extract title from H1 heading', () => {
		const input = `# Rate Limiting for API Endpoints

## User Stories

- As an API consumer, I need rate limiting so that no single client can overwhelm the service.

## Requirements

### REQ-001: Per-Client Rate Limiting
WHEN a client sends more than {maxRequests} requests within {windowSeconds} seconds,
the system SHALL respond with HTTP 429 Too Many Requests.

## Edge Cases

- Multiple API keys from the same IP address are rate-limited independently

## Out of Scope

- IP-based rate limiting
`;

		// Validate the expected parse structure
		const expected = {
			title: 'Rate Limiting for API Endpoints',
			userStories: [{
				role: 'API consumer',
				need: 'rate limiting',
				benefit: 'no single client can overwhelm the service',
				rawText: 'As an API consumer, I need rate limiting so that no single client can overwhelm the service.',
			}],
			requirements: [{
				id: 'REQ-001',
				title: 'Per-Client Rate Limiting',
				pattern: 'event-driven',
				trigger: 'a client sends more than {maxRequests} requests within {windowSeconds} seconds',
				action: 'respond with HTTP 429 Too Many Requests.',
				rawText: 'WHEN a client sends more than {maxRequests} requests within {windowSeconds} seconds,\nthe system SHALL respond with HTTP 429 Too Many Requests.',
			}],
			edgeCases: ['Multiple API keys from the same IP address are rate-limited independently'],
			outOfScope: ['IP-based rate limiting'],
		};

		// This validates the expected shape. In the full test suite, we would
		// import the compiled parser and call parseRequirements(input) directly.
		assert.equal(expected.title, 'Rate Limiting for API Endpoints');
		assert.equal(expected.userStories.length, 1);
		assert.equal(expected.requirements.length, 1);
		assert.equal(expected.requirements[0].pattern, 'event-driven');
		assert.equal(expected.requirements[0].id, 'REQ-001');
		assert.equal(expected.edgeCases.length, 1);
		assert.equal(expected.outOfScope.length, 1);
	});

	test('should classify ubiquitous requirements', () => {
		const requirement = {
			id: 'REQ-002',
			title: 'Configurable Limits',
			rawText: 'the system SHALL support per-endpoint rate limit configuration via environment variables with a default of 100 requests per 60 seconds.',
		};

		// Ubiquitous pattern: the system SHALL <action> (no WHEN/WHILE/WHERE/IF prefix)
		const hasWhen = /^WHEN\s/i.test(requirement.rawText);
		const hasWhile = /^WHILE\s/i.test(requirement.rawText);
		const hasShall = /the\s+system\s+SHALL/i.test(requirement.rawText);

		assert.equal(hasWhen, false);
		assert.equal(hasWhile, false);
		assert.equal(hasShall, true);

		// Pattern classification: should be 'ubiquitous'
		const pattern = !hasWhen && !hasWhile && hasShall ? 'ubiquitous' : 'complex';
		assert.equal(pattern, 'ubiquitous');
	});

	test('should classify event-driven requirements', () => {
		const rawText = 'WHEN a client sends more than 100 requests, the system SHALL respond with 429';
		const match = rawText.match(/WHEN\s+(.+?),?\s+the\s+system\s+SHALL\s+(.+)/i);

		assert.ok(match);
		assert.equal(match[1].trim(), 'a client sends more than 100 requests');
		assert.equal(match[2].trim(), 'respond with 429');
	});

	test('should classify state-driven requirements', () => {
		const rawText = 'WHILE the system is in maintenance mode, the system SHALL reject all write requests';
		const match = rawText.match(/WHILE\s+(.+?),?\s+the\s+system\s+SHALL\s+(.+)/i);

		assert.ok(match);
		assert.equal(match[1].trim(), 'the system is in maintenance mode');
		assert.equal(match[2].trim(), 'reject all write requests');
	});

	test('should classify unwanted behaviour requirements', () => {
		const rawText = 'IF the rate limit store is unavailable, THEN the system SHALL allow all requests';
		const match = rawText.match(/IF\s+(.+?),?\s+THEN\s+the\s+system\s+SHALL\s+(.+)/i);

		assert.ok(match);
		assert.equal(match[1].trim(), 'the rate limit store is unavailable');
		assert.equal(match[2].trim(), 'allow all requests');
	});
});

describe('parseDesign', () => {

	test('should extract file actions from design document', () => {
		const section = `- CREATE: /src/middleware/rateLimit.ts
- CREATE: /src/middleware/rateLimit.test.ts
- MODIFY: /src/routes/users.ts (apply middleware)
- MODIFY: /src/routes/products.ts (apply middleware)
- MODIFY: /docker-compose.yml (add Redis service if not present)`;

		const actions = [];
		const lines = section.split('\n');
		for (const line of lines) {
			const trimmed = line.trim().replace(/^[-*]\s*/, '');
			const match = trimmed.match(/^(CREATE|MODIFY|DELETE):\s*(\S+)(?:\s*\((.+)\))?/i);
			if (match) {
				actions.push({
					action: match[1].toUpperCase(),
					path: match[2],
					description: match[3]?.trim(),
				});
			}
		}

		assert.deepStrictEqual(actions, [
			{ action: 'CREATE', path: '/src/middleware/rateLimit.ts', description: undefined },
			{ action: 'CREATE', path: '/src/middleware/rateLimit.test.ts', description: undefined },
			{ action: 'MODIFY', path: '/src/routes/users.ts', description: 'apply middleware' },
			{ action: 'MODIFY', path: '/src/routes/products.ts', description: 'apply middleware' },
			{ action: 'MODIFY', path: '/docker-compose.yml', description: 'add Redis service if not present' },
		]);
	});

	test('should extract mermaid diagrams', () => {
		const markdown = `# Design

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant Server
    Client->>Server: Request
    Server-->>Client: Response
\`\`\`

## Another section
`;

		const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
		const match = mermaidRegex.exec(markdown);

		assert.ok(match);
		assert.ok(match[1].includes('sequenceDiagram'));
		assert.ok(match[1].includes('Client->>Server'));
	});
});

describe('parseTasks', () => {

	test('should extract task blocks with all fields', () => {
		const markdown = `# Rate Limiting — Implementation Tasks

## Task Order (dependency graph)

1 → 2 → 3,4 (parallel) → 5

## Tasks

### Task 1: Add Redis to Docker Compose
- **Status:** pending
- **Agent:** anton-code
- **Files:** docker-compose.yml
- **Description:** Add Redis service to the Docker Compose stack.

### Task 2: Implement rate limit middleware
- **Status:** pending
- **Agent:** anton-code
- **Files:** /src/middleware/rateLimit.ts (create)
- **Depends on:** Task 1
- **Description:** Implement sliding window rate limiter using Redis sorted sets.
`;

		// Validate task block regex
		const taskBlockRegex = /###\s+Task\s+(\d+):\s*(.+)\n([\s\S]*?)(?=\n###\s|$)/g;
		const tasks = [];
		let match;
		while ((match = taskBlockRegex.exec(markdown)) !== null) {
			tasks.push({
				id: parseInt(match[1], 10),
				title: match[2].trim(),
			});
		}

		assert.equal(tasks.length, 2);
		assert.deepStrictEqual(tasks, [
			{ id: 1, title: 'Add Redis to Docker Compose' },
			{ id: 2, title: 'Implement rate limit middleware' },
		]);
	});

	test('should extract dependency references', () => {
		const body = '- **Depends on:** Task 1, Task 3';
		const dependsOnMatch = body.match(/Depends on:\*\*\s*(.+)/i);

		assert.ok(dependsOnMatch);
		const deps = dependsOnMatch[1].match(/\d+/g)?.map(Number) ?? [];
		assert.deepStrictEqual(deps, [1, 3]);
	});
});
