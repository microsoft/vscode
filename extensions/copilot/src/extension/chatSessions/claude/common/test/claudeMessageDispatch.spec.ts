/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NonNullableUsage, SDKAssistantMessage, SDKCompactBoundaryMessage, SDKHookProgressMessage, SDKHookResponseMessage, SDKHookStartedMessage, SDKResultError, SDKResultSuccess, SDKStatusMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService, type ISpanHandle } from '../../../../../platform/otel/common/otelService';
import { IRequestLogger } from '../../../../../platform/requestLogger/common/requestLogger';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import type { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { IToolsService } from '../../../../tools/common/toolsService';
import {
	ALL_KNOWN_MESSAGE_KEYS,
	DENY_TOOL_MESSAGE,
	dispatchMessage,
	handleAssistantMessage,
	handleCompactBoundary,
	handleHookProgress,
	handleHookResponse,
	handleHookStarted,
	handleResultMessage,
	handleUserMessage,
	KnownClaudeError,
	MessageHandlerRequestContext,
	MessageHandlerState,
	messageKey,
	parseHookJsonOutput,
	SYNTHETIC_MODEL_ID,
} from '../claudeMessageDispatch';
import { ClaudeToolNames } from '../claudeTools';
import { IClaudeSessionStateService } from '../claudeSessionStateService';

// #region Test helpers

const TEST_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as `${string}-${string}-${string}-${string}-${string}`;
const TEST_SESSION = 'test-session';

const noopSpan: ISpanHandle = {
	setAttribute() { },
	setAttributes() { },
	setStatus() { },
	recordException() { },
	addEvent() { },
	getSpanContext() { return undefined; },
	end() { },
};

interface TestServices {
	readonly logService: TestLogService;
	readonly otelService: IOTelService;
	readonly toolsService: IToolsService;
	readonly requestLogger: { logToolCall: ReturnType<typeof vi.fn>; captureInvocation: ReturnType<typeof vi.fn> };
	readonly sessionStateService: { setPermissionModeForSession: ReturnType<typeof vi.fn>; getCapturingTokenForSession: ReturnType<typeof vi.fn> };
}

function createTestServices(): TestServices {
	return {
		logService: new TestLogService(),
		otelService: { startSpan: () => noopSpan } as Pick<IOTelService, 'startSpan'> as IOTelService,
		toolsService: { invokeTool: vi.fn() } as Pick<IToolsService, 'invokeTool'> as IToolsService,
		requestLogger: { logToolCall: vi.fn(), captureInvocation: vi.fn() },
		sessionStateService: { setPermissionModeForSession: vi.fn(), getCapturingTokenForSession: vi.fn().mockReturnValue(undefined) },
	};
}

const TEST_SESSION_ID = 'test-session-id';

function createAccessor(services: TestServices): ServicesAccessor {
	const serviceMap = new Map<unknown, unknown>([
		[ILogService, services.logService],
		[IOTelService, services.otelService],
		[IToolsService, services.toolsService],
		[IRequestLogger, services.requestLogger],
		[IClaudeSessionStateService, services.sessionStateService],
	]);
	return { get: <T>(id: { toString(): string }): T => serviceMap.get(id) as T };
}

function createRequestContext(): MessageHandlerRequestContext {
	return {
		stream: {
			markdown: vi.fn(),
			push: vi.fn(),
			progress: vi.fn(),
			hookProgress: vi.fn(),
		} as Pick<vscode.ChatResponseStream, 'markdown' | 'push' | 'progress' | 'hookProgress'> as vscode.ChatResponseStream,
		toolInvocationToken: {} as vscode.ChatParticipantToolToken,
		token: { isCancellationRequested: false } as vscode.CancellationToken,
	};
}

function createState(): MessageHandlerState {
	return {
		unprocessedToolCalls: new Map(),
		otelToolSpans: new Map(),
		otelHookSpans: new Map(),
	};
}

function createMockSpan(): ISpanHandle {
	return {
		setAttribute: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		addEvent: vi.fn(),
		getSpanContext: vi.fn(),
		end: vi.fn(),
	};
}

/**
 * Creates a minimal BetaUsage satisfying the SDK type.
 * New required fields from SDK upgrades get added here once.
 */
function makeBetaUsage(): Anthropic.Beta.Messages.BetaUsage {
	return {
		input_tokens: 10,
		output_tokens: 20,
		cache_creation_input_tokens: 0,
		cache_read_input_tokens: 0,
		cache_creation: null,
		inference_geo: null,
		iterations: null,
		server_tool_use: null,
		service_tier: null,
		speed: null,
	};
}

/**
 * Creates a NonNullableUsage (all fields non-null) for SDKResult factories.
 */
function makeNonNullableUsage(): NonNullableUsage {
	return {
		input_tokens: 10,
		output_tokens: 20,
		cache_creation_input_tokens: 0,
		cache_read_input_tokens: 0,
		cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
		inference_geo: 'us',
		iterations: [],
		server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
		service_tier: 'standard',
		speed: 'standard',
	};
}

function makeAssistantMessage(content: Anthropic.Beta.Messages.BetaContentBlock[], parentToolUseId: string | null = null, model = 'claude-3-sonnet'): SDKAssistantMessage {
	return {
		type: 'assistant',
		message: {
			id: 'msg-1',
			type: 'message',
			model,
			role: 'assistant',
			content,
			container: null,
			context_management: null,
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: makeBetaUsage(),
		},
		parent_tool_use_id: parentToolUseId,
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeUserMessage(content: Anthropic.Messages.ContentBlockParam[]): SDKUserMessage {
	return {
		type: 'user',
		message: { role: 'user', content },
		parent_tool_use_id: null,
		session_id: TEST_SESSION,
	};
}

function makeSuccessResult(numTurns = 5): SDKResultSuccess {
	return {
		type: 'result',
		subtype: 'success',
		duration_ms: 1000,
		duration_api_ms: 800,
		is_error: false,
		num_turns: numTurns,
		result: '',
		stop_reason: null,
		total_cost_usd: 0.01,
		usage: makeNonNullableUsage(),
		modelUsage: {},
		permission_denials: [],
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeErrorResult(subtype: SDKResultError['subtype'], numTurns = 5): SDKResultError {
	return {
		type: 'result',
		subtype,
		duration_ms: 1000,
		duration_api_ms: 800,
		is_error: true,
		num_turns: numTurns,
		stop_reason: null,
		total_cost_usd: 0.01,
		usage: makeNonNullableUsage(),
		modelUsage: {},
		permission_denials: [],
		errors: [],
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeCompactBoundary(): SDKCompactBoundaryMessage {
	return {
		type: 'system',
		subtype: 'compact_boundary',
		compact_metadata: { trigger: 'auto', pre_tokens: 100 },
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeStatusMessage(): SDKStatusMessage {
	return {
		type: 'system',
		subtype: 'status',
		status: null,
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeHookStarted(hookId = 'hook-1', hookName = 'my-hook', hookEvent = 'PreToolUse'): SDKHookStartedMessage {
	return {
		type: 'system',
		subtype: 'hook_started',
		hook_id: hookId,
		hook_name: hookName,
		hook_event: hookEvent,
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeHookResponse(
	hookId = 'hook-1',
	outcome: 'success' | 'error' | 'cancelled' = 'success',
	overrides: Partial<Pick<SDKHookResponseMessage, 'output' | 'stderr' | 'stdout' | 'exit_code' | 'hook_name' | 'hook_event'>> = {},
): SDKHookResponseMessage {
	return {
		type: 'system',
		subtype: 'hook_response',
		hook_id: hookId,
		hook_name: overrides.hook_name ?? 'my-hook',
		hook_event: overrides.hook_event ?? 'PreToolUse',
		output: overrides.output ?? '',
		stdout: overrides.stdout ?? '',
		stderr: overrides.stderr ?? '',
		exit_code: overrides.exit_code,
		outcome,
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

function makeHookProgress(
	hookId = 'hook-1',
	overrides: Partial<Pick<SDKHookProgressMessage, 'stdout' | 'stderr' | 'output' | 'hook_name' | 'hook_event'>> = {},
): SDKHookProgressMessage {
	return {
		type: 'system',
		subtype: 'hook_progress',
		hook_id: hookId,
		hook_name: overrides.hook_name ?? 'my-hook',
		hook_event: overrides.hook_event ?? 'PreToolUse',
		stdout: overrides.stdout ?? '',
		stderr: overrides.stderr ?? '',
		output: overrides.output ?? '',
		uuid: TEST_UUID,
		session_id: TEST_SESSION,
	};
}

// #endregion

// #region messageKey

describe('messageKey', () => {
	it('returns type for non-system messages', () => {
		expect(messageKey(makeAssistantMessage([]))).toBe('assistant');
		expect(messageKey(makeUserMessage([]))).toBe('user');
		expect(messageKey(makeSuccessResult())).toBe('result');
	});

	it('returns type:subtype for system messages', () => {
		expect(messageKey(makeCompactBoundary())).toBe('system:compact_boundary');
		expect(messageKey(makeStatusMessage())).toBe('system:status');
	});
});

// #endregion

// #region dispatchMessage

describe('dispatchMessage', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let request: MessageHandlerRequestContext;
	let state: MessageHandlerState;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		request = createRequestContext();
		state = createState();
	});

	it('dispatches assistant messages', () => {
		const message = makeAssistantMessage([{ type: 'text', text: 'Hello', citations: null }]);
		const result = dispatchMessage(accessor, message, TEST_SESSION_ID, request, state);
		expect(result).toBeUndefined(); // assistant handler returns void
		expect(request.stream.markdown).toHaveBeenCalledWith('Hello');
	});

	it('dispatches result messages and returns requestComplete', () => {
		const result = dispatchMessage(accessor, makeSuccessResult(), TEST_SESSION_ID, request, state);
		expect(result).toEqual({ requestComplete: true });
	});

	it('dispatches compact_boundary messages', () => {
		dispatchMessage(accessor, makeCompactBoundary(), TEST_SESSION_ID, request, state);
		expect(request.stream.markdown).toHaveBeenCalledWith('*Conversation compacted*');
	});

	it('trace-logs known but unhandled message types', () => {
		const traceSpy = vi.spyOn(services.logService, 'trace');
		const result = dispatchMessage(accessor, makeStatusMessage(), TEST_SESSION_ID, request, state);
		expect(result).toBeUndefined();
		expect(traceSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled known message type: system:status'));
	});
});

// #endregion

// #region handleAssistantMessage

describe('handleAssistantMessage', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let request: MessageHandlerRequestContext;
	let state: MessageHandlerState;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		request = createRequestContext();
		state = createState();
	});

	it('skips synthetic messages', () => {
		handleAssistantMessage(
			makeAssistantMessage([{ type: 'text', text: 'should be ignored', citations: null }], null, SYNTHETIC_MODEL_ID),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.markdown).not.toHaveBeenCalled();
		expect(request.stream.push).not.toHaveBeenCalled();
	});

	it('streams text content as markdown', () => {
		handleAssistantMessage(
			makeAssistantMessage([{ type: 'text', text: 'Hello world', citations: null }]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.markdown).toHaveBeenCalledWith('Hello world');
	});

	it('pushes thinking content', () => {
		handleAssistantMessage(
			makeAssistantMessage([{ type: 'thinking', thinking: 'Let me think...', signature: 'sig' }]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.push).toHaveBeenCalled();
	});

	it('tracks tool_use blocks in unprocessedToolCalls', () => {
		handleAssistantMessage(
			makeAssistantMessage([{
				type: 'tool_use', id: 'tool-123', name: ClaudeToolNames.Read, input: { file_path: '/test.ts' },
			}]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(state.unprocessedToolCalls.has('tool-123')).toBe(true);
	});

	it('creates OTel spans for tool_use blocks', () => {
		const startSpanSpy = vi.spyOn(services.otelService, 'startSpan');
		handleAssistantMessage(
			makeAssistantMessage([{
				type: 'tool_use', id: 'tool-456', name: ClaudeToolNames.Bash, input: { command: 'ls' },
			}]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(startSpanSpy).toHaveBeenCalledWith(
			expect.stringContaining('execute_tool'),
			expect.objectContaining({ attributes: expect.any(Object) }),
		);
		expect(state.otelToolSpans.has('tool-456')).toBe(true);
	});

	it('sets subAgentInvocationId when parent_tool_use_id is present', () => {
		handleAssistantMessage(
			makeAssistantMessage([{
				type: 'tool_use', id: 'tool-789', name: ClaudeToolNames.Bash, input: { command: 'echo test' },
			}], 'parent-tool-id'),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.push).toHaveBeenCalled();
	});
});

// #endregion

// #region handleUserMessage

describe('handleUserMessage', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let request: MessageHandlerRequestContext;
	let state: MessageHandlerState;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		request = createRequestContext();
		state = createState();
	});

	it('processes tool_result blocks that match unprocessed tool calls', () => {
		const toolUse: Anthropic.Beta.Messages.BetaToolUseBlock = {
			type: 'tool_use', id: 'tool-100', name: ClaudeToolNames.Read, input: { file_path: '/test.ts' },
		};
		state.unprocessedToolCalls.set('tool-100', toolUse);

		const mockSpan = createMockSpan();
		state.otelToolSpans.set('tool-100', mockSpan);

		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-100', content: 'file contents here' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(state.unprocessedToolCalls.has('tool-100')).toBe(false);
		expect(mockSpan.end).toHaveBeenCalled();
	});

	it('skips tool_result blocks with no matching tool call', () => {
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'nonexistent-tool', content: 'result' }]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.push).not.toHaveBeenCalled();
	});

	it('handles non-array content gracefully', () => {
		const message: SDKUserMessage = {
			type: 'user',
			message: { role: 'user', content: 'just a string' },
			parent_tool_use_id: null,
			session_id: TEST_SESSION,
		};
		// Should not throw
		handleUserMessage(message, accessor, TEST_SESSION_ID, request, state);
	});

	it('marks denied tool results with isConfirmed=false', () => {
		const toolUse: Anthropic.Beta.Messages.BetaToolUseBlock = {
			type: 'tool_use', id: 'tool-denied', name: ClaudeToolNames.Bash, input: { command: 'rm -rf /' },
		};
		state.unprocessedToolCalls.set('tool-denied', toolUse);

		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-denied', content: DENY_TOOL_MESSAGE }]),
			accessor, TEST_SESSION_ID, request, state,
		);
		expect(request.stream.push).toHaveBeenCalled();
	});

	it('invokes CoreManageTodoList for TodoWrite tool results', () => {
		const toolUse: Anthropic.Beta.Messages.BetaToolUseBlock = {
			type: 'tool_use',
			id: 'tool-todo',
			name: ClaudeToolNames.TodoWrite,
			input: {
				todos: [
					{ content: 'Fix bug', status: 'in_progress', activeForm: 'Fixing bug' },
					{ content: 'Write tests', status: 'pending', activeForm: 'Writing tests' },
				]
			},
		};
		state.unprocessedToolCalls.set('tool-todo', toolUse);

		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-todo', content: 'success' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.toolsService.invokeTool).toHaveBeenCalledWith(
			'manage_todo_list',
			expect.objectContaining({
				input: expect.objectContaining({
					operation: 'write',
					todoList: expect.arrayContaining([
						expect.objectContaining({ title: 'Fix bug', status: 'in-progress' }),
						expect.objectContaining({ title: 'Write tests', status: 'not-started' }),
					]),
				}),
			}),
			expect.anything(),
		);
	});

	it('sets permission mode to plan on EnterPlanMode tool completion', () => {
		state.unprocessedToolCalls.set('tool-1', { type: 'tool_use', id: 'tool-1', name: ClaudeToolNames.EnterPlanMode, input: {} });
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-1', content: 'success' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.sessionStateService.setPermissionModeForSession).toHaveBeenCalledWith(TEST_SESSION_ID, 'plan');
	});

	it('sets permission mode to acceptEdits on ExitPlanMode tool completion', () => {
		state.unprocessedToolCalls.set('tool-1', { type: 'tool_use', id: 'tool-1', name: ClaudeToolNames.ExitPlanMode, input: {} });
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-1', content: 'success' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.sessionStateService.setPermissionModeForSession).toHaveBeenCalledWith(TEST_SESSION_ID, 'acceptEdits');
	});

	it('handles EnterPlanMode followed by ExitPlanMode in same message', () => {
		state.unprocessedToolCalls.set('tool-a', { type: 'tool_use', id: 'tool-a', name: ClaudeToolNames.EnterPlanMode, input: {} });
		state.unprocessedToolCalls.set('tool-b', { type: 'tool_use', id: 'tool-b', name: ClaudeToolNames.ExitPlanMode, input: {} });

		handleUserMessage(
			makeUserMessage([
				{ type: 'tool_result', tool_use_id: 'tool-a', content: 'success' },
				{ type: 'tool_result', tool_use_id: 'tool-b', content: 'success' },
			]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.sessionStateService.setPermissionModeForSession).toHaveBeenCalledTimes(2);
		expect(services.sessionStateService.setPermissionModeForSession).toHaveBeenNthCalledWith(1, TEST_SESSION_ID, 'plan');
		expect(services.sessionStateService.setPermissionModeForSession).toHaveBeenNthCalledWith(2, TEST_SESSION_ID, 'acceptEdits');
	});

	it('does not set permission mode for non-plan-mode tools', () => {
		state.unprocessedToolCalls.set('tool-x', { type: 'tool_use', id: 'tool-x', name: ClaudeToolNames.Read, input: { file_path: '/test.ts' } });
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-x', content: 'success' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.sessionStateService.setPermissionModeForSession).not.toHaveBeenCalled();
	});

	it('calls logToolCall on IRequestLogger for completed tools', () => {
		state.unprocessedToolCalls.set('tool-1', { type: 'tool_use', id: 'tool-1', name: ClaudeToolNames.Read, input: { file_path: '/test.ts' } });
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents here' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.requestLogger.logToolCall).toHaveBeenCalledWith(
			'tool-1',
			ClaudeToolNames.Read,
			{ file_path: '/test.ts' },
			{ content: [expect.objectContaining({ value: 'file contents here' })] },
		);
	});

	it('uses captureInvocation when a capturing token is set', () => {
		const mockToken = { label: 'test' };
		services.sessionStateService.getCapturingTokenForSession.mockReturnValue(mockToken);

		state.unprocessedToolCalls.set('tool-1', { type: 'tool_use', id: 'tool-1', name: ClaudeToolNames.Read, input: { file_path: '/test.ts' } });
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents here' }]),
			accessor, TEST_SESSION_ID, request, state,
		);

		expect(services.requestLogger.captureInvocation).toHaveBeenCalledWith(mockToken, expect.any(Function));
	});
});

// #endregion

// #region handleCompactBoundary

describe('handleCompactBoundary', () => {
	it('streams compact notification markdown', () => {
		const request = createRequestContext();
		handleCompactBoundary(makeCompactBoundary(), request);
		expect(request.stream.markdown).toHaveBeenCalledWith('*Conversation compacted*');
	});
});

// #endregion

// #region handleHookStarted / handleHookResponse

describe('handleHookStarted', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let state: MessageHandlerState;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		state = createState();
	});

	it('creates an OTel span and stores it by hook_id', () => {
		const startSpanSpy = vi.spyOn(services.otelService, 'startSpan');
		handleHookStarted(makeHookStarted('hook-42', 'lint-check', 'PreToolUse'), accessor, TEST_SESSION_ID, state);

		expect(startSpanSpy).toHaveBeenCalledWith(
			'user_hook PreToolUse:lint-check',
			expect.objectContaining({ attributes: expect.any(Object) }),
		);
		expect(state.otelHookSpans.has('hook-42')).toBe(true);
	});
});

describe('handleHookResponse', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let request: MessageHandlerRequestContext;
	let state: MessageHandlerState;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		request = createRequestContext();
		state = createState();
	});

	it('ends the OTel span with OK on success', () => {
		const mockSpan = createMockSpan();
		state.otelHookSpans.set('hook-1', mockSpan);

		handleHookResponse(makeHookResponse('hook-1', 'success'), accessor, request, state);

		expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.anything()); // SpanStatusCode.OK
		expect(mockSpan.end).toHaveBeenCalled();
		expect(state.otelHookSpans.has('hook-1')).toBe(false);
	});

	it('ends the OTel span with ERROR on failure and surfaces error via hookProgress', () => {
		const mockSpan = createMockSpan();
		state.otelHookSpans.set('hook-1', mockSpan);

		handleHookResponse(
			makeHookResponse('hook-1', 'error', { stderr: 'lint failed', hook_name: 'lint-check', hook_event: 'PreToolUse' }),
			accessor, request, state,
		);

		expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.anything(), 'lint failed');
		expect(mockSpan.end).toHaveBeenCalled();
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PreToolUse', expect.stringContaining('lint failed'));
		expect(request.stream.markdown).not.toHaveBeenCalled();
	});

	it('does not surface anything to user on success with no stdout', () => {
		const mockSpan = createMockSpan();
		state.otelHookSpans.set('hook-1', mockSpan);

		handleHookResponse(makeHookResponse('hook-1', 'success'), accessor, request, state);

		expect(request.stream.hookProgress).not.toHaveBeenCalled();
		expect(request.stream.markdown).not.toHaveBeenCalled();
	});

	it('handles cancelled outcome — log only, no hookProgress', () => {
		const mockSpan = createMockSpan();
		state.otelHookSpans.set('hook-1', mockSpan);

		handleHookResponse(makeHookResponse('hook-1', 'cancelled'), accessor, request, state);

		expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.anything(), 'cancelled');
		expect(mockSpan.end).toHaveBeenCalled();
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	it('handles response without a matching started span gracefully', () => {
		// No span in otelHookSpans — should not throw
		handleHookResponse(
			makeHookResponse('nonexistent', 'error', { stderr: 'some error', hook_name: 'my-hook', hook_event: 'PreToolUse' }),
			accessor, request, state,
		);
		// Still surfaces the error via hookProgress
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PreToolUse', expect.stringContaining('some error'));
	});

	// #region Exit code handling

	it('exit code 2 — blocking error via hookProgress with stderr', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'error', { exit_code: 2, stderr: 'blocked!', hook_event: 'Stop' }),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('Stop', expect.stringContaining('blocked!'));
	});

	it('exit code 2 — ignores JSON in stdout', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'error', {
				exit_code: 2,
				stderr: 'real error',
				stdout: '{"decision": "block", "reason": "should be ignored"}',
				hook_event: 'PostToolUse',
			}),
			accessor, request, state,
		);
		// Should use stderr, not JSON
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PostToolUse', expect.stringContaining('real error'));
	});

	it('other non-zero exit codes — non-blocking warning', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'error', { exit_code: 1, stderr: 'warning text', hook_event: 'PreToolUse' }),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PreToolUse', undefined, 'warning text');
	});

	it('other non-zero exit codes without stderr — no hookProgress', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'error', { exit_code: 1, hook_event: 'PreToolUse' }),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	// #endregion

	// #region JSON output parsing (exit code 0)

	it('exit code 0 — JSON with continue:false calls hookProgress with stopReason', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: JSON.stringify({ continue: false, stopReason: 'Build failed' }),
				hook_event: 'UserPromptSubmit',
			}),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('UserPromptSubmit', expect.stringContaining('Build failed'));
	});

	it('exit code 0 — JSON with continue:false and no stopReason uses empty string', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: JSON.stringify({ continue: false }),
				hook_event: 'Stop',
			}),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('Stop', expect.any(String));
	});

	it('exit code 0 — JSON with decision:block calls hookProgress with reason', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: JSON.stringify({ decision: 'block', reason: 'Tests must pass' }),
				hook_event: 'PostToolUse',
			}),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PostToolUse', expect.stringContaining('Tests must pass'));
	});

	it('exit code 0 — JSON with systemMessage shows warning via hookProgress', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: JSON.stringify({ systemMessage: 'Watch out for side effects' }),
				hook_event: 'PreToolUse',
			}),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PreToolUse', undefined, 'Watch out for side effects');
	});

	it('exit code 0 — non-JSON stdout logs warning, no hookProgress', () => {
		const warnSpy = vi.spyOn(services.logService, 'warn');
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: 'not valid json {',
				hook_event: 'PreToolUse',
			}),
			accessor, request, state,
		);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-JSON output'));
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	it('exit code 0 — empty stdout means success, no hookProgress', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', { exit_code: 0, stdout: '' }),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	it('exit code 0 — JSON with continue:true and no systemMessage is silent', () => {
		handleHookResponse(
			makeHookResponse('hook-1', 'success', {
				exit_code: 0,
				stdout: JSON.stringify({ continue: true }),
				hook_event: 'PreToolUse',
			}),
			accessor, request, state,
		);
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	// #endregion
});

