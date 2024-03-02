/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';

enum MoveToNewLocation {
	Editor = 'Editor',
	Window = 'Window'
}

const getMoveToChatActionDescriptorForViewTitle = (viewId: string, providerId: string, moveTo: MoveToNewLocation): Readonly<IAction2Options> & { viewId: string } => ({
	id: `workbench.action.chat.${providerId}.openIn${moveTo}`,
	title: {
		value: moveTo === MoveToNewLocation.Editor ? localize('chat.openInEditor.label', "Open Chat in Editor") : localize('chat.openInNewWindow.label', "Open Chat in New Window"),
		original: moveTo === MoveToNewLocation.Editor ? 'Open Chat in Editor' : 'Open Chat in New Window',
	},
	category: CHAT_CATEGORY,
	precondition: CONTEXT_PROVIDER_EXISTS,
	f1: false,
	viewId,
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		order: 0
	},
});

export function getMoveToEditorAction(viewId: string, providerId: string) {
	return getMoveToAction(viewId, providerId, MoveToNewLocation.Editor);
}

export function getMoveToNewWindowAction(viewId: string, providerId: string) {
	return getMoveToAction(viewId, providerId, MoveToNewLocation.Window);
}

export function getMoveToAction(viewId: string, providerId: string, moveTo: MoveToNewLocation) {
	return class MoveToAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getMoveToChatActionDescriptorForViewTitle(viewId, providerId, moveTo));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const viewModel = view.widget.viewModel;
			if (!viewModel) {
				return;
			}

			const editorService = accessor.get(IEditorService);
			const sessionId = viewModel.sessionId;
			const viewState = view.widget.getViewState();
			view.clear();

			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId }, pinned: true, viewState: viewState } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		}
	};
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInEditor`,
				title: localize2('interactiveSession.openInEditor.label', "Open Chat in Editor"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			executeMoveToAction(accessor, MoveToNewLocation.Editor);
		}
	});

	registerAction2(class GlobalMoveToNewWindowAction extends Action2 {

		constructor() {
			super({
				id: `workbench.action.chat.openInNewWindow`,
				title: localize2('interactiveSession.openInNewWindow.label', "Open Chat in New Window"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			executeMoveToAction(accessor, MoveToNewLocation.Window);
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInSidebar`,
				title: localize2('interactiveSession.openInSidebar.label', "Open Chat in Side Bar"),
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
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

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation) {
	const widgetService = accessor.get(IChatWidgetService);
	const viewService = accessor.get(IViewsService);
	const chatService = accessor.get(IChatService);
	const editorService = accessor.get(IEditorService);

	const widget = widgetService.lastFocusedWidget;
	if (!widget || !('viewId' in widget.viewContext)) {
		const providerId = chatService.getProviderInfos()[0].id;

		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { providerId }, pinned: true } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
		return;
	}

	const viewModel = widget.viewModel;
	if (!viewModel) {
		return;
	}

	const sessionId = viewModel.sessionId;
	const view = await viewService.openView(widget.viewContext.viewId) as ChatViewPane;
	const viewState = view.widget.getViewState();
	view.clear();

	await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId }, pinned: true, viewState: viewState } }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
}

async function moveToSidebar(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);
	const chatContribService = accessor.get(IChatContributionService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const chatEditorInput = editorService.activeEditor;
	if (chatEditorInput instanceof ChatEditorInput && chatEditorInput.sessionId && chatEditorInput.providerId) {
		await editorService.closeEditor({ editor: chatEditorInput, groupId: editorGroupService.activeGroup.id });
		const viewId = chatContribService.getViewIdForProvider(chatEditorInput.providerId);
		const view = await viewsService.openView(viewId) as ChatViewPane;
		view.loadSession(chatEditorInput.sessionId);
	} else {
		const chatService = accessor.get(IChatService);
		const providerId = chatService.getProviderInfos()[0].id;
		const viewId = chatContribService.getViewIdForProvider(providerId);
		await viewsService.openView(viewId);
	}
}
