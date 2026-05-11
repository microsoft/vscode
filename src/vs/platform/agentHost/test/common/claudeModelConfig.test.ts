/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CLAUDE_THINKING_LEVEL_KEY, createClaudeThinkingLevelSchema, isClaudeEffortLevel, resolveClaudeEffort, type ClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';

suite('resolveClaudeEffort (Phase 6.1 / Cycle E)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns the SDK enum value for each accepted thinkingLevel string', () => {
		const accepted = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
		const actual = accepted.map(level => resolveClaudeEffort({
			id: 'claude-opus-4.6',
			config: { [CLAUDE_THINKING_LEVEL_KEY]: level },
		}));
		assert.deepStrictEqual(actual, ['low', 'medium', 'high', 'xhigh', 'max']);
	});

	test('returns undefined for absent / unrecognized inputs (SDK default takes over)', () => {
		// Each input represents a real failure mode the materialize site can
		// hit: no model picked, model with no config bag, model with empty
		// config bag, model with config but no thinkingLevel key, and a model
		// whose thinkingLevel string is outside the union. All five must
		// degrade to `undefined` so the SDK falls through to its own default
		// instead of being told to use a value it doesn't understand.
		const cases: readonly (ModelSelection | undefined)[] = [
			undefined,
			{ id: 'claude-opus-4.6' },
			{ id: 'claude-opus-4.6', config: {} },
			{ id: 'claude-opus-4.6', config: { unrelated: 'high' } },
			{ id: 'claude-opus-4.6', config: { [CLAUDE_THINKING_LEVEL_KEY]: 'turbo' } },
		];
		assert.deepStrictEqual(cases.map(resolveClaudeEffort), [undefined, undefined, undefined, undefined, undefined]);
	});
});

suite('isClaudeEffortLevel (Phase 6.1 / Cycle D3)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts the canonical 5-value union, rejects anything else', () => {
		// Picker-side and read-side must agree on the same union: the picker
		// only emits these five strings, and `toAgentModelInfo` filters
		// CAPI's `reasoning_effort` array through this guard before passing
		// it into `createClaudeThinkingLevelSchema`. A drift between the two
		// would surface as a model whose enum advertises a value the
		// materialize site can't honor.
		const inputs = ['low', 'medium', 'high', 'xhigh', 'max', '', 'LOW', 'turbo', 'minimal', 'High'];
		assert.deepStrictEqual(inputs.map(isClaudeEffortLevel), [true, true, true, true, true, false, false, false, false, false]);
	});
});

suite('createClaudeThinkingLevelSchema (Phase 6.1 / Cycle D3)', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('per-model variation: enum + enumLabels + default track the supplied list; empty list returns undefined', () => {
		// Single snapshot covering every shape the caller can hand in: the
		// full 5-value union, a 3-value subset (most common Claude case), a
		// single-value list, an out-of-canonical-order list that omits
		// 'high' (no `default` emitted), and the empty list (no schema
		// rendered, picker hides the control). Asserting them together
		// locks (a) `enum` ordering and `enumLabels` ordering stay 1:1 with
		// the input, and (b) `default: 'high'` is emitted iff 'high' is in
		// the supported list (mirror of the extension's rule at
		// extensions/copilot/.../claudeCodeModels.ts:230).
		const fullUnion: readonly ClaudeEffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
		const lowMediumHigh: readonly ClaudeEffortLevel[] = ['low', 'medium', 'high'];
		const highOnly: readonly ClaudeEffortLevel[] = ['high'];
		const noHigh: readonly ClaudeEffortLevel[] = ['max', 'low'];
		const empty: readonly ClaudeEffortLevel[] = [];

		assert.deepStrictEqual({
			fullUnion: createClaudeThinkingLevelSchema(fullUnion),
			lowMediumHigh: createClaudeThinkingLevelSchema(lowMediumHigh),
			highOnly: createClaudeThinkingLevelSchema(highOnly),
			noHigh: createClaudeThinkingLevelSchema(noHigh),
			empty: createClaudeThinkingLevelSchema(empty),
		}, {
			fullUnion: {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'medium', 'high', 'xhigh', 'max'],
						enumLabels: ['Low', 'Medium', 'High', 'Extra High', 'Max'],
						default: 'high',
					},
				},
			},
			lowMediumHigh: {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'medium', 'high'],
						enumLabels: ['Low', 'Medium', 'High'],
						default: 'high',
					},
				},
			},
			highOnly: {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['high'],
						enumLabels: ['High'],
						default: 'high',
					},
				},
			},
			noHigh: {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['max', 'low'],
						enumLabels: ['Max', 'Low'],
					},
				},
			},
			empty: undefined,
		});
	});

	test(`emits default: 'high' iff 'high' is in the supported list, never substitutes another value`, () => {
		// 'high' is the canonical Claude default (server-side fallback when
		// adaptive thinking is enabled). When a model omits 'high' the
		// helper must NOT pick another value as a stand-in default — the
		// picker should open with no pre-selection so the SDK falls through
		// to its own default rather than being told to use a value the user
		// didn't pick.
		const cases: readonly { input: readonly ClaudeEffortLevel[]; expected: ClaudeEffortLevel | undefined }[] = [
			{ input: ['high'], expected: 'high' },
			{ input: ['low', 'high'], expected: 'high' },
			{ input: ['low', 'medium', 'high', 'xhigh', 'max'], expected: 'high' },
			{ input: ['low'], expected: undefined },
			{ input: ['low', 'medium'], expected: undefined },
			{ input: ['xhigh'], expected: undefined },
			{ input: ['xhigh', 'max'], expected: undefined },
		];
		assert.deepStrictEqual(
			cases.map(c => createClaudeThinkingLevelSchema(c.input)?.properties.thinkingLevel.default),
			cases.map(c => c.expected),
		);
	});

	test('input array is not mutated and the returned enum is independent of subsequent input mutation', () => {
		// The helper is invoked once per model at authenticate-time; the
		// caller's array is the post-`filter` view of `reasoning_effort`.
		// If the schema's `enum` aliased the input array, a subsequent
		// mutation (e.g. another caller reusing a buffer) would silently
		// rewrite an already-published `IAgentModelInfo.configSchema`.
		const input: ClaudeEffortLevel[] = ['low', 'high'];
		const schema = createClaudeThinkingLevelSchema(input);
		input.push('max');
		assert.deepStrictEqual({
			input,
			enum: schema?.properties.thinkingLevel.enum,
			default: schema?.properties.thinkingLevel.default,
		}, {
			input: ['low', 'high', 'max'],
			enum: ['low', 'high'],
			default: 'high',
		});
	});
});