// #endregion

// #region handleHookProgress

describe('handleHookProgress', () => {
	let services: TestServices;
	let accessor: ServicesAccessor;
	let request: MessageHandlerRequestContext;

	beforeEach(() => {
		services = createTestServices();
		accessor = createAccessor(services);
		request = createRequestContext();
	});

	it('shows stdout via hookProgress as system message', () => {
		handleHookProgress(
			makeHookProgress('hook-1', { stdout: 'Running lint...', hook_event: 'PreToolUse' }),
			accessor, request,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PreToolUse', undefined, 'Running lint...');
	});

	it('falls back to stderr when stdout is empty', () => {
		handleHookProgress(
			makeHookProgress('hook-1', { stderr: 'warning output', hook_event: 'PostToolUse' }),
			accessor, request,
		);
		expect(request.stream.hookProgress).toHaveBeenCalledWith('PostToolUse', undefined, 'warning output');
	});

	it('does not call hookProgress when both stdout and stderr are empty', () => {
		handleHookProgress(
			makeHookProgress('hook-1'),
			accessor, request,
		);
		expect(request.stream.hookProgress).not.toHaveBeenCalled();
	});

	it('trace-logs progress output', () => {
		const traceSpy = vi.spyOn(services.logService, 'trace');
		handleHookProgress(
			makeHookProgress('hook-1', { stdout: 'progress text', hook_name: 'my-hook', hook_event: 'PreToolUse' }),
			accessor, request,
		);
		expect(traceSpy).toHaveBeenCalledWith(expect.stringContaining('Hook progress'));
		expect(traceSpy).toHaveBeenCalledWith(expect.stringContaining('progress text'));
	});
});

// #endregion

// #region parseHookJsonOutput

describe('parseHookJsonOutput', () => {
	it('parses valid JSON with all fields', () => {
		const result = parseHookJsonOutput(JSON.stringify({
			continue: false,
			stopReason: 'Build failed',
			systemMessage: 'Warning',
			decision: 'block',
			reason: 'Not allowed',
		}));
		expect(result).toEqual({
			continue: false,
			stopReason: 'Build failed',
			systemMessage: 'Warning',
			decision: 'block',
			reason: 'Not allowed',
		});
	});

	it('parses JSON with only some fields', () => {
		const result = parseHookJsonOutput(JSON.stringify({ continue: false }));
		expect(result).toEqual({ continue: false });
	});

	it('returns undefined for non-JSON string', () => {
		expect(parseHookJsonOutput('not json')).toBeUndefined();
	});

	it('returns undefined for JSON null', () => {
		expect(parseHookJsonOutput('null')).toBeUndefined();
	});

	it('returns undefined for JSON array', () => {
		expect(parseHookJsonOutput('[]')).toBeUndefined();
	});

	it('returns undefined for JSON primitive', () => {
		expect(parseHookJsonOutput('"hello"')).toBeUndefined();
	});

	it('ignores fields with wrong types via fallback validation', () => {
		const result = parseHookJsonOutput(JSON.stringify({
			continue: 'not-a-boolean',
			stopReason: 42,
			systemMessage: 'valid string',
		}));
		expect(result).toEqual({ systemMessage: 'valid string' });
	});

	it('returns undefined when all fields have wrong types', () => {
		const result = parseHookJsonOutput(JSON.stringify({
			continue: 'true',
			decision: 'allow',
		}));
		expect(result).toBeUndefined();
	});

	it('ignores unknown fields', () => {
		const result = parseHookJsonOutput(JSON.stringify({
			continue: true,
			unknownField: 'whatever',
		}));
		expect(result).toEqual({ continue: true });
	});

	it('rejects decision values other than block', () => {
		const result = parseHookJsonOutput(JSON.stringify({
			decision: 'allow',
			systemMessage: 'hello',
		}));
		// decision: 'allow' fails vLiteral('block'), but systemMessage succeeds
		expect(result).toEqual({ systemMessage: 'hello' });
	});
});

// #endregion

// #region handleResultMessage

describe('handleResultMessage', () => {
	it('returns requestComplete for success', () => {
		const result = handleResultMessage(makeSuccessResult(), createRequestContext());
		expect(result).toEqual({ requestComplete: true });
	});

	it('shows progress for error_max_turns', () => {
		const request = createRequestContext();
		const result = handleResultMessage(makeErrorResult('error_max_turns', 25), request);
		expect(result).toEqual({ requestComplete: true });
		expect(request.stream.progress).toHaveBeenCalled();
	});

	it('throws KnownClaudeError for error_during_execution', () => {
		expect(
			() => handleResultMessage(makeErrorResult('error_during_execution'), createRequestContext()),
		).toThrow(KnownClaudeError);
	});
});

// #endregion

// #region ALL_KNOWN_MESSAGE_KEYS coverage

describe('ALL_KNOWN_MESSAGE_KEYS', () => {
	it('contains entries for all non-system SDKMessage type values', () => {
		const expectedNonSystemTypes = [
			'assistant', 'user', 'result', 'stream_event',
			'tool_progress', 'tool_use_summary', 'auth_status',
			'rate_limit_event', 'prompt_suggestion',
		];
		for (const key of expectedNonSystemTypes) {
			expect(ALL_KNOWN_MESSAGE_KEYS.has(key)).toBe(true);
		}
	});

	it('contains entries for all system subtype values', () => {
		const expectedSystemSubtypes = [
			'init', 'compact_boundary', 'status', 'api_retry', 'local_command_output',
			'hook_started', 'hook_progress', 'hook_response',
			'task_notification', 'task_started', 'task_progress',
			'files_persisted', 'elicitation_complete',
		];
		for (const subtype of expectedSystemSubtypes) {
			expect(ALL_KNOWN_MESSAGE_KEYS.has(`system:${subtype}`)).toBe(true);
		}
	});
});

// #endregion
