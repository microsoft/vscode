/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { _util, ServiceIdentifier } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { EditorWindowMainSessionHost } from '../../../../browser/agentsView/editorWindowMainSessionHost.js';
import { AgentsChatViewHost } from '../../../../browser/agentsView/agentsChatViewHost.js';
import { EditorWindowChatPartService } from '../../../../browser/agentsView/agentsChatPartContribution.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { IChat, ISession, SessionStatus } from '../../../../../../services/sessions/common/session.js';
import { ChatView, NewChatView } from '../../../../browser/chat/chatView.js';
import { NewChatInSessionWidget } from '../../../../browser/chat/newChatInSessionWidget.js';
import { NewChatWidget } from '../../../../browser/chat/newChatWidget.js';
import { SharedChatInputComposer } from '../../../../browser/chat/sharedChatInputComposer.js';
import { ChatEditorView } from '../../../../browser/chatEditor/chatEditor.js';
import { ChatEditorContent } from '../../../../browser/chatEditor/chatEditorContent.js';
import { ChatGroupView } from '../../../../browser/parts/chatGroupView.js';
import { SessionsList } from '../../../../browser/views/sessionsList.js';
import { SessionsView } from '../../../../browser/views/sessionsView.js';
import { SessionArchiveNudge } from '../../../../browser/chat/sessionArchiveNudge.js';
import { SessionChatInputToolbar } from '../../../../browser/chat/sessionChatInputToolbar.js';
import { SessionInputBanners } from '../../../../browser/sessionInputBanners/sessionInputBanners.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';
import { ChatCompositeBar } from '../../../../browser/parts/chatCompositeBar.js';
import { ChatHeader } from '../../../../browser/parts/chatHeader.js';
import { RemoteHostUnavailableEmptyState } from '../../../../browser/parts/remoteHostUnavailableEmptyState.js';
import { ChatViewSessionActivityBar } from '../../../../browser/parts/sessionActivityBar.js';
import { SessionHeader } from '../../../../browser/parts/sessionHeader.js';
import { SessionReadOnlyBanner } from '../../../../browser/parts/sessionReadOnlyBanner.js';
import { SessionRemoteConnection } from '../../../../browser/parts/sessionRemoteConnection.js';
import { SessionsInboxScope } from '../../../../browser/views/sessionsInboxScope.js';
import { SessionsListFilters } from '../../../../browser/views/sessionsListFilters.js';
import { SessionsListNotification } from '../../../../browser/views/sessionsListNotification.js';
import { SessionStorageCleanupNotice } from '../../../../browser/views/sessionStorageCleanupNotice.js';
import { ResponseSelectionSideChatController } from '../../../../../chat/browser/responseSelectionSideChatController.js';
// What an editor window registers for its sessions: the shared editor-window services and the Agents view's
import '../../../../browser/editorWindow/editorWindowSessions.contribution.js';
import '../../browser/agentsViewProviders.contribution.js';

/**
 * The services that an editor window provides without registering them here: those of the workbench's main service
 * collection, and those that core modules register, which this test does not load.
 */
const CORE_SERVICES = new Set([
	'accessibilityService', 'accessibilitySignalService', 'accountPolicyGateService', 'actionViewItemService', 'agentHostConnectionsService',
	'agentHostEnablementService', 'agentHostService', 'agentPluginService', 'agentSessions', 'chatAgentNameService', 'chatAgentService', 'chatAttachmentResolveService',
	'chatEditingService', 'chatEntitlementService', 'chatModeService', 'chatPetService', 'chatService', 'chatSessionsService', 'chatSideChatService',
	'chatSlashCommandService', 'chatSubmitRequestHandlerService', 'chatTipService', 'chatViewHostService', 'chatWidgetHistoryService',
	'chatWidgetService', 'clipboardService', 'commandService', 'configurationService', 'contextKeyService', 'contextMenuService', 'contextService',
	'contextViewService', 'defaultAccountService', 'dialogService', 'editorGroupsService', 'editorService', 'environmentService', 'extensionService', 'externalUriOpenerService',
	'fileDialogService', 'fileService', 'IFileDecorationsService', 'hostService', 'hoverService', 'IAuthenticationService', 'IChatService', 'IChatWidgetHistoryService',
	'ILanguageModelsService', 'ILanguageModelToolsService', 'instantiationService', 'IPromptsService', 'IUriIdentityService', 'IUserDataProfileService', 'IUserDataProfilesService', 'keybindingService',
	'labelService', 'languageModelsService', 'languageModelToolsService', 'layoutService', 'lifecycleService', 'listService', 'loggerService', 'logService',
	'managedSettingsService', 'menuService', 'modelService', 'notificationService', 'onboardingScenarioService', 'openerService', 'paneCompositePartService', 'pathService', 'productService', 'progressService',
	'quickInputService', 'remoteAgentHostService', 'remoteAgentService', 'requestService', 'sessionChatPillVisibilityService', 'speechService', 'storageService', 'telemetryService', 'textModelService',
	'themeService', 'uriIdentityService', 'viewDescriptorService', 'viewsService', 'voiceClientService', 'workingCopyService',
	'jsonEditingService', 'markerService', 'terminalService', 'textResourceConfigurationService', 'workspaceContextService', 'workspaceEditingService', 'workspaceFolderLocationService', 'workspacesService', 'workspaceTrustEnablementService', 'workspaceTrustManagementService', 'workspaceTrustRequestService',
]);

