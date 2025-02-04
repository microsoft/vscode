/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { isLocation, Location } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { GroupsOrder, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatAgentLocation } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingResourceContextKey, chatEditingWidgetFileReadonlyContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, WorkingSetEntryRemovalReason, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../chat.js';
import { EditsAttachmentModel } from '../chatAttachmentModel.js';

export abstract class EditingSessionAction extends Action2 {

	constructor(opts: Readonly<IAction2Options>) {
		super({
			category: CHAT_CATEGORY,
			...opts
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const chatEditingService = accessor.get(IChatEditingService);
		const chatWidget = accessor.get(IChatWidgetService).lastFocusedWidget;

		if (chatWidget?.location !== ChatAgentLocation.EditingSession || !chatWidget.viewModel) {
			return;
		}

		const chatSessionId = chatWidget.viewModel.model.sessionId;
		const editingSession = chatEditingService.getEditingSession(chatSessionId);

		if (!editingSession) {
			return;
		}

		return this.runEditingSessionAction(accessor, editingSession, chatWidget, ...args);
	}

	abstract runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]): any;
}


abstract class WorkingSetAction extends EditingSessionAction {

	runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]) {

		const uris: URI[] = [];
		if (URI.isUri(args[0])) {
			uris.push(args[0]);
		} else if (chatWidget) {
			uris.push(...chatWidget.input.selectedElements);
		}
		if (!uris.length) {
			return;
		}

		return this.runWorkingSetAction(accessor, editingSession, chatWidget, ...uris);
	}

	abstract runWorkingSetAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget | undefined, ...uris: URI[]): any;
}

registerAction2(class MarkFileAsReadonly extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.markFileAsReadonly',
			title: localize2('markFileAsReadonly', 'Mark as read-only'),
			icon: Codicon.lock,
			toggled: chatEditingWidgetFileReadonlyContextKey,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.and(
					chatEditingAgentSupportsReadonlyReferencesContextKey,
					ContextKeyExpr.or(
						ContextKeyExpr.equals(chatEditingWidgetFileReadonlyContextKey.key, true),
						ContextKeyExpr.equals(chatEditingWidgetFileReadonlyContextKey.key, false),
					)
				),
				order: 10,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(_accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, _chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		for (const uri of uris) {
			currentEditingSession.markIsReadonly(uri);
		}
	}
});

registerAction2(class AddFileToWorkingSet extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.addFileToWorkingSet',
			title: localize2('addFileToWorkingSet', 'Add File'),
			icon: Codicon.plus,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.or(ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Transient), ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Suggested)),
				order: 0,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(_accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, _chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		for (const uri of uris) {
			currentEditingSession.addFileToWorkingSet(uri);
		}
	}
});

registerAction2(class RemoveFileFromWorkingSet extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.removeFileFromWorkingSet',
			title: localize2('removeFileFromWorkingSet', 'Remove File'),
			icon: Codicon.close,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				// when: ContextKeyExpr.or(ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Attached), ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Suggested), ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, WorkingSetEntryState.Transient)),
				order: 5,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		const dialogService = accessor.get(IDialogService);

		const pendingEntries = currentEditingSession.entries.get().filter((entry) => uris.includes(entry.modifiedURI) && entry.state.get() === WorkingSetEntryState.Modified);
		if (pendingEntries.length > 0) {
			// Ask for confirmation if there are any pending edits
			const file = pendingEntries.length > 1
				? localize('chat.editing.removeFile.confirmationmanyFiles', "{0} files", pendingEntries.length)
				: basename(pendingEntries[0].modifiedURI);
			const confirmation = await dialogService.confirm({
				title: localize('chat.editing.removeFile.confirmation.title', "Remove {0} from working set?", file),
				message: localize('chat.editing.removeFile.confirmation.message', "This will remove {0} from your working set and undo the edits made to it. Do you want to proceed?", file),
				primaryButton: localize('chat.editing.removeFile.confirmation.primaryButton', "Yes"),
				type: 'info'
			});
			if (!confirmation.confirmed) {
				return;
			}
		}

		// Remove from working set
		await currentEditingSession.reject(...uris);
		currentEditingSession.remove(WorkingSetEntryRemovalReason.User, ...uris);

		// Remove from chat input part
		for (const uri of uris) {
			chatWidget.attachmentModel.delete(uri.toString());
		}

		// If there are now only suggested files in the working set, also clear those
		const entries = [...currentEditingSession.workingSet.entries()];
		const suggestedFiles = entries.filter(([_, state]) => state.state === WorkingSetEntryState.Suggested);
		if (suggestedFiles.length === entries.length && !chatWidget.attachmentModel.attachments.find((v) => v.isFile && URI.isUri(v.value))) {
			currentEditingSession.remove(WorkingSetEntryRemovalReason.Programmatic, ...entries.map(([uri,]) => uri));
		}
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
			const editedFile = currentEditingSession.getEntry(uri);
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

export class ChatEditingAcceptAllAction extends EditingSessionAction {

	constructor() {
		super({
			id: 'chatEditing.acceptAllFiles',
			title: localize('accept', 'Accept'),
			icon: Codicon.check,
			tooltip: localize('acceptAllEdits', 'Accept All Edits'),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey, ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), ChatContextKeys.inChatInput),
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
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession))))
				}
			]
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]) {
		await editingSession.accept();
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
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey),
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
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), hasUndecidedChatEditingResourceContextKey))
				}
			],
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate(), hasUndecidedChatEditingResourceContextKey, ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), ChatContextKeys.inChatInput, ChatContextKeys.inputHasText.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		await discardAllEditsWithConfirmation(accessor);
	}
}
registerAction2(ChatEditingDiscardAllAction);

