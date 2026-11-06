/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildCustomAgentHandoffsInfo, getHandoffId, IChatMode } from '../../common/chatModes.js';
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
