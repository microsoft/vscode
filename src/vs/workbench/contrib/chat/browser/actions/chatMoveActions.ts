/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { CHAT_CATEGORY, isChatViewTitleActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { CHAT_VIEW_ID, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

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
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				menu: {
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					order: 0
				},
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Editor, isChatViewTitleActionContext(context) ? context.chatView : undefined);
		}
	});

	registerAction2(class GlobalMoveToNewWindowAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInNewWindow`,
				title: localize2('chat.openInNewWindow.label', "Open Chat in New Window"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				menu: {
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					order: 0
				},
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			executeMoveToAction(accessor, MoveToNewLocation.Window, isChatViewTitleActionContext(context) ? context.chatView : undefined);
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInSidebar`,
				title: localize2('interactiveSession.openInSidebar.label', "Open Chat in Side Bar"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_CHAT_ENABLED,
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

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation, chatView?: ChatViewPane) {
	const widgetService = accessor.get(IChatWidgetService);
	const editorService = accessor.get(IEditorService);

	const widget = chatView?.widget ?? widgetService.lastFocusedWidget;
	if (!widget || !('viewId' in widget.viewContext)) {
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}

	const viewModel = widget.viewModel;
	if (!viewModel) {
		return;
	}

	const sessionId = viewModel.sessionId;
	const viewState = widget.getViewState();
	widget.clear();

	const options: IChatEditorOptions = { target: { sessionId }, pinned: true, viewState: viewState };
	await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
}

async function moveToSidebar(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const chatEditorInput = editorService.activeEditor;
	let view: ChatViewPane;
	if (chatEditorInput instanceof ChatEditorInput && chatEditorInput.sessionId) {
		await editorService.closeEditor({ editor: chatEditorInput, groupId: editorGroupService.activeGroup.id });
		view = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
		view.loadSession(chatEditorInput.sessionId);
	} else {
		view = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
	}

	view.focus();
}