suite('Editor window sessions services', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('an editor window registers every sessions service that its sessions list, chats and chat part depend on', () => {
		const registered = new Map(getSingletonServiceDescriptors().map(([id, descriptor]) => [id.toString(), descriptor]));
		const missing = new Set<string>();
		const seen = new Set<unknown>();
		const visit = (ctor: unknown) => {
			if (!ctor || seen.has(ctor)) {
				return;
			}
			seen.add(ctor);
			for (const { id } of _util.getServiceDependencies(ctor as _util.DI_TARGET_OBJ)) {
				const name = (id as ServiceIdentifier<unknown>).toString();
				const descriptor = registered.get(name);
				if (descriptor) {
					visit(descriptor.ctor);
				} else if (!CORE_SERVICES.has(name)) {
					missing.add(name);
				}
			}
		};
		// The views, and what they create as they show a session, such as a chat's input toolbar: their services are checked
		// as they are created, not as the views that create them are
		const roots = [
			SessionsView, SessionsList, ChatView, ChatGroupView, ChatEditorView, ChatEditorContent, NewChatWidget, NewChatInSessionWidget, SharedChatInputComposer, AgentsChatViewHost, EditorWindowChatPartService,
			NewChatView, SessionChatInputToolbar, SessionInputBanners, SessionArchiveNudge, SessionStatusIcon, ResponseSelectionSideChatController,
			SessionHeader, ChatCompositeBar, ChatHeader, ChatViewSessionActivityBar, RemoteHostUnavailableEmptyState, SessionReadOnlyBanner, SessionRemoteConnection,
			SessionsListNotification, SessionsInboxScope, SessionStorageCleanupNotice, SessionsListFilters,
		];
		for (const root of roots) {
			visit(root);
		}

		assert.deepStrictEqual([...missing].sort(), []);
	});

	test('the session host of an editor window, created as the window starts, does nothing until a feature binds what it shows', () => {
		// Records every use of its only service: it neither listens to it nor reads it until something reads the host
		const used: string[] = [];
		const contextKeyService = new Proxy({}, { get: (_target, property) => { used.push(String(property)); return undefined; } }) as IContextKeyService;
		const host = new EditorWindowMainSessionHost(contextKeyService);

		assert.deepStrictEqual({ used, content: host.content.get(), session: host.session.get(), chat: host.chat.get() }, { used: [], content: { kind: 'empty' }, session: undefined, chat: undefined });
	});

	test('the session host of an editor window shows the chat an override names in place of the bound one, until the override ends', () => {
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const host = new EditorWindowMainSessionHost(contextKeyService);
		const chat = (id: string) => ({ session: upcastPartial<ISession>({ sessionId: id, status: constObservable(SessionStatus.Completed), mainChat: constObservable(upcastPartial<IChat>({})) }), chat: upcastPartial<IChat>({}) });
		const shownId = () => host.session.get()?.sessionId;

		const bound = host.bindShownChat(constObservable(chat('chat part')));
		const beforeOverride = shownId();
		const override = host.overrideShownChat(constObservable(chat('chat view')));
		const overridden = shownId();
		override.dispose();
		const afterOverride = shownId();
		bound.dispose();

		assert.deepStrictEqual({ beforeOverride, overridden, afterOverride, afterBound: shownId() }, { beforeOverride: 'chat part', overridden: 'chat view', afterOverride: 'chat part', afterBound: undefined });
	});
});
