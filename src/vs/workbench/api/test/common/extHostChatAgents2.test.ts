/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatAgentLocation } from '../../../contrib/chat/common/constants.js';
import { IChatAgentRequest } from '../../../contrib/chat/common/participants/chatAgents.js';
import { ILanguageModelChatInfoOptions } from '../../../contrib/chat/common/languageModels.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { IExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { ExtHostDocumentsAndEditors, IExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { ChatAgentResponseStream, ExtHostChatAgents2 } from '../../common/extHostChatAgents2.js';
import { ExtHostChatSessions } from '../../common/extHostChatSessions.js';
import { CommandsConverter, ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDiagnostics } from '../../common/extHostDiagnostics.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { ExtHostLanguageModels } from '../../common/extHostLanguageModels.js';
import { ExtHostLanguageModelTools } from '../../common/extHostLanguageModelTools.js';
import { IChatAgentProgressShape, IChatProgressDto, MainThreadLanguageModelToolsShape } from '../../common/extHost.protocol.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ChatResponseAnchorPart } from '../../common/extHostTypes.js';
import { AnyCallRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostChatAgents2', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

	suite('$notifyUserAttention', function () {
		let agents: ExtHostChatAgents2;
		let languageModels: ExtHostLanguageModels;
		let registeredHandle: number | undefined;

		setup(function () {
			registeredHandle = undefined;
			const rpcProtocol = AnyCallRPCProtocol<MainThreadLanguageModelToolsShape>({
				$getTools: () => Promise.resolve([]),
				$registerAgent: (handle: number) => { registeredHandle = handle; }
			} as unknown as MainThreadLanguageModelToolsShape);
			const logService = new NullLogService();

			const commands = new ExtHostCommands(rpcProtocol, logService, new class extends mock<IExtHostTelemetry>() { });
			const documentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, logService);
			const documents = disposables.add(new ExtHostDocuments(rpcProtocol, documentsAndEditors));
			languageModels = disposables.add(new ExtHostLanguageModels(rpcProtocol, logService, new class extends mock<IExtHostAuthentication>() { }));
			const diagnostics = new ExtHostDiagnostics(rpcProtocol, logService, new class extends mock<IExtHostFileSystemInfo>() { }, new class extends mock<IExtHostDocumentsAndEditors>() {
				override getDocument() { return undefined; }
			});
			const tools = new ExtHostLanguageModelTools(rpcProtocol, languageModels);
			const chatSessions = disposables.add(new ExtHostChatSessions(commands, languageModels, rpcProtocol, logService));

			agents = disposables.add(new ExtHostChatAgents2(rpcProtocol, logService, commands, documents, documentsAndEditors, languageModels, diagnostics, tools, chatSessions));
		});

		test('fires onDidRequestUserAttention on the in-flight request', async function () {
			// Register a fake model provider so `getLanguageModelByIdentifier` can resolve the
			// `userSelectedModelId` below without a real main-thread round trip: our test drives
			// `$provideLanguageModelChatInfo` directly, mirroring what the (stubbed) main thread
			// would normally trigger via `$selectChatModels`.
			const modelInfo: vscode.LanguageModelChatInformation = {
				id: 'test-model',
				name: 'Test Model',
				family: 'test-family',
				version: '1.0',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				capabilities: {}
			};
			disposables.add(languageModels.registerLanguageModelChatProvider(nullExtensionDescription, 'test-vendor', {
				provideLanguageModelChatInformation: () => [modelInfo],
				provideLanguageModelChatResponse: () => { throw new Error('not implemented'); },
				provideTokenCount: () => { throw new Error('not implemented'); }
			}));
			const options: ILanguageModelChatInfoOptions = { silent: true };
			const [{ identifier: modelIdentifier }] = await languageModels.$provideLanguageModelChatInfo('test-vendor', options, CancellationToken.None);

			const receivedAttentions: vscode.ChatRequestUserAttention[] = [];
			const extension = { ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] };
			const requestDto: IChatAgentRequest = {
				sessionResource: URI.parse('chat-session:/test'),
				requestId: 'requestId',
				agentId: 'agentId',
				message: '',
				variables: { variables: [] },
				location: ChatAgentLocation.Chat,
				userSelectedModelId: modelIdentifier
			};
			const requestHandler: vscode.ChatExtendedRequestHandler = (request) => {
				disposables.add(request.onDidRequestUserAttention!(attention => receivedAttentions.push(attention)));
				// Simulate the (later-wired) main thread calling `$notifyUserAttention` while the
				// request is still in flight, e.g. to surface a tool permission prompt.
				agents.$notifyUserAttention(requestDto.requestId, { notificationType: 'permission_prompt', message: 'm', title: 't' });
				return {};
			};
			agents.createChatAgent(extension, 'agentId', requestHandler);

			await agents.$invokeAgent(0, requestDto, { history: [] }, CancellationToken.None);

			assert.deepStrictEqual(receivedAttentions, [{ notificationType: 'permission_prompt', message: 'm', title: 't' }]);
		});

		test('threads request.notification through to vscode.ChatRequest', async function () {
			const modelInfo: vscode.LanguageModelChatInformation = {
				id: 'test-model',
				name: 'Test Model',
				family: 'test-family',
				version: '1.0',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				capabilities: {}
			};
			disposables.add(languageModels.registerLanguageModelChatProvider(nullExtensionDescription, 'test-vendor', {
				provideLanguageModelChatInformation: () => [modelInfo],
				provideLanguageModelChatResponse: () => { throw new Error('not implemented'); },
				provideTokenCount: () => { throw new Error('not implemented'); }
			}));
			const options: ILanguageModelChatInfoOptions = { silent: true };
			const [{ identifier: modelIdentifier }] = await languageModels.$provideLanguageModelChatInfo('test-vendor', options, CancellationToken.None);

			const extension = { ...nullExtensionDescription, enabledApiProposals: ['chatParticipantAdditions'] };
			const requestDto: IChatAgentRequest = {
				sessionResource: URI.parse('chat-session:/test'),
				requestId: 'requestId',
				agentId: 'agentId',
				message: '',
				variables: { variables: [] },
				location: ChatAgentLocation.Chat,
				userSelectedModelId: modelIdentifier,
				notification: { notificationType: 'shell_completed', message: 'm', title: 't' }
			};
			let receivedNotification: vscode.ChatRequestNotification | undefined;
			const requestHandler: vscode.ChatExtendedRequestHandler = (request) => {
				receivedNotification = request.notification;
				return {};
			};

			// `createChatAgent` assigns handles from a process-wide static pool. `setup` wires
			// `$registerAgent` (see above) to capture the handle it was just given.
			agents.createChatAgent(extension, 'agentId', requestHandler);
			assert.ok(registeredHandle !== undefined, 'expected $registerAgent to be called');

			await agents.$invokeAgent(registeredHandle!, requestDto, { history: [] }, CancellationToken.None);

			assert.deepStrictEqual(receivedNotification, { notificationType: 'shell_completed', message: 'm', title: 't' });
		});
	});
});
