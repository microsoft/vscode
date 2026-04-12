/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { EditingSessionAction, getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession } from './chatActions.js';
import { clearChatEditor } from './chatClear.js';
import { AgentSessionProviders, AgentSessionsViewerOrientation } from '../agentSessions/agentSessions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
function isNewEditSessionActionContext(arg) {
    if (arg && typeof arg === 'object') {
        const obj = arg;
        if (obj.inputValue !== undefined && typeof obj.inputValue !== 'string') {
            return false;
        }
        if (obj.agentMode !== undefined && typeof obj.agentMode !== 'boolean') {
            return false;
        }
        if (obj.isPartialQuery !== undefined && typeof obj.isPartialQuery !== 'boolean') {
            return false;
        }
        return true;
    }
    return false;
}
export function registerNewChatActions() {
    // Add "New Chat" submenu to Chat view menu
    MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
        submenu: MenuId.ChatNewMenu,
        title: localize2('chat.newEdits.label', "New Chat"),
        icon: Codicon.plus,
        when: ContextKeyExpr.equals('view', ChatViewId),
        group: 'navigation',
        order: -1,
        isSplitButton: true
    });
    registerAction2(class NewChatEditorAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chatEditor.newChat',
                title: localize2('chat.newChat.label', "New Chat"),
                icon: Codicon.plus,
                f1: false,
                precondition: ChatContextKeys.enabled,
            });
        }
        async run(accessor, ...args) {
            await clearChatEditor(accessor);
        }
    });
    registerAction2(class NewChatAction extends Action2 {
        constructor() {
            super({
                id: ACTION_ID_NEW_CHAT,
                title: localize2('chat.newEdits.label', "New Chat"),
                category: CHAT_CATEGORY,
                icon: Codicon.plus,
                precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
                f1: true,
                menu: [
                    {
                        id: MenuId.ChatContext,
                        group: 'z_clear'
                    },
                    {
                        id: MenuId.ChatNewMenu,
                        group: '1_open',
                        order: 1,
                        when: ContextKeyExpr.and(ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('copilot'), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('new-session'), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo('comment'))
                    }
                ],
                keybinding: {
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 42 /* KeyCode.KeyL */],
                    mac: {
                        primary: 2048 /* KeyMod.CtrlCmd */ | 44 /* KeyCode.KeyN */,
                        secondary: [256 /* KeyMod.WinCtrl */ | 42 /* KeyCode.KeyL */]
                    },
                    when: ChatContextKeys.inChatSession
                }
            });
        }
        async run(accessor, ...args) {
            const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : undefined;
            // Context from toolbar or lastFocusedWidget
            const context = getEditingSessionContext(accessor, args);
            await runNewChatAction(accessor, context, executeCommandContext);
        }
    });
    const iconVariants = [
        { idSuffix: '.copilotIcon', iconValue: 'copilot', icon: Codicon.copilot },
        { idSuffix: '.newSessionIcon', iconValue: 'new-session', icon: Codicon.newSession },
        { idSuffix: '.commentIcon', iconValue: 'comment', icon: Codicon.comment },
    ];
    for (const variant of iconVariants) {
        registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: ACTION_ID_NEW_CHAT + variant.idSuffix,
                    title: localize2('chat.newEdits.label', "New Chat"),
                    category: CHAT_CATEGORY,
                    icon: variant.icon,
                    precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
                    f1: false,
                    menu: [{
                            id: MenuId.ChatNewMenu,
                            group: '1_open',
                            order: 1,
                            when: ChatContextKeys.newChatButtonExperimentIcon.isEqualTo(variant.iconValue)
                        }]
                });
            }
            async run(accessor, ...args) {
                const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : undefined;
                const context = getEditingSessionContext(accessor, args);
                await runNewChatAction(accessor, context, executeCommandContext);
            }
        });
    }
    CommandsRegistry.registerCommandAlias(ACTION_ID_NEW_EDIT_SESSION, ACTION_ID_NEW_CHAT);
    registerAction2(class NewLocalChatAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.newLocalChat',
                title: localize2('chat.newLocalChat.label', "New Local Chat"),
                category: CHAT_CATEGORY,
                icon: Codicon.plus,
                precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
                f1: false,
            });
        }
        async run(accessor, ...args) {
            const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : undefined;
            // Context from toolbar or lastFocusedWidget
            const context = getEditingSessionContext(accessor, args);
            await runNewChatAction(accessor, context, executeCommandContext, AgentSessionProviders.Local);
        }
    });
    MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleNavigationToolbar, {
        command: {
            id: ACTION_ID_NEW_CHAT,
            title: localize2('chat.goBack', "Go Back"),
            icon: Codicon.arrowLeft,
        },
        when: ChatContextKeys.agentSessionsViewerOrientation.notEqualsTo(AgentSessionsViewerOrientation.SideBySide), // when sessions show side by side, no need for a back button
        group: 'navigation',
        order: 1
    });
    MenuRegistry.appendMenuItem(MenuId.ChatTitleBarMenu, {
        command: {
            id: ACTION_ID_NEW_CHAT,
            title: localize2('chat.newEdits.label', "New Chat"),
        },
        when: ChatContextKeys.enabled,
        group: 'b_new',
        order: -1,
    });
    registerAction2(class UndoChatEditInteractionAction extends EditingSessionAction {
        constructor() {
            super({
                id: 'workbench.action.chat.undoEdit',
                title: localize2('chat.undoEdit.label', "Undo Last Edit"),
                category: CHAT_CATEGORY,
                icon: Codicon.discard,
                precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanUndo, ChatContextKeys.enabled),
                f1: true,
                menu: [{
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.equals('view', ChatViewId),
                        group: 'navigation',
                        order: -3,
                        isHiddenByDefault: true
                    }]
            });
        }
        async runEditingSessionAction(accessor, editingSession) {
            await editingSession.undoInteraction();
        }
    });
    registerAction2(class RedoChatEditInteractionAction extends EditingSessionAction {
        constructor() {
            super({
                id: 'workbench.action.chat.redoEdit',
                title: localize2('chat.redoEdit.label', "Redo Last Edit"),
                category: CHAT_CATEGORY,
                icon: Codicon.redo,
                precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
                f1: true,
                menu: [
                    {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.equals('view', ChatViewId),
                        group: 'navigation',
                        order: -2,
                        isHiddenByDefault: true
                    }
                ]
            });
        }
        async runEditingSessionAction(accessor, editingSession) {
            const chatService = accessor.get(IChatService);
            await editingSession.redoInteraction();
            chatService.getSession(editingSession.chatSessionResource)?.setCheckpoint(undefined);
        }
    });
    registerAction2(class RedoChatCheckpoints extends EditingSessionAction {
        constructor() {
            super({
                id: 'workbench.action.chat.redoEdit2',
                title: localize2('chat.redoEdit.label2', "Redo"),
                tooltip: localize2('chat.redoEdit.tooltip', "Reapply discarded workspace changes and chat"),
                category: CHAT_CATEGORY,
                precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
                f1: true,
                menu: [{
                        id: MenuId.ChatMessageRestoreCheckpoint,
                        when: ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession),
                        group: 'navigation',
                        order: -1
                    }]
            });
        }
        async runEditingSessionAction(accessor, editingSession) {
            const widget = accessor.get(IChatWidgetService);
            while (editingSession.canRedo.get()) {
                await editingSession.redoInteraction();
            }
            const currentWidget = widget.getWidgetBySessionResource(editingSession.chatSessionResource);
            const requestText = currentWidget?.viewModel?.model.checkpoint?.message.text;
            // if the input has the same text that we just restored, clear it.
            if (currentWidget?.inputEditor.getValue() === requestText) {
                currentWidget?.input.setValue('', false);
            }
            currentWidget?.viewModel?.model.setCheckpoint(undefined);
            currentWidget?.focusInput();
        }
    });
}
async function runNewChatAction(accessor, context, executeCommandContext, sessionType) {
    const accessibilityService = accessor.get(IAccessibilityService);
    const viewsService = accessor.get(IViewsService);
    const configurationService = accessor.get(IConfigurationService);
    const { editingSession, chatWidget: widget } = context ?? {};
    if (!widget) {
        return;
    }
    const dialogService = accessor.get(IDialogService);
    const model = widget.viewModel?.model;
    if (model && !(await handleCurrentEditingSession(model, undefined, dialogService))) {
        return;
    }
    await editingSession?.stop();
    // Create a new session, preserving the session type (or using the specified one)
    await clearChatSessionPreservingType(widget, viewsService, sessionType);
    widget.attachmentModel.clear(true);
    widget.focusInput();
    accessibilityService.alert(localize('newChat', "New chat"));
    if (!executeCommandContext) {
        return;
    }
    if (typeof executeCommandContext.agentMode === 'boolean') {
        widget.input.setChatMode(executeCommandContext.agentMode ? ChatModeKind.Agent : ChatModeKind.Edit);
    }
    else if (widget.input.currentModeKind === ChatModeKind.Edit && configurationService.getValue(ChatConfiguration.EditModeHidden)) {
        widget.input.setChatMode(ChatModeKind.Agent);
    }
    if (executeCommandContext.inputValue) {
        if (executeCommandContext.isPartialQuery) {
            widget.setInput(executeCommandContext.inputValue);
        }
        else {
            widget.acceptInput(executeCommandContext.inputValue);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE5ld0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0TmV3QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVuRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRS9GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDL0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUM1RCxPQUFPLEVBQUUsb0JBQW9CLEVBQStCLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkksT0FBTyxFQUFFLGtCQUFrQixFQUFFLDBCQUEwQixFQUFFLGFBQWEsRUFBRSw4QkFBOEIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzlKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQXNCdEcsU0FBUyw2QkFBNkIsQ0FBQyxHQUFZO0lBQ2xELElBQUksR0FBRyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3BDLE1BQU0sR0FBRyxHQUFHLEdBQThCLENBQUM7UUFDM0MsSUFBSSxHQUFHLENBQUMsVUFBVSxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxVQUFVLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDeEUsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxHQUFHLENBQUMsU0FBUyxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDdkUsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxHQUFHLENBQUMsY0FBYyxLQUFLLFNBQVMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxjQUFjLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDakYsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsTUFBTSxVQUFVLHNCQUFzQjtJQUVyQywyQ0FBMkM7SUFDM0MsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFO1FBQzdDLE9BQU8sRUFBRSxNQUFNLENBQUMsV0FBVztRQUMzQixLQUFLLEVBQUUsU0FBUyxDQUFDLHFCQUFxQixFQUFFLFVBQVUsQ0FBQztRQUNuRCxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7UUFDbEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQztRQUMvQyxLQUFLLEVBQUUsWUFBWTtRQUNuQixLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ1QsYUFBYSxFQUFFLElBQUk7S0FDbkIsQ0FBQyxDQUFDO0lBRUgsZUFBZSxDQUFDLE1BQU0sbUJBQW9CLFNBQVEsT0FBTztRQUN4RDtZQUNDLEtBQUssQ0FBQztnQkFDTCxFQUFFLEVBQUUscUNBQXFDO2dCQUN6QyxLQUFLLEVBQUUsU0FBUyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsQ0FBQztnQkFDbEQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO2dCQUNsQixFQUFFLEVBQUUsS0FBSztnQkFDVCxZQUFZLEVBQUUsZUFBZSxDQUFDLE9BQU87YUFDckMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7WUFDdkQsTUFBTSxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakMsQ0FBQztLQUNELENBQUMsQ0FBQztJQUVILGVBQWUsQ0FBQyxNQUFNLGFBQWMsU0FBUSxPQUFPO1FBQ2xEO1lBQ0MsS0FBSyxDQUFDO2dCQUNMLEVBQUUsRUFBRSxrQkFBa0I7Z0JBQ3RCLEtBQUssRUFBRSxTQUFTLENBQUMscUJBQXFCLEVBQUUsVUFBVSxDQUFDO2dCQUNuRCxRQUFRLEVBQUUsYUFBYTtnQkFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO2dCQUNsQixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNySCxFQUFFLEVBQUUsSUFBSTtnQkFDUixJQUFJLEVBQUU7b0JBQ0w7d0JBQ0MsRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXO3dCQUN0QixLQUFLLEVBQUUsU0FBUztxQkFDaEI7b0JBQ0Q7d0JBQ0MsRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXO3dCQUN0QixLQUFLLEVBQUUsUUFBUTt3QkFDZixLQUFLLEVBQUUsQ0FBQzt3QkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FDdkIsZUFBZSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFDbEUsZUFBZSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFDdEUsZUFBZSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FDbEU7cUJBQ0Q7aUJBQ0Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNYLE1BQU0sRUFBRSw4Q0FBb0MsQ0FBQztvQkFDN0MsT0FBTyxFQUFFLGlEQUE2QjtvQkFDdEMsU0FBUyxFQUFFLENBQUMsaURBQTZCLENBQUM7b0JBQzFDLEdBQUcsRUFBRTt3QkFDSixPQUFPLEVBQUUsaURBQTZCO3dCQUN0QyxTQUFTLEVBQUUsQ0FBQyxnREFBNkIsQ0FBQztxQkFDMUM7b0JBQ0QsSUFBSSxFQUFFLGVBQWUsQ0FBQyxhQUFhO2lCQUNuQzthQUNELENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsR0FBRyxJQUFlO1lBQ3ZELE1BQU0scUJBQXFCLEdBQUcsNkJBQTZCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBRTNGLDRDQUE0QztZQUM1QyxNQUFNLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekQsTUFBTSxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLHFCQUFxQixDQUFDLENBQUM7UUFDbEUsQ0FBQztLQUNELENBQ0EsQ0FBQztJQUVGLE1BQU0sWUFBWSxHQUFHO1FBQ3BCLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFO1FBQ3pFLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxVQUFVLEVBQUU7UUFDbkYsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUU7S0FDaEUsQ0FBQztJQUVYLEtBQUssTUFBTSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUM7UUFDcEMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO1lBQ3BDO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUsa0JBQWtCLEdBQUcsT0FBTyxDQUFDLFFBQVE7b0JBQ3pDLEtBQUssRUFBRSxTQUFTLENBQUMscUJBQXFCLEVBQUUsVUFBVSxDQUFDO29CQUNuRCxRQUFRLEVBQUUsYUFBYTtvQkFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO29CQUNsQixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLGVBQWUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNySCxFQUFFLEVBQUUsS0FBSztvQkFDVCxJQUFJLEVBQUUsQ0FBQzs0QkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFdBQVc7NEJBQ3RCLEtBQUssRUFBRSxRQUFROzRCQUNmLEtBQUssRUFBRSxDQUFDOzRCQUNSLElBQUksRUFBRSxlQUFlLENBQUMsMkJBQTJCLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7eUJBQzlFLENBQUM7aUJBQ0YsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7Z0JBQ3ZELE1BQU0scUJBQXFCLEdBQUcsNkJBQTZCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUMzRixNQUFNLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pELE1BQU0sZ0JBQWdCLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1lBQ2xFLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsMEJBQTBCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUV0RixlQUFlLENBQUMsTUFBTSxrQkFBbUIsU0FBUSxPQUFPO1FBQ3ZEO1lBQ0MsS0FBSyxDQUFDO2dCQUNMLEVBQUUsRUFBRSxvQ0FBb0M7Z0JBQ3hDLEtBQUssRUFBRSxTQUFTLENBQUMseUJBQXlCLEVBQUUsZ0JBQWdCLENBQUM7Z0JBQzdELFFBQVEsRUFBRSxhQUFhO2dCQUN2QixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7Z0JBQ2xCLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsZUFBZSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JILEVBQUUsRUFBRSxLQUFLO2FBQ1QsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUFHLElBQWU7WUFDdkQsTUFBTSxxQkFBcUIsR0FBRyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFFM0YsNENBQTRDO1lBQzVDLE1BQU0sT0FBTyxHQUFHLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN6RCxNQUFNLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0YsQ0FBQztLQUNELENBQUMsQ0FBQztJQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLHFDQUFxQyxFQUFFO1FBQ3pFLE9BQU8sRUFBRTtZQUNSLEVBQUUsRUFBRSxrQkFBa0I7WUFDdEIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDO1lBQzFDLElBQUksRUFBRSxPQUFPLENBQUMsU0FBUztTQUN2QjtRQUNELElBQUksRUFBRSxlQUFlLENBQUMsOEJBQThCLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDLFVBQVUsQ0FBQyxFQUFFLDZEQUE2RDtRQUMxSyxLQUFLLEVBQUUsWUFBWTtRQUNuQixLQUFLLEVBQUUsQ0FBQztLQUNSLENBQUMsQ0FBQztJQUVILFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1FBQ3BELE9BQU8sRUFBRTtZQUNSLEVBQUUsRUFBRSxrQkFBa0I7WUFDdEIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxxQkFBcUIsRUFBRSxVQUFVLENBQUM7U0FDbkQ7UUFDRCxJQUFJLEVBQUUsZUFBZSxDQUFDLE9BQU87UUFDN0IsS0FBSyxFQUFFLE9BQU87UUFDZCxLQUFLLEVBQUUsQ0FBQyxDQUFDO0tBQ1QsQ0FBQyxDQUFDO0lBRUgsZUFBZSxDQUFDLE1BQU0sNkJBQThCLFNBQVEsb0JBQW9CO1FBQy9FO1lBQ0MsS0FBSyxDQUFDO2dCQUNMLEVBQUUsRUFBRSxnQ0FBZ0M7Z0JBQ3BDLEtBQUssRUFBRSxTQUFTLENBQUMscUJBQXFCLEVBQUUsZ0JBQWdCLENBQUM7Z0JBQ3pELFFBQVEsRUFBRSxhQUFhO2dCQUN2QixJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU87Z0JBQ3JCLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRSxlQUFlLENBQUMsT0FBTyxDQUFDO2dCQUM3RixFQUFFLEVBQUUsSUFBSTtnQkFDUixJQUFJLEVBQUUsQ0FBQzt3QkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7d0JBQ3BCLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUM7d0JBQy9DLEtBQUssRUFBRSxZQUFZO3dCQUNuQixLQUFLLEVBQUUsQ0FBQyxDQUFDO3dCQUNULGlCQUFpQixFQUFFLElBQUk7cUJBQ3ZCLENBQUM7YUFDRixDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFFBQTBCLEVBQUUsY0FBbUM7WUFDNUYsTUFBTSxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDeEMsQ0FBQztLQUNELENBQUMsQ0FBQztJQUVILGVBQWUsQ0FBQyxNQUFNLDZCQUE4QixTQUFRLG9CQUFvQjtRQUMvRTtZQUNDLEtBQUssQ0FBQztnQkFDTCxFQUFFLEVBQUUsZ0NBQWdDO2dCQUNwQyxLQUFLLEVBQUUsU0FBUyxDQUFDLHFCQUFxQixFQUFFLGdCQUFnQixDQUFDO2dCQUN6RCxRQUFRLEVBQUUsYUFBYTtnQkFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO2dCQUNsQixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsa0JBQWtCLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQztnQkFDN0YsRUFBRSxFQUFFLElBQUk7Z0JBQ1IsSUFBSSxFQUFFO29CQUNMO3dCQUNDLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUzt3QkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQzt3QkFDL0MsS0FBSyxFQUFFLFlBQVk7d0JBQ25CLEtBQUssRUFBRSxDQUFDLENBQUM7d0JBQ1QsaUJBQWlCLEVBQUUsSUFBSTtxQkFDdkI7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFFBQTBCLEVBQUUsY0FBbUM7WUFDNUYsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMvQyxNQUFNLGNBQWMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN2QyxXQUFXLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0RixDQUFDO0tBQ0QsQ0FBQyxDQUFDO0lBRUgsZUFBZSxDQUFDLE1BQU0sbUJBQW9CLFNBQVEsb0JBQW9CO1FBQ3JFO1lBQ0MsS0FBSyxDQUFDO2dCQUNMLEVBQUUsRUFBRSxpQ0FBaUM7Z0JBQ3JDLEtBQUssRUFBRSxTQUFTLENBQUMsc0JBQXNCLEVBQUUsTUFBTSxDQUFDO2dCQUNoRCxPQUFPLEVBQUUsU0FBUyxDQUFDLHVCQUF1QixFQUFFLDhDQUE4QyxDQUFDO2dCQUMzRixRQUFRLEVBQUUsYUFBYTtnQkFDdkIsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUM7Z0JBQzdGLEVBQUUsRUFBRSxJQUFJO2dCQUNSLElBQUksRUFBRSxDQUFDO3dCQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsNEJBQTRCO3dCQUN2QyxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLEVBQUUsbUJBQW1CLENBQUMsa0JBQWtCLENBQUM7d0JBQzdHLEtBQUssRUFBRSxZQUFZO3dCQUNuQixLQUFLLEVBQUUsQ0FBQyxDQUFDO3FCQUNULENBQUM7YUFDRixDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFFBQTBCLEVBQUUsY0FBbUM7WUFDNUYsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRWhELE9BQU8sY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLGNBQWMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN4QyxDQUFDO1lBRUQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLDBCQUEwQixDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQzVGLE1BQU0sV0FBVyxHQUFHLGFBQWEsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDO1lBRTdFLGtFQUFrRTtZQUNsRSxJQUFJLGFBQWEsRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFLEtBQUssV0FBVyxFQUFFLENBQUM7Z0JBQzNELGFBQWEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQyxDQUFDO1lBRUQsYUFBYSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pELGFBQWEsRUFBRSxVQUFVLEVBQUUsQ0FBQztRQUM3QixDQUFDO0tBQ0QsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELEtBQUssVUFBVSxnQkFBZ0IsQ0FDOUIsUUFBMEIsRUFDMUIsT0FBZ0QsRUFDaEQscUJBQW9ELEVBQ3BELFdBQW1DO0lBRW5DLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQ2pFLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDakQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFFakUsTUFBTSxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxJQUFJLEVBQUUsQ0FBQztJQUM3RCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDYixPQUFPO0lBQ1IsQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFbkQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUM7SUFDdEMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLE1BQU0sMkJBQTJCLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDcEYsT0FBTztJQUNSLENBQUM7SUFFRCxNQUFNLGNBQWMsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUU3QixpRkFBaUY7SUFDakYsTUFBTSw4QkFBOEIsQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBRXhFLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25DLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUVwQixvQkFBb0IsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBRTVELElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzVCLE9BQU87SUFDUixDQUFDO0lBRUQsSUFBSSxPQUFPLHFCQUFxQixDQUFDLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMxRCxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNwRyxDQUFDO1NBQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsS0FBSyxZQUFZLENBQUMsSUFBSSxJQUFJLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1FBQzNJLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsSUFBSSxxQkFBcUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN0QyxJQUFJLHFCQUFxQixDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkQsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQyJ9