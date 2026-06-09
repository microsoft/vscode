/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatDebugModelTurnEvent } from '../../common/chatDebugService.js';
import { agentKey, alignSignatureChunks, computeAgentCounts, defaultAgentSelection, ISignatureSegment, resolveFilteredSelectionIndex } from '../../browser/chatDebug/chatDebugCacheExplorerView.js';

function turn(requestName?: string): IChatDebugModelTurnEvent {
	return { kind: 'modelTurn', sessionResource: URI.parse('vscode-chat://session/1'), created: new Date(0), requestName };
}

function turnWithId(id: string, requestName?: string): IChatDebugModelTurnEvent {
	return { kind: 'modelTurn', id, sessionResource: URI.parse('vscode-chat://session/1'), created: new Date(0), requestName };
}

function turnNoId(opts: { created?: number; parentEventId?: string; requestName?: string; model?: string }): IChatDebugModelTurnEvent {
	return {
		kind: 'modelTurn',
		sessionResource: URI.parse('vscode-chat://session/1'),
		created: new Date(opts.created ?? 0),
		parentEventId: opts.parentEventId,
		requestName: opts.requestName,
		model: opts.model,
	};
}

function seg(role: string, chars: number, synthetic: boolean, drift = false, label = role): ISignatureSegment {
	return { role, chars, drift, label, synthetic };
}

