/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IsNewChatInSessionContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './openInVSCodeWidget.js';
import './nullChatTipService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISessionsConfigurationService, SessionsConfigurationService } from './sessionsConfigurationService.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { ChatViewContainerId, ChatViewId } from '../../../../workbench/contrib/chat/browser/chat.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { NewChatViewPane, SessionsViewId } from './newChatViewPane.js';
import { NewChatInSessionViewPane, NewChatInSessionViewId } from './newChatInSessionViewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ChatViewPane } from '../../../../workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';


class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.sessions.newChat',
			title: localize2('chat.newEdits.label', "New Chat"),
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 2,
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			}
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		sessionsManagementService.openNewSessionView();
	}
}

registerAction2(NewChatInSessionsWindowAction);





// --- Sessions New Chat View Registration ---
// Registers in the same ChatBar container as the existing ChatViewPane.
// The `when` clause ensures only the new-session pane shows when no active session exists.

const chatViewIcon = registerIcon('chat-view-icon', Codicon.chatSparkle, localize('chatViewIcon', 'View icon of the chat view.'));

class RegisterChatViewContainerContribution implements IWorkbenchContribution {

	static ID = 'sessions.registerChatViewContainer';

	constructor() {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		let chatViewContainer = viewContainerRegistry.get(ChatViewContainerId);
		if (chatViewContainer) {
			const view = viewsRegistry.getView(ChatViewId);
			if (view) {
				viewsRegistry.deregisterViews([view], chatViewContainer);
			}
			viewContainerRegistry.deregisterViewContainer(chatViewContainer);
		}

		chatViewContainer = viewContainerRegistry.registerViewContainer({
			id: ChatViewContainerId,
			title: localize2('chat.viewContainer.label', "Chat"),
			icon: chatViewIcon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ChatViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: ChatViewContainerId,
			hideIfEmpty: true,
			order: 1,
			windowEnablement: WindowEnablement.Sessions,
		}, ViewContainerLocation.ChatBar, { isDefault: true, doNotRegisterOpenCommand: true });

		viewsRegistry.registerViews([{
			id: ChatViewId,
			containerIcon: chatViewContainer.icon,
			containerTitle: chatViewContainer.title.value,
			singleViewPaneContainerTitle: chatViewContainer.title.value,
			name: localize2('chat.viewContainer.label', "Chat"),
			canToggleVisibility: false,
			canMoveView: false,
			ctorDescriptor: new SyncDescriptor(ChatViewPane),
			when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), IsNewChatInSessionContext.negate()),
			windowEnablement: WindowEnablement.Sessions
		}, {
			id: SessionsViewId,
			containerIcon: chatViewContainer.icon,
			containerTitle: chatViewContainer.title.value,
			singleViewPaneContainerTitle: chatViewContainer.title.value,
			name: localize2('sessions.newChat.view', "New Session"),
			canToggleVisibility: false,
			canMoveView: false,
			ctorDescriptor: new SyncDescriptor(NewChatViewPane),
			when: IsNewChatSessionContext,
			windowEnablement: WindowEnablement.Sessions,
		}, {
			id: NewChatInSessionViewId,
			containerIcon: chatViewContainer.icon,
			containerTitle: chatViewContainer.title.value,
			singleViewPaneContainerTitle: chatViewContainer.title.value,
			name: localize2('sessions.newChatInSession.view', "New Chat"),
			canToggleVisibility: false,
			canMoveView: false,
			ctorDescriptor: new SyncDescriptor(NewChatInSessionViewPane),
			when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), IsNewChatInSessionContext),
			windowEnablement: WindowEnablement.Sessions,
		}], chatViewContainer);
	}
}


// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
registerWorkbenchContribution2(RegisterChatViewContainerContribution.ID, RegisterChatViewContainerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);

// register services
registerSingleton(IPromptsService, AgenticPromptsService, InstantiationType.Delayed);
registerSingleton(ISessionsConfigurationService, SessionsConfigurationService, InstantiationType.Delayed);
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, InstantiationType.Delayed);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, InstantiationType.Delayed);

// register accessibility help
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());
