/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { isChatViewTitleActionContext } from '../../common/chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ChatEditor, IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { waitForChatSessionCleared } from './chatClearActions.js';

enum MoveToNewLocation {
	Editor = 'Editor',
	Window = 'Window'
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInEditor`,
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
				id: `workbench.action.chat.openInNewWindow`,
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
				id: `workbench.action.chat.openInSidebar`,
				title: localize2('interactiveSession.openInSidebar.label', "Open Chat in Side Bar"),
				category: CHAT_CATEGORY,
				precondition: ChatContextKeys.enabled,
				f1: true,
				menu: [{
					id: MenuId.EditorTitle,
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	});
}

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation, _sessionId?: string) {
	const widgetService = accessor.get(IChatWidgetService);
	const editorService = accessor.get(IEditorService);
	const chatService = accessor.get(IChatService);

	const widget = (_sessionId ? widgetService.getWidgetBySessionId(_sessionId) : undefined)
		?? widgetService.lastFocusedWidget;
	if (!widget || !widget.viewModel || widget.location !== ChatAgentLocation.Panel) {
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}

	const sessionId = widget.viewModel.sessionId;
	const viewState = widget.getViewState();

	widget.clear();
	await waitForChatSessionCleared(sessionId, chatService);

	const options: IChatEditorOptions = { target: { sessionId }, pinned: true, viewState: viewState };
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
