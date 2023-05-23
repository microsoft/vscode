/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const getMoveToEditorChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	id: `workbench.action.chat.${providerId}.openInEditor`,
	title: {
		value: localize('chat.openInEditor.label', "Open In Editor"),
		original: 'Open In Editor'
	},
	category: CHAT_CATEGORY,
	icon: Codicon.arrowLeft,
	precondition: CONTEXT_PROVIDER_EXISTS,
	f1: false,
	viewId,
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.and(ContextKeyExpr.equals('view', viewId), ContextKeyExpr.deserialize('config.chat.experimiental.moveIcons')),
		group: 'navigation',
		order: 0
	},
});

export function getMoveToEditorAction(viewId: string, providerId: string) {
	return class MoveToEditorAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getMoveToEditorChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const viewModel = view.widget.viewModel;
			if (!viewModel) {
				return;
			}

			const editorService = accessor.get(IEditorService);
			view.clear();
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId: viewModel.sessionId }, pinned: true } });
		}
	};
}

const getMoveToSidebarChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	id: `workbench.action.chat.${providerId}.openInSidebar`,
	title: {
		value: localize('chat.openInSidebar.label', "Open In Sidebar"),
		original: 'Open In Sidebar'
	},
	category: CHAT_CATEGORY,
	icon: Codicon.arrowRight,
	precondition: CONTEXT_PROVIDER_EXISTS,
	f1: false, // TODO
	viewId,
	menu: [{
		id: MenuId.EditorTitle,
		group: 'navigation',
		order: 0,
		when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ContextKeyExpr.deserialize('config.chat.experimental.moveIcons')),
	}]
});

export function getMoveToSidebarAction(viewId: string, providerId: string) {
	return class MoveToSidebarAction extends Action2 {
		constructor() {
			super(getMoveToSidebarChatActionDescriptorForViewTitle(viewId, providerId));
		}

		override async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	};
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
	}
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInEditor`,
				title: {
					value: localize('interactiveSession.openInEditor.label', "Open Session In Editor"),
					original: 'Open Session In Editor'
				},
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			const viewService = accessor.get(IViewsService);
			const editorService = accessor.get(IEditorService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !('viewId' in widget.viewContext)) {
				return;
			}

			const viewModel = widget.viewModel;
			if (!viewModel) {
				return;
			}

			const view = await viewService.openView(widget.viewContext.viewId) as ChatViewPane;
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId: viewModel.sessionId }, pinned: true } });
			view.clear();
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInSidebar`,
				title: {
					value: localize('interactiveSession.openInSidebar.label', "Open Session In Sidebar"),
					original: 'Open Session In Sidebar'
				},
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	});
}
