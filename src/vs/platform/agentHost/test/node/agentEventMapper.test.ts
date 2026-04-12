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
	IAgentReasoningEvent,
	IAgentTitleChangedEvent,
	IAgentToolCompleteEvent,
	IAgentToolStartEvent,
	IAgentUsageEvent,
	IAgentUserInputRequestEvent,
} from '../../common/agentService.js';
import type {
	IDeltaAction,
	IReasoningAction,
	IResponsePartAction,
	ISessionAction,
	ISessionErrorAction,
	ISessionInputRequestedAction,
	ITitleChangedAction,
	IToolCallCompleteAction,
	IToolCallReadyAction,
	IToolCallStartAction,
	ITurnCompleteAction,
	IUsageAction,
} from '../../common/state/sessionActions.js';
import { SessionInputQuestionKind, ToolResultContentType, type IMarkdownResponsePart, type IReasoningResponsePart, type ISessionInputRequest } from '../../common/state/sessionState.js';
import { AgentEventMapper } from '../../node/agentEventMapper.js';

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
	let mapper: AgentEventMapper;

	setup(() => {
		mapper = new AgentEventMapper();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('first delta event creates a responsePart with content', () => {
		const event: IAgentDeltaEvent = {
			session,
			type: 'delta',
			messageId: 'msg-1',
			content: 'hello world',
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/responsePart');
		const part = (actions[0] as IResponsePartAction).part;
		assert.strictEqual(part.kind, 'markdown');
		assert.strictEqual(part.content, 'hello world');
		assert.ok(part.id);
	});

	test('subsequent delta event maps to session/delta action', () => {
		const first: IAgentDeltaEvent = { session, type: 'delta', messageId: 'msg-1', content: 'hello ' };
		const second: IAgentDeltaEvent = { session, type: 'delta', messageId: 'msg-1', content: 'world' };

		const firstActions = mapToArray(mapper.mapProgressEventToActions(first, session.toString(), turnId));
		const partId = ((firstActions[0] as IResponsePartAction).part as IMarkdownResponsePart).id;

		const secondActions = mapToArray(mapper.mapProgressEventToActions(second, session.toString(), turnId));
		assert.strictEqual(secondActions.length, 1);
		const delta = secondActions[0] as IDeltaAction;
		assert.strictEqual(delta.type, 'session/delta');
		assert.strictEqual(delta.content, 'world');
		assert.strictEqual(delta.partId, partId);
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

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
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
			result: {
				success: true,
				pastTenseMessage: 'Read file successfully',
				content: [{ type: ToolResultContentType.Text, text: 'file contents here' }],
			},
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
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

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
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

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
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

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
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

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/titleChanged');
		assert.strictEqual((actions[0] as ITitleChangedAction).title, 'New Title');
	});

	test('first reasoning event creates a responsePart with content', () => {
		const event: IAgentReasoningEvent = {
			session,
			type: 'reasoning',
			content: 'Let me think about this...',
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/responsePart');
		const part = (actions[0] as IResponsePartAction).part;
		assert.strictEqual(part.kind, 'reasoning');
		assert.strictEqual(part.content, 'Let me think about this...');
		assert.ok(part.id);
	});

	test('subsequent reasoning event maps to session/reasoning action', () => {
		const first: IAgentReasoningEvent = { session, type: 'reasoning', content: 'Let me think...' };
		const second: IAgentReasoningEvent = { session, type: 'reasoning', content: ' more thoughts' };

		const firstActions = mapToArray(mapper.mapProgressEventToActions(first, session.toString(), turnId));
		const partId = ((firstActions[0] as IResponsePartAction).part as IReasoningResponsePart).id;

		const secondActions = mapToArray(mapper.mapProgressEventToActions(second, session.toString(), turnId));
		assert.strictEqual(secondActions.length, 1);
		const reasoning = secondActions[0] as IReasoningAction;
		assert.strictEqual(reasoning.type, 'session/reasoning');
		assert.strictEqual(reasoning.content, ' more thoughts');
		assert.strictEqual(reasoning.partId, partId);
	});

	test('message event with no prior deltas creates responsePart', () => {
		const event: IAgentMessageEvent = {
			session,
			type: 'message',
			role: 'assistant',
			messageId: 'msg-1',
			content: 'Some full message',
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/responsePart');
		const part = (actions[0] as IResponsePartAction).part;
		assert.strictEqual(part.kind, 'markdown');
		assert.strictEqual(part.content, 'Some full message');
	});

	test('message event after deltas returns undefined', () => {
		// First send a delta so the mapper tracks a current markdown part
		const delta: IAgentDeltaEvent = { session, type: 'delta', messageId: 'msg-1', content: 'hello' };
		mapper.mapProgressEventToActions(delta, session.toString(), turnId);

		const event: IAgentMessageEvent = {
			session,
			type: 'message',
			role: 'assistant',
			messageId: 'msg-1',
			content: 'hello',
		};

		const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
		assert.strictEqual(result, undefined);
	});

	test('message event after tool_start creates responsePart for post-tool text', () => {
		// Delta before tool call
		const delta: IAgentDeltaEvent = { session, type: 'delta', messageId: 'msg-1', content: 'before' };
		mapper.mapProgressEventToActions(delta, session.toString(), turnId);

		// Tool call clears the current markdown part
		const toolStart: IAgentToolStartEvent = {
			session, type: 'tool_start',
			toolCallId: 'tc-1', toolName: 'bash', displayName: 'Bash',
			invocationMessage: 'Running', toolInput: 'ls',
		};
		mapper.mapProgressEventToActions(toolStart, session.toString(), turnId);

		// Message event with text that came after the tool call
		const msg: IAgentMessageEvent = {
			session, type: 'message', role: 'assistant',
			messageId: 'msg-2', content: 'after tool',
		};
		const actions = mapToArray(mapper.mapProgressEventToActions(msg, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].type, 'session/responsePart');
		const part = (actions[0] as IResponsePartAction).part;
		assert.strictEqual(part.kind, 'markdown');
		assert.strictEqual(part.content, 'after tool');
	});

	test('message event with user role returns undefined', () => {
		const event: IAgentMessageEvent = {
			session, type: 'message', role: 'user',
			messageId: 'msg-1', content: 'user text',
		};
		const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
		assert.strictEqual(result, undefined);
	});

	test('message event with empty content returns undefined', () => {
		const event: IAgentMessageEvent = {
			session, type: 'message', role: 'assistant',
			messageId: 'msg-1', content: '',
		};
		const result = mapper.mapProgressEventToActions(event, session.toString(), turnId);
		assert.strictEqual(result, undefined);
	});

	test('user_input_request event maps to session/inputRequested action', () => {
		const request: ISessionInputRequest = {
			id: 'req-1',
			message: 'What is your name?',
			questions: [{
				kind: SessionInputQuestionKind.Text,
				id: 'q-1',
				message: 'What is your name?',
				required: true,
			}],
		};
		const event: IAgentUserInputRequestEvent = {
			session,
			type: 'user_input_request',
			request,
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		assert.strictEqual(actions.length, 1);
		const action = actions[0] as ISessionInputRequestedAction;
		assert.strictEqual(action.type, 'session/inputRequested');
		assert.strictEqual(action.session, session.toString());
		assert.strictEqual(action.request, request);
	});

	test('tool_start with subagent toolKind extracts agent metadata from toolArguments', () => {
		const event: IAgentToolStartEvent = {
			session,
			type: 'tool_start',
			toolCallId: 'tc-sub',
			toolName: 'task',
			displayName: 'Task',
			invocationMessage: 'Delegating...',
			toolKind: 'subagent',
			toolArguments: JSON.stringify({ description: 'Review the code', agentName: 'code-reviewer' }),
		};

		const actions = mapToArray(mapper.mapProgressEventToActions(event, session.toString(), turnId));
		const startAction = actions[0] as IToolCallStartAction;
		assert.strictEqual(startAction._meta?.toolKind, 'subagent');
		assert.strictEqual(startAction._meta?.subagentDescription, 'Review the code');
		assert.strictEqual(startAction._meta?.subagentAgentName, 'code-reviewer');
	});
});
