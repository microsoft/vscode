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
import { ChatResponseAnchorPart } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostChatAgents2', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createParticipant(dynamic = false) {
		let handle = -1;
		let unregisterCount = 0;
		const proxy = new class extends mock<MainThreadChatAgentsShape2>() {
			override $registerAgent(value: number): void { handle = value; }
			override $unregisterAgent(): void { unregisterCount++; }
			override $registerAgentCompletionsProvider(): void { }
		};
		const commands = new ExtHostCommands(SingleProxyRPCProtocol(new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
		}), new NullLogService(), undefined!);
		const agents = disposables.add(new ExtHostChatAgents2(SingleProxyRPCProtocol(proxy), new NullLogService(), commands, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!));
		const extension = { ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] as const };
		const participant = disposables.add(dynamic
			? agents.createDynamicChatAgent(extension, 'test.participant', { name: 'Test', publisherName: 'Test' }, async () => ({}))
			: agents.createChatAgent(extension, 'test.participant', async () => ({})));
		return { agents, participant, commands, handle, unregisterCount: () => unregisterCount };
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
		const { participant, unregisterCount } = createParticipant();
		participant.dispose();
		participant.dispose();
		assert.strictEqual(unregisterCount(), 1);
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
