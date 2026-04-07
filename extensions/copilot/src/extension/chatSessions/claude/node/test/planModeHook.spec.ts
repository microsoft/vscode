/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import sinon from 'sinon';
import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import { ILogService } from '../../../../../platform/log/common/logService';
import { ClaudeToolNames } from '../../common/claudeTools';
import { IClaudeSessionStateService, SessionStateChangeEvent } from '../claudeSessionStateService';
import { PlanModeHook } from '../hooks/toolHooks';

describe('PlanModeHook', () => {
	let hook: PlanModeHook;
	let mockLogService: sinon.SinonStubbedInstance<ILogService>;
	let mockSessionStateService: sinon.SinonStubbedInstance<IClaudeSessionStateService>;
	let stateChangeEvents: SessionStateChangeEvent[];
	let abortController: AbortController;
	let hookOptions: { signal: AbortSignal };

	beforeEach(() => {
		stateChangeEvents = [];
		abortController = new AbortController();
		hookOptions = { signal: abortController.signal };

		mockLogService = {
			trace: sinon.stub(),
			debug: sinon.stub(),
			info: sinon.stub(),
			warn: sinon.stub(),
			error: sinon.stub(),
			show: sinon.stub(),
			createSubLogger: sinon.stub(),
		} as unknown as sinon.SinonStubbedInstance<ILogService>;

		mockSessionStateService = {
			onDidChangeSessionState: sinon.stub().callsFake((callback: (e: SessionStateChangeEvent) => void) => {
				// Capture the callback to simulate events
				return { dispose: () => { } };
			}),
			getModelIdForSession: sinon.stub().returns('claude-sonnet-4-20250514'),
			setModelIdForSession: sinon.stub(),
			getPermissionModeForSession: sinon.stub().returns('acceptEdits'),
			setPermissionModeForSession: sinon.stub().callsFake((sessionId: string, mode: string) => {
				stateChangeEvents.push({ sessionId, permissionMode: mode as any });
			}),
		} as unknown as sinon.SinonStubbedInstance<IClaudeSessionStateService>;

		hook = new PlanModeHook(mockLogService, mockSessionStateService);
	});

	afterEach(() => {
		sinon.restore();
	});

	function createPostToolUseHookInput(toolName: string, sessionId: string): PostToolUseHookInput {
		return {
			tool_name: toolName,
			session_id: sessionId,
			tool_input: {},
			cwd: '/some/path',
			hook_event_name: 'PostToolUse',
			tool_response: { text: '' },
			tool_use_id: 'tool-use-12345',
			transcript_path: '/some/path/transcript.jsonl'
		};
	}

	describe('hooks property', () => {
		it('should have exactly one hook callback', () => {
			assert.strictEqual(hook.hooks.length, 1);
			assert.strictEqual(typeof hook.hooks[0], 'function');
		});
	});

	describe('EnterPlanMode handling', () => {
		it('should set permission mode to plan when EnterPlanMode is detected', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.EnterPlanMode, 'session-1');

			const result = await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.calledOnceWithExactly(
				mockSessionStateService.setPermissionModeForSession,
				'session-1',
				'plan'
			);
			assert.deepStrictEqual(result, { continue: true });
		});

		it('should log when EnterPlanMode is detected', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.EnterPlanMode, 'session-1');

			await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.calledOnce(mockLogService.trace);
			const logMessage = mockLogService.trace.firstCall.args[0];
			assert.ok(logMessage.includes('EnterPlanMode'));
			assert.ok(logMessage.includes('plan'));
		});

		it('should propagate state change event for UI updates', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.EnterPlanMode, 'session-1');

			await hook.hooks[0](input, undefined, hookOptions);

			assert.strictEqual(stateChangeEvents.length, 1);
			assert.strictEqual(stateChangeEvents[0].sessionId, 'session-1');
			assert.strictEqual(stateChangeEvents[0].permissionMode, 'plan');
		});
	});

	describe('ExitPlanMode handling', () => {
		it('should set permission mode to acceptEdits when ExitPlanMode is detected', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.ExitPlanMode, 'session-2');

			const result = await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.calledOnceWithExactly(
				mockSessionStateService.setPermissionModeForSession,
				'session-2',
				'acceptEdits'
			);
			assert.deepStrictEqual(result, { continue: true });
		});

		it('should log when ExitPlanMode is detected', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.ExitPlanMode, 'session-2');

			await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.calledOnce(mockLogService.trace);
			const logMessage = mockLogService.trace.firstCall.args[0];
			assert.ok(logMessage.includes('ExitPlanMode'));
			assert.ok(logMessage.includes('acceptEdits'));
		});

		it('should propagate state change event for UI updates', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.ExitPlanMode, 'session-2');

			await hook.hooks[0](input, undefined, hookOptions);

			assert.strictEqual(stateChangeEvents.length, 1);
			assert.strictEqual(stateChangeEvents[0].sessionId, 'session-2');
			assert.strictEqual(stateChangeEvents[0].permissionMode, 'acceptEdits');
		});
	});

	describe('other tool handling', () => {
		it('should not change permission mode for other tools', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.Read, 'session-3');

			const result = await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.notCalled(mockSessionStateService.setPermissionModeForSession);
			assert.deepStrictEqual(result, { continue: true });
		});

		it('should not log for other tools', async () => {
			const input = createPostToolUseHookInput(ClaudeToolNames.Read, 'session-3');

			await hook.hooks[0](input, undefined, hookOptions);

			sinon.assert.notCalled(mockLogService.trace);
		});

		it('should always return continue: true', async () => {
			const tools = [ClaudeToolNames.Bash, ClaudeToolNames.Edit, ClaudeToolNames.Glob];

			for (const tool of tools) {
				const input = createPostToolUseHookInput(tool, 'session-test');
				const result = await hook.hooks[0](input, undefined, hookOptions);
				assert.deepStrictEqual(result, { continue: true });
			}
		});
	});

	describe('session isolation', () => {
		it('should update the correct session when multiple sessions exist', async () => {
			const input1 = createPostToolUseHookInput(ClaudeToolNames.EnterPlanMode, 'session-a');
			const input2 = createPostToolUseHookInput(ClaudeToolNames.ExitPlanMode, 'session-b');

			await hook.hooks[0](input1, undefined, hookOptions);
			await hook.hooks[0](input2, undefined, hookOptions);

			assert.strictEqual(mockSessionStateService.setPermissionModeForSession.callCount, 2);

			const call1 = mockSessionStateService.setPermissionModeForSession.getCall(0);
			assert.strictEqual(call1.args[0], 'session-a');
			assert.strictEqual(call1.args[1], 'plan');

			const call2 = mockSessionStateService.setPermissionModeForSession.getCall(1);
			assert.strictEqual(call2.args[0], 'session-b');
			assert.strictEqual(call2.args[1], 'acceptEdits');
		});
	});
});
