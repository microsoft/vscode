/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ensureChatHandoffTargetMode, executeChatHandoff, type IChatHandoffAgentSwitchResult, type IChatHandoffExecutionDelegate } from '../../../browser/widget/chatHandoffExecution.js';
import type { IChatMode } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import type { IHandOff } from '../../../common/promptSyntax/promptFileParser.js';
import { Target } from '../../../common/promptSyntax/promptTypes.js';

function createMockMode(id: string, name = id): IChatMode {
	return {
		id,
		name: constObservable(name),
		label: constObservable(name),
		icon: constObservable(undefined),
		description: constObservable(undefined),
		isBuiltin: false,
		kind: ChatModeKind.Agent,
		target: constObservable(Target.Undefined),
	} as IChatMode;
}

function createExecutionDelegate(switchResult: IChatHandoffAgentSwitchResult = { success: true, mode: createMockMode('target-mode', 'target-agent') }) {
	const calls = {
		switches: [] as string[],
		models: [] as string[][],
		values: [] as string[],
		focusCount: 0,
		accepts: [] as (string | undefined)[],
	};

	const delegate: IChatHandoffExecutionDelegate = {
		switchToAgent: async agentName => {
			calls.switches.push(agentName);
			return switchResult;
		},
		switchModelByQualifiedName: qualifiedModelNames => calls.models.push([...qualifiedModelNames]),
		setInputValue: value => calls.values.push(value),
		focusInput: () => calls.focusCount++,
		acceptInput: handoffTargetModeId => calls.accepts.push(handoffTargetModeId),
	};

	return { calls, delegate };
}

suite('executeChatHandoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should execute regular auto-send handoffs with target mode pinning', async () => {
		const { calls, delegate } = createExecutionDelegate();
		const handoff: IHandOff = { agent: 'target-agent', label: 'Start', prompt: 'Implement the plan', send: true, model: 'GPT-5 (copilot)' };

		const result = await executeChatHandoff(handoff, undefined, delegate);

		assert.deepStrictEqual({ calls, result }, {
			calls: {
				switches: ['target-agent'],
				models: [['GPT-5 (copilot)']],
				values: ['Implement the plan'],
				focusCount: 1,
				accepts: ['target-mode'],
			},
			result: { success: true, submitted: true, targetModeId: 'target-mode' },
		});
	});

	test('should execute delegated handoffs after switching target mode', async () => {
		const { calls, delegate } = createExecutionDelegate();
		const handoff: IHandOff = { agent: 'target-agent', label: 'Continue', prompt: 'Continue the task' };

		const result = await executeChatHandoff(handoff, 'background', delegate);

		assert.deepStrictEqual({ calls, result }, {
			calls: {
				switches: ['target-agent'],
				models: [],
				values: ['@background Continue the task'],
				focusCount: 1,
				accepts: ['target-mode'],
			},
			result: { success: true, submitted: true, targetModeId: 'target-mode' },
		});
	});

	test('should preserve pure delegated handoffs without a custom target agent', async () => {
		const { calls, delegate } = createExecutionDelegate();
		const handoff = { agent: '', label: 'Continue', prompt: 'Continue remotely' } as IHandOff;

		const result = await executeChatHandoff(handoff, 'background', delegate);

		assert.deepStrictEqual({ calls, result }, {
			calls: {
				switches: [],
				models: [],
				values: ['@background Continue remotely'],
				focusCount: 1,
				accepts: [undefined],
			},
			result: { success: true, submitted: true, targetModeId: undefined },
		});
	});

	test('should switch and insert regular handoffs without submitting when send is false', async () => {
		const { calls, delegate } = createExecutionDelegate();
		const handoff: IHandOff = { agent: 'target-agent', label: 'Open', prompt: 'Review before sending', send: false };

		const result = await executeChatHandoff(handoff, undefined, delegate);

		assert.deepStrictEqual({ calls, result }, {
			calls: {
				switches: ['target-agent'],
				models: [],
				values: ['Review before sending'],
				focusCount: 1,
				accepts: [],
			},
			result: { success: true, submitted: false, targetModeId: 'target-mode' },
		});
	});

	test('should abort without changing input when target switch fails', async () => {
		const { calls, delegate } = createExecutionDelegate({ success: false, reason: 'target agent was not found', mode: createMockMode('missing-target') });
		const handoff: IHandOff = { agent: 'missing-agent', label: 'Start', prompt: 'Implement the plan', send: true, model: 'GPT-5 (copilot)' };

		const result = await executeChatHandoff(handoff, 'background', delegate);

		assert.deepStrictEqual({ calls, result }, {
			calls: {
				switches: ['missing-agent'],
				models: [],
				values: [],
				focusCount: 0,
				accepts: [],
			},
			result: { success: false, error: 'target agent was not found', targetModeId: 'missing-target' },
		});
	});
});

suite('ensureChatHandoffTargetMode', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should reassert target mode or abort when switching is ignored', () => {
		let currentModeId = 'source-mode';
		const changedModes: string[] = [];
		const debugMessages: string[] = [];
		const warningMessages: string[] = [];

		const reasserted = ensureChatHandoffTargetMode('target-mode', 'before send', {
			getCurrentModeId: () => currentModeId,
			setChatMode: modeId => {
				changedModes.push(modeId);
				currentModeId = modeId;
			},
			logDebug: message => debugMessages.push(message),
			logWarning: message => warningMessages.push(message),
		});

		const alreadyTarget = ensureChatHandoffTargetMode('target-mode', 'before send', {
			getCurrentModeId: () => currentModeId,
			setChatMode: modeId => changedModes.push(modeId),
			logDebug: message => debugMessages.push(message),
			logWarning: message => warningMessages.push(message),
		});

		currentModeId = 'source-mode';
		const failed = ensureChatHandoffTargetMode('target-mode', 'before send', {
			getCurrentModeId: () => currentModeId,
			setChatMode: modeId => changedModes.push(modeId),
			logDebug: message => debugMessages.push(message),
			logWarning: message => warningMessages.push(message),
		});

		assert.deepStrictEqual({ reasserted, alreadyTarget, failed, changedModes, debugCount: debugMessages.length, warningCount: warningMessages.length }, {
			reasserted: true,
			alreadyTarget: true,
			failed: false,
			changedModes: ['target-mode', 'target-mode'],
			debugCount: 2,
			warningCount: 1,
		});
	});
});