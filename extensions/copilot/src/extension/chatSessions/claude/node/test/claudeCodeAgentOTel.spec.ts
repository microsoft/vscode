/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Options, PermissionMode, Query, SDKAssistantMessage, SDKResultMessage, SDKUserMessage as SDKUserMessageType } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { resolveOTelConfig } from '../../../../../platform/otel/common/index';
import { ICompletedSpanData, IOTelService } from '../../../../../platform/otel/common/otelService';
import { InMemoryOTelService } from '../../../../../platform/otel/node/inMemoryOTelService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { MockChatResponseStream } from '../../../../test/node/testHelpers';
import type { ClaudeFolderInfo } from '../../common/claudeFolderInfo';
import { ClaudeCodeSession } from '../claudeCodeAgent';
import { IClaudeCodeSdkService } from '../claudeCodeSdkService';
import { ClaudeLanguageModelServer } from '../claudeLanguageModelServer';
import { parseClaudeModelId } from '../claudeModelId';
import { IClaudeSessionStateService } from '../../common/claudeSessionStateService';

const TEST_MODEL_ID_STRING = 'claude-3-sonnet';
const TEST_MODEL_ID = parseClaudeModelId(TEST_MODEL_ID_STRING);
const TEST_PERMISSION_MODE: PermissionMode = 'acceptEdits';
const TEST_FOLDER_INFO: ClaudeFolderInfo = { cwd: '/test/project', additionalDirectories: [] };
const SERVER_CONFIG = { port: 8080, nonce: 'test-nonce' };

function createMockLangModelServer(): ClaudeLanguageModelServer {
	return {
		incrementUserInitiatedMessageCount: vi.fn()
	} as unknown as ClaudeLanguageModelServer;
}

function createMockChatRequest(): vscode.ChatRequest {
	return { tools: new Map() } as unknown as vscode.ChatRequest;
}

function commitTestState(
	sessionStateService: IClaudeSessionStateService,
	sessionId: string,
): void {
	sessionStateService.setModelIdForSession(sessionId, TEST_MODEL_ID);
	sessionStateService.setPermissionModeForSession(sessionId, TEST_PERMISSION_MODE);
	sessionStateService.setFolderInfoForSession(sessionId, TEST_FOLDER_INFO);
}

/**
 * Creates a mock SDK service that emits a configurable sequence of messages.
 */
function createToolCallSdkService(messageFactory: (sessionId: string) => AsyncGenerator<SDKAssistantMessage | SDKUserMessageType | SDKResultMessage, void, unknown>): IClaudeCodeSdkService {
	return {
		_serviceBrand: undefined,
		async query(options: { prompt: AsyncIterable<SDKUserMessageType>; options: Options }) {
			const prompt = options.prompt;
			const generator = (async function* () {
				for await (const msg of prompt) {
					const sessionId = msg.session_id ?? '';
					yield* messageFactory(sessionId);
				}
			})();
			return {
				[Symbol.asyncIterator]: () => generator,
				setModel: async () => { },
				setPermissionMode: async () => { },
				abort: () => { },
			} as unknown as Query;
		},
		async listSessions() { return []; },
		async getSessionInfo() { return undefined; },
		async getSessionMessages() { return []; },
		async renameSession() { },
		async forkSession() { return { sessionId: 'forked' }; },
		async listSubagents() { return []; },
		async getSubagentMessages() { return []; },
	};
}

function createOTelService() {
	const config = resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' });
	const otelService = new InMemoryOTelService(config);
	const spans: ICompletedSpanData[] = [];
	otelService.onDidCompleteSpan(span => spans.push(span));
	return { otelService, spans };
}

/** Helper to convert a string prompt to TextBlockParam array */
function toPromptBlocks(text: string): Anthropic.TextBlockParam[] {
	return [{ type: 'text', text }];
}

/** Creates a typed assistant message with tool_use content blocks */
function makeAssistantMessage(sessionId: string, content: Anthropic.Beta.Messages.BetaContentBlock[]): SDKAssistantMessage {
	return {
		type: 'assistant',
		session_id: sessionId,
		uuid: randomUUID(),
		parent_tool_use_id: null,
		message: {
			id: `msg-${randomUUID()}`,
			type: 'message',
			role: 'assistant',
			model: TEST_MODEL_ID_STRING,
			content,
			stop_reason: 'tool_use',
			stop_sequence: null,
			usage: { input_tokens: 0, output_tokens: 0 },
		},
	} as SDKAssistantMessage;
}

/** Creates a typed user message with tool_result content blocks */
function makeUserMessage(sessionId: string, content: Anthropic.Messages.ToolResultBlockParam[]): SDKUserMessageType {
	return {
		type: 'user',
		session_id: sessionId,
		parent_tool_use_id: null,
		message: {
			role: 'user',
			content,
		},
	} as SDKUserMessageType;
}

