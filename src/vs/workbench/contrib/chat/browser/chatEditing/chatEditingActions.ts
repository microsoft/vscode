/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { GroupsOrder, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_LOCATION, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT, CONTEXT_IN_CHAT_SESSION, CONTEXT_ITEM_ID, CONTEXT_LAST_ITEM_ID, CONTEXT_REQUEST, CONTEXT_RESPONSE } from '../../common/chatContextKeys.js';
import { applyingChatEditsContextKey, applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, isChatRequestCheckpointed, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../chat.js';

abstract class WorkingSetAction extends Action2 {
	run(accessor: ServicesAccessor, ...args: any[]) {
		const chatEditingService = accessor.get(IChatEditingService);
		const currentEditingSession = chatEditingService.currentEditingSession;
		if (!currentEditingSession) {
			return;
		}

		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;
		if (chatWidget?.location !== ChatAgentLocation.EditingSession) {
			return;
		}

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
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
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

registerAction2(class OpenFileInDiffAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.openFileInDiff',
			title: localize2('open.fileInDiff', 'Open Changes in Diff Editor'),
			icon: Codicon.diffSingle,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 2,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, _chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		for (const uri of uris) {
			const editedFile = currentEditingSession.entries.get().find((e) => e.modifiedURI.toString() === uri.toString());
			if (editedFile?.state.get() === WorkingSetEntryState.Modified) {
				await editorService.openEditor({
					original: { resource: URI.from(editedFile.originalURI, true) },
					modified: { resource: URI.from(editedFile.modifiedURI, true) },
				});
			} else {
				await editorService.openEditor({ resource: uri });
			}
		}
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
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Modified),
				order: 0,
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
				order: 2,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
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

	constructor() {
		super({
			id: 'chatEditing.acceptAllFiles',
			title: localize('accept', 'Accept'),
			icon: Codicon.check,
			tooltip: localize('acceptAllEdits', 'Accept All Edits'),
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), hasUndecidedChatEditingResourceContextKey),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), hasUndecidedChatEditingResourceContextKey, CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_IN_CHAT_INPUT),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
					id: MenuId.EditorTitle,
					order: 0,
					group: 'navigation',
				},
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.or(hasAppliedChatEditsContextKey.negate(), ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession)))))
				}
			]
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

	constructor() {
		super({
			id: 'chatEditing.discardAllFiles',
			title: localize('discard', 'Discard'),
			icon: Codicon.discard,
			tooltip: localize('discardAllEdits', 'Discard All Edits'),
			precondition: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), hasUndecidedChatEditingResourceContextKey),
			menu: [
				{
					when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
					id: MenuId.EditorTitle,
					order: 1,
					group: 'navigation',
				},
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.or(hasAppliedChatEditsContextKey.negate(), ContextKeyExpr.and(CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), hasUndecidedChatEditingResourceContextKey)))
				}
			],
			keybinding: {
				when: ContextKeyExpr.and(CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(), hasUndecidedChatEditingResourceContextKey, CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_IN_CHAT_INPUT, CONTEXT_CHAT_INPUT_HAS_TEXT.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
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
	static readonly ID = 'chatEditing.viewChanges';
	static readonly LABEL = localize('chatEditing.viewChanges', 'View All Edits');

	constructor() {
		super({
			id: ChatEditingShowChangesAction.ID,
			title: ChatEditingShowChangesAction.LABEL,
			tooltip: ChatEditingShowChangesAction.LABEL,
			f1: false,
			icon: Codicon.diffMultiple,
			precondition: hasUndecidedChatEditingResourceContextKey,
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.or(hasAppliedChatEditsContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession))))
				}
			],
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
			id: 'workbench.action.chat.addSelectedFilesToWorkingSet',
			title: localize2('workbench.action.chat.addSelectedFilesToWorkingSet.label', "Add Selected Files to Working Set"),
			icon: Codicon.attach,
			category: CHAT_CATEGORY,
			precondition: CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession),
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
			chatEditingService?.currentEditingSessionObs.get()?.addFileToWorkingSet(file);
		}
	}
});


