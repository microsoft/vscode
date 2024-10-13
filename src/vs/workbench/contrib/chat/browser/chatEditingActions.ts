/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { GroupsOrder, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatAgentLocation } from '../common/chatAgents.js';
import { CONTEXT_CHAT_LOCATION, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_REQUEST, CONTEXT_RESPONSE } from '../common/chatContextKeys.js';
import { applyingChatEditsContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, inChatEditingSessionContextKey, isChatRequestCheckpointed, WorkingSetEntryState } from '../common/chatEditingService.js';
import { IChatService } from '../common/chatService.js';
import { isRequestVM, isResponseVM } from '../common/chatViewModel.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from './chat.js';

abstract class WorkingSetAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: any[]) {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;
		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		return this.runWorkingSetAction(accessor, currentEditingSession, chatWidget, ...uris);
	}

	abstract runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget | undefined, ...uris: URI[]): any;
}


registerAction2(class RemoveFileFromWorkingSet extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.removeFileFromWorkingSet',
			title: localize2('removeFileFromWorkingSet', 'Remove File'),
			icon: Codicon.close,
			menu: [{
				id: MenuId.ChatEditingSessionWidgetToolbar,
				when: ContextKeyExpr.or(ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Attached), ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Transient)),
				order: 0,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		// Remove from working set
		currentEditingSession.remove(...uris);

		// Remove from chat input part
		const resourceSet = new ResourceSet(uris);
		const newContext = [];

		for (const context of chatWidget.input.attachmentModel.attachments) {
			if (!URI.isUri(context.value) || !context.isFile || !resourceSet.has(context.value)) {
				newContext.push(context);
			}
		}

		chatWidget.attachmentModel.clearAndSetContext(...newContext);
	}
});

registerAction2(class OpenFileAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.openFile',
			title: localize2('open.file', 'Open File'),
			icon: Codicon.goToFile,
			menu: [{
				id: MenuId.ChatEditingSessionWidgetToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 0,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await Promise.all(uris.map((uri) => editorService.openEditor({ resource: uri, options: { pinned: true, activation: EditorActivation.ACTIVATE } })));
	}
});

registerAction2(class AcceptAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.acceptFile',
			title: localize2('accept.file', 'Accept'),
			icon: Codicon.check,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingSessionWidgetToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 2,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		await currentEditingSession.accept(...uris);
	}
});

registerAction2(class DiscardAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.discardFile',
			title: localize2('discard.file', 'Discard'),
			icon: Codicon.discard,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingSessionWidgetToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 1,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		await currentEditingSession.reject(...uris);
	}
});

export class ChatEditingAcceptAllAction extends Action2 {
	static readonly ID = 'chatEditing.acceptAllFiles';
	static readonly LABEL = localize('accept.allFiles', 'Accept All');