/** Creates a standard result message to end a turn */
function makeResultMessage(sessionId: string): SDKResultMessage {
	// SDKResultMessage requires deep NonNullableUsage fields that are irrelevant
	// to OTel tests. Use the repo-standard pattern of as unknown as SDKResultMessage.
	return {
		type: 'result',
		subtype: 'error_max_turns',
		uuid: randomUUID(),
		session_id: sessionId,
		duration_ms: 0,
		duration_api_ms: 0,
		is_error: false,
		num_turns: 0,
		stop_reason: null,
		total_cost_usd: 0,
		usage: { input_tokens: 0, output_tokens: 0 },
		modelUsage: {},
		permission_denials: [],
		errors: [],
	} as unknown as SDKResultMessage;
}

describe('Claude Session OTel Tool Spans', () => {
	const store = new DisposableStore();
	let spans: ICompletedSpanData[];

	beforeEach(() => {
		spans = [];
	});

	afterEach(() => {
		store.clear();
		vi.resetAllMocks();
	});

	it('emits an execute_tool span for a successful tool call', async () => {
		const sessionId = 'otel-test-1';
		const sdkService = createToolCallSdkService(sid => (async function* () {
			yield makeAssistantMessage(sid, [
				{ type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/foo.ts' } },
			]);

			yield makeUserMessage(sid, [
				{ type: 'tool_result', tool_use_id: 'tu-1', content: 'file contents here' },
			]);

			yield makeResultMessage(sid);
		})());

		const services = store.add(createExtensionUnitTestingServices());
		const { otelService, spans: localSpans } = createOTelService();
		spans = localSpans;
		services.define(IOTelService, otelService);
		services.define(IClaudeCodeSdkService, sdkService);
		const accessor = services.createTestingAccessor();
		const localInstantiationService = accessor.get(IInstantiationService);
		const localSessionStateService = accessor.get(IClaudeSessionStateService);

		commitTestState(localSessionStateService, sessionId);
		const session = store.add(localInstantiationService.createInstance(
			ClaudeCodeSession, SERVER_CONFIG, createMockLangModelServer(), sessionId, TEST_MODEL_ID, TEST_PERMISSION_MODE, true
		));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('read file'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		// Should have a user_message span + an execute_tool span
		const toolSpan = spans.find(s => s.name === 'execute_tool Read');
		expect(toolSpan).toBeDefined();
		expect(toolSpan!.attributes['gen_ai.operation.name']).toBe('execute_tool');
		expect(toolSpan!.attributes['gen_ai.tool.name']).toBe('Read');
		expect(toolSpan!.attributes['gen_ai.tool.call.id']).toBe('tu-1');
		expect(toolSpan!.attributes['copilot_chat.chat_session_id']).toBe(sessionId);
		expect(toolSpan!.status.code).toBe(1); // SpanStatusCode.OK
		expect(toolSpan!.attributes['gen_ai.tool.call.arguments']).toContain('file_path');
		expect(toolSpan!.attributes['gen_ai.tool.call.result']).toContain('file contents here');
	});

	it('emits an execute_tool span with ERROR status for a failed tool call', async () => {
		const sessionId = 'otel-test-2';
		const sdkService = createToolCallSdkService(sid => (async function* () {
			yield makeAssistantMessage(sid, [
				{ type: 'tool_use', id: 'tu-err', name: 'Write', input: { file_path: '/readonly.ts', content: 'x' } },
			]);

			yield makeUserMessage(sid, [
				{ type: 'tool_result', tool_use_id: 'tu-err', content: 'Permission denied', is_error: true },
			]);

			yield makeResultMessage(sid);
		})());

		const services = store.add(createExtensionUnitTestingServices());
		const { otelService, spans: localSpans } = createOTelService();
		spans = localSpans;
		services.define(IOTelService, otelService);
		services.define(IClaudeCodeSdkService, sdkService);
		const accessor = services.createTestingAccessor();
		const localInstantiationService = accessor.get(IInstantiationService);
		const localSessionStateService = accessor.get(IClaudeSessionStateService);

		commitTestState(localSessionStateService, sessionId);
		const session = store.add(localInstantiationService.createInstance(
			ClaudeCodeSession, SERVER_CONFIG, createMockLangModelServer(), sessionId, TEST_MODEL_ID, TEST_PERMISSION_MODE, true
		));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('write file'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		const toolSpan = spans.find(s => s.name === 'execute_tool Write');
		expect(toolSpan).toBeDefined();
		expect(toolSpan!.status.code).toBe(2); // SpanStatusCode.ERROR
		expect(toolSpan!.status.message).toContain('Permission denied');
		expect(toolSpan!.attributes['gen_ai.tool.call.result']).toContain('ERROR');
	});

	it('correctly correlates multiple concurrent tool calls', async () => {
		const sessionId = 'otel-test-3';
		const sdkService = createToolCallSdkService(sid => (async function* () {
			// Assistant emits two tool_use blocks in one message
			yield makeAssistantMessage(sid, [
				{ type: 'tool_use', id: 'tu-a', name: 'Read', input: { file_path: '/a.ts' } },
				{ type: 'tool_use', id: 'tu-b', name: 'Glob', input: { pattern: '*.ts' } },
			]);

			// Results come in reverse order
			yield makeUserMessage(sid, [
				{ type: 'tool_result', tool_use_id: 'tu-b', content: 'glob result' },
				{ type: 'tool_result', tool_use_id: 'tu-a', content: 'read result' },
			]);

			yield makeResultMessage(sid);
		})());

		const services = store.add(createExtensionUnitTestingServices());
		const { otelService, spans: localSpans } = createOTelService();
		spans = localSpans;
		services.define(IOTelService, otelService);
		services.define(IClaudeCodeSdkService, sdkService);
		const accessor = services.createTestingAccessor();
		const localInstantiationService = accessor.get(IInstantiationService);
		const localSessionStateService = accessor.get(IClaudeSessionStateService);

		commitTestState(localSessionStateService, sessionId);
		const session = store.add(localInstantiationService.createInstance(
			ClaudeCodeSession, SERVER_CONFIG, createMockLangModelServer(), sessionId, TEST_MODEL_ID, TEST_PERMISSION_MODE, true
		));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('read and glob'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		const readSpan = spans.find(s => s.name === 'execute_tool Read');
		const globSpan = spans.find(s => s.name === 'execute_tool Glob');
		expect(readSpan).toBeDefined();
		expect(globSpan).toBeDefined();
		expect(readSpan!.attributes['gen_ai.tool.call.result']).toContain('read result');
		expect(globSpan!.attributes['gen_ai.tool.call.result']).toContain('glob result');
		expect(readSpan!.status.code).toBe(1); // OK
		expect(globSpan!.status.code).toBe(1); // OK
	});

	it('emits user_message span for user prompts', async () => {
		const sessionId = 'otel-test-4';
		const sdkService = createToolCallSdkService(sid => (async function* () {
			yield makeAssistantMessage(sid, [
				{ type: 'text', text: 'Hello!', citations: [] },
			]);
			yield makeResultMessage(sid);
		})());

		const services = store.add(createExtensionUnitTestingServices());
		const { otelService, spans: localSpans } = createOTelService();
		spans = localSpans;
		services.define(IOTelService, otelService);
		services.define(IClaudeCodeSdkService, sdkService);
		const accessor = services.createTestingAccessor();
		const localInstantiationService = accessor.get(IInstantiationService);
		const localSessionStateService = accessor.get(IClaudeSessionStateService);

		commitTestState(localSessionStateService, sessionId);
		const session = store.add(localInstantiationService.createInstance(
			ClaudeCodeSession, SERVER_CONFIG, createMockLangModelServer(), sessionId, TEST_MODEL_ID, TEST_PERMISSION_MODE, true
		));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('hello'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		const userMsgSpan = spans.find(s => s.name === 'user_message');
		expect(userMsgSpan).toBeDefined();
		expect(userMsgSpan!.attributes['copilot_chat.chat_session_id']).toBe(sessionId);
	});

	it('records tool_input as TOOL_CALL_ARGUMENTS', async () => {
		const sessionId = 'otel-test-5';
		const sdkService = createToolCallSdkService(sid => (async function* () {
			yield makeAssistantMessage(sid, [
				{ type: 'tool_use', id: 'tu-args', name: 'Bash', input: { command: 'ls -la' } },
			]);

			yield makeUserMessage(sid, [
				{ type: 'tool_result', tool_use_id: 'tu-args', content: 'output' },
			]);

			yield makeResultMessage(sid);
		})());

		const services = store.add(createExtensionUnitTestingServices());
		const { otelService, spans: localSpans } = createOTelService();
		spans = localSpans;
		services.define(IOTelService, otelService);
		services.define(IClaudeCodeSdkService, sdkService);
		const accessor = services.createTestingAccessor();
		const localInstantiationService = accessor.get(IInstantiationService);
		const localSessionStateService = accessor.get(IClaudeSessionStateService);

		commitTestState(localSessionStateService, sessionId);
		const session = store.add(localInstantiationService.createInstance(
			ClaudeCodeSession, SERVER_CONFIG, createMockLangModelServer(), sessionId, TEST_MODEL_ID, TEST_PERMISSION_MODE, true
		));
		const stream = new MockChatResponseStream();

		await session.invoke(createMockChatRequest(), toPromptBlocks('run command'), {} as vscode.ChatParticipantToolToken, stream, CancellationToken.None);

		const toolSpan = spans.find(s => s.name === 'execute_tool Bash');
		expect(toolSpan).toBeDefined();
		expect(toolSpan!.attributes['gen_ai.tool.call.arguments']).toContain('ls -la');
	});
});
