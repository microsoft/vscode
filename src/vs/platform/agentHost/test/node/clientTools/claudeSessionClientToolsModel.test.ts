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

	test('fresh diff: state empty, no difference', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		assert.deepStrictEqual(diff.model.state.get(), { tools: undefined, clientId: undefined });
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools(undefined → []) does NOT flip dirty (undefined ≡ [])', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools with a real snapshot flips dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('consume() returns the current state and clears dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()], 'c1');
		const state = diff.consume();
		assert.deepStrictEqual(state, { tools: [tool()], clientId: 'c1' });
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools with a structurally-equal snapshot does NOT re-flip dirty after consume', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()]);
		diff.consume();
		diff.model.setTools([{ name: 'echo', description: 'echoes', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } }]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('C6: setTools racing async work after consume re-flips dirty via autorun', async () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool({ name: 'original' })]);
		const state = diff.consume();
		assert.deepStrictEqual(state.tools, [tool({ name: 'original' })]);
		await Promise.resolve();
		diff.model.setTools([tool({ name: 'racer' })]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('markDirty re-flips after a failed downstream build', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()]);
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);
		diff.markDirty();
		assert.strictEqual(diff.hasDifference, true);
	});

	test('hasDifference detects rename / description / inputSchema; ignores title', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool({ name: 'a' })]);
		diff.consume();

		diff.model.setTools([tool({ name: 'b' })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools([tool({ name: 'b', description: 'new' })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools([tool({ name: 'b', description: 'new', inputSchema: { type: 'object', properties: { msg: { type: 'number' } }, required: ['msg'] } })]);
		assert.strictEqual(diff.hasDifference, true);
		diff.consume();

		diff.model.setTools([tool({ name: 'b', description: 'new', inputSchema: { type: 'object', properties: { msg: { type: 'number' } }, required: ['msg'] }, title: 'X' })]);
		assert.strictEqual(diff.hasDifference, false, 'title is outside the diff scope');
	});

	test('order-insensitive: reordering tools does not flip dirty', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool({ name: 'a' }), tool({ name: 'b' })]);
		diff.consume();
		diff.model.setTools([tool({ name: 'b' }), tool({ name: 'a' })]);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('setTools writes clientId only when supplied', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()], 'c1');
		assert.strictEqual(diff.model.state.get().clientId, 'c1');
		diff.model.setTools([tool({ name: 'echo2' })]);
		assert.strictEqual(diff.model.state.get().clientId, 'c1', 'omitted clientId leaves previous value');
		diff.model.setTools([tool()], 'c2');
		assert.strictEqual(diff.model.state.get().clientId, 'c2');
	});

	test('clientId change alone does NOT flip dirty (same tools, new window)', () => {
		const diff = disposables.add(new SessionClientToolsDiff());
		diff.model.setTools([tool()], 'c1');
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);
		// A window reload re-pushes identical tools under a new clientId. The
		// observable still updates clientId, but no SDK yield-restart is
		// required — only structural tool changes flip the dirty bit.
		diff.model.setTools([tool()], 'c2');
		assert.strictEqual(diff.hasDifference, false);
		assert.strictEqual(diff.model.state.get().clientId, 'c2');
	});
});
