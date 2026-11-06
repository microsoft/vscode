/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GetSessionMessagesOptions, SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../files/common/files.js';
import { InstantiationService } from '../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { buildNonPtyShellTerminalUri } from '../../../common/nonPtyShellTerminalUri.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { buildChatUri, ChatOriginKind, ResponsePartKind, ToolCallStatus, ToolResultContentType } from '../../../common/state/sessionState.js';
import { encodeProviderData } from '../../../node/agentChatBackings.js';
import type { IAgentHostSavedChatReadContext } from '../../../node/agentHostSavedChatService.js';
import { IClaudeAgentSdkService } from '../../../node/claude/claudeAgentSdkService.js';
import { ClaudeSavedChatReader } from '../../../node/claude/claudeSavedChatReader.js';
import { SessionDatabase } from '../../../node/sessionDatabase.js';

const session = URI.parse('ahp-session:/host-session');
const peer = URI.parse(buildChatUri(session, 'peer'));

function message(type: SessionMessage['type'], uuid: string, content: unknown): SessionMessage {
	return { type, uuid, session_id: 'sdk-peer', parent_tool_use_id: null, parent_agent_id: null, message: { role: type, content } };
}

function conversation(text = 'Saved response'): SessionMessage[] {
	return [message('user', 'user-1', 'Saved prompt'), message('assistant', 'assistant-1', [{ type: 'text', text }])];
}

function context(overrides: Partial<IAgentHostSavedChatReadContext> = {}): IAgentHostSavedChatReadContext {
	return {
		session,
		chat: peer,
		storageResource: peer,
		providerData: encodeProviderData({ sdkSessionId: 'sdk-peer' }),
		origin: { kind: ChatOriginKind.User },
		workingDirectories: [URI.file('/workspace')],
		...overrides,
	};
}

class SavedClaudeSdk extends mock<IClaudeAgentSdkService>() {
	available = true;
	info: SDKSessionInfo | undefined = { sessionId: 'sdk-peer', summary: 'Saved prompt', firstPrompt: 'Saved prompt', lastModified: 1 };
	messages: readonly SessionMessage[] = conversation();
	childMessages: readonly SessionMessage[] = conversation('Child response');
	readonly calls: (readonly unknown[])[] = [];
	readonly messagesStarted = new DeferredPromise<void>();
	pendingMessages: DeferredPromise<readonly SessionMessage[]> | undefined;
	readError: Error | undefined;

	override async canLoadWithoutDownload(): Promise<boolean> {
		this.calls.push(['available']);
		return this.available;
	}

	override async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		this.calls.push(['info', sessionId]);
		return this.info;
	}

	override async getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]> {
		this.calls.push(['messages', sessionId, options]);
		this.messagesStarted.complete();
		if (this.readError) {
			throw this.readError;
		}
		return this.pendingMessages ? this.pendingMessages.p : this.messages;
	}

	override async getSubagentMessages(sessionId: string, agentId: string): Promise<readonly SessionMessage[]> {
		this.calls.push(['child', sessionId, agentId]);
		return this.childMessages;
	}
}