registerAction2(class RestoreWorkingSetAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.restoreFile',
			title: localize2('chat.restoreSnapshot.label', 'Restore File Snapshot'),
			f1: false,
			icon: Codicon.target,
			shortTitle: localize2('chat.restoreSnapshot.shortTitle', 'Restore Snapshot'),
			toggled: {
				condition: isChatRequestCheckpointed,
				title: localize2('chat.restoreSnapshot.title', 'Using Snapshot').value,
				tooltip: localize('chat.restoreSnapshot.tooltip', 'Toggle to use a previous snapshot of an edited file in your next request')
			},
			precondition: ContextKeyExpr.and(applyingChatEditsContextKey.negate(), CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate()),
			menu: {
				id: MenuId.ChatMessageFooter,
				group: 'navigation',
				order: 1000,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('config.chat.editing.experimental.enableRestoreFile', true), CONTEXT_CHAT_LOCATION.isEqualTo(ChatAgentLocation.EditingSession), CONTEXT_RESPONSE, ContextKeyExpr.notIn(CONTEXT_ITEM_ID.key, CONTEXT_LAST_ITEM_ID.key))
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
			icon: Codicon.x,
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
		if (!isResponseVM(item) && !isRequestVM(item)) {
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
			const configurationService = accessor.get(IConfigurationService);
			const dialogService = accessor.get(IDialogService);
			const chatEditingService = accessor.get(IChatEditingService);
			const chatRequests = chatModel.getRequests();
			const itemIndex = chatRequests.findIndex(request => request.id === requestId);
			const editsToUndo = chatRequests.length - itemIndex;

			const requestsToRemove = chatRequests.slice(itemIndex);
			const requestIdsToRemove = new Set(requestsToRemove.map(request => request.id));
			const entriesModifiedInRequestsToRemove = chatEditingService.currentEditingSessionObs.get()?.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
			const shouldPrompt = entriesModifiedInRequestsToRemove.length > 0 && configurationService.getValue('chat.editing.confirmEditRequestRemoval') === true;

			let message: string;
			if (editsToUndo === 1) {
				if (entriesModifiedInRequestsToRemove.length === 1) {
					message = localize('chat.removeLast.confirmation.message2', "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
				} else {
					message = localize('chat.removeLast.confirmation.multipleEdits.message', "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
				}
			} else {
				if (entriesModifiedInRequestsToRemove.length === 1) {
					message = localize('chat.remove.confirmation.message2', "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
				} else {
					message = localize('chat.remove.confirmation.multipleEdits.message', "This will remove all subsequent requests and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
				}
			}

			const confirmation = shouldPrompt
				? await dialogService.confirm({
					title: editsToUndo === 1
						? localize('chat.removeLast.confirmation.title', "Do you want to undo your last edit?")
						: localize('chat.remove.confirmation.title', "Do you want to undo {0} edits?", editsToUndo),
					message: message,
					primaryButton: localize('chat.remove.confirmation.primaryButton', "Yes"),
					checkbox: { label: localize('chat.remove.confirmation.checkbox', "Don't ask again"), checked: false },
					type: 'info'
				})
				: { confirmed: true };

			if (!confirmation.confirmed) {
				return;
			}

			if (confirmation.checkboxChecked) {
				await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
			}

			// Restore the snapshot to what it was before the request(s) that we deleted
			const snapshotRequestId = chatRequests[itemIndex].id;
			await chatEditingService.restoreSnapshot(snapshotRequestId);

			// Remove the request and all that come after it
			for (const request of requestsToRemove) {
				await chatService.removeRequest(item.sessionId, request.id);
			}
		}
	}
});

registerAction2(class OpenWorkingSetHistoryAction extends Action2 {

	static readonly id = 'chat.openFileSnapshot';
	constructor() {
		super({
			id: OpenWorkingSetHistoryAction.id,
			title: localize('chat.openSnapshot.label', "Open File Snapshot"),
			menu: [{
				id: MenuId.ChatEditingCodeBlockContext,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.notIn(CONTEXT_ITEM_ID.key, CONTEXT_LAST_ITEM_ID.key),
			},]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const context: { sessionId: string; requestId: string; uri: URI } | undefined = args[0];
		if (!context?.sessionId) {
			return;
		}

		const chatService = accessor.get(IChatService);
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const chatModel = chatService.getSession(context.sessionId);
		const requests = chatModel?.getRequests();
		if (!requests) {
			return;
		}
		const snapshotRequestIndex = requests?.findIndex((v, i) => i > 0 && requests[i - 1]?.id === context.requestId);
		if (snapshotRequestIndex < 1) {
			return;
		}
		const snapshotRequestId = requests[snapshotRequestIndex]?.id;
		if (snapshotRequestId) {
			const snapshot = chatEditingService.getSnapshotUri(snapshotRequestId, context.uri);
			if (snapshot) {
				const editor = await editorService.openEditor({ resource: snapshot, label: localize('chatEditing.snapshot', '{0} (Snapshot {1})', basename(context.uri), snapshotRequestIndex - 1), options: { transient: true, activation: EditorActivation.ACTIVATE } });
				if (isCodeEditor(editor)) {
					editor.updateOptions({ readOnly: true });
				}
			}
		}
	}
});
