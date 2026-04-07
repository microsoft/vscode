/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NonNullableUsage, SDKAssistantMessage, SDKCompactBoundaryMessage, SDKResultError, SDKResultSuccess, SDKStatusMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IOTelService, type ISpanHandle } from '../../../../../platform/otel/common/otelService';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import type { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { IToolsService } from '../../../../tools/common/toolsService';
import {
	ALL_KNOWN_MESSAGE_KEYS,
	DENY_TOOL_MESSAGE,
	dispatchMessage,
	handleAssistantMessage,
	handleCompactBoundary,
	handleResultMessage,
	handleUserMessage,
	KnownClaudeError,
	MessageHandlerRequestContext,
	MessageHandlerState,
	messageKey,
	SYNTHETIC_MODEL_ID,
} from '../claudeMessageDispatch';
import { ClaudeToolNames } from '../claudeTools';

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
}

function createTestServices(): TestServices {
	return {
		logService: new TestLogService(),
		otelService: { startSpan: () => noopSpan } as Pick<IOTelService, 'startSpan'> as IOTelService,
		toolsService: { invokeTool: vi.fn() } as Pick<IToolsService, 'invokeTool'> as IToolsService,
	};
}

const TEST_SESSION_ID = 'test-session-id';

function createAccessor(services: TestServices): ServicesAccessor {
	const serviceMap = new Map<unknown, unknown>([
		[ILogService, services.logService],
		[IOTelService, services.otelService],
		[IToolsService, services.toolsService],
	]);
	return { get: <T>(id: { toString(): string }): T => serviceMap.get(id) as T };
}

function createRequestContext(): MessageHandlerRequestContext {
	return {
		stream: {
			markdown: vi.fn(),
			push: vi.fn(),
			progress: vi.fn(),
		} as Pick<vscode.ChatResponseStream, 'markdown' | 'push' | 'progress'> as vscode.ChatResponseStream,
		toolInvocationToken: {} as vscode.ChatParticipantToolToken,
		token: { isCancellationRequested: false } as vscode.CancellationToken,
	};
}

function createState(): MessageHandlerState {
	return {
		unprocessedToolCalls: new Map(),
		otelToolSpans: new Map(),
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
			accessor, request, state,
		);

		expect(state.unprocessedToolCalls.has('tool-100')).toBe(false);
		expect(mockSpan.end).toHaveBeenCalled();
	});

	it('skips tool_result blocks with no matching tool call', () => {
		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'nonexistent-tool', content: 'result' }]),
			accessor, request, state,
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
		handleUserMessage(message, accessor, request, state);
	});

	it('marks denied tool results with isConfirmed=false', () => {
		const toolUse: Anthropic.Beta.Messages.BetaToolUseBlock = {
			type: 'tool_use', id: 'tool-denied', name: ClaudeToolNames.Bash, input: { command: 'rm -rf /' },
		};
		state.unprocessedToolCalls.set('tool-denied', toolUse);

		handleUserMessage(
			makeUserMessage([{ type: 'tool_result', tool_use_id: 'tool-denied', content: DENY_TOOL_MESSAGE }]),
			accessor, request, state,
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
			accessor, request, state,
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
			'init', 'compact_boundary', 'status', 'local_command_output',
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
