/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/participants/chatAgents.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ChatAgentResponseStream, ExtHostChatAgents2 } from '../../common/extHostChatAgents2.js';
import { CommandsConverter, ExtHostCommands } from '../../common/extHostCommands.js';
import { IChatAgentProgressShape, IChatProgressDto, MainThreadChatAgentsShape2, MainThreadCommandsShape } from '../../common/extHost.protocol.js';
import { ChatResponseAnchorPart, ChatResponseTextEditPart, Range, TextEdit } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostChatAgents2', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createParticipant(dynamic = false) {
		let handle = -1;
		let unregisterCount = 0;
		const unregisteredCompletions: { handle: number; id: string }[] = [];
		const proxy = new class extends mock<MainThreadChatAgentsShape2>() {
			override $registerAgent(value: number): void { handle = value; }
			override $unregisterAgent(): void { unregisterCount++; }
			override $registerAgentCompletionsProvider(): void { }
			override $unregisterAgentCompletionsProvider(handle: number, id: string): void { unregisteredCompletions.push({ handle, id }); }
		};
		const commands = new ExtHostCommands(SingleProxyRPCProtocol(new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
		}), new NullLogService(), undefined!);
		const agents = disposables.add(new ExtHostChatAgents2(SingleProxyRPCProtocol(proxy), new NullLogService(), commands, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!));
		const extension = { ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] as const };
		const participant = disposables.add(dynamic
			? agents.createDynamicChatAgent(extension, 'test.participant', { name: 'Test', publisherName: 'Test' }, async () => ({}))
			: agents.createChatAgent(extension, 'test.participant', async () => ({})));
		return { agents, participant, commands, handle, unregisteredCompletions, unregisterCount: () => unregisterCount };
	}

	const completion: vscode.ChatCompletionItem = {
		id: 'item', label: 'Item', values: [{ level: 1, value: 'value' }],
		command: { command: 'test.command', title: 'Test', arguments: [{ resource: 'test' }] }
	};

	for (const dynamic of [false, true]) {
		test(`does not invoke disposed ${dynamic ? 'dynamic' : 'static'} participants`, async () => {
			const { agents, participant, handle } = createParticipant(dynamic);
			let calls = 0;
			participant.participantVariableProvider = { triggerCharacters: ['#'], provider: { provideCompletionItems() { calls++; return []; } } };
			await agents.$invokeCompletionProvider(handle, '', CancellationToken.None);
			participant.dispose();
			await agents.$invokeCompletionProvider(handle, '', CancellationToken.None);
			assert.strictEqual(calls, 1);
		});
		test(`unregisters variable providers of disposed ${dynamic ? 'dynamic' : 'static'} participants only once`, () => {
			const { participant, handle, unregisteredCompletions } = createParticipant(dynamic);
			participant.participantVariableProvider = { triggerCharacters: ['#'], provider: { provideCompletionItems: () => [] } };
			participant.dispose();
			participant.dispose();
			assert.deepStrictEqual({
				provider: participant.participantVariableProvider,
				unregisteredCompletions
			}, {
				provider: undefined,
				unregisteredCompletions: [{ handle, id: 'test.participant' }]
			});
		});

	}

	test('releases completion commands when the participant is disposed', async () => {
		const { agents, participant, commands, handle } = createParticipant();
		participant.participantVariableProvider = { triggerCharacters: ['#'], provider: { provideCompletionItems: () => [completion] } };
		const [item] = await agents.$invokeCompletionProvider(handle, '', CancellationToken.None);
		assert.strictEqual(commands.converter.fromInternal(item.command!), completion.command);
		participant.dispose();
		assert.strictEqual(commands.converter.fromInternal(item.command!), undefined);
	});

	test('ignores completions that finish after participant disposal', async () => {
		const { agents, participant, handle } = createParticipant();
		const result = new DeferredPromise<vscode.ChatCompletionItem[]>();
		participant.participantVariableProvider = { triggerCharacters: ['#'], provider: { provideCompletionItems: () => result.p } };
		const pending = agents.$invokeCompletionProvider(handle, '', CancellationToken.None);
		participant.dispose();
		result.complete([completion]);
		assert.deepStrictEqual(await pending, []);
	});

	test('unregisters a disposed participant only once', () => {
		const { participant, unregisterCount, unregisteredCompletions } = createParticipant();
		participant.dispose();
		participant.dispose();
		assert.deepStrictEqual({ unregisterCount: unregisterCount(), unregisteredCompletions }, { unregisterCount: 1, unregisteredCompletions: [] });
	});

	test('forwards the Auto tier on edit parts and omits it when unset', async () => {
		const progress: { requestId: string; chunks: IChatProgressDto[] }[] = [];
		const stream = new ChatAgentResponseStream(
			{ ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] },
			{
				sessionResource: URI.parse('chat-session:/test'),
				requestId: 'auto-request',
				agentId: 'agent',
				message: '',
				variables: { variables: [] },
				location: ChatAgentLocation.Chat,
			},
			{
				async $handleProgressChunk(requestId, chunks) {
					progress.push({ requestId, chunks: chunks.map(chunk => Array.isArray(chunk) ? chunk[0] : chunk) });
				},
				$handleAnchorResolve() { },
			},
			undefined as unknown as CommandsConverter,
			disposables.add(new DisposableStore()),
			new Map(),
			CancellationToken.None,
		);
		const uri = URI.file('/test/file.ts');
		const edit = new ChatResponseTextEditPart(uri, [new TextEdit(new Range(0, 0, 0, 0), 'text')]);
		edit.autoTier = 'efficiency';
		stream.apiObject.push(edit);
		stream.apiObject.push(new ChatResponseTextEditPart(uri, true));
		stream.close();
		await Promise.resolve();

		assert.deepStrictEqual(progress, [{
			requestId: 'auto-request',
			chunks: [
				{ kind: 'textEdit', uri, edits: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'text', eol: undefined }], done: undefined, autoTier: 'efficiency' },
				{ kind: 'textEdit', uri, edits: [], done: true },
			],
		}]);
	});

	test('reports anchor before resolving it', async function () {
		const sessionDisposables = disposables.add(new DisposableStore());
		const events: string[] = [];
		const progressChunks: IChatProgressDto[] = [];
		let resolvedHandle: string | undefined;
		const proxy: IChatAgentProgressShape = {
			async $handleProgressChunk(_requestId, chunks) {
				events.push('progress');
				for (const chunk of chunks) {
					progressChunks.push(Array.isArray(chunk) ? chunk[0] : chunk);
				}
			},
			$handleAnchorResolve(_requestId, handle) {
				events.push('resolve');
				resolvedHandle = handle;
			}
		};
		const request: IChatAgentRequest = {
			sessionResource: URI.parse('chat-session:/test'),
			requestId: 'requestId',
			agentId: 'agentId',
			message: '',
			variables: { variables: [] },
			location: ChatAgentLocation.Chat
		};
		const stream = new ChatAgentResponseStream(
			{ ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] },
			request,
			proxy,
			undefined as unknown as CommandsConverter,
			sessionDisposables,
			new Map<string, Map<string, DeferredPromise<Record<string, unknown> | undefined>>>(),
			CancellationToken.None
		);
		const part = new ChatResponseAnchorPart(URI.file('/test/file.ts'), 'TestSymbol');
		part.resolve = () => Promise.resolve();

		stream.apiObject.push(part);

		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual(events, ['progress', 'resolve']);
		assert.strictEqual(progressChunks.length, 1);
		const progressChunk = progressChunks[0];
		assert.strictEqual(progressChunk.kind, 'inlineReference');
		assert.ok(progressChunk.resolveId);
		assert.strictEqual(resolvedHandle, progressChunk.resolveId);
	});
});