suite('chatDebugCacheExplorerView agent filter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('agentKey trims and falls back for missing names', () => {
		assert.deepStrictEqual(
			[agentKey(turn('panel/editAgent')), agentKey(turn('  backgroundTodoAgent  ')), agentKey(turn(undefined)), agentKey(turn('   '))],
			['panel/editAgent', 'backgroundTodoAgent', '(unnamed)', '(unnamed)'],
		);
	});

	test('computeAgentCounts tallies per agent preserving first-seen order', () => {
		const counts = computeAgentCounts([
			turn('panel/editAgent'),
			turn('backgroundTodoAgent'),
			turn('panel/editAgent'),
			turn('title'),
			turn('panel/editAgent'),
		]);
		assert.deepStrictEqual([...counts], [
			['panel/editAgent', 3],
			['backgroundTodoAgent', 1],
			['title', 1],
		]);
	});

	test('defaultAgentSelection focuses the edit agent when present, else all agents', () => {
		const withEditAgent = computeAgentCounts([turn('panel/editAgent'), turn('backgroundTodoAgent'), turn('title')]);
		const withoutEditAgent = computeAgentCounts([turn('backgroundTodoAgent'), turn('title')]);
		assert.deepStrictEqual(
			[[...defaultAgentSelection(withEditAgent)], [...defaultAgentSelection(withoutEditAgent)]],
			[['panel/editAgent'], ['backgroundTodoAgent', 'title']],
		);
	});

	suite('resolveFilteredSelectionIndex', () => {
		test('keeps the previously-selected turn when it survives the filter', () => {
			const filtered = [turnWithId('a1', 'panel/editAgent'), turnWithId('a3', 'panel/editAgent')];
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, filtered[1]), 1);
		});

		test('matches by id even when the stored turn is a different object instance', () => {
			// getEvents returns fresh arrays; the stored turn may be a different
			// instance carrying the same span id.
			const filtered = [turnWithId('a1', 'panel/editAgent'), turnWithId('a3', 'panel/editAgent')];
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, turnWithId('a3', 'panel/editAgent')), 1);
		});

		test('falls back to the most recent turn when the selected turn is filtered out', () => {
			// Repro for the stale-ordinal bug: previously selected 'b0' is gone
			// after filtering to the edit agent. The result must be the last
			// surviving turn (index 2), not the stale ordinal position.
			const filtered = [turnWithId('a1', 'panel/editAgent'), turnWithId('a2', 'panel/editAgent'), turnWithId('a3', 'panel/editAgent')];
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, turnWithId('b0', 'backgroundTodoAgent')), 2);
		});

		test('preserves a turn without an id via composite identity', () => {
			// id is optional; a fresh object with no id and no reference match
			// must still match on created + parentEventId + requestName + model
			// (the second pass) rather than falling through to the default.
			const filtered = [
				turnNoId({ created: 10, parentEventId: 'p0', requestName: 'panel/editAgent', model: 'gpt' }),
				turnNoId({ created: 20, parentEventId: 'p1', requestName: 'panel/editAgent', model: 'gpt' }),
			];
			const sameAsIndex1 = turnNoId({ created: 20, parentEventId: 'p1', requestName: 'panel/editAgent', model: 'gpt' });
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, sameAsIndex1), 1);
		});

		test('prefers the exact selected turn over an earlier look-alike (id-less)', () => {
			// Two distinct id-less turns share every composite field. The stored
			// object is the SECOND one. The precise (reference) pass must win, so
			// the result is index 1 — not 0, which a single composite findIndex
			// pass would have returned.
			const twin = { created: 20, parentEventId: 'p1', requestName: 'panel/editAgent', model: 'gpt' };
			const first = turnNoId(twin);
			const second = turnNoId(twin);
			assert.strictEqual(resolveFilteredSelectionIndex([first, second], second), 1);
		});

		test('does not composite-match an id-less turn against a turn that has an id', () => {
			// Composite matching requires both sides to lack an id. A surviving
			// turn that shares the composite fields but carries an id must not
			// fuzzy-match the id-less stored turn; fall back to most recent.
			const withId: IChatDebugModelTurnEvent = { kind: 'modelTurn', id: 'x', sessionResource: URI.parse('vscode-chat://session/1'), created: new Date(20), parentEventId: 'p1', requestName: 'panel/editAgent', model: 'gpt' };
			const filtered = [withId, turnNoId({ created: 99, parentEventId: 'pZ', requestName: 'title' })];
			const storedNoId = turnNoId({ created: 20, parentEventId: 'p1', requestName: 'panel/editAgent', model: 'gpt' });
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, storedNoId), 1);
		});

		test('falls back to the most recent turn when a turn without an id is filtered out', () => {
			const filtered = [
				turnNoId({ created: 10, parentEventId: 'p0', requestName: 'panel/editAgent' }),
				turnNoId({ created: 20, parentEventId: 'p1', requestName: 'panel/editAgent' }),
			];
			const filteredOut = turnNoId({ created: 5, parentEventId: 'pX', requestName: 'backgroundTodoAgent' });
			assert.strictEqual(resolveFilteredSelectionIndex(filtered, filteredOut), 1);
		});

		test('returns the most recent turn when there is no prior selection', () => {
			assert.strictEqual(resolveFilteredSelectionIndex([turnWithId('a1'), turnWithId('a2')], undefined), 1);
		});

		test('returns -1 when there are no turns', () => {
			assert.strictEqual(resolveFilteredSelectionIndex([], turnWithId('anything')), -1);
		});
	});

	suite('alignSignatureChunks', () => {
		test('aligns synthetic prefixes by identity and messages positionally when both sides match', () => {
			const a = [seg('system', 100, true), seg('tools', 200, true), seg('user', 50, false, false, 'user')];
			const b = [seg('system', 100, true), seg('tools', 250, true, true), seg('user', 60, false, false, 'user')];
			assert.deepStrictEqual(alignSignatureChunks(a, b), [
				{ role: 'system', label: 'system', aChars: 100, bChars: 100, drift: false },
				{ role: 'tools', label: 'tools', aChars: 200, bChars: 250, drift: true },
				{ role: 'user', label: 'user', aChars: 50, bChars: 60, drift: false },
			]);
		});

		test('keeps message rows aligned when a synthetic prefix exists on only one side', () => {
			// Previous request carried a tools catalog; current request dropped it.
			// The user message must still line up against the user message — not the
			// tools chunk — and tools must be shown as a removed (drift) row.
			const a = [seg('system', 100, true), seg('tools', 200, true), seg('user', 50, false, false, 'user')];
			const b = [seg('system', 100, true), seg('user', 50, false, false, 'user')];
			assert.deepStrictEqual(alignSignatureChunks(a, b), [
				{ role: 'system', label: 'system', aChars: 100, bChars: 100, drift: false },
				{ role: 'tools', label: 'tools', aChars: 200, bChars: undefined, drift: true },
				{ role: 'user', label: 'user', aChars: 50, bChars: 50, drift: false },
			]);
		});

		test('marks added/removed trailing messages as drift', () => {
			const a = [seg('user', 10, false, false, 'user')];
			const b = [seg('user', 10, false, false, 'user'), seg('assistant', 30, false, true, 'assistant')];
			assert.deepStrictEqual(alignSignatureChunks(a, b), [
				{ role: 'user', label: 'user', aChars: 10, bChars: 10, drift: false },
				{ role: 'assistant', label: 'assistant', aChars: undefined, bChars: 30, drift: true },
			]);
		});
	});
});
