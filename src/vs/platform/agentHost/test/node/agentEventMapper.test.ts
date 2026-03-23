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
	ISessionAction,
	ISessionErrorAction,
	ITitleChangedAction,
	IToolCallCompleteAction,
	IToolCallReadyAction,
	IToolCallStartAction,
	ITurnCompleteAction,
	IUsageAction,
} from '../../common/state/sessionActions.js';
import { PermissionKind } from '../../common/state/sessionState.js';
import { mapProgressEventToActions } from '../../node/agentEventMapper.js';

/** Helper: flatten the result of mapProgressEventToActions into an array. */
function mapToArray(result: ISessionAction | ISessionAction[] | undefined): ISessionAction[] {
	if (!result) {
		return [];
	}
	return Array.isArray(result) ? result : [result];
}

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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const action = actions[0];
		assert.strictEqual(action.type, 'session/delta');
		const delta = action as IDeltaAction;
		assert.strictEqual(delta.content, 'hello world');
		assert.strictEqual(delta.session.toString(), session.toString());
		assert.strictEqual(delta.turnId, turnId);
	});

	test('tool_start event maps to toolCallStart + toolCallReady actions', () => {
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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 2);

		const startAction = actions[0] as IToolCallStartAction;
		assert.strictEqual(startAction.type, 'session/toolCallStart');
		assert.strictEqual(startAction.toolCallId, 'tc-1');
		assert.strictEqual(startAction.toolName, 'readFile');
		assert.strictEqual(startAction.displayName, 'Read File');
		assert.strictEqual(startAction._meta?.toolKind, 'terminal');
		assert.strictEqual(startAction._meta?.language, 'shellscript');

		const readyAction = actions[1] as IToolCallReadyAction;
		assert.strictEqual(readyAction.type, 'session/toolCallReady');
		assert.strictEqual(readyAction.toolCallId, 'tc-1');
		assert.strictEqual(readyAction.invocationMessage, 'Reading file...');
		assert.strictEqual(readyAction.toolInput, '/src/foo.ts');
		assert.strictEqual(readyAction.confirmed, 'not-needed');
	});

	test('tool_complete event maps to session/toolCallComplete action', () => {
		const event: IAgentToolCompleteEvent = {
			session,
			type: 'tool_complete',
			toolCallId: 'tc-1',
			success: true,
			pastTenseMessage: 'Read file successfully',
			toolOutput: 'file contents here',
		};

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const complete = actions[0] as IToolCallCompleteAction;
		assert.strictEqual(complete.type, 'session/toolCallComplete');
		assert.strictEqual(complete.toolCallId, 'tc-1');
		assert.strictEqual(complete.result.success, true);
		assert.strictEqual(complete.result.pastTenseMessage, 'Read file successfully');
		assert.deepStrictEqual(complete.result.content, [{ type: 'text', text: 'file contents here' }]);
	});

	test('idle event maps to session/turnComplete action', () => {
		const event: IAgentIdleEvent = {
			session,
			type: 'idle',
		};

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const turnComplete = actions[0] as ITurnCompleteAction;
		assert.strictEqual(turnComplete.type, 'session/turnComplete');
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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const errorAction = actions[0] as ISessionErrorAction;
		assert.strictEqual(errorAction.type, 'session/error');
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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const usageAction = actions[0] as IUsageAction;
		assert.strictEqual(usageAction.type, 'session/usage');
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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/titleChanged');
		assert.strictEqual((actions[0] as ITitleChangedAction).title, 'New Title');
	});

	test('permission_request event maps to session/permissionRequest action', () => {
		const event: IAgentPermissionRequestEvent = {
			session,
			type: 'permission_request',
			requestId: 'perm-1',
			permissionKind: PermissionKind.Shell,
			toolCallId: 'tc-2',
			fullCommandText: 'rm -rf /',
			intention: 'Delete all files',
			rawRequest: '{}',
		};

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/permissionRequest');
		const req = (actions[0] as IPermissionRequestAction).request;
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

		const actions = mapToArray(mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/reasoning');
		const reasoning = actions[0] as IReasoningAction;
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

		const result = mapProgressEventToActions(event, session.toString(), turnId);
		assert.strictEqual(result, undefined);
	});
});
