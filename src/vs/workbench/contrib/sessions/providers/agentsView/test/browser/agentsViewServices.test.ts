/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../../../platform/instantiation/common/extensions.js';
import { _util, ServiceIdentifier } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatView } from '../../../../browser/chat/chatView.js';
import { NewChatInSessionWidget } from '../../../../browser/chat/newChatInSessionWidget.js';
import { NewChatWidget } from '../../../../browser/chat/newChatWidget.js';
import { SharedChatInputComposer } from '../../../../browser/chat/sharedChatInputComposer.js';
import { ChatEditorView } from '../../../../browser/chatEditor/chatEditor.js';
import { ChatEditorContent } from '../../../../browser/chatEditor/chatEditorContent.js';
import { ChatGroupView } from '../../../../browser/parts/chatGroupView.js';
import { SessionsList } from '../../../../browser/views/sessionsList.js';
import { SessionsView } from '../../../../browser/views/sessionsView.js';
import { AgentsChatViewHost } from '../../../../browser/agentsView/agentsChatViewHost.js';
import { AgentsChatPartContribution } from '../../../../browser/agentsView/agentsChatPartContribution.js';
// What an editor window registers for its sessions: the shared editor-window services and the Agents view's
import '../../../../browser/editorWindow/editorWindowSessions.contribution.js';
import '../../../../browser/agentsView/agentsView.contribution.js';
import '../../browser/agentsViewProviders.contribution.js';

/**
 * The services that an editor window provides without registering them here: those of the workbench's main service
 * collection, and those that core modules register, which this test does not load.
 */
const CORE_SERVICES = new Set([
	'accessibilityService', 'accessibilitySignalService', 'accountPolicyGateService', 'actionViewItemService', 'agentHostConnectionsService',
	'agentHostEnablementService', 'agentHostService', 'agentPluginService', 'agentSessions', 'chatAgentNameService', 'chatAgentService', 'chatAttachmentResolveService',
	'chatEditingService', 'chatEntitlementService', 'chatModeService', 'chatPetService', 'chatService', 'chatSessionsService',
	'chatSlashCommandService', 'chatSubmitRequestHandlerService', 'chatTipService', 'chatViewHostService', 'chatWidgetHistoryService',
	'chatWidgetService', 'clipboardService', 'commandService', 'configurationService', 'contextKeyService', 'contextMenuService', 'contextService',
	'contextViewService', 'defaultAccountService', 'dialogService', 'editorGroupsService', 'editorService', 'environmentService', 'extensionService',
	'fileDialogService', 'fileService', 'hostService', 'hoverService', 'IAuthenticationService', 'IChatService', 'IChatWidgetHistoryService',
	'ILanguageModelsService', 'ILanguageModelToolsService', 'instantiationService', 'IPromptsService', 'IUriIdentityService', 'IUserDataProfileService', 'IUserDataProfilesService', 'keybindingService',
	'labelService', 'languageModelsService', 'languageModelToolsService', 'layoutService', 'lifecycleService', 'listService', 'loggerService', 'logService',
	'managedSettingsService', 'menuService', 'modelService', 'notificationService', 'openerService', 'paneCompositePartService', 'pathService', 'productService', 'progressService',
	'quickInputService', 'remoteAgentHostService', 'remoteAgentService', 'requestService', 'speechService', 'storageService', 'telemetryService', 'textModelService',
	'themeService', 'uriIdentityService', 'viewDescriptorService', 'viewsService', 'voiceClientService', 'workingCopyService',
	'workspaceContextService', 'workspacesService', 'workspaceTrustManagementService', 'workspaceTrustRequestService',
]);

suite('Agents view services', () => {

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
		for (const root of [SessionsView, SessionsList, ChatView, ChatGroupView, ChatEditorView, ChatEditorContent, NewChatWidget, NewChatInSessionWidget, SharedChatInputComposer, AgentsChatViewHost, AgentsChatPartContribution]) {
			visit(root);
		}

		assert.deepStrictEqual([...missing].sort(), []);
	});
});
