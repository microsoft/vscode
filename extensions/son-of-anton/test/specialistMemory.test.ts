/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as vscode from 'vscode';
import { SpecialistMemory } from 'son-of-anton-core/agents/SpecialistMemory';

// ── Fake VS Code Memento ──────────────────────────────────────────────────────

class FakeMemento implements vscode.Memento {
	private readonly data = new Map<string, unknown>();

	keys(): readonly string[] {
		return Array.from(this.data.keys());
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		return (this.data.has(key) ? this.data.get(key) : defaultValue) as T | undefined;
	}

	update(key: string, value: unknown): Thenable<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
		return Promise.resolve();
	}

	setKeysForSync(_keys: readonly string[]): void {
		// no-op
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('SpecialistMemory — Phase 76', () => {

	test('set then get round-trips a value', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		memory.set('anton-code', 'code-style', 'Tabs over spaces.');

		assert.deepStrictEqual(
			{
				value: memory.get('anton-code', 'code-style'),
				missing: memory.get('anton-code', 'unknown'),
				otherHandle: memory.get('anton-test', 'code-style'),
			},
			{
				value: 'Tabs over spaces.',
				missing: undefined,
				otherHandle: undefined,
			},
		);
		memory.dispose();
	});

	test('list returns entries newest first', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		// Force distinct timestamps by stubbing Date.now incrementally.
		const realNow = Date.now;
		let tick = 1_000_000;
		Date.now = () => ++tick;
		try {
			memory.set('anton-code', 'first', 'a');
			memory.set('anton-code', 'second', 'b');
			memory.set('anton-code', 'third', 'c');
		} finally {
			Date.now = realNow;
		}

		const keys = memory.list('anton-code').map(e => e.key);
		assert.deepStrictEqual(keys, ['third', 'second', 'first']);
		memory.dispose();
	});

	test('clear removes one specialist without affecting others', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		memory.set('anton-code', 'k1', 'v1');
		memory.set('anton-code', 'k2', 'v2');
		memory.set('anton-test', 'k1', 'tv1');

		memory.clear('anton-code');

		assert.deepStrictEqual(
			{
				codeEntries: memory.list('anton-code').length,
				testEntries: memory.list('anton-test').map(e => ({ key: e.key, value: e.value })),
			},
			{
				codeEntries: 0,
				testEntries: [{ key: 'k1', value: 'tv1' }],
			},
		);
		memory.dispose();
	});

	test('30-entry cap evicts oldest', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		const realNow = Date.now;
		let tick = 1_000_000;
		Date.now = () => ++tick;
		try {
			for (let i = 0; i < 35; i++) {
				memory.set('anton-code', `key-${i}`, `value-${i}`);
			}
		} finally {
			Date.now = realNow;
		}

		const entries = memory.list('anton-code');
		const keys = entries.map(e => e.key);
		// Cap is 30; the 5 oldest (key-0 through key-4) should be gone.
		// list() returns newest first so the most recent set (key-34) leads.
		assert.deepStrictEqual(
			{
				count: entries.length,
				newest: keys[0],
				oldest: keys[keys.length - 1],
				containsKey0: keys.includes('key-0'),
				containsKey5: keys.includes('key-5'),
				containsKey34: keys.includes('key-34'),
			},
			{
				count: 30,
				newest: 'key-34',
				oldest: 'key-5',
				containsKey0: false,
				containsKey5: true,
				containsKey34: true,
			},
		);
		memory.dispose();
	});

	test('500-char value cap truncates with ellipsis', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		const longValue = 'x'.repeat(600);
		memory.set('anton-code', 'long', longValue);

		const stored = memory.get('anton-code', 'long')!;
		assert.deepStrictEqual(
			{
				length: stored.length,
				endsWithEllipsis: stored.endsWith('…'),
				prefix: stored.slice(0, 5),
			},
			{
				length: 500,
				endsWithEllipsis: true,
				prefix: 'xxxxx',
			},
		);
		memory.dispose();
	});

	test('formatForSystemPrompt returns markdown with entries, empty when none', () => {
		const memory = new SpecialistMemory(new FakeMemento());

		const emptyOutput = memory.formatForSystemPrompt('anton-code');

		const realNow = Date.now;
		let tick = 1_000_000;
		Date.now = () => ++tick;
		try {
			memory.set('anton-code', 'code-style', 'Tabs over spaces.');
			memory.set('anton-code', 'preferred-test-runner', 'mocha');
		} finally {
			Date.now = realNow;
		}

		const populated = memory.formatForSystemPrompt('anton-code');

		assert.deepStrictEqual(
			{
				empty: emptyOutput,
				populated,
			},
			{
				empty: '',
				populated: [
					'# Specialist Memory',
					'',
					'- **preferred-test-runner**: mocha',
					'- **code-style**: Tabs over spaces.',
				].join('\n'),
			},
		);
		memory.dispose();
	});

	test('onDidChange fires for set, delete, and clear', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		const events: string[] = [];
		const sub = memory.onDidChange(e => events.push(e.handle));

		memory.set('anton-code', 'k1', 'v1');
		memory.set('anton-test', 'k2', 'v2');
		memory.delete('anton-code', 'k1');
		memory.delete('anton-code', 'missing'); // no-op, no event
		memory.clear('anton-test');
		memory.clear('anton-docs'); // no-op, no event

		sub.dispose();
		memory.dispose();

		assert.deepStrictEqual(events, [
			'anton-code',
			'anton-test',
			'anton-code',
			'anton-test',
		]);
	});

	test('persists across instances via the shared Memento', () => {
		const memento = new FakeMemento();
		const first = new SpecialistMemory(memento);
		first.set('anton-code', 'k', 'v', 'conv-1');
		first.dispose();

		const second = new SpecialistMemory(memento);
		const entries = second.list('anton-code');
		assert.deepStrictEqual(
			entries.map(e => ({ key: e.key, value: e.value, conversationId: e.conversationId })),
			[{ key: 'k', value: 'v', conversationId: 'conv-1' }],
		);
		second.dispose();
	});

	test('set with existing key updates the value in place', () => {
		const memory = new SpecialistMemory(new FakeMemento());
		const realNow = Date.now;
		let tick = 1_000_000;
		Date.now = () => ++tick;
		try {
			memory.set('anton-code', 'k', 'v1');
			memory.set('anton-code', 'other', 'o');
			memory.set('anton-code', 'k', 'v2');
		} finally {
			Date.now = realNow;
		}

		const entries = memory.list('anton-code');
		assert.deepStrictEqual(
			{
				count: entries.length,
				value: memory.get('anton-code', 'k'),
				newestKey: entries[0].key,
			},
			{
				count: 2,
				value: 'v2',
				newestKey: 'k',
			},
		);
		memory.dispose();
	});
});
