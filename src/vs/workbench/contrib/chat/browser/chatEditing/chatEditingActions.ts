/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
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
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { isChatViewTitleActionContext } from '../../common/chatActions.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { applyingChatEditsFailedContextKey, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingResourceContextKey, chatEditingWidgetFileStateContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, IChatEditingSession, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../chat.js';

export abstract class EditingSessionAction extends Action2 {

	constructor(opts: Readonly<IAction2Options>) {
		super({
			category: CHAT_CATEGORY,
			...opts
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		const context = getEditingSessionContext(accessor, args);
		if (!context || !context.editingSession) {
			return;
		}

		return this.runEditingSessionAction(accessor, context.editingSession, context.chatWidget, ...args);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	abstract runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]): any;
}

/**
 * Resolve view title toolbar context. If none, return context from the lastFocusedWidget.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEditingSessionContext(accessor: ServicesAccessor, args: any[]): { editingSession?: IChatEditingSession; chatWidget: IChatWidget } | undefined {
	const arg0 = args.at(0);
	const context = isChatViewTitleActionContext(arg0) ? arg0 : undefined;

	const chatWidgetService = accessor.get(IChatWidgetService);
	const chatEditingService = accessor.get(IChatEditingService);
	let chatWidget = context ? chatWidgetService.getWidgetBySessionResource(context.sessionResource) : undefined;
	if (!chatWidget) {
		chatWidget = chatWidgetService.lastFocusedWidget ?? chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(w => w.supportsChangingModes);
	}

	if (!chatWidget?.viewModel) {
		return;
	}

	const editingSession = chatEditingService.getEditingSession(chatWidget.viewModel.model.sessionResource);
	return { editingSession, chatWidget };
}


abstract class WorkingSetAction extends EditingSessionAction {

	runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]) {

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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	abstract runWorkingSetAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget | undefined, ...uris: URI[]): any;
}

registerAction2(class OpenFileInDiffAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.openFileInDiff',
			title: localize2('open.fileInDiff', 'Open Changes in Diff Editor'),
			icon: Codicon.diffSingle,
			menu: [{
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
				order: 2,
				group: 'navigation'
			}],
		});
	}

	async runWorkingSetAction(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession, _chatWidget: IChatWidget, ...uris: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);


		for (const uri of uris) {

			let pane: IEditorPane | undefined = editorService.activeEditorPane;
			if (!pane) {
				pane = await editorService.openEditor({ resource: uri });
			}

			if (!pane) {
				return;
			}

			const editedFile = currentEditingSession.getEntry(uri);
			editedFile?.getEditorIntegration(pane).toggleDiff(undefined, true);
		}
	}
});

registerAction2(class AcceptAction extends WorkingSetAction {
	constructor() {
		super({
			id: 'chatEditing.acceptFile',
			title: localize2('accept.file', 'Keep'),
			icon: Codicon.check,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 0,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
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
			title: localize2('discard.file', 'Undo'),
			icon: Codicon.discard,
			menu: [{
				when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME), ContextKeyExpr.notIn(chatEditingResourceContextKey.key, decidedChatEditingResourceContextKey.key)),
				id: MenuId.MultiDiffEditorFileToolbar,
				order: 2,
				group: 'navigation',
			}, {
				id: MenuId.ChatEditingWidgetModifiedFilesToolbar,
				when: ContextKeyExpr.equals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
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
			title: localize('accept', 'Keep'),
			icon: Codicon.check,
			tooltip: localize('acceptAllEdits', 'Keep All Edits'),
			precondition: hasUndecidedChatEditingResourceContextKey,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [

				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey))
				}
			]
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]) {
		await editingSession.accept();
	}
}
registerAction2(ChatEditingAcceptAllAction);

export class ChatEditingDiscardAllAction extends EditingSessionAction {

	constructor() {
		super({
			id: 'chatEditing.discardAllFiles',
			title: localize('discard', 'Undo'),
			icon: Codicon.discard,
			tooltip: localize('discardAllEdits', 'Undo All Edits'),
			precondition: hasUndecidedChatEditingResourceContextKey,
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), hasUndecidedChatEditingResourceContextKey)
				}
			],
			keybinding: {
				when: ContextKeyExpr.and(hasUndecidedChatEditingResourceContextKey, ChatContextKeys.inChatInput, ChatContextKeys.inputHasText.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Backspace,
			},
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]) {
		await discardAllEditsWithConfirmation(accessor, editingSession);
	}
}
registerAction2(ChatEditingDiscardAllAction);

export async function discardAllEditsWithConfirmation(accessor: ServicesAccessor, currentEditingSession: IChatEditingSession): Promise<boolean> {

	const dialogService = accessor.get(IDialogService);

	// Ask for confirmation if there are any edits
	const entries = currentEditingSession.entries.get();
	if (entries.length > 0) {
		const confirmation = await dialogService.confirm({
			title: localize('chat.editing.discardAll.confirmation.title', "Undo all edits?"),
			message: entries.length === 1
				? localize('chat.editing.discardAll.confirmation.oneFile', "This will undo changes made in {0}. Do you want to proceed?", basename(entries[0].modifiedURI))
				: localize('chat.editing.discardAll.confirmation.manyFiles', "This will undo changes made in {0} files. Do you want to proceed?", entries.length),
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

export class ChatEditingShowChangesAction extends EditingSessionAction {
	static readonly ID = 'chatEditing.viewChanges';
	static readonly LABEL = localize('chatEditing.viewChanges', 'View All Edits');

	constructor() {
		super({
			id: ChatEditingShowChangesAction.ID,
			title: { value: ChatEditingShowChangesAction.LABEL, original: ChatEditingShowChangesAction.LABEL },
			tooltip: ChatEditingShowChangesAction.LABEL,
			f1: true,
			icon: Codicon.diffMultiple,
			precondition: hasUndecidedChatEditingResourceContextKey,
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey))
				}
			],
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]): Promise<void> {
		await editingSession.show();
	}
}
registerAction2(ChatEditingShowChangesAction);

export class ViewAllSessionChangesAction extends Action2 {
	static readonly ID = 'chatEditing.viewAllSessionChanges';

	constructor() {
		super({
			id: ViewAllSessionChangesAction.ID,
			title: localize2('chatEditing.viewAllSessionChanges', 'View All Changes'),
			icon: Codicon.diffMultiple,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.hasAgentSessionChanges,
			menu: [
				{
					id: MenuId.ChatEditingSessionChangesToolbar,
					group: 'navigation',
					order: 10,
					when: ChatContextKeys.hasAgentSessionChanges
				}
			],
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const agentSessionsService = accessor.get(IAgentSessionsService);
		const commandService = accessor.get(ICommandService);

		const chatWidget = chatWidgetService.lastFocusedWidget ?? chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(w => w.supportsChangingModes);
		if (!chatWidget?.viewModel) {
			return;
		}

		const sessionResource = chatWidget.viewModel.model.sessionResource;
		const session = agentSessionsService.getSession(sessionResource);
		const changes = session?.changes;
		if (!(changes instanceof Array)) {
			return;
		}

		const resources = changes
			.filter(d => d.originalUri)
			.map(d => ({ originalUri: d.originalUri!, modifiedUri: d.modifiedUri }));

		if (resources.length > 0) {
			await commandService.executeCommand('_workbench.openMultiDiffEditor', {
				title: localize('chatEditing.allChanges.title', 'All Session Changes'),
				resources,
			});
		}
	}
}
registerAction2(ViewAllSessionChangesAction);

async function restoreSnapshotWithConfirmation(accessor: ServicesAccessor, item: ChatTreeItem): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);
	const chatWidgetService = accessor.get(IChatWidgetService);
	const widget = chatWidgetService.getWidgetBySessionResource(item.sessionResource);
	const chatService = accessor.get(IChatService);
	const chatModel = chatService.getSession(item.sessionResource);
	if (!chatModel) {
		return;
	}

	const session = chatModel.editingSession;
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
		const entriesModifiedInRequestsToRemove = session.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
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
			widget?.viewModel?.model.setCheckpoint(undefined);
			return;
		}

		if (confirmation.checkboxChecked) {
			await configurationService.updateValue('chat.editing.confirmEditRequestRemoval', false);
		}

		// Restore the snapshot to what it was before the request(s) that we deleted
		const snapshotRequestId = chatRequests[itemIndex].id;
		await session.restoreSnapshot(snapshotRequestId, undefined);
	}
}

registerAction2(class RemoveAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.undoEdits',
			title: localize2('chat.undoEdits.label', "Undo Requests"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.discard,
			keybinding: {
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'input').negate(), ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, false), ChatContextKeys.lockedToCodingAgent.negate()),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		let item = args[0] as ChatTreeItem | undefined;
		const chatWidgetService = accessor.get(IChatWidgetService);
		const configurationService = accessor.get(IConfigurationService);
		const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		await restoreSnapshotWithConfirmation(accessor, item);

		if (isRequestVM(item) && configurationService.getValue('chat.undoRequests.restoreInput')) {
			widget?.focusInput();
			widget?.input.setValue(item.messageText, false);
		}
	}
});

registerAction2(class RestoreCheckpointAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.restoreCheckpoint',
			title: localize2('chat.restoreCheckpoint.label', "Restore Checkpoint"),
			tooltip: localize2('chat.restoreCheckpoint.tooltip', "Restores workspace and chat to this point"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					id: MenuId.ChatMessageCheckpoint,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.lockedToCodingAgent.negate())
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		let item = args[0] as ChatTreeItem | undefined;
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		if (isRequestVM(item)) {
			widget?.focusInput();
			widget?.input.setValue(item.messageText, false);
		}

		widget?.viewModel?.model.setCheckpoint(item.id);
		await restoreSnapshotWithConfirmation(accessor, item);
	}
});

registerAction2(class RestoreLastCheckpoint extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.restoreLastCheckpoint',
			title: localize2('chat.restoreLastCheckpoint.label', "Restore to Last Checkpoint"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.discard,
			menu: [
				{
					id: MenuId.ChatMessageFooter,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(ContextKeyExpr.in(ChatContextKeys.itemId.key, ChatContextKeys.lastItemId.key), ContextKeyExpr.equals(`config.${ChatConfiguration.CheckpointsEnabled}`, true), ChatContextKeys.lockedToCodingAgent.negate()),
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		let item = args[0] as ChatTreeItem | undefined;
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatService = accessor.get(IChatService);
		const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		const chatModel = chatService.getSession(item.sessionResource);
		if (!chatModel) {
			return;
		}

		const session = chatModel.editingSession;
		if (!session) {
			return;
		}

		await restoreSnapshotWithConfirmation(accessor, item);

		if (isResponseVM(item)) {
			widget?.viewModel?.model.setCheckpoint(item.requestId);
			const request = chatModel.getRequests().find(request => request.id === item.requestId);
			if (request) {
				widget?.focusInput();
				widget?.input.setValue(request.message.text, false);
			}
		}
	}
});

registerAction2(class EditAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.editRequests',
			title: localize2('chat.editRequests.label', "Edit Request"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.edit,
			keybinding: {
				primary: KeyCode.Enter,
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, EditorContextKeys.textInputFocus.negate()),
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: [
				{
					id: MenuId.ChatMessageTitle,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'hover'), ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, 'input')))
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		let item = args[0] as ChatTreeItem | undefined;
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = (isChatTreeItem(item) && chatWidgetService.getWidgetBySessionResource(item.sessionResource)) || chatWidgetService.lastFocusedWidget;
		if (!isResponseVM(item) && !isRequestVM(item)) {
			item = widget?.getFocus();
		}

		if (!item) {
			return;
		}

		if (isRequestVM(item)) {
			widget?.startEditing(item.id);
		}
	}
});

export interface ChatEditingActionContext {
	readonly sessionResource: URI;
	readonly requestId: string;
	readonly uri: URI;
	readonly stopId: string | undefined;
}

registerAction2(class OpenWorkingSetHistoryAction extends Action2 {

	static readonly id = 'chat.openFileUpdatedBySnapshot';
	constructor() {
		super({
			id: OpenWorkingSetHistoryAction.id,
			title: localize('chat.openFileUpdatedBySnapshot.label', "Open File"),
			menu: [{
				id: MenuId.ChatEditingCodeBlockContext,
				group: 'navigation',
				order: 0,
			},]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const context = args[0] as ChatEditingActionContext | undefined;
		if (!context?.sessionResource) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: context.uri });
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
				order: 1,
			},]
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const context = args[0] as ChatEditingActionContext | undefined;
		if (!context?.sessionResource) {
			return;
		}

		const chatService = accessor.get(IChatService);
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const chatModel = chatService.getSession(context.sessionResource);
		if (!chatModel) {
			return;
		}

		const snapshot = chatEditingService.getEditingSession(chatModel.sessionResource)?.getSnapshotUri(context.requestId, context.uri, context.stopId);
		if (snapshot) {
			const editor = await editorService.openEditor({ resource: snapshot, label: localize('chatEditing.snapshot', '{0} (Snapshot)', basename(context.uri)), options: { activation: EditorActivation.ACTIVATE } });
			if (isCodeEditor(editor)) {
				editor.updateOptions({ readOnly: true });
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
				when: ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask), EditorContextKeys.hasReferenceProvider)
			}
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]): Promise<void> {
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
			attachments.push(chatWidget.attachmentModel.asFileVariableEntry(reference.uri));
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

export class ViewPreviousEditsAction extends EditingSessionAction {
	static readonly Id = 'chatEditing.viewPreviousEdits';
	static readonly Label = localize('chatEditing.viewPreviousEdits', 'View Previous Edits');

	constructor() {
		super({
			id: ViewPreviousEditsAction.Id,
			title: { value: ViewPreviousEditsAction.Label, original: ViewPreviousEditsAction.Label },
			tooltip: ViewPreviousEditsAction.Label,
			f1: true,
			icon: Codicon.diffMultiple,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasUndecidedChatEditingResourceContextKey.negate()),
			menu: [
				{
					id: MenuId.ChatEditingWidgetToolbar,
					group: 'navigation',
					order: 4,
					when: ContextKeyExpr.and(applyingChatEditsFailedContextKey.negate(), ContextKeyExpr.and(hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey.negate()))
				}
			],
		});
	}

	override async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession, chatWidget: IChatWidget, ...args: unknown[]): Promise<void> {
		await editingSession.show(true);
	}
}
registerAction2(ViewPreviousEditsAction);

/**
 * Workbench command to explore accepting working set changes from an extension. Executing
 * the command will accept the changes for the provided resources across all edit sessions.
 */
CommandsRegistry.registerCommand('_chat.editSessions.accept', async (accessor: ServicesAccessor, resources: UriComponents[]) => {
	if (resources.length === 0) {
		return;
	}

	const uris = resources.map(resource => URI.revive(resource));
	const chatEditingService = accessor.get(IChatEditingService);
	for (const editingSession of chatEditingService.editingSessionsObs.get()) {
		await editingSession.accept(...uris);
	}
});
