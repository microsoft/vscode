/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ToolDefinition } from '../../../common/state/protocol/state.js';
import { SessionClientToolsDiff } from '../../../node/claude/clientTools/claudeSessionClientToolsModel.js';

const tool = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
	name: 'echo',
	description: 'echoes',
	inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
	...over,
});

suite('SessionClientToolsDiff', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh diff: merged empty, no difference', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		assert.deepStrictEqual(diff.model.merged.get(), []);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools(c1, []) does NOT flip dirty (undefined ≡ [])', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', []);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools with a real snapshot flips dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool()]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('consume() returns the merged tools and clears dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool()]);
		const merged = diff.consume();
		assert.deepStrictEqual(merged, [tool()]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools with a structurally-equal snapshot does NOT re-flip dirty after consume', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool()]);
		diff.consume();
		diff.model.setTools('c1', [{ name: 'echo', description: 'echoes', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('C6: setTools racing async work after consume re-flips dirty via autorun', async () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'original' })]);
		const merged = diff.consume();
		assert.deepStrictEqual(merged, [tool({ name: 'original' })]);
		await Promise.resolve();
		diff.model.setTools('c1', [tool({ name: 'racer' })]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('markDirty re-flips after a failed downstream build', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool()]);
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);
		diff.markDirty();
		assert.strictEqual(diff.hasDifference, true);
	});

	test('hasDifference detects rename / description / inputSchema; ignores title', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'a' })]);
		diff.consume();

		diff.model.setTools('c1', [tool({ name: 'b' })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools('c1', [tool({ name: 'b', description: 'new' })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools('c1', [tool({ name: 'b', description: 'new', inputSchema: { type: 'object', properties: { msg: { type: 'number' } }, required: ['msg'] } })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools('c1', [tool({ name: 'b', description: 'new', inputSchema: { type: 'object', properties: { msg: { type: 'number' } }, required: ['msg'] }, title: 'X' })]);
		assert.strictEqual(diff.hasDifference, false, 'title is outside the diff scope');
	});

	test('order-insensitive: reordering tools does not flip dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'a' }), tool({ name: 'b' })]);
		diff.consume();
		diff.model.setTools('c1', [tool({ name: 'b' }), tool({ name: 'a' })]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('ownerOf reflects which client contributed a tool; getTools returns a client slice', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'a' })]);
		diff.model.setTools('c2', [tool({ name: 'b' })]);
		assert.strictEqual(diff.model.ownerOf('a'), 'c1');
		assert.strictEqual(diff.model.ownerOf('b'), 'c2');
		assert.strictEqual(diff.model.ownerOf('missing'), undefined);
		assert.deepStrictEqual(diff.model.getTools('c1'), [tool({ name: 'a' })]);
		assert.deepStrictEqual(diff.model.getTools('c2'), [tool({ name: 'b' })]);
	});

	test('merged unions multiple clients and dedupes by name (first client wins)', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'shared', description: 'from c1' }), tool({ name: 'a' })]);
		diff.model.setTools('c2', [tool({ name: 'shared', description: 'from c2' }), tool({ name: 'b' })]);
		assert.deepStrictEqual(diff.model.merged.get().map(t => t.name), ['shared', 'a', 'b']);
		assert.strictEqual(diff.model.ownerOf('shared'), 'c1', 'first-inserted client wins the shared name');
	});

	test('ownerOf prefers the requested client when it provides the shared tool', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'shared', description: 'from c1' })]);
		diff.model.setTools('c2', [tool({ name: 'shared', description: 'from c2' })]);
		assert.deepStrictEqual({
			defaultOwner: diff.model.ownerOf('shared'),
			preferredOwner: diff.model.ownerOf('shared', 'c2'),
			missingPreferredOwner: diff.model.ownerOf('shared', 'missing'),
		}, {
			defaultOwner: 'c1',
			preferredOwner: 'c2',
			missingPreferredOwner: 'c1',
		});
	});

	test('removeClient drops that client and re-flips dirty when the merged set changes', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools('c1', [tool({ name: 'a' })]);
		diff.model.setTools('c2', [tool({ name: 'b' })]);
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);

		diff.model.removeClient('c2');
		assert.strictEqual(diff.hasDifference, true);
		assert.deepStrictEqual(diff.model.merged.get().map(t => t.name), ['a']);
		assert.strictEqual(diff.model.ownerOf('b'), undefined);
	});
});