export async function discardAllEditsWithConfirmation(accessor: ServicesAccessor): Promise<boolean> {
	const chatEditingService = accessor.get(IChatEditingService);
	const dialogService = accessor.get(IDialogService);
	const currentEditingSession = chatEditingService.globalEditingSession;
	if (!currentEditingSession) {
		return false;
	}

	// Ask for confirmation if there are any edits
	const entries = currentEditingSession.entries.get();
	if (entries.length > 0) {
		const confirmation = await dialogService.confirm({
			title: localize('chat.editing.discardAll.confirmation.title', "Discard all edits?"),
			message: entries.length === 1
				? localize('chat.editing.discardAll.confirmation.oneFile', "This will undo changes made by {0} in {1}. Do you want to proceed?", 'Copilot Edits', basename(entries[0].modifiedURI))
				: localize('chat.editing.discardAll.confirmation.manyFiles', "This will undo changes made by {0} in {1} files. Do you want to proceed?", 'Copilot Edits', entries.length),
			primaryButton: localize('chat.editing.discardAll.confirmation.primaryButton', "Yes"),
			type: 'info'
		});
		if (!confirmation.confirmed) {
			return false;
		}
	}

	await currentEditingSession.reject();
	return true;
}

export class ChatEditingRemoveAllFilesAction extends EditingSessionAction {
	static readonly ID = 'chatEditing.clearWorkingSet';

	constructor() {
		super({
			id: ChatEditingRemoveAllFilesAction.ID,
			title: localize('clearWorkingSet', 'Clear Working Set'),
			icon: Codicon.clearAll,
			tooltip: localize('clearWorkingSet', 'Clear Working Set'),
			precondition: ContextKeyExpr.and(ChatContextKeys.requestInProgress.negate()),
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 5,
					when: ContextKeyExpr.and(hasAppliedChatEditsContextKey.negate(), ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession))
				}
			]
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]): Promise<void> {
		// Remove all files from working set
		const uris = [...editingSession.workingSet.keys()];
		editingSession.remove(WorkingSetEntryRemovalReason.User, ...uris);

		// Remove all file attachments
		const fileAttachments = chatWidget.attachmentModel ? [...(chatWidget.attachmentModel as EditsAttachmentModel).excludedFileAttachments, ...(chatWidget.attachmentModel as EditsAttachmentModel).fileAttachments] : [];
		const attachmentIdsToRemove = fileAttachments.map(attachment => (attachment.value as URI).toString());
		chatWidget.attachmentModel.delete(...attachmentIdsToRemove);
	}
}
registerAction2(ChatEditingRemoveAllFilesAction);

export class ChatEditingShowChangesAction extends EditingSessionAction {
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
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession)))
				}
			],
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]): Promise<void> {
		await editingSession.show();
	}
}
registerAction2(ChatEditingShowChangesAction);

