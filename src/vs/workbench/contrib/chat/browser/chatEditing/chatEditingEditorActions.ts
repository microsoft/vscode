/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, IAction2Options, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { resolveCommandsContext } from '../../../../browser/parts/editor/editorCommandsContext.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor, TEXT_DIFF_EDITOR_ID } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from '../../../notebook/common/notebookContextKeys.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, IChatEditingService, IChatEditingSession, IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { LocalChatSessionUri } from '../../common/chatUri.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ctxCursorInChangeRange, ctxHasEditorModification, ctxIsCurrentlyBeingModified, ctxIsGlobalEditingSession, ctxReviewModeEnabled } from './chatEditingEditorContextKeys.js';


abstract class ChatEditingEditorAction extends Action2 {

	constructor(desc: Readonly<IAction2Options>) {
		super({
			category: CHAT_CATEGORY,
			...desc
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]) {

		const instaService = accessor.get(IInstantiationService);
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);

		const uri = EditorResourceAccessor.getOriginalUri(editorService.activeEditorPane?.input, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!uri || !editorService.activeEditorPane) {
			return;
		}

		const session = chatEditingService.editingSessionsObs.get()
			.find(candidate => candidate.getEntry(uri));

		if (!session) {
			return;
		}

		const entry = session.getEntry(uri)!;
		const ctrl = entry.getEditorIntegration(editorService.activeEditorPane);

		return instaService.invokeFunction(this.runChatEditingCommand.bind(this), session, entry, ctrl, ...args);
	}

	abstract runChatEditingCommand(accessor: ServicesAccessor, session: IChatEditingSession, entry: IModifiedFileEntry, integration: IModifiedFileEntryEditorIntegration, ...args: unknown[]): Promise<void> | void;
}

abstract class NavigateAction extends ChatEditingEditorAction {

	constructor(readonly next: boolean) {
		super({
			id: next
				? 'chatEditor.action.navigateNext'
				: 'chatEditor.action.navigatePrevious',
			title: next
				? localize2('next', 'Go to Next Chat Edit')
				: localize2('prev', 'Go to Previous Chat Edit'),
			icon: next ? Codicon.arrowDown : Codicon.arrowUp,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ctxHasEditorModification),
			keybinding: {
				primary: next
					? KeyMod.Alt | KeyCode.F5
					: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(
					ctxHasEditorModification,
					ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)
				),
			},
			f1: true,
			menu: {
				id: MenuId.ChatEditingEditorContent,
				group: 'navigate',
				order: !next ? 2 : 3,
				when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification)
			}
		});
	}

	override async runChatEditingCommand(accessor: ServicesAccessor, session: IChatEditingSession, entry: IModifiedFileEntry, ctrl: IModifiedFileEntryEditorIntegration): Promise<void> {

		const instaService = accessor.get(IInstantiationService);

		const done = this.next
			? ctrl.next(false)
			: ctrl.previous(false);

		if (done) {
			return;
		}

		const didOpenNext = await instaService.invokeFunction(openNextOrPreviousChange, session, entry, this.next);
		if (didOpenNext) {
			return;
		}

		//ELSE: wrap inside the same file
		this.next
			? ctrl.next(true)
			: ctrl.previous(true);
	}
}

async function openNextOrPreviousChange(accessor: ServicesAccessor, session: IChatEditingSession, entry: IModifiedFileEntry, next: boolean) {

	const editorService = accessor.get(IEditorService);

	const entries = session.entries.get();
	let idx = entries.indexOf(entry);

	let newEntry: IModifiedFileEntry;
	while (true) {
		idx = (idx + (next ? 1 : -1) + entries.length) % entries.length;
		newEntry = entries[idx];
		if (newEntry.state.get() === ModifiedFileEntryState.Modified) {
			break;
		} else if (newEntry === entry) {
			return false;
		}
	}

	const pane = await editorService.openEditor({
		resource: newEntry.modifiedURI,
		options: {
			revealIfOpened: false,
			revealIfVisible: false,
		}
	}, ACTIVE_GROUP);

	if (!pane) {
		return false;
	}

	if (session.entries.get().includes(newEntry)) {
		// make sure newEntry is still valid!
		newEntry.getEditorIntegration(pane).reveal(next);
	}

	return true;
}

abstract class KeepOrUndoAction extends ChatEditingEditorAction {

