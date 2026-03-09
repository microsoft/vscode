import { describe, test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WalkthroughGenerator } from '../src/walkthroughGenerator.js';
import { WalkthroughStorage } from '../src/storage.js';
import { Walkthrough } from '../src/types.js';

function createMockWalkthrough(overrides?: Partial<Walkthrough>): Walkthrough {
	return {
		taskId: 'task-001',
		specialist: 'refactor-agent',
		summary: 'Refactored the authentication module to use dependency injection instead of hard-coded dependencies.',
		decisions: [
			{
				what: 'Introduced an AuthProvider interface',
				why: 'Allows swapping authentication backends without changing consuming code',
				alternatives: ['Keep using concrete classes directly', 'Use a service locator pattern'],
				source: 'CLAUDE.md architecture guidelines',
			},
			{
				what: 'Moved token storage to a separate TokenStore class',
				why: 'Single responsibility principle — token persistence should not be coupled to auth logic',
				alternatives: ['Keep token logic in AuthService'],
				source: 'Code graph showed 5 modules importing token helpers directly',
			},
		],
		filesChanged: [
			{
				path: 'src/auth/authProvider.ts',
				action: 'create',
				description: 'New AuthProvider interface and default implementation',
				linesAdded: 45,
				linesRemoved: 0,
			},
			{
				path: 'src/auth/authService.ts',
				action: 'modify',
				description: 'Updated to accept AuthProvider via constructor injection',
				linesAdded: 12,
				linesRemoved: 28,
			},
			{
				path: 'src/auth/legacyAuth.ts',
				action: 'delete',
				description: 'Removed deprecated legacy authentication module',
				linesAdded: 0,
				linesRemoved: 150,
			},
		],
		specsReferenced: [
			'AUTH-001: Authentication provider abstraction',
			'SEC-003: Token storage security requirements',
		],
		graphContext: [
			'MATCH (n)-[:IMPORTS]->(auth:Module {name: "authService"}) RETURN n',
		],
		risksAndTradeoffs: [
			'Existing extensions using legacyAuth will need migration',
			'Slight runtime overhead from interface indirection',
		],
		confidence: 'high',
		generatedAt: 1709942400000,
		...overrides,
	};
}

