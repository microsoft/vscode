/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { isChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ChatEditor } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { CHAT_CATEGORY } from './chatActions.js';
var MoveToNewLocation;
(function (MoveToNewLocation) {
    MoveToNewLocation["Editor"] = "Editor";
    MoveToNewLocation["Window"] = "Window";
})(MoveToNewLocation || (MoveToNewLocation = {}));
export function registerMoveActions() {
    registerAction2(class GlobalMoveToEditorAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.openInEditor',
                title: localize2('chat.openInEditor.label', "Move Chat into Editor Area"),
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                f1: true,
                menu: {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.equals('view', ChatViewId),
                    order: 0,
                    group: '1_open'
                },
            });
        }
        async run(accessor, ...args) {
            const context = args[0];
            executeMoveToAction(accessor, MoveToNewLocation.Editor, isChatViewTitleActionContext(context) ? context.sessionResource : undefined);
        }
    });
    registerAction2(class GlobalMoveToNewWindowAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.openInNewWindow',
                title: localize2('chat.openInNewWindow.label', "Move Chat into New Window"),
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                f1: true,
                menu: {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.equals('view', ChatViewId),
                    order: 0,
                    group: '1_open'
                },
            });
        }
        async run(accessor, ...args) {
            const context = args[0];
            executeMoveToAction(accessor, MoveToNewLocation.Window, isChatViewTitleActionContext(context) ? context.sessionResource : undefined);
        }
    });
    registerAction2(class GlobalMoveToSidebarAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.openInSidebar',
                title: localize2('interactiveSession.openInSidebar.label', "Move Chat into Side Bar"),
                category: CHAT_CATEGORY,
                precondition: ChatContextKeys.enabled,
                f1: true
            });
        }
        async run(accessor, ...args) {
            return moveToSidebar(accessor);
        }
    });
    function appendOpenChatInViewMenuItem(menuId, title, icon, locationContextKey) {
        MenuRegistry.appendMenuItem(menuId, {
            command: { id: 'workbench.action.chat.openInSidebar', title, icon },
            when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), locationContextKey),
            group: menuId === MenuId.CompactWindowEditorTitle ? 'navigation' : undefined,
            order: 0
        });
    }
    [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].forEach(id => {
        appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInSecondarySidebar.label', "Move Chat into Secondary Side Bar"), Codicon.layoutSidebarRightDock, ChatContextKeys.panelLocation.isEqualTo(2 /* ViewContainerLocation.AuxiliaryBar */));
        appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInPrimarySidebar.label', "Move Chat into Primary Side Bar"), Codicon.layoutSidebarLeftDock, ChatContextKeys.panelLocation.isEqualTo(0 /* ViewContainerLocation.Sidebar */));
        appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInPanel.label', "Move Chat into Panel"), Codicon.layoutPanelDock, ChatContextKeys.panelLocation.isEqualTo(1 /* ViewContainerLocation.Panel */));
    });
}
async function executeMoveToAction(accessor, moveTo, sessionResource) {
    const widgetService = accessor.get(IChatWidgetService);
    const auxiliary = { compact: true, bounds: { width: 800, height: 640 } };
    const widget = (sessionResource ? widgetService.getWidgetBySessionResource(sessionResource) : undefined)
        ?? widgetService.lastFocusedWidget;
    if (!widget || !widget.viewModel || widget.location !== ChatAgentLocation.Chat) {
        await widgetService.openSession(ChatEditorInput.getNewEditorUri(), moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP, { pinned: true, auxiliary });
        return;
    }
    const existingWidget = widgetService.getWidgetBySessionResource(widget.viewModel.sessionResource);
    if (!existingWidget) {
        // Do NOT attempt to open a session that isn't already open since we cannot guarantee its state.
        await widgetService.openSession(ChatEditorInput.getNewEditorUri(), moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP, { pinned: true, auxiliary });
        return;
    }
    // Save off the session resource before clearing
    const resourceToOpen = widget.viewModel.sessionResource;
    // Todo: can possibly go away with https://github.com/microsoft/vscode/pull/278476
    const modelInputState = existingWidget.getViewState();
    await widget.clear();
    const options = { pinned: true, modelInputState, auxiliary };
    await widgetService.openSession(resourceToOpen, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP, options);
}
async function moveToSidebar(accessor) {
    const viewsService = accessor.get(IViewsService);
    const editorService = accessor.get(IEditorService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const chatEditor = editorService.activeEditorPane;
    const chatEditorInput = chatEditor?.input;
    let view;
    if (chatEditor instanceof ChatEditor && chatEditorInput instanceof ChatEditorInput && chatEditorInput.sessionResource) {
        const previousViewState = chatEditor.widget.getViewState();
        await editorService.closeEditor({ editor: chatEditor.input, groupId: editorGroupService.activeGroup.id });
        view = await viewsService.openView(ChatViewId);
        // Todo: can possibly go away with https://github.com/microsoft/vscode/pull/278476
        const newModel = await view.loadSession(chatEditorInput.sessionResource);
        if (previousViewState && newModel && !newModel.inputModel.state.get()) {
            newModel.inputModel.setState(previousViewState);
        }
    }
    else {
        view = await viewsService.openView(ChatViewId);
    }
    view.focus();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vdmVBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdE1vdmVBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsY0FBYyxFQUF3QixNQUFNLHlEQUF5RCxDQUFDO0FBRS9HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQXNCLE1BQU0scUNBQXFDLENBQUM7QUFDckYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNFLE9B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