	constructor(id: string, private _keep: boolean) {
		super({
			id,
			title: _keep
				? localize2('accept', 'Keep Chat Edits')
				: localize2('discard', 'Undo Chat Edits'),
			shortTitle: _keep
				? localize2('accept2', 'Keep')
				: localize2('discard2', 'Undo'),
			tooltip: _keep
				? localize2('accept3', 'Keep Chat Edits in this File')
				: localize2('discard3', 'Undo Chat Edits in this File'),
			precondition: ContextKeyExpr.and(ctxIsGlobalEditingSession, ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
			icon: _keep
				? Codicon.check
				: Codicon.discard,
			f1: true,
			keybinding: {
				when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
				weight: KeybindingWeight.WorkbenchContrib + 10, // win over new-window-action
				primary: _keep
					? KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY
					: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN,
			},
			menu: {
				id: MenuId.ChatEditingEditorContent,
				group: 'a_resolve',
				order: _keep ? 0 : 1,
				when: !_keep ? ctxReviewModeEnabled : undefined
			}
		});
	}

	override async runChatEditingCommand(accessor: ServicesAccessor, session: IChatEditingSession, entry: IModifiedFileEntry, _integration: IModifiedFileEntryEditorIntegration): Promise<void> {

		const instaService = accessor.get(IInstantiationService);

		if (this._keep) {
			session.accept(entry.modifiedURI);
		} else {
			session.reject(entry.modifiedURI);
		}

		await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
	}
}

export class AcceptAction extends KeepOrUndoAction {

	static readonly ID = 'chatEditor.action.accept';

	constructor() {
		super(AcceptAction.ID, true);
	}
}

export class RejectAction extends KeepOrUndoAction {

	static readonly ID = 'chatEditor.action.reject';

	constructor() {
		super(RejectAction.ID, false);
	}
}

const acceptHunkId = 'chatEditor.action.acceptHunk';
const undoHunkId = 'chatEditor.action.undoHunk';
abstract class AcceptRejectHunkAction extends ChatEditingEditorAction {

	constructor(private readonly _accept: boolean) {
		super(
			{
				id: _accept ? acceptHunkId : undoHunkId,
				title: _accept ? localize2('acceptHunk', 'Keep this Change') : localize2('undo', 'Undo this Change'),
				shortTitle: _accept ? localize2('acceptHunkShort', 'Keep') : localize2('undoShort', 'Undo'),
				precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(ctxCursorInChangeRange, ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_CELL_LIST_FOCUSED)),
					weight: KeybindingWeight.WorkbenchContrib + 1,
					primary: _accept
						? KeyMod.CtrlCmd | KeyCode.KeyY
						: KeyMod.CtrlCmd | KeyCode.KeyN
				},
				menu: {
					id: MenuId.ChatEditingEditorHunk,
					order: 1
				}
			}
		);
	}

	override async runChatEditingCommand(accessor: ServicesAccessor, session: IChatEditingSession, entry: IModifiedFileEntry, ctrl: IModifiedFileEntryEditorIntegration, ...args: unknown[]): Promise<void> {

		const instaService = accessor.get(IInstantiationService);

		if (this._accept) {
			await ctrl.acceptNearestChange(args[0] as IModifiedFileEntryChangeHunk | undefined);
		} else {
			await ctrl.rejectNearestChange(args[0] as IModifiedFileEntryChangeHunk | undefined);
		}

		if (entry.changesCount.get() === 0) {
			// no more changes, move to next file
			await instaService.invokeFunction(openNextOrPreviousChange, session, entry, true);
		}
	}
}

export class AcceptHunkAction extends AcceptRejectHunkAction {

	static readonly ID = acceptHunkId;

	constructor() {
		super(true);
	}
}

export class RejectHunkAction extends AcceptRejectHunkAction {

	static readonly ID = undoHunkId;

	constructor() {
		super(false);
	}
}

class ToggleDiffAction extends ChatEditingEditorAction {
	constructor() {
		super({
			id: 'chatEditor.action.toggleDiff',
			title: localize2('diff', 'Toggle Diff Editor for Chat Edits'),
			category: CHAT_CATEGORY,
			toggled: {
				condition: ContextKeyExpr.or(EditorContextKeys.inDiffEditor, ActiveEditorContext.isEqualTo(TEXT_DIFF_EDITOR_ID))!,
				icon: Codicon.goToFile,
			},
			precondition: ContextKeyExpr.and(ctxHasEditorModification),
			icon: Codicon.diffSingle,
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F7,
			},
			menu: [{
				id: MenuId.ChatEditingEditorHunk,
				order: 10
			}, {
				id: MenuId.ChatEditingEditorContent,
				group: 'a_resolve',
				order: 2,
				when: ContextKeyExpr.and(ctxReviewModeEnabled)
			}]
		});
	}

	override runChatEditingCommand(_accessor: ServicesAccessor, _session: IChatEditingSession, _entry: IModifiedFileEntry, integration: IModifiedFileEntryEditorIntegration, ...args: unknown[]): Promise<void> | void {
		integration.toggleDiff(args[0] as IModifiedFileEntryChangeHunk | undefined);
	}
}

