/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type {
	IAgentDeltaEvent,
	IAgentErrorEvent,
	IAgentIdleEvent,
	IAgentMessageEvent,
	IAgentPermissionRequestEvent,
	IAgentReasoningEvent,
	IAgentTitleChangedEvent,
	IAgentToolCompleteEvent,
	IAgentToolStartEvent,
	IAgentUsageEvent,
} from '../../common/agentService.js';
import type {
	IDeltaAction,
	IPermissionRequestAction,
	IReasoningAction,
	ISessionErrorAction,
	ITitleChangedAction,
	IToolCompleteAction,
	IToolStartAction,
	ITurnCompleteAction,
	IUsageAction,
} from '../../common/state/sessionActions.js';
import { ToolCallStatus } from '../../common/state/sessionState.js';
import { mapProgressEventToAction } from '../../node/agentEventMapper.js';

suite('AgentEventMapper', () => {

	const session = URI.from({ scheme: 'copilot', path: '/test-session' });
	const turnId = 'turn-1';

	ensureNoDisposablesAreLeakedInTestSuite();

	test('delta event maps to session/delta action', () => {
		const event: IAgentDeltaEvent = {
			session,
			type: 'delta',
			messageId: 'msg-1',
			content: 'hello world',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/delta');
		const delta = action as IDeltaAction;
		assert.strictEqual(delta.content, 'hello world');
		assert.strictEqual(delta.session.toString(), session.toString());
		assert.strictEqual(delta.turnId, turnId);
	});

	test('tool_start event maps to session/toolStart action', () => {
		const event: IAgentToolStartEvent = {
			session,
			type: 'tool_start',
			toolCallId: 'tc-1',
			toolName: 'readFile',
			displayName: 'Read File',
			invocationMessage: 'Reading file...',
			toolInput: '/src/foo.ts',
			toolKind: 'terminal',
			language: 'shellscript',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/toolStart');
		const toolCall = (action as IToolStartAction).toolCall;
		assert.strictEqual(toolCall.toolCallId, 'tc-1');
		assert.strictEqual(toolCall.toolName, 'readFile');
		assert.strictEqual(toolCall.displayName, 'Read File');
		assert.strictEqual(toolCall.invocationMessage, 'Reading file...');
		assert.strictEqual(toolCall.toolInput, '/src/foo.ts');
		assert.strictEqual(toolCall.toolKind, 'terminal');
		assert.strictEqual(toolCall.language, 'shellscript');
		assert.strictEqual(toolCall.status, ToolCallStatus.Running);
	});

	test('tool_complete event maps to session/toolComplete action', () => {
		const event: IAgentToolCompleteEvent = {
			session,
			type: 'tool_complete',
			toolCallId: 'tc-1',
			success: true,
			pastTenseMessage: 'Read file successfully',
			toolOutput: 'file contents here',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/toolComplete');
		const complete = action as IToolCompleteAction;
		assert.strictEqual(complete.toolCallId, 'tc-1');
		assert.strictEqual(complete.result.success, true);
		assert.strictEqual(complete.result.pastTenseMessage, 'Read file successfully');
		assert.strictEqual(complete.result.toolOutput, 'file contents here');
	});

	test('idle event maps to session/turnComplete action', () => {
		const event: IAgentIdleEvent = {
			session,
			type: 'idle',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/turnComplete');
		const turnComplete = action as ITurnCompleteAction;
		assert.strictEqual(turnComplete.session.toString(), session.toString());
		assert.strictEqual(turnComplete.turnId, turnId);
	});

	test('error event maps to session/error action', () => {
		const event: IAgentErrorEvent = {
			session,
			type: 'error',
			errorType: 'runtime',
			message: 'Something went wrong',
			stack: 'Error: Something went wrong\n    at foo.ts:1',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/error');
		const errorAction = action as ISessionErrorAction;
		assert.strictEqual(errorAction.error.errorType, 'runtime');
		assert.strictEqual(errorAction.error.message, 'Something went wrong');
		assert.strictEqual(errorAction.error.stack, 'Error: Something went wrong\n    at foo.ts:1');
	});

	test('usage event maps to session/usage action', () => {
		const event: IAgentUsageEvent = {
			session,
			type: 'usage',
			inputTokens: 100,
			outputTokens: 50,
			model: 'gpt-4',
			cacheReadTokens: 25,
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/usage');
		const usageAction = action as IUsageAction;
		assert.strictEqual(usageAction.usage.inputTokens, 100);
		assert.strictEqual(usageAction.usage.outputTokens, 50);
		assert.strictEqual(usageAction.usage.model, 'gpt-4');
		assert.strictEqual(usageAction.usage.cacheReadTokens, 25);
	});

	test('title_changed event maps to session/titleChanged action', () => {
		const event: IAgentTitleChangedEvent = {
			session,
			type: 'title_changed',
			title: 'New Title',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/titleChanged');
		assert.strictEqual((action as ITitleChangedAction).title, 'New Title');
	});

	test('permission_request event maps to session/permissionRequest action', () => {
		const event: IAgentPermissionRequestEvent = {
			session,
			type: 'permission_request',
			requestId: 'perm-1',
			permissionKind: 'shell',
			toolCallId: 'tc-2',
			fullCommandText: 'rm -rf /',
			intention: 'Delete all files',
			rawRequest: '{}',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/permissionRequest');
		const req = (action as IPermissionRequestAction).request;
		assert.strictEqual(req.requestId, 'perm-1');
		assert.strictEqual(req.permissionKind, 'shell');
		assert.strictEqual(req.toolCallId, 'tc-2');
		assert.strictEqual(req.fullCommandText, 'rm -rf /');
		assert.strictEqual(req.intention, 'Delete all files');
	});

	test('reasoning event maps to session/reasoning action', () => {
		const event: IAgentReasoningEvent = {
			session,
			type: 'reasoning',
			content: 'Let me think about this...',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.ok(action);
		assert.strictEqual(action.type, 'session/reasoning');
		const reasoning = action as IReasoningAction;
		assert.strictEqual(reasoning.content, 'Let me think about this...');
		assert.strictEqual(reasoning.turnId, turnId);
	});

	test('message event returns undefined', () => {
		const event: IAgentMessageEvent = {
			session,
			type: 'message',
			role: 'assistant',
			messageId: 'msg-1',
			content: 'Some full message',
		};

		const action = mapProgressEventToAction(event, session, turnId);
		assert.strictEqual(action, undefined);
	});
});
