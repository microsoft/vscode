/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Extensions as ViewExtensions } from '../../../../workbench/common/views.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsActiveSessionBackgroundProviderContext, IsNewChatSessionContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { ISessionsConfigurationService, SessionsConfigurationService } from './sessionsConfigurationService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { ChatViewContainerId, ChatViewId } from '../../../../workbench/contrib/chat/browser/chat.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { NewChatViewPane, SessionsViewId } from './newChatViewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ChatViewPane } from '../../../../workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CopilotCLISessionType } from '../../sessions/browser/sessionTypes.js';
export class OpenSessionWorktreeInVSCodeAction extends Action2 {
    static { this.ID = 'chat.openSessionWorktreeInVSCode'; }
    constructor() {
        super({
            id: OpenSessionWorktreeInVSCodeAction.ID,
            title: localize2('openInVSCode', 'Open in VS Code'),
            icon: Codicon.vscodeInsiders,
            precondition: IsActiveSessionBackgroundProviderContext,
            menu: [{
                    id: Menus.TitleBarSessionMenu,
                    group: 'navigation',
                    order: 9,
                    when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
                }]
        });
    }
    async run(accessor) {
        const telemetryService = accessor.get(ITelemetryService);
        logSessionsInteraction(telemetryService, 'openInVSCode');
        const openerService = accessor.get(IOpenerService);
        const productService = accessor.get(IProductService);
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const activeSession = sessionsManagementService.activeSession.get();
        if (!activeSession) {
            return;
        }
        const workspace = activeSession.workspace.get();
        const repo = workspace?.repositories[0];
        const folderUri = activeSession.sessionType === CopilotCLISessionType.id ? repo?.workingDirectory ?? repo?.uri : undefined;
        if (!folderUri) {
            return;
        }
        const scheme = productService.quality === 'stable'
            ? 'vscode'
            : productService.quality === 'exploration'
                ? 'vscode-exploration'
                : 'vscode-insiders';
        const params = new URLSearchParams();
        params.set('windowId', '_blank');
        params.set('session', activeSession.resource.toString());
        await openerService.open(URI.from({
            scheme,
            authority: Schemas.file,
            path: folderUri.path,
            query: params.toString(),
        }), { openExternal: true });
    }
}
registerAction2(OpenSessionWorktreeInVSCodeAction);
class NewChatInSessionsWindowAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.sessions.newChat',
            title: localize2('chat.newEdits.label', "New Chat"),
            category: CHAT_CATEGORY,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 2,
                primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 42 /* KeyCode.KeyL */],
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
                    secondary: [256 /* KeyMod.WinCtrl */ | 42 /* KeyCode.KeyL */]
                },
            }
        });
    }
    run(accessor) {
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        sessionsManagementService.openNewSessionView();
    }
}
registerAction2(NewChatInSessionsWindowAction);
// --- Sessions New Chat View Registration ---
// Registers in the same ChatBar container as the existing ChatViewPane.
// The `when` clause ensures only the new-session pane shows when no active session exists.
const chatViewIcon = registerIcon('chat-view-icon', Codicon.chatSparkle, localize('chatViewIcon', 'View icon of the chat view.'));
class RegisterChatViewContainerContribution {
    static { this.ID = 'sessions.registerChatViewContainer'; }
    constructor() {
        const viewContainerRegistry = Registry.as(ViewExtensions.ViewContainersRegistry);
        const viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
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
            windowVisibility: 2 /* WindowVisibility.Sessions */,
        }, 3 /* ViewContainerLocation.ChatBar */, { isDefault: true, doNotRegisterOpenCommand: true });
        viewsRegistry.registerViews([{
                id: ChatViewId,
                containerIcon: chatViewContainer.icon,
                containerTitle: chatViewContainer.title.value,
                singleViewPaneContainerTitle: chatViewContainer.title.value,
                name: localize2('chat.viewContainer.label', "Chat"),
                canToggleVisibility: false,
                canMoveView: false,
                ctorDescriptor: new SyncDescriptor(ChatViewPane),
                when: IsNewChatSessionContext.negate(),
                windowVisibility: 2 /* WindowVisibility.Sessions */
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
                windowVisibility: 2 /* WindowVisibility.Sessions */,
            }], chatViewContainer);
    }
}
// register actions
registerAction2(BranchChatSessionAction);
// register workbench contributions
registerWorkbenchContribution2(RegisterChatViewContainerContribution.ID, RegisterChatViewContainerContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, 3 /* WorkbenchPhase.AfterRestored */);
// register services
registerSingleton(IPromptsService, AgenticPromptsService, 1 /* InstantiationType.Delayed */);
registerSingleton(ISessionsConfigurationService, SessionsConfigurationService, 1 /* InstantiationType.Delayed */);
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, 1 /* InstantiationType.Delayed */);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RSxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBa0UsVUFBVSxJQUFJLGNBQWMsRUFBb0IsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2SyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3Q0FBd0MsRUFBRSx1QkFBdUIsRUFBRSw2QkFBNkIsRUFBRSxN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