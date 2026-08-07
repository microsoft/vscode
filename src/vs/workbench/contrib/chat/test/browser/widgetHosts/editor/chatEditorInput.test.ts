/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { isResourceEditorInput } from '../../../../../../common/editor.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { clearChatEditor } from '../../../../browser/actions/chatClear.js';
import { ChatEditorInput } from '../../../../browser/widgetHosts/editor/chatEditorInput.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IChatService, IChatSessionStartOptions } from '../../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../common/constants.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';

suite('ChatEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('explicit local session type starts local session for generic editor URI', async () => {
		const sessionResource = LocalChatSessionUri.forSession('explicit-local');
		const model = {
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		let startCall: { location: ChatAgentLocation; options: IChatSessionStartOptions | undefined } | undefined;
		let didTryDefaultLoad = false;
		const chatService = {
			startNewLocalSession(location: ChatAgentLocation, options?: IChatSessionStartOptions) {
				startCall = { location, options };
				return { object: model, dispose: () => { } };
			},
			async acquireOrLoadSession() {
				didTryDefaultLoad = true;
				return undefined;
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			ChatEditorInput.getNewEditorUri(),
			{ explicitSessionType: localChatSessionType },
			chatService,
			{} as IDialogService,
			{} as IConfigurationService,
			{} as IChatSessionsService,
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(false) },
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({
				model: resolved?.model,
				sessionResource: input.sessionResource,
				startLocation: startCall?.location,
				debugOwner: startCall?.options?.debugOwner,
				didTryDefaultLoad,
			}, {
				model,
				sessionResource,
				startLocation: ChatAgentLocation.Chat,
				debugOwner: 'ChatEditorInput#resolveExplicitLocal',
				didTryDefaultLoad: false,
			});
		} finally {
			input.dispose();
		}
	});

	test('explicit local session type preserves empty local session resource', async () => {
		const sessionResource = LocalChatSessionUri.forSession('explicit-empty-local');
		const model = {
			hasRequests: false,
			onDidDispose: Event.None,
			onDidChange: Event.None,
			sessionResource,
		} as Partial<IChatModel> as IChatModel;

		const loadedResources: string[] = [];
		const chatService = {
			async acquireOrLoadSession(resource: URI) {
				loadedResources.push(resource.toString());
				return { object: model, dispose: () => { } };
			},
			startNewLocalSession() {
				throw new Error('Should not create a new local session when the local session resource resolves');
			},
		} as Partial<IChatService> as IChatService;

		const input = new ChatEditorInput(
			sessionResource,
			{ explicitSessionType: localChatSessionType },
			chatService,
			{} as IDialogService,
			{} as IConfigurationService,
			{} as IChatSessionsService,
			{} as IInstantiationService,
			{} as IStorageService,
			new NullLogService(),
			new TestContextService(),
			{ _serviceBrand: undefined, enabled: constObservable(false) },
		);

		try {
			const resolved = await input.resolve();

			assert.deepStrictEqual({
				model: resolved?.model,
				sessionResource: input.sessionResource,
				loadedResources,
			}, {
				model,
				sessionResource,
				loadedResources: [sessionResource.toString()],
			});
		} finally {
			input.dispose();
		}
	});

	test('new chat replaces a current extension host Copilot CLI harness', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([{
			type: SessionType.CopilotCLI,
			name: 'Copilot CLI',
			displayName: 'Copilot CLI',
			description: 'Copilot CLI',
		}]);
		const storageService = store.add(new TestStorageService());
		const workspaceContextService = new TestContextService();
		const agentHostEnablementService = { _serviceBrand: undefined, enabled: constObservable(true) } satisfies IAgentHostEnablementService;

		instantiationService.stub(IChatService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IChatSessionsService, chatSessionsService);
		instantiationService.set(IStorageService, storageService);
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.set(IWorkspaceContextService, workspaceContextService);
		instantiationService.set(IAgentHostEnablementService, agentHostEnablementService);

		const input = store.add(instantiationService.createInstance(
			ChatEditorInput,
			URI.from({ scheme: SessionType.CopilotCLI, path: '/session' }),
			{},
		));
		let replacementResource: URI | undefined;
		instantiationService.stub(IEditorService, {
			findEditors: () => [{ editor: input, groupId: 1 }],
			replaceEditors: async replacements => {
				const replacement = replacements[0].replacement;
				replacementResource = isResourceEditorInput(replacement) ? replacement.resource : undefined;
			},
		});

		try {
			await instantiationService.invokeFunction(clearChatEditor, input);

			assert.deepStrictEqual({
				currentSessionType: input.sessionResource ? getChatSessionType(input.sessionResource) : undefined,
				replacementSessionType: replacementResource ? getChatSessionType(replacementResource) : undefined,
			}, {
				currentSessionType: SessionType.CopilotCLI,
				replacementSessionType: localChatSessionType,
			});
		} finally {
			store.dispose();
		}
	});
});
