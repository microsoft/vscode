/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { InlineChatIntent } from '../../node/inlineChatIntent';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ILogService } from '../../../../platform/log/common/logService';
import { IToolsService } from '../../../tools/common/toolsService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IEditSurvivalTrackerService } from '../../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { ChatLocation, ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { ChatTelemetryBuilder } from '../../../prompt/node/chatParticipantTelemetry';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ChatRequestEditorData } from '../../../../vscodeTypes';
import { CopilotInteractiveEditorResponse } from '../../../inlineChat/node/promptCraftingTypes';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../util/vs/base/common/uri';


suite('InlineChatIntent', () => {

	test('Metadata is set on the latest turn', async () => {
		const mockInstantiationService = {
			createInstance: vi.fn((ctor, ...args) => {
				if (ctor.name === 'InlineChatProgressMessages') {
					return {
						getContextualMessage: vi.fn().mockResolvedValue('mock message')
					};
				}
				if (ctor.name === 'InlineChatToolCalling') {
					return {
						run: vi.fn().mockResolvedValue({
							lastResponse: { type: ChatFetchResponseType.Success, value: 'mocked success!' },
							telemetry: { telemetryMessageId: 'test-msg-id' },
							needsExitTool: false
						})
					};
				}
				return {};
			})
		} as unknown as IInstantiationService;

		const mockEndpointProvider = {
			getChatEndpoint: vi.fn().mockResolvedValue({ supportsToolCalls: true })
		} as unknown as IEndpointProvider;

		const mockAuthService = {
			getCopilotToken: vi.fn()
		} as unknown as IAuthenticationService;

		const mockLogService = {
			warn: vi.fn(),
			error: vi.fn(),
			trace: vi.fn()
		} as unknown as ILogService;

		const mockToolsService = {
			invokeTool: vi.fn()
		} as unknown as IToolsService;

		const mockIgnoreService = {
			isCopilotIgnored: vi.fn().mockResolvedValue(false)
		} as unknown as IIgnoreService;

		const mockEditTracker = {
			collectAIEdits: vi.fn()
		};
		const mockEditSurvivalTrackerService = {
			initialize: vi.fn().mockReturnValue(mockEditTracker)
		} as unknown as IEditSurvivalTrackerService;

		const mockOctoKitService = {
			getGitHubOutageStatus: vi.fn()
		} as unknown as IOctoKitService;

		const intent = new InlineChatIntent(
			mockInstantiationService,
			mockEndpointProvider,
			mockAuthService,
			mockLogService,
			mockToolsService,
			mockIgnoreService,
			mockEditSurvivalTrackerService,
			mockOctoKitService
		);

		const mockTurn = {
			setMetadata: vi.fn()
		};

		const conversation = new Conversation('someId', [mockTurn as unknown as Turn]);

		const document = createTextDocumentData(URI.parse('file:///test.ts'), 'test content', 'typescript').document;
		const request = {
			prompt: 'test prompt',
			location2: new ChatRequestEditorData({} as vscode.TextEditor, document, {} as vscode.Selection, {} as vscode.Range),
			toolInvocationToken: {} as vscode.ChatParticipantToolToken
		} as unknown as vscode.ChatRequest;

		const stream = {
			progress: vi.fn(),
			text: vi.fn()
		} as unknown as vscode.ChatResponseStream;

		const token = CancellationToken.None;

		const documentContext = { document: TextDocumentSnapshot.create(document) } as IDocumentContext;
		const chatTelemetry = {} as ChatTelemetryBuilder;

		await intent.handleRequest(conversation, request, stream, token, documentContext, 'agent', ChatLocation.Editor, chatTelemetry);

		expect(mockTurn.setMetadata).toHaveBeenCalledTimes(1);
		const metadata = mockTurn.setMetadata.mock.calls[0][0];
		expect(metadata).toBeInstanceOf(CopilotInteractiveEditorResponse);
		expect(metadata.messageId).toBe('test-msg-id');
		expect(metadata.promptQuery.query).toBe('test prompt');
		expect(metadata.promptQuery.document).toBe(documentContext.document);
	});

});
