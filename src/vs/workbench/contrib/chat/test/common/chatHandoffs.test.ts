/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS, buildCustomAgentHandoffsInfo, getHandoffId, IChatMode, shouldAutoFireHandoff } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { IHandOff } from '../../common/promptSyntax/promptFileParser.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';

function createMockMode(overrides: Partial<IChatMode> & { id: string; kind: ChatModeKind }): IChatMode {
	return {
		name: constObservable(overrides.id),
		label: constObservable(overrides.id),
		icon: constObservable(undefined),
		description: constObservable(undefined),
		isBuiltin: overrides.isBuiltin ?? false,
		target: constObservable(Target.Undefined),
		...overrides,
	} as IChatMode;
}

suite('getHandoffId', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should generate a stable id from agent and label', () => {
		const handoff: IHandOff = { agent: 'agent', label: 'Start Implementation', prompt: 'go' };
		assert.strictEqual(getHandoffId(handoff), 'agent:start-implementation');
	});

	test('should handle special characters in label', () => {
		const handoff: IHandOff = { agent: 'edit', label: 'Open in Editor!', prompt: '' };
		assert.strictEqual(getHandoffId(handoff), 'edit:open-in-editor');
	});

	test('should handle single-word label', () => {
		const handoff: IHandOff = { agent: 'agent', label: 'Continue', prompt: '' };
		assert.strictEqual(getHandoffId(handoff), 'agent:continue');
	});
});

suite('shouldAutoFireHandoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows firing when nothing has been auto-fired yet', () => {
		assert.strictEqual(shouldAutoFireHandoff(0), true);
	});

	test('allows firing up to and including the last attempt under the cap', () => {
		for (let count = 0; count < AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS; count++) {
			assert.strictEqual(shouldAutoFireHandoff(count), true, `count=${count} should still be allowed`);
		}
	});

	test('blocks firing once the cap is reached', () => {
		assert.strictEqual(shouldAutoFireHandoff(AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS), false);
	});

	test('stays blocked for counts beyond the cap (defensive — count should never overshoot in practice)', () => {
		assert.strictEqual(shouldAutoFireHandoff(AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS + 1), false);
	});

	test('the cap is reached the same way whether or not a cycle\'s handoff ids happen to match', () => {
		// Plan's handoff to Implement is labeled "Implement"; Implement's
		// handoff back to Plan is labeled "Review" — two entirely different
		// handoff ids (getHandoffId is agent + label). An approach that
		// detects loops by comparing identities across hops would never see
		// these two as "the same handoff repeating" and would need a much
		// more elaborate model to catch this shape at all. A plain
		// consecutive-attempt count sidesteps the question entirely: it
		// doesn't matter whether the ids match, only how many unattended
		// auto-fires have happened in a row, so both a same-id cycle (A -> A)
		// and a different-id cycle (A -> B -> A with distinct labels each
		// way) are governed by the exact same cap.
		const toImplement: IHandOff = { agent: 'implement', label: 'Implement', prompt: '', send: true };
		const toPlan: IHandOff = { agent: 'plan', label: 'Review', prompt: '', send: true };
		assert.notStrictEqual(getHandoffId(toImplement), getHandoffId(toPlan));

		assert.strictEqual(shouldAutoFireHandoff(AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS - 1), true);
		assert.strictEqual(shouldAutoFireHandoff(AUTOPILOT_MAX_CONSECUTIVE_AUTO_HANDOFFS), false);
	});

	test('a long but genuinely non-repeating chain that stays under the cap is never blocked', () => {
		// plan -> implement -> verify: three distinct handoffs, well under the
		// cap, and the chain naturally ends (verify's response offers no
		// further send:true handoff) rather than continuing indefinitely.
		for (let count = 0; count < 3; count++) {
			assert.strictEqual(shouldAutoFireHandoff(count), true);
		}
	});
});

suite('buildCustomAgentHandoffsInfo', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return empty handoffs for modes without handOffs', () => {
		const mode = createMockMode({
			id: 'ask',
			kind: ChatModeKind.Ask,
			isBuiltin: true,
		});

		const result = buildCustomAgentHandoffsInfo([mode]);
		assert.deepStrictEqual(result, [{
			id: 'ask',
			name: 'ask',
			isBuiltin: true,
			visibility: { userInvocable: true, agentInvocable: true },
			handoffs: [],
		}]);
	});

	test('should map handoffs with all fields', () => {
		const handoffs: IHandOff[] = [
			{ agent: 'agent', label: 'Start Implementation', prompt: 'Start implementation', send: true, model: 'gpt-4o' },
			{ agent: 'agent', label: 'Open in Editor', prompt: 'Open the plan', showContinueOn: false },
		];
		const mode = createMockMode({
			id: 'plan-mode',
			kind: ChatModeKind.Agent,
			handOffs: observableValue('handOffs', handoffs),
			visibility: observableValue('visibility', { userInvocable: true, agentInvocable: false }),
		});

		const result = buildCustomAgentHandoffsInfo([mode]);
		assert.deepStrictEqual(result, [{
			id: 'plan-mode',
			name: 'plan-mode',
			isBuiltin: false,
			visibility: { userInvocable: true, agentInvocable: false },
			handoffs: [
				{ id: 'agent:start-implementation', label: 'Start Implementation', agent: 'agent', prompt: 'Start implementation', send: true, model: 'gpt-4o' },
				{ id: 'agent:open-in-editor', label: 'Open in Editor', agent: 'agent', prompt: 'Open the plan', showContinueOn: false },
			],
		}]);
	});

	test('should handle multiple modes', () => {
		const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
		const agentMode = createMockMode({ id: 'agent', kind: ChatModeKind.Agent, isBuiltin: true });

		const result = buildCustomAgentHandoffsInfo([askMode, agentMode]);
		assert.deepStrictEqual(result, [
			{
				id: 'ask',
				name: 'ask',
				isBuiltin: true,
				visibility: { userInvocable: true, agentInvocable: true },
				handoffs: [],
			},
			{
				id: 'agent',
				name: 'agent',
				isBuiltin: true,
				visibility: { userInvocable: true, agentInvocable: true },
				handoffs: [],
			},
		]);
	});

	test('should omit optional handoff fields when undefined', () => {
		const handoffs: IHandOff[] = [
			{ agent: 'agent', label: 'Go', prompt: 'do it' },
		];
		const mode = createMockMode({
			id: 'test',
			kind: ChatModeKind.Agent,
			handOffs: observableValue('handOffs', handoffs),
		});

		const result = buildCustomAgentHandoffsInfo([mode]);
		const info = result[0].handoffs[0];
		assert.strictEqual(info.id, 'agent:go');
		assert.strictEqual(info.send, undefined);
		assert.strictEqual(info.showContinueOn, undefined);
		assert.strictEqual(info.model, undefined);
	});
});