registerAction2(class AddFilesToWorkingSetAction extends EditingSessionAction {
	constructor() {
		super({
			id: 'workbench.action.chat.addSelectedFilesToWorkingSet',
			title: localize2('workbench.action.chat.addSelectedFilesToWorkingSet.label', "Add Selected Files to Working Set"),
			icon: Codicon.attach,
			precondition: ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession),
			f1: true
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]): Promise<void> {
		const listService = accessor.get(IListService);
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
			editingSession.addFileToWorkingSet(file);
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
				when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), ChatContextKeys.isRequest)
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



		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const chatEditingService = accessor.get(IChatEditingService);
		const chatService = accessor.get(IChatService);
		const chatModel = chatService.getSession(item.sessionId);
		if (chatModel?.initialLocation !== ChatAgentLocation.EditingSession) {
			return;
		}

		const session = chatEditingService.getEditingSession(chatModel.sessionId);
		if (!session) {
			return;
		}

		const requestId = isRequestVM(item) ? item.id :
			isResponseVM(item) ? item.requestId : undefined;

		if (requestId) {
			const chatRequests = chatModel.getRequests();
			const itemIndex = chatRequests.findIndex(request => request.id === requestId);
			const editsToUndo = chatRequests.length - itemIndex;

			const requestsToRemove = chatRequests.slice(itemIndex);
			const requestIdsToRemove = new Set(requestsToRemove.map(request => request.id));
			const entriesModifiedInRequestsToRemove = chatEditingService.globalEditingSessionObs.get()?.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
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
			await session.restoreSnapshot(snapshotRequestId);

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
			precondition: ContextKeyExpr.notIn(ChatContextKeys.itemId.key, ChatContextKeys.lastItemId.key),
			menu: [{
				id: MenuId.ChatEditingCodeBlockContext,
				group: 'navigation',
				order: 0,
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
		if (!chatModel) {
			return;
		}
		const requests = chatModel.getRequests();
		const snapshotRequestIndex = requests.findIndex((v, i) => i > 0 && requests[i - 1]?.id === context.requestId);
		if (snapshotRequestIndex < 1) {
			return;
		}
		const snapshotRequestId = requests[snapshotRequestIndex]?.id;
		if (snapshotRequestId) {
			const snapshot = chatEditingService.getEditingSession(chatModel.sessionId)?.getSnapshotUri(snapshotRequestId, context.uri);
			if (snapshot) {
				const editor = await editorService.openEditor({ resource: snapshot, label: localize('chatEditing.snapshot', '{0} (Snapshot {1})', basename(context.uri), snapshotRequestIndex - 1), options: { transient: true, activation: EditorActivation.ACTIVATE } });
				if (isCodeEditor(editor)) {
					editor.updateOptions({ readOnly: true });
				}
			}
		}
	}
});

registerAction2(class ResolveSymbolsContextAction extends EditingSessionAction {
	constructor() {
		super({
			id: 'workbench.action.edits.addFilesFromReferences',
			title: localize2('addFilesFromReferences', "Add Files From References"),
			f1: false,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatInputSymbolAttachmentContext,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession), EditorContextKeys.hasReferenceProvider)
			}
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: any[]): Promise<void> {
		if (args.length === 0 || !isLocation(args[0])) {
			return;
		}

		const textModelService = accessor.get(ITextModelService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const symbol = args[0] as Location;

		const modelReference = await textModelService.createModelReference(symbol.uri);
		const textModel = modelReference.object.textEditorModel;
		if (!textModel) {
			return;
		}

		const position = new Position(symbol.range.startLineNumber, symbol.range.startColumn);

		const [references, definitions, implementations] = await Promise.all([
			this.getReferences(position, textModel, languageFeaturesService),
			this.getDefinitions(position, textModel, languageFeaturesService),
			this.getImplementations(position, textModel, languageFeaturesService)
		]);

		// Sort the references, definitions and implementations by
		// how important it is that they make it into the working set as it has limited size
		const attachments = [];
		for (const reference of [...definitions, ...implementations, ...references]) {
			attachments.push(chatWidget.attachmentModel.asVariableEntry(reference.uri));
		}

		chatWidget.attachmentModel.addContext(...attachments);
	}

	private async getReferences(position: Position, textModel: ITextModel, languageFeaturesService: ILanguageFeaturesService): Promise<Location[]> {
		const referenceProviders = languageFeaturesService.referenceProvider.all(textModel);

		const references = await Promise.all(referenceProviders.map(async (referenceProvider) => {
			return await referenceProvider.provideReferences(textModel, position, { includeDeclaration: true }, CancellationToken.None) ?? [];
		}));

		return references.flat();
	}

	private async getDefinitions(position: Position, textModel: ITextModel, languageFeaturesService: ILanguageFeaturesService): Promise<Location[]> {
		const definitionProviders = languageFeaturesService.definitionProvider.all(textModel);

		const definitions = await Promise.all(definitionProviders.map(async (definitionProvider) => {
			return await definitionProvider.provideDefinition(textModel, position, CancellationToken.None) ?? [];
		}));

		return definitions.flat();
	}

	private async getImplementations(position: Position, textModel: ITextModel, languageFeaturesService: ILanguageFeaturesService): Promise<Location[]> {
		const implementationProviders = languageFeaturesService.implementationProvider.all(textModel);

		const implementations = await Promise.all(implementationProviders.map(async (implementationProvider) => {
			return await implementationProvider.provideImplementation(textModel, position, CancellationToken.None) ?? [];
		}));

		return implementations.flat();
	}
});