describe('WalkthroughGenerator', () => {
	const generator = new WalkthroughGenerator({ modelRouterUrl: 'http://localhost:3100' });

	describe('render text format', () => {
		test('produces correct output structure', () => {
			const walkthrough = createMockWalkthrough();
			const output = generator.render(walkthrough, { format: 'text' });

			assert.ok(output.startsWith('━━━ WALKTHROUGH ━━━'));
			assert.ok(output.endsWith('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
			assert.ok(output.includes(walkthrough.summary));
			assert.ok(output.includes('DECISIONS'));
			assert.ok(output.includes('1. Introduced an AuthProvider interface'));
			assert.ok(output.includes('Why: Allows swapping authentication backends'));
			assert.ok(output.includes('Alternative considered: Keep using concrete classes directly, Use a service locator pattern'));
			assert.ok(output.includes('Source: CLAUDE.md architecture guidelines'));
			assert.ok(output.includes('2. Moved token storage to a separate TokenStore class'));
			assert.ok(output.includes('FILES CHANGED'));
			assert.ok(output.includes('+ src/auth/authProvider.ts (45 lines)'));
			assert.ok(output.includes('~ src/auth/authService.ts (+12/-28 lines)'));
			assert.ok(output.includes('- src/auth/legacyAuth.ts (150 lines)'));
			assert.ok(output.includes('SPECS REFERENCED'));
			assert.ok(output.includes('AUTH-001: Authentication provider abstraction'));
			assert.ok(output.includes('RISKS'));
			assert.ok(output.includes('Existing extensions using legacyAuth will need migration'));
			assert.ok(output.includes('CONFIDENCE: high'));
		});
	});

	describe('render markdown format', () => {
		test('produces correct output', () => {
			const walkthrough = createMockWalkthrough();
			const output = generator.render(walkthrough, { format: 'markdown' });

			assert.ok(output.includes('# Walkthrough'));
			assert.ok(output.includes(walkthrough.summary));
			assert.ok(output.includes('## Decisions'));
			assert.ok(output.includes('### 1. Introduced an AuthProvider interface'));
			assert.ok(output.includes('**Why:** Allows swapping authentication backends'));
			assert.ok(output.includes('**Alternatives considered:**'));
			assert.ok(output.includes('**Source:** CLAUDE.md architecture guidelines'));
			assert.ok(output.includes('## Files Changed'));
			assert.ok(output.includes('| Action | Path | Changes | Description |'));
			assert.ok(output.includes('| Add | `src/auth/authProvider.ts`'));
			assert.ok(output.includes('| Modify | `src/auth/authService.ts`'));
			assert.ok(output.includes('| Delete | `src/auth/legacyAuth.ts`'));
			assert.ok(output.includes('## Specs Referenced'));
			assert.ok(output.includes('- AUTH-001: Authentication provider abstraction'));
			assert.ok(output.includes('## Risks and Tradeoffs'));
			assert.ok(output.includes('- Existing extensions using legacyAuth will need migration'));
			assert.ok(output.includes('**Confidence:** high'));
		});
	});

	describe('render JSON format', () => {
		test('produces valid JSON', () => {
			const walkthrough = createMockWalkthrough();
			const output = generator.render(walkthrough, { format: 'json' });

			const parsed = JSON.parse(output);
			assert.deepStrictEqual(parsed, walkthrough);
		});
	});

	describe('buildSystemPrompt', () => {
		test('includes JSON structure instructions', () => {
			const prompt = generator.buildSystemPrompt();

			assert.ok(prompt.includes('Son-Of-Anton'));
			assert.ok(prompt.includes('JSON'));
			assert.ok(prompt.includes('"summary"'));
			assert.ok(prompt.includes('"decisions"'));
			assert.ok(prompt.includes('"filesChanged"'));
			assert.ok(prompt.includes('"confidence"'));
		});
	});

	describe('buildUserPrompt', () => {
		test('includes all provided context', () => {
			const prompt = generator.buildUserPrompt({
				taskId: 'task-002',
				taskDescription: 'Refactor auth module',
				specialist: 'refactor-agent',
				diff: '--- a/file.ts\n+++ b/file.ts',
				graphQueries: ['MATCH (n) RETURN n'],
				specReferences: ['AUTH-001'],
				traceData: 'trace-abc-123',
			});

			assert.ok(prompt.includes('## Task'));
			assert.ok(prompt.includes('Refactor auth module'));
			assert.ok(prompt.includes('## Specialist'));
			assert.ok(prompt.includes('refactor-agent'));
			assert.ok(prompt.includes('## Diff'));
			assert.ok(prompt.includes('--- a/file.ts'));
			assert.ok(prompt.includes('## Graph Queries'));
			assert.ok(prompt.includes('MATCH (n) RETURN n'));
			assert.ok(prompt.includes('## Spec References'));
			assert.ok(prompt.includes('AUTH-001'));
			assert.ok(prompt.includes('## Trace Data'));
			assert.ok(prompt.includes('trace-abc-123'));
		});

		test('omits optional sections when not provided', () => {
			const prompt = generator.buildUserPrompt({
				taskId: 'task-003',
				taskDescription: 'Fix bug',
				specialist: 'debug-agent',
				diff: 'some diff',
			});

			assert.ok(prompt.includes('## Task'));
			assert.ok(!prompt.includes('## Graph Queries'));
			assert.ok(!prompt.includes('## Spec References'));
			assert.ok(!prompt.includes('## Trace Data'));
		});
	});
});

describe('WalkthroughStorage', () => {
	let tempDir: string;
	let storage: WalkthroughStorage;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walkthrough-test-'));
		storage = new WalkthroughStorage(tempDir);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe('save and load roundtrip', () => {
		test('saves and loads a walkthrough correctly', async () => {
			const walkthrough = createMockWalkthrough();
			await storage.save(walkthrough);
			const loaded = await storage.load('task-001');

			assert.deepStrictEqual(loaded, walkthrough);
		});

		test('returns null for non-existent taskId', async () => {
			const loaded = await storage.load('non-existent');
			assert.strictEqual(loaded, null);
		});
	});

	describe('list', () => {
		test('returns saved taskIds', async () => {
			await storage.save(createMockWalkthrough({ taskId: 'task-alpha' }));
			await storage.save(createMockWalkthrough({ taskId: 'task-beta' }));
			await storage.save(createMockWalkthrough({ taskId: 'task-gamma' }));

			const taskIds = await storage.list();
			taskIds.sort();

			assert.deepStrictEqual(taskIds, ['task-alpha', 'task-beta', 'task-gamma']);
		});

		test('returns empty array when no walkthroughs exist', async () => {
			const taskIds = await storage.list();
			assert.deepStrictEqual(taskIds, []);
		});
	});

	describe('search', () => {
		test('finds matching walkthroughs by summary', async () => {
			await storage.save(createMockWalkthrough({
				taskId: 'task-100',
				summary: 'Updated the logging framework',
			}));
			await storage.save(createMockWalkthrough({
				taskId: 'task-101',
				summary: 'Refactored authentication module',
			}));

			const results = await storage.search('logging');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].taskId, 'task-100');
		});

		test('finds matching walkthroughs by decision content', async () => {
			await storage.save(createMockWalkthrough({
				taskId: 'task-200',
				summary: 'Some changes',
				decisions: [{
					what: 'Switched to Redis for caching',
					why: 'Better performance',
					alternatives: ['Memcached'],
					source: 'benchmarks',
				}],
			}));

			const results = await storage.search('redis');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].taskId, 'task-200');
		});

		test('returns empty array when no matches found', async () => {
			await storage.save(createMockWalkthrough({ taskId: 'task-300' }));

			const results = await storage.search('nonexistent-query-xyz');
			assert.deepStrictEqual(results, []);
		});
	});

	describe('delete', () => {
		test('removes walkthrough file', async () => {
			await storage.save(createMockWalkthrough({ taskId: 'task-del' }));
			assert.ok(await storage.load('task-del'));

			await storage.delete('task-del');
			assert.strictEqual(await storage.load('task-del'), null);
		});

		test('does not throw when deleting non-existent walkthrough', async () => {
			await assert.doesNotReject(() => storage.delete('non-existent'));
		});
	});
});