	constructor() {
		super({
			id: ChatEditingAcceptAllAction.ID,
			title: ChatEditingAcceptAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.accept();
	}
}
registerAction2(ChatEditingAcceptAllAction);

export class ChatEditingDiscardAllAction extends Action2 {
	static readonly ID = 'chatEditing.discardAllFiles';
	static readonly LABEL = localize('discard.allFiles', 'Discard All');

	constructor() {
		super({
			id: ChatEditingDiscardAllAction.ID,
			title: ChatEditingDiscardAllAction.LABEL,
			// icon: Codicon.goToFile,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
				id: MenuId.EditorTitle,
				order: 0,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.reject();
	}
}
registerAction2(ChatEditingDiscardAllAction);

export class ChatEditingShowChangesAction extends Action2 {
	static readonly ID = 'chatEditing.openDiffs';
	static readonly LABEL = localize('chatEditing.openDiffs', 'Open Diffs');

	constructor() {
		super({
			id: ChatEditingShowChangesAction.ID,
			title: ChatEditingShowChangesAction.LABEL,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}
		await currentEditingSession.show();
	}
}
registerAction2(ChatEditingShowChangesAction);

registerAction2(class AddFilesToWorkingSetAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.addFilesToWorkingSet',
			title: localize2('workbench.action.chat.addFilesToWorkingSet.label', "Add Files to Working Set"),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			precondition: inChatEditingSessionContextKey,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const listService = accessor.get(IListService);
		const chatEditingService = accessor.get(IChatEditingService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		const uris: URI[] = [];

		for (const group of editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			for (const selection of group.selectedEditors) {
				if (selection.resource) {
					uris.push(selection.resource);
				}
			}
		}

		if (uris.length === 0) {
			const selection = listService.lastFocusedList?.getSelection();
			if (selection?.length) {
				for (const file of selection) {
					if (!!file && typeof file === 'object' && 'resource' in file && URI.isUri(file.resource)) {
						uris.push(file.resource);
					}
				}
			}
		}

		for (const file of uris) {
			await chatEditingService?.addFileToWorkingSet(file);
		}
	}
});


registerAction2(class RestoreWorkingSetAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.restoreWorkingSet',
			title: localize2('chat.restoreWorkingSet.label', 'Restore Working Set'),
			f1: false,
			shortTitle: localize2('chat.restoreWorkingSet.shortTitle', 'Restore Working Set'),
			toggled: {
				condition: isChatRequestCheckpointed,
				title: localize2('chat.restoreWorkingSet.title', 'Using Working Set').value,
				tooltip: localize2('chat.restoreWorkingSet.tooltip', 'Toggle to use the working set state from an earlier request in your next edit').value
			},
			precondition: ContextKeyExpr.and(applyingChatEditsContextKey.negate(), CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			menu: {
				id: MenuId.ChatMessageFooter,
				group: 'navigation',
				order: 1000,
				when: ContextKeyExpr.false()
				// when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_RESPONSE, ContextKeyExpr.notIn(CONTEXT_ITEM_ID.key, CONTEXT_LAST_ITEM_ID.key)
			}
		});
	}

	override run(accessor: ServicesAccessor, ...args: any[]): void {
		const chatEditingService = accessor.get(IChatEditingService);
		const item = args[0];
		if (!isResponseVM(item)) {
			return;
		}

		const { session, requestId } = item.model;
		const shouldUnsetCheckpoint = requestId === session.checkpoint?.id;
		if (shouldUnsetCheckpoint) {
			// Unset the existing checkpoint
			session.setCheckpoint(undefined);
		} else {
			session.setCheckpoint(requestId);
		}

		// The next request is associated with the working set snapshot representing
		// the 'good state' from this checkpointed request
		const chatService = accessor.get(IChatService);
		const chatModel = chatService.getSession(item.sessionId);
		const chatRequests = chatModel?.getRequests();
		const snapshot = chatRequests?.find((v, i) => i > 0 && chatRequests[i - 1]?.id === requestId);
		if (!shouldUnsetCheckpoint && snapshot !== undefined) {
			chatEditingService.restoreSnapshot(snapshot.id);
		} else if (shouldUnsetCheckpoint) {
			chatEditingService.restoreSnapshot(undefined);
		}
	}
});

registerAction2(class RemoveAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.undoEdits',
			title: localize2('chat.undoEdits.label', "Undo Edits"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.trashcan,
			keybinding: {
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
				when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_IN_CHAT_SESSION, CONTEXT_IN_CHAT_INPUT.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_RESPONSE)
				},
				{
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_REQUEST)
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		let item: ChatTreeItem | undefined = args[0];
		if (!isResponseVM(item)) {
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		const chatService = accessor.get(IChatService);
		const chatModel = chatService.getSession(item.sessionId);
		if (chatModel?.initialLocation !== ChatAgentLocation.EditingSession) {
			return;
		}

		const requestId = isRequestVM(item) ? item.id :
			isResponseVM(item) ? item.requestId : undefined;

		if (requestId) {
			const dialogService = accessor.get(IDialogService);
			const chatEditingService = accessor.get(IChatEditingService);
			const chatRequests = chatModel.getRequests();
			const itemIndex = chatRequests.findIndex(request => request.id === requestId);
			const editsToUndo = chatRequests.length - itemIndex;

			const confirmation = await dialogService.confirm({
				title: editsToUndo === 1
					? localize('chat.removeLast.confirmation.title', "Do you want to undo your last edit?")
					: localize('chat.remove.confirmation.title', "Do you want to undo {0} edits?", editsToUndo),
				message: editsToUndo === 1
					? localize('chat.removeLast.confirmation.message', "This will remove your last request and undo the edits it made to your working set.")
					: localize('chat.remove.confirmation.message', "This will remove all subsequent requests and undo the edits they made to your working set."),
				primaryButton: localize('chat.remove.confirmation.primaryButton', "Yes"),
				type: 'info'
			});

			if (confirmation.confirmed) {
				// Restore the snapshot to what it was before the request(s) that we deleted
				const snapshotRequestId = chatRequests[itemIndex].id;
				await chatEditingService.restoreSnapshot(snapshotRequestId);

				// Remove the request and all that come after it
				for (const request of chatRequests.slice(itemIndex)) {
					await chatService.removeRequest(item.sessionId, request.id);
				}
			}
		}
	}
});
