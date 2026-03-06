/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, IAction2Options, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor, TEXT_DIFF_EDITOR_ID } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { CTX_HOVER_MODE } from '../../../inlineChat/common/inlineChat.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { IDocumentDiffItemWithMultiDiffEditorItem, MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { NOTEBOOK_CELL_LIST_FOCUSED } from '../../../notebook/common/notebookContextKeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState, CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, parseChatMultiDiffUri } from '../../common/editing/chatEditingService.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { ctxHasEditorModification, ctxHasRequestInProgress, ctxIsCurrentlyBeingModified, ctxIsGlobalEditingSession, ctxReviewModeEnabled } from './chatEditingEditorContextKeys.js';
import { ChatEditingExplanationWidgetManager } from './chatEditingExplanationWidget.js';
import { IChatEditingExplanationModelManager, IExplanationDiffInfo } from './chatEditingExplanationModelManager.js';
import { DiffEditorViewModel } from '../../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { ChatConfiguration } from '../../common/constants.js';


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
			}, {
				id: MenuId.ChatEditorInlineExecute,
				group: 'a_resolve',
				order: 2,
				when: ContextKeyExpr.and(ctxReviewModeEnabled, CTX_HOVER_MODE)
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
				when: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
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
				when: ContextKeyExpr.and(ctxReviewModeEnabled.negate(), ctxIsCurrentlyBeingModified.negate(), ContextKeyExpr.or(ctxIsGlobalEditingSession, ctxHasRequestInProgress.negate())),
			}]
		});
	}

	override runChatEditingCommand(_accessor: ServicesAccessor, _session: IChatEditingSession, entry: IModifiedFileEntry, _integration: IModifiedFileEntryEditorIntegration, ..._args: unknown[]): void {
		entry.enableReviewModeUntilSettled();
	}
}


const explainMultiDiffSchemes = [CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, 'copilotcli-worktree-changes', 'copilotcloud-pr-changes'];

class ExplainMultiDiffAction extends Action2 {

	private readonly _widgetsByInput = new WeakMap<EditorInput, DisposableStore>();

	constructor() {
		super({
			id: 'chatEditing.multidiff.explain',
			title: localize('explain', 'Explain'),
			menu: {
				when: ContextKeyExpr.and(ContextKeyExpr.or(...explainMultiDiffSchemes.map(scheme => ContextKeyExpr.equals('resourceScheme', scheme))), ContextKeyExpr.has(`config.${ChatConfiguration.ExplainChangesEnabled}`)),
				id: MenuId.MultiDiffEditorContent,
				order: 10,
			},
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const explanationModelManager = accessor.get(IChatEditingExplanationModelManager);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const viewsService = accessor.get(IViewsService);
		const chatEditingService = accessor.get(IChatEditingService);

		const activePane = editorService.activeEditorPane;
		if (!activePane) {
			return;
		}

		// Check if we're in a multi-diff editor
		if (!(activePane instanceof MultiDiffEditor) || !activePane.viewModel) {
			return;
		}

		const input = activePane.input;
		if (!input) {
			return;
		}

		// Dispose existing widgets for this input and create new store
		this._widgetsByInput.get(input)?.dispose();
		const widgetsStore = new DisposableStore();
		this._widgetsByInput.set(input, widgetsStore);

		// Dispose widgets when the input is disposed
		Event.once(input.onWillDispose)(() => {
			widgetsStore.dispose();
			this._widgetsByInput.delete(input);
		});

		const viewModel = activePane.viewModel;
		const items = viewModel.items.get();

		// Try to extract chat session resource from the multi-diff editor URI or by scanning sessions
		let chatSessionResource: URI | undefined;
		if (input instanceof MultiDiffEditorInput && input.resource?.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME) {
			chatSessionResource = parseChatMultiDiffUri(input.resource).chatSessionResource;
		}
		if (!chatSessionResource) {
			// Scan sessions to find one that owns files in this multi-diff editor
			// Use goToFileUri if available, otherwise extract file path from the modified URI
			const fileUris = items.map(item => {
				const docDiffItem = item.documentDiffItem as IDocumentDiffItemWithMultiDiffEditorItem | undefined;
				const goToFileUri = docDiffItem?.multiDiffEditorItem?.goToFileUri;
				if (goToFileUri) {
					return goToFileUri;
				}
				// Fallback: extract file path from the modified URI (e.g., git: URIs have the path)
				const modifiedUri = docDiffItem?.multiDiffEditorItem?.modifiedUri ?? item.modifiedUri;
				if (modifiedUri?.path) {
					return URI.file(modifiedUri.path);
				}
				return undefined;
			}).filter((uri): uri is URI => !!uri);
			for (const session of chatEditingService.editingSessionsObs.get()) {
				if (fileUris.some(uri => session.getEntry(uri))) {
					chatSessionResource = session.chatSessionResource;
					break;
				}
			}
		}

		// First pass: collect all diffs grouped by file
		const diffsByFile = new Map<string, {
			editor: ICodeEditor;
			changes: DetailedLineRangeMapping[];
			originalModel: ITextModel;
			modifiedModel: ITextModel;
		}>();

		for (const item of items) {
			const modifiedUri = item.modifiedUri;
			if (!modifiedUri) {
				continue;
			}

			// Try to get the editor for this item
			const editorInfo = activePane.tryGetCodeEditor(modifiedUri);
			if (!editorInfo) {
				continue;
			}

			// Get diff info from the view model
			const diffEditorVM = item.diffEditorViewModel as DiffEditorViewModel;
			await diffEditorVM.waitForDiff();

			const diff = diffEditorVM.diff.get();
			if (!diff || diff.identical) {
				continue;
			}

			const fileKey = modifiedUri.toString();
			const existing = diffsByFile.get(fileKey);
			if (existing) {
				// Add changes to existing file entry
				existing.changes.push(...diff.mappings.map(m => m.lineRangeMapping));
			} else {
				// Create new file entry
				diffsByFile.set(fileKey, {
					editor: editorInfo.editor,
					changes: diff.mappings.map(m => m.lineRangeMapping),
					originalModel: diffEditorVM.model.original,
					modifiedModel: diffEditorVM.model.modified,
				});
			}
		}

		// Second pass: create managers for each file with all its changes
		const allDiffInfos: IExplanationDiffInfo[] = [];

		for (const fileData of diffsByFile.values()) {
			// Build diff info with all changes for this file
			const diffInfo: IExplanationDiffInfo = {
				changes: fileData.changes,
				identical: false,
				originalModel: fileData.originalModel,
				modifiedModel: fileData.modifiedModel,
			};
			allDiffInfos.push(diffInfo);

			// Create a widget manager for this file - it will observe state from model manager
			const manager = new ChatEditingExplanationWidgetManager(
				fileData.editor,
				chatWidgetService,
				viewsService,
				explanationModelManager,
				diffInfo.modifiedModel.uri,
			);
			widgetsStore.add(manager);
		}

		// Generate explanations for all files in a single request
		// This populates state which triggers the managers' autoruns to create widgets
		if (allDiffInfos.length > 0) {
			widgetsStore.add(explanationModelManager.generateExplanations(allDiffInfos, chatSessionResource, CancellationToken.None));
		}
	}
}


export function registerChatEditorActions() {
	registerAction2(class NextAction extends NavigateAction { constructor() { super(true); } });
	registerAction2(class PrevAction extends NavigateAction { constructor() { super(false); } });
	registerAction2(ReviewChangesAction);
	registerAction2(ToggleDiffAction);
	registerAction2(ToggleAccessibleDiffViewAction);

	registerAction2(ExplainMultiDiffAction);

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