suite('ClaudeSavedChatReader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createReader(sdk = new SavedClaudeSdk(), sessionData = new class extends mock<ISessionDataService>() { }) {
		const services = new ServiceCollection(
			[IClaudeAgentSdkService, sdk],
			[IFileService, new class extends mock<IFileService>() { }],
			[ISessionDataService, sessionData],
			[ILogService, disposables.add(new NullLogService())],
		);
		return { reader: disposables.add(new InstantiationService(services)).createInstance(ClaudeSavedChatReader), sdk };
	}

	test('reads the exact saved peer without an executable provider', async () => {
		const { reader, sdk } = createReader();
		const turns = await reader.read(context(), CancellationToken.None);
		assert.deepStrictEqual({
			turns: turns.map(turn => ({ id: turn.id, prompt: turn.message.text, text: turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content) })),
			calls: sdk.calls,
		}, {
			turns: [{ id: 'user-1', prompt: 'Saved prompt', text: ['Saved response'] }],
			calls: [['available'], ['messages', 'sdk-peer', { includeSystemMessages: true }]],
		});
	});

	test('does not download an unavailable SDK', async () => {
		const { reader, sdk } = createReader();
		sdk.available = false;
		await assert.rejects(reader.read(context(), CancellationToken.None), /not available/i);
		assert.deepStrictEqual(sdk.calls, [['available']]);
	});

	test('rejects absent or corrupt backing instead of guessing the host or peer ID', async () => {
		const { reader, sdk } = createReader();
		for (const providerData of [undefined, '', '{', '{"sdkSessionId":1}']) {
			await assert.rejects(reader.read(context({ providerData }), CancellationToken.None), /backing/i);
		}
		await assert.rejects(reader.read(context({ session: URI.parse('claude:/legacy'), providerData: undefined }), CancellationToken.None), /backing/i);
		assert.deepStrictEqual(sdk.calls, []);
	});

	test('reads a host-supplied legacy default from its provider-native identity', async () => {
		const { reader, sdk } = createReader();
		const legacy = URI.parse('claude:/sdk-peer');
		const turns = await reader.read(context({ session: legacy, storageResource: legacy, chat: URI.parse(buildChatUri(legacy, 'main')), providerData: undefined }), CancellationToken.None);
		assert.deepStrictEqual({ prompts: turns.map(turn => turn.message.text), messageCall: sdk.calls[1] }, { prompts: ['Saved prompt'], messageCall: ['messages', 'sdk-peer', { includeSystemMessages: true }] });
	});

	test('rejects missing history, empty history with a known prompt, and malformed messages', async () => {
		const { reader, sdk } = createReader();
		sdk.info = undefined;
		sdk.messages = [];
		await assert.rejects(reader.read(context(), CancellationToken.None), /transcript/i);
		sdk.info = { sessionId: 'sdk-peer', summary: 'Saved prompt', firstPrompt: 'Saved prompt', lastModified: 1 };
		await assert.rejects(reader.read(context(), CancellationToken.None), /transcript/i);
		sdk.messages = [message('user', 'broken', { malformed: true })];
		await assert.rejects(reader.read(context(), CancellationToken.None), /transcript/i);
	});

	test('allows a saved empty conversation with valid metadata', async () => {
		const { reader, sdk } = createReader();
		sdk.info = { sessionId: 'sdk-peer', summary: 'Empty conversation', customTitle: 'Empty conversation', lastModified: 1 };
		sdk.messages = [];
		assert.deepStrictEqual(await reader.read(context(), CancellationToken.None), []);
		assert.deepStrictEqual(sdk.calls.slice(1), [['messages', 'sdk-peer', { includeSystemMessages: true }], ['info', 'sdk-peer']]);
	});

	test('reads existing messages when the SDK cannot extract a session summary', async () => {
		const { reader, sdk } = createReader();
		sdk.info = undefined;
		const turns = await reader.read(context(), CancellationToken.None);
		assert.deepStrictEqual(turns.map(turn => turn.message.text), ['Saved prompt']);
	});

	test('rejects mismatched SDK identity and propagates native file errors', async () => {
		const { reader, sdk } = createReader();
		sdk.info = { sessionId: 'another-chat', summary: 'Other history', lastModified: 1 };
		sdk.messages = [];
		await assert.rejects(reader.read(context(), CancellationToken.None), /transcript/i);
		assert.deepStrictEqual(sdk.calls, [['available'], ['messages', 'sdk-peer', { includeSystemMessages: true }], ['info', 'sdk-peer']]);
		sdk.info = { sessionId: 'sdk-peer', summary: 'Saved prompt', firstPrompt: 'Saved prompt', lastModified: 1 };
		sdk.readError = new Error('Saved transcript file could not be read');
		await assert.rejects(reader.read(context(), CancellationToken.None), error => error === sdk.readError);
	});

	test('checks cancellation before and after the native file read', async () => {
		const { reader, sdk } = createReader();
		await assert.rejects(reader.read(context(), CancellationToken.Cancelled), CancellationError);
		assert.deepStrictEqual(sdk.calls, []);
		const cancellation = disposables.add(new CancellationTokenSource());
		sdk.pendingMessages = new DeferredPromise<readonly SessionMessage[]>();
		const pending = reader.read(context(), cancellation.token);
		await sdk.messagesStarted.p;
		cancellation.cancel();
		await sdk.pendingMessages.complete(conversation());
		await assert.rejects(pending, CancellationError);
	});

	test('retains complete shell output from the exact peer database', async () => {
		const database = disposables.add(await SessionDatabase.open(':memory:'));
		await database.createTurn('user-1');
		await database.storeTerminalOutput('user-1', 'bash-1', VSBuffer.fromString('Full saved output').buffer);
		const opened: string[] = [];
		const sessionData = new class extends mock<ISessionDataService>() {
			override async tryOpenDatabase(resource: URI) {
				opened.push(resource.toString());
				return { object: database, dispose: () => { } };
			}
		};
		const { reader, sdk } = createReader(new SavedClaudeSdk(), sessionData);
		sdk.messages = [
			message('user', 'user-1', 'Run the command'),
			message('assistant', 'assistant-1', [{ type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'printf test' } }]),
			message('user', 'result-1', [{ type: 'tool_result', tool_use_id: 'bash-1', content: 'Saved preview' }]),
		];
		const turns = await reader.read(context(), CancellationToken.None);
		const call = turns[0]?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall)?.toolCall;
		assert.deepStrictEqual({ opened, status: call?.status, content: call?.status === ToolCallStatus.Completed ? call.content : undefined }, {
			opened: [peer.toString()],
			status: ToolCallStatus.Completed,
			content: [
				{ type: ToolResultContentType.Text, text: 'Saved preview' },
				{ type: ToolResultContentType.Terminal, resource: buildNonPtyShellTerminalUri(peer, session.toString(), peer, 'bash-1'), title: 'Run shell command', isPty: false, result: { exitCode: 0, truncated: true } },
			],
		});
	});

	test('resolves a child from its exact parent backing and spawning tool call', async () => {
		const { reader, sdk } = createReader();
		sdk.messages = [
			message('user', 'user-1', 'Delegate work'),
			message('assistant', 'assistant-1', [{ type: 'tool_use', id: 'spawn-1', name: 'Task', input: { prompt: 'Read this' } }]),
			message('user', 'result-1', [{ type: 'tool_result', tool_use_id: 'spawn-1', content: 'Done\nagentId: ab123' }]),
		];
		const child = context({ chat: URI.parse(buildChatUri(session, 'child')), providerData: undefined, origin: { kind: ChatOriginKind.Tool, chat: peer.toString(), toolCallId: 'spawn-1' }, parent: context() });
		const turns = await reader.read(child, CancellationToken.None);
		assert.deepStrictEqual({ text: turns.flatMap(turn => turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content)), childCalls: sdk.calls.filter(call => call[0] === 'child') }, {
			text: ['Child response'], childCalls: [['child', 'sdk-peer', 'ab123']],
		});
	});

	test('rejects a child with missing origin backing, unresolved identity, or missing messages', async () => {
		const { reader, sdk } = createReader();
		const child = context({ providerData: undefined, origin: { kind: ChatOriginKind.Tool, chat: peer.toString(), toolCallId: 'spawn-1' } });
		await assert.rejects(reader.read(child, CancellationToken.None), /subagent/i);
		await assert.rejects(reader.read({ ...child, parent: context({ chat: URI.parse(buildChatUri(session, 'another-parent')) }) }, CancellationToken.None), /subagent/i);
		assert.deepStrictEqual(sdk.calls, []);
		await assert.rejects(reader.read({ ...child, parent: context() }, CancellationToken.None), /subagent/i);
		sdk.messages = [
			message('user', 'user-1', 'Delegate work'),
			message('assistant', 'assistant-1', [{ type: 'tool_use', id: 'spawn-1', name: 'Task', input: {} }]),
			message('user', 'result-1', [{ type: 'tool_result', tool_use_id: 'spawn-1', content: 'Done\nagentId: ab123' }]),
		];
		sdk.childMessages = [];
		await assert.rejects(reader.read({ ...child, parent: context() }, CancellationToken.None), /subagent/i);
	});
});