class ToggleAccessibleDiffViewAction extends ChatEditingEditorAction {
	constructor() {
		super({
			id: 'chatEditor.action.showAccessibleDiffView',
			title: localize2('accessibleDiff', 'Show Accessible Diff View for Chat Edits'),
			f1: true,
			precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
			keybinding: {
				when: EditorContextKeys.focus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F7,
			}
		});
	}

	override runChatEditingCommand(_accessor: ServicesAccessor, _session: IChatEditingSession, _entry: IModifiedFileEntry, integration: IModifiedFileEntryEditorIntegration): Promise<void> | void {
		integration.enableAccessibleDiffView();
	}
}

export class ReviewChangesAction extends ChatEditingEditorAction {

	constructor() {
		super({
			id: 'chatEditor.action.reviewChanges',
			title: localize2('review', "Review"),
			precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
			menu: [{
				id: MenuId.ChatEditingEditorContent,
				group: 'a_resolve',
				order: 3,
				when: ContextKeyExpr.and(ctxReviewModeEnabled.negate(), ctxIsCurrentlyBeingModified.negate()),
			}]
		});
	}

	override runChatEditingCommand(_accessor: ServicesAccessor, _session: IChatEditingSession, entry: IModifiedFileEntry, _integration: IModifiedFileEntryEditorIntegration, ..._args: unknown[]): void {
		entry.enableReviewModeUntilSettled();
	}
}

export class AcceptAllEditsAction extends ChatEditingEditorAction {

	static readonly ID = 'chatEditor.action.acceptAllEdits';

	constructor() {
		super({
			id: AcceptAllEditsAction.ID,
			title: localize2('acceptAllEdits', 'Keep All Chat Edits'),
			tooltip: localize2('acceptAllEditsTooltip', 'Keep All Chat Edits in this Session'),
			precondition: ContextKeyExpr.and(ctxHasEditorModification, ctxIsCurrentlyBeingModified.negate()),
			icon: Codicon.checkAll,
			f1: true,
			keybinding: {
				when: ContextKeyExpr.or(EditorContextKeys.focus, NOTEBOOK_EDITOR_FOCUSED),
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyY,
			},
		});
	}

	override async runChatEditingCommand(_accessor: ServicesAccessor, session: IChatEditingSession, _entry: IModifiedFileEntry, _integration: IModifiedFileEntryEditorIntegration, ..._args: unknown[]): Promise<void> {
		await session.accept();
	}
}


// --- multi file diff

abstract class MultiDiffAcceptDiscardAction extends Action2 {

	constructor(readonly accept: boolean) {
		super({
			id: accept ? 'chatEditing.multidiff.acceptAllFiles' : 'chatEditing.multidiff.discardAllFiles',
			title: accept ? localize('accept4', 'Keep All Edits') : localize('discard4', 'Undo All Edits'),
			icon: accept ? Codicon.check : Codicon.discard,
			menu: {
				when: ContextKeyExpr.equals('resourceScheme', CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME),
				id: MenuId.EditorTitle,
				order: accept ? 0 : 1,
				group: 'navigation',
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatEditingService = accessor.get(IChatEditingService);
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const listService = accessor.get(IListService);

		const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);

		const groupContext = resolvedContext.groupedEditors[0];
		if (!groupContext) {
			return;
		}

		const editor = groupContext.editors[0];
		if (!(editor instanceof MultiDiffEditorInput) || !editor.resource) {
			return;
		}

		const session = chatEditingService.getEditingSession(LocalChatSessionUri.forSession(editor.resource.authority));
		if (this.accept) {
			await session?.accept();
		} else {
			await session?.reject();
		}
	}
}


export function registerChatEditorActions() {
	registerAction2(class NextAction extends NavigateAction { constructor() { super(true); } });
	registerAction2(class PrevAction extends NavigateAction { constructor() { super(false); } });
	registerAction2(ReviewChangesAction);
	registerAction2(AcceptAction);
	registerAction2(RejectAction);
	registerAction2(AcceptAllEditsAction);
	registerAction2(AcceptHunkAction);
	registerAction2(RejectHunkAction);
	registerAction2(ToggleDiffAction);
	registerAction2(ToggleAccessibleDiffViewAction);

	registerAction2(class extends MultiDiffAcceptDiscardAction { constructor() { super(true); } });
	registerAction2(class extends MultiDiffAcceptDiscardAction { constructor() { super(false); } });

	MenuRegistry.appendMenuItem(MenuId.ChatEditingEditorContent, {
		command: {
			id: navigationBearingFakeActionId,
			title: localize('label', "Navigation Status"),
			precondition: ContextKeyExpr.false(),
		},
		group: 'navigate',
		order: -1,
		when: ContextKeyExpr.and(ctxReviewModeEnabled, ctxHasEditorModification),
	});
}

export const navigationBearingFakeActionId = 'chatEditor.navigation.bearings';
