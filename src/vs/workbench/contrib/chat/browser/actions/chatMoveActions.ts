/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { ViewContainerLocation } from '../../../../common/views.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { isChatViewTitleActionContext } from '../../common/chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ChatEditor, IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';
import { CHAT_CATEGORY } from './chatActions.js';

enum MoveToNewLocation {
	Editor = 'Editor',
	Window = 'Window'
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openInEditor',
				title: localize2('chat.openInEditor.label', "Open Chat in Editor"),
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

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Editor, isChatViewTitleActionContext(context) ? context.sessionId : undefined);
		}
	});

	registerAction2(class GlobalMoveToNewWindowAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openInNewWindow',
				title: localize2('chat.openInNewWindow.label', "Open Chat in New Window"),
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

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Window, isChatViewTitleActionContext(context) ? context.sessionId : undefined);
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openInSidebar',
				title: localize2('interactiveSession.openInSidebar.label', "Open Chat in Side Bar"),
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	});

	function appendOpenChatInViewMenuItem(menuId: MenuId, title: string, icon: ThemeIcon, locationContextKey: ContextKeyExpression) {
		MenuRegistry.appendMenuItem(menuId, {
			command: { id: 'workbench.action.chat.openInSidebar', title, icon },
			when: ContextKeyExpr.and(
				ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				locationContextKey
			),
			group: menuId === MenuId.CompactWindowEditorTitle ? 'navigation' : undefined,
			order: 0
		});
	}

	[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].forEach(id => {
		appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInSecondarySidebar.label', "Open Chat in Secondary Side Bar"), Codicon.layoutSidebarRightDock, ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.AuxiliaryBar));
		appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInPrimarySidebar.label', "Open Chat in Primary Side Bar"), Codicon.layoutSidebarLeftDock, ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Sidebar));
		appendOpenChatInViewMenuItem(id, localize('interactiveSession.openInPanel.label', "Open Chat in Panel"), Codicon.layoutPanelDock, ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.Panel));
	});
}

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation, _sessionId?: string) {
	const widgetService = accessor.get(IChatWidgetService);
	const editorService = accessor.get(IEditorService);

	const widget = (_sessionId ? widgetService.getWidgetBySessionId(_sessionId) : undefined)
		?? widgetService.lastFocusedWidget;
	if (!widget || !widget.viewModel || widget.location !== ChatAgentLocation.Chat) {
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}

	const sessionId = widget.viewModel.sessionId;
	const existingWidget = widgetService.getWidgetBySessionId(sessionId);
	if (!existingWidget) {
		// Do NOT attempt to open a session that isn't already open since we cannot guarantee its state.
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}
	const viewState = widget.getViewState();

	widget.clear();
	await widget.waitForReady();

	const options: IChatEditorOptions = { target: { sessionId }, pinned: true, viewState, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } };
	await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
}

async function moveToSidebar(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const chatEditor = editorService.activeEditorPane;
	const chatEditorInput = chatEditor?.input;
	let view: ChatViewPane;
	if (chatEditor instanceof ChatEditor && chatEditorInput instanceof ChatEditorInput && chatEditorInput.sessionId) {
		await editorService.closeEditor({ editor: chatEditor.input, groupId: editorGroupService.activeGroup.id });
		view = await viewsService.openView(ChatViewId) as ChatViewPane;
		await view.loadSession(chatEditorInput.sessionId, chatEditor.getViewState());
	} else {
		view = await viewsService.openView(ChatViewId) as ChatViewPane;
	}

	view.focus();
}
