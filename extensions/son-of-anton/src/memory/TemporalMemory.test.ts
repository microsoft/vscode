/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TemporalMemory } from './TemporalMemory';

describe('TemporalMemory', () => {
	let memory: TemporalMemory;

	beforeEach(() => {
		memory = new TemporalMemory({
			host: 'localhost',
			port: 6379,
		});
	});

	test('record creates a new memory entry', () => {
		const entry = memory.record(
			'Decision',
			'We use Redis for rate limiting',
			'session-abc',
			['rate-limiting', 'redis'],
			'orchestrator',
		);

		assert.deepStrictEqual(
			{
				type: entry.type,
				content: entry.content,
				source: entry.source,
				validUntil: entry.validUntil,
				supersededBy: entry.supersededBy,
				topics: entry.topics,
			},
			{
				type: 'Decision',
				content: 'We use Redis for rate limiting',
				source: 'session-abc',
				validUntil: null,
				supersededBy: null,
				topics: ['rate-limiting', 'redis'],
			},
		);
	});

	test('agents cannot write to memory', () => {
		assert.throws(
			() => memory.record('Decision', 'test', 'agent', ['test'], 'agent'),
			/Agents cannot write to temporal memory/,
		);
	});

	test('human role can write to memory', () => {
		const entry = memory.record('Convention', 'Use Result types', 'human', ['error-handling'], 'human');
		assert.strictEqual(entry.type, 'Convention');
	});

	test('query returns current entries by default', () => {
		memory.record('Decision', 'Use Redis', 'session-1', ['caching'], 'orchestrator');
		memory.record('Convention', 'No exceptions', 'session-2', ['error-handling'], 'orchestrator');

		const results = memory.query({ currentOnly: true });
		assert.strictEqual(results.length, 2);
		assert.ok(results.every(r => r.validUntil === null));
	});

	test('query filters by type', () => {
		memory.record('Decision', 'Use Redis', 'session-1', ['caching'], 'orchestrator');
		memory.record('Convention', 'No exceptions', 'session-2', ['error-handling'], 'orchestrator');
		memory.record('Warning', 'Auth is fragile', 'session-3', ['auth'], 'orchestrator');

		const decisions = memory.query({ type: 'Decision' });
		assert.strictEqual(decisions.length, 1);
		assert.strictEqual(decisions[0].content, 'Use Redis');
	});

	test('query filters by keyword', () => {
		memory.record('Decision', 'Use Redis for rate limiting', 'session-1', ['caching'], 'orchestrator');
		memory.record('Decision', 'Use PostgreSQL for persistence', 'session-2', ['database'], 'orchestrator');

		const results = memory.query({ keyword: 'redis' });
		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].content, 'Use Redis for rate limiting');
	});

	test('query filters by topic', () => {
		memory.record('Decision', 'Use Redis', 'session-1', ['caching', 'redis'], 'orchestrator');
		memory.record('Decision', 'Use PostgreSQL', 'session-2', ['database'], 'orchestrator');

		const results = memory.query({ topic: 'caching' });
		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].content, 'Use Redis');
	});

	test('superseding marks old entry and links to new', () => {
		const old = memory.record('Convention', 'Use callbacks', 'session-1', ['async'], 'orchestrator');
		const newer = memory.record('Convention', 'Use async/await', 'session-2', ['async'], 'orchestrator', old.id);

		const allAsync = memory.query({ topic: 'async', currentOnly: false });
		assert.strictEqual(allAsync.length, 2);

		const currentOnly = memory.query({ topic: 'async', currentOnly: true });
		assert.strictEqual(currentOnly.length, 1);
		assert.strictEqual(currentOnly[0].content, 'Use async/await');

		// Check the old entry was marked
		const oldEntry = allAsync.find(e => e.id === old.id);
		assert.ok(oldEntry);
		assert.notStrictEqual(oldEntry!.validUntil, null);
		assert.strictEqual(oldEntry!.supersededBy, newer.id);
	});

	test('history returns chronological changes for a topic', () => {
		const old = memory.record('Convention', 'Use callbacks', 'session-1', ['async'], 'orchestrator');
		memory.record('Convention', 'Use async/await', 'session-2', ['async'], 'orchestrator', old.id);

		const hist = memory.history('async');
		assert.strictEqual(hist.length, 3); // created, superseded, created
		assert.strictEqual(hist[0].action, 'created');
		assert.strictEqual(hist[1].action, 'superseded');
		assert.strictEqual(hist[2].action, 'created');
	});

	test('getCurrentForTopic returns the latest non-superseded entry', () => {
		const old = memory.record('Convention', 'Use callbacks', 'session-1', ['async'], 'orchestrator');
		memory.record('Convention', 'Use async/await', 'session-2', ['async'], 'orchestrator', old.id);

		const current = memory.getCurrentForTopic('async');
		assert.ok(current);
		assert.strictEqual(current!.content, 'Use async/await');
	});

	test('getSystemContext builds formatted context string', () => {
		memory.record('Decision', 'Use Redis for caching', 'session-1', ['caching'], 'orchestrator');
		memory.record('Warning', 'Auth module is fragile', 'session-2', ['auth'], 'orchestrator');

		const context = memory.getSystemContext();
		assert.ok(context.includes('Long-term Project Memory'));
		assert.ok(context.includes('Use Redis for caching'));
		assert.ok(context.includes('Auth module is fragile'));
	});

	test('exportAll and importAll round-trip entries', () => {
		memory.record('Decision', 'Use Redis', 'session-1', ['caching'], 'orchestrator');
		memory.record('Convention', 'No exceptions', 'session-2', ['errors'], 'orchestrator');

		const exported = memory.exportAll();

		const newMemory = new TemporalMemory({ host: 'localhost', port: 6379 });
		newMemory.importAll(exported);

		const results = newMemory.query();
		assert.strictEqual(results.length, 2);
	});

	test('query respects limit', () => {
		for (let i = 0; i < 10; i++) {
			memory.record('Decision', `Decision ${i}`, `session-${i}`, ['test'], 'orchestrator');
		}

		const results = memory.query({ limit: 3 });
		assert.strictEqual(results.length, 3);
	});
});
