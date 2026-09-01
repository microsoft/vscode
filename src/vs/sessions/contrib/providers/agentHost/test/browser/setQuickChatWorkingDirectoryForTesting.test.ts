/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildDefaultChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IsDevelopmentContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { type ContextKeyValue, type IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService, type IOpenDialogOptions } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { type IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IsQuickChatSessionContext, SessionIsCreatedContext } from '../../../../../common/contextkeys.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { type IChat } from '../../../../../services/sessions/common/session.js';
import { type IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { IsAgentHostSession } from '../../browser/agentHostSkillButtons.js';
import { SetQuickChatWorkingDirectoryForTestingAction, setQuickChatWorkingDirectoryForTesting } from '../../browser/setQuickChatWorkingDirectoryForTestingAction.js';

suite('Set Quick Chat Working Directory For Testing', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function context(values: Record<string, ContextKeyValue>): IContext {
		return {
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined => values[key] as T | undefined,
		};
	}

	function createServices(selected: URI[] | undefined, deferConversion = false) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const clientChat = URI.parse('agent-host-copilotcli:/session-1');
		const backendSession = URI.parse('copilot:/session-1');
		const backendChat = URI.parse(buildDefaultChatUri(backendSession));
		const defaultDirectory = URI.file('/default');
		let dialogOptions: IOpenDialogOptions | undefined;
		const workingDirectoryCalls: { chat: string; workingDirectory: string }[] = [];
		const conversionRequested = new DeferredPromise<void>();
		const isQuickChat = observableValue('isQuickChat', true);

		const mainChat = new class extends mock<IChat>() {
			override readonly resource = clientChat;
		}();
		const activeSession = new class extends mock<IActiveSession>() {
			override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly isQuickChat = isQuickChat;
			override readonly mainChat = constObservable(mainChat);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(activeSession);
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override getBackendChatResource(chatResource: URI): URI | undefined {
				return chatResource.toString() === clientChat.toString() ? backendChat : undefined;
			}
		}();
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T>(): T | undefined {
				return provider as T;
			}
		}();
		const fileDialogService = new class extends mock<IFileDialogService>() {
			override async defaultFolderPath(): Promise<URI> {
				return defaultDirectory;
			}
			override async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
				dialogOptions = options;
				return selected;
			}
		}();
		const agentHostService = new class extends mock<IAgentHostService>() {
			override async setSessionWorkingDirectoryForTesting(chat: URI, workingDirectory: URI): Promise<void> {
				workingDirectoryCalls.push({ chat: chat.toString(), workingDirectory: workingDirectory.toString() });
				conversionRequested.complete();
				if (!deferConversion) {
					isQuickChat.set(false, undefined);
				}
			}
		}();

		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsProvidersService, sessionsProvidersService);
		instantiationService.stub(IFileDialogService, fileDialogService);
		instantiationService.stub(IAgentHostService, agentHostService);
		instantiationService.stub(INotificationService, new TestNotificationService());

		return {
			instantiationService,
			backendChat,
			getDialogOptions: () => dialogOptions,
			workingDirectoryCalls,
			conversionRequested,
			completeConversion: () => isQuickChat.set(false, undefined),
		};
	}

	test('is available only for a created local Agent Host Quick Chat in a development Sessions window', () => {
		const precondition = new SetQuickChatWorkingDirectoryForTestingAction().desc.precondition;
		const enabled = {
			[IsDevelopmentContext.key]: true,
			[ChatContextKeys.enabled.key]: true,
			[IsSessionsWindowContext.key]: true,
			[IsAgentHostSession.key]: true,
			[IsQuickChatSessionContext.key]: true,
			[SessionIsCreatedContext.key]: true,
		};

		assert.deepStrictEqual({
			enabled: precondition?.evaluate(context(enabled)),
			notDevelopment: precondition?.evaluate(context({ ...enabled, [IsDevelopmentContext.key]: false })),
			notQuickChat: precondition?.evaluate(context({ ...enabled, [IsQuickChatSessionContext.key]: false })),
			notCreated: precondition?.evaluate(context({ ...enabled, [SessionIsCreatedContext.key]: false })),
		}, {
			enabled: true,
			notDevelopment: false,
			notQuickChat: false,
			notCreated: false,
		});
	});

	test('picks one local folder and routes the owning backend session', async () => {
		const workingDirectory = URI.file('/workspace/project');
		const services = createServices([workingDirectory]);

		await services.instantiationService.invokeFunction(setQuickChatWorkingDirectoryForTesting);

		assert.deepStrictEqual({
			dialog: services.getDialogOptions(),
			calls: services.workingDirectoryCalls,
		}, {
			dialog: {
				title: 'Select Quick Chat Working Directory',
				openLabel: 'Select',
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				defaultUri: URI.file('/default'),
				availableFileSystems: [Schemas.file],
			},
			calls: [{
				chat: services.backendChat.toString(),
				workingDirectory: 'file:///workspace/project',
			}],
		});
	});

	test('does not mutate the session when folder selection is cancelled', async () => {
		const services = createServices(undefined);

		await services.instantiationService.invokeFunction(setQuickChatWorkingDirectoryForTesting);

		assert.deepStrictEqual(services.workingDirectoryCalls, []);
	});

	test('waits for the existing session to become workspace-backed before completing', async () => {
		const services = createServices([URI.file('/workspace/project')], true);
		let completed = false;

		const operation = services.instantiationService.invokeFunction(setQuickChatWorkingDirectoryForTesting).then(() => {
			completed = true;
		});
		await services.conversionRequested.p;

		assert.strictEqual(completed, false);
		services.completeConversion();
		await operation;
		assert.strictEqual(completed, true);
	});
});
