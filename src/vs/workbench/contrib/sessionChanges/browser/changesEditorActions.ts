/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesEditorActions.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID, AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID, AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { DIFF_VIEW_MODE_INLINE_TEMPORARY, SET_DIFF_VIEW_MODE_AUTOMATIC, SET_DIFF_VIEW_MODE_INLINE, SET_DIFF_VIEW_MODE_SIDE_BY_SIDE, TOGGLE_DIFF_SIDE_BY_SIDE } from '../../../browser/parts/editor/diffEditorCommands.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext, TextCompareEditorActiveContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorCommandsContext, IEditorPane, isEditorCommandsContext } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IDiffEditorOptionsService, SESSIONS_DIFF_EDITOR_WORD_WRAP_SETTING, SessionsDiffViewModeContext, SessionsWordWrap } from '../../../services/editor/common/diffEditorOptionsService.js';
import { IChat, ISession, ISessionChangeset, ISessionChangesetOperation, ISessionFileChange, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../services/sessions/common/session.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { readTransientState, writeTransientState } from '../../codeEditor/browser/toggleWordWrap.js';
import { ToggleSyncSplitViewAction } from '../../multiDiffEditor/browser/actions.js';
import { MultiDiffEditor } from '../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListEnabledContext, MultiDiffEditorFileListPositionContext, MultiDiffEditorFileListViewModeContext, TOGGLE_MULTI_DIFF_EDITOR_FILE_LIST_COMMAND_ID } from '../../multiDiffEditor/common/multiDiffEditor.js';
import { Menus } from '../../sessions/browser/menus.js';
import { resolveSessionCommandTarget } from '../../sessions/browser/sessionCommandTarget.js';
import { getChangesOfSession, IChangesSessionObservables, IChangesViewService } from '../../sessions/common/changesViewService.js';
import { DesktopDiffEditorInputActiveContext, DesktopLayoutContext, SessionChangesEditorDrawsHeaderContext, SessionIsCreatedContext } from '../../sessions/common/contextkeys.js';
import { findChangesEditorFileChange, getChangesEditorFileResource } from './changesEditorLabels.js';
import { SessionChangesFileResourceContext } from './changesMultiDiffSourceResolver.js';
import { getChangesFileUri, isChangesFileResource } from './changesViewRenderer.js';
import { ChangesetReviewedFilesContext, ChangesetReviewSupportContext, mainWindowChangesOwner } from './changesViewService.js';
import { ISessionActionContextKeysSource, registerSessionActionContextKeyBinder } from './sessionActionContextKeys.js';
import { CHANGESET_REVIEW_ACTION_ID, getFileActionEditorPane, IChangesEditorFileActionContext, SessionChangesEditor } from './sessionChangesEditor.js';

const agentsChangesEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ActiveEditorContext.isEqualTo(SessionChangesEditor.ID)
);

const desktopFileDiffEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	DesktopDiffEditorInputActiveContext,
	DesktopLayoutContext
);

const agentsTextDiffEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	TextCompareEditorActiveContext
);

const agentsMultiDiffEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ActiveEditorContext.isEqualTo(MultiDiffEditor.ID)
);

const agentsDiffEditorActive = ContextKeyExpr.or(
	agentsChangesEditorActive,
	agentsTextDiffEditorActive,
	agentsMultiDiffEditorActive
);

const agentsMultiDiffEditorsActive = ContextKeyExpr.or(
	agentsChangesEditorActive,
	agentsMultiDiffEditorActive
);

export const desktopChangesEditorActive = ContextKeyExpr.and(agentsChangesEditorActive, DesktopLayoutContext);
const desktopTextDiffEditorActive = ContextKeyExpr.and(agentsTextDiffEditorActive, DesktopLayoutContext);

// The title actions below show in the menus of the Agents window's editor areas, which only they show: those of the main
// window and of chat windows. Each editor area binds whether it is visible in its own context.
const editorAreaVisible = MainEditorAreaVisibleContext;

// Title-bar (tab-row) gate that does NOT require the editor content area to be
// visible, so session-level title actions (e.g. Create Pull Request) stay available
// when the editor area is closed but the docked tab bar is still shown.
const desktopChangesEditorTitle = ContextKeyExpr.and(
	desktopChangesEditorActive,
	IsTopRightEditorGroupContext
);

const desktopChangesEditorTitleVisible = ContextKeyExpr.and(
	desktopChangesEditorTitle,
	editorAreaVisible
);

export const desktopDiffEditorTitle = ContextKeyExpr.and(
	ContextKeyExpr.or(desktopChangesEditorActive, desktopFileDiffEditorActive),
	IsTopRightEditorGroupContext
);

const desktopTextDiffEditorTitle = ContextKeyExpr.and(
	desktopTextDiffEditorActive,
	IsTopRightEditorGroupContext
);

export const desktopMultiDiffEditorTitle = ContextKeyExpr.and(
	agentsMultiDiffEditorActive,
	DesktopLayoutContext,
	IsTopRightEditorGroupContext
);

const desktopDiffEditorTitleVisible = ContextKeyExpr.and(
	ContextKeyExpr.or(
		desktopChangesEditorTitle,
		desktopTextDiffEditorTitle,
		desktopMultiDiffEditorTitle
	),
	editorAreaVisible
);

// The Changes editor shows its diff actions in the header row above its diffs instead of in its tab row: Run Code Review
// and the More Actions menu in Menus.SessionsEditorHeaderSecondary.
export const notChangesEditor = ActiveEditorContext.notEqualsTo(SessionChangesEditor.ID);

/**
 * The header row that a Changes editor draws itself outside the Agents window, such as in an editor window: it offers the
 * diff actions that the Agents window offers in the header row of its editor area.
 */
const editorWindowChangesEditorHeader = ContextKeyExpr.and(
	IsSessionsWindowContext.negate(),
	ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
	SessionChangesEditorDrawsHeaderContext,
	ChatContextKeys.enabled,
);

const changesEditorHeaderVisible = ContextKeyExpr.or(desktopChangesEditorTitleVisible, editorWindowChangesEditorHeader);

/**
 * The actions of the files of the Changes editor show while chat is enabled where the editor draws its header itself and its
 * files read its context, such as in an editor window; the Agents window shows them as ever.
 */
const changesEditorFileActionsAvailable = ContextKeyExpr.or(SessionChangesEditorDrawsHeaderContext.negate(), ChatContextKeys.enabled);

export function wordWrapToggled(settingId: string) {
	return ContextKeyExpr.or(
		ContextKeyExpr.equals(`config.${settingId}`, 'on'),
		ContextKeyExpr.and(
			ContextKeyExpr.equals(`config.${settingId}`, 'inherit'),
			ContextKeyExpr.notEquals('config.editor.wordWrap', 'off'),
		),
	);
}

class ToggleSessionsDiffEditorWordWrapAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.toggleDiffEditorWordWrap';

	constructor() {
		super({
			id: ToggleSessionsDiffEditorWordWrapAction.ID,
			title: localize2('agentSessions.diffEditorWordWrap', "Word Wrap"),
			f1: false,
			menu: [{
				id: Menus.SessionsEditorTitle,
				group: '1_diff',
				order: 20,
				when: ContextKeyExpr.and(desktopMultiDiffEditorTitle, MainEditorAreaVisibleContext),
			}, {
				id: Menus.SessionsEditorHeaderSecondary,
				group: 'secondary/1_diff',
				order: 20,
				when: changesEditorHeaderVisible,
			}, {
				id: MenuId.EditorTitle,
				group: '1_diff',
				order: 20,
				when: ContextKeyExpr.and(agentsMultiDiffEditorsActive, DesktopLayoutContext.negate()),
			}],
			toggled: wordWrapToggled(SESSIONS_DIFF_EDITOR_WORD_WRAP_SETTING),
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		// Editor title menus pass the active editor's resource before the editor context.
		await toggleSessionsWordWrap(accessor, 'diffEditor', args.find(isEditorCommandsContext));
	}
}

/** The editor of the group whose title an action is invoked from (editor title menus pass the editor context), else the active editor. */
function getInvokingEditorPane(accessor: ServicesAccessor, args: unknown[]) {
	const context = args.find(isEditorCommandsContext);
	return context ? accessor.get(IEditorGroupsService).getGroup(context.groupId)?.activeEditorPane : accessor.get(IEditorService).activeEditorPane;
}

export async function toggleSessionsWordWrap(accessor: ServicesAccessor, target: 'editor' | 'diffEditor', context?: IEditorCommandsContext): Promise<void> {
	const codeEditorService = accessor.get(ICodeEditorService);
	const optionsService = accessor.get(IDiffEditorOptionsService);
	const editorService = accessor.get(IEditorService);
	const activeEditorPane = context
		? accessor.get(IEditorGroupsService).getGroup(context.groupId)?.activeEditorPane
		: editorService.activeEditorPane;
	const activeControl = activeEditorPane?.getControl();
	const diffEditor = target === 'diffEditor' && isDiffEditor(activeControl) ? activeControl : null;
	const codeEditor = target === 'editor' && isCodeEditor(activeControl)
		? activeControl
		: diffEditor?.getModifiedEditor() ?? null;
	const wordWrap = target === 'editor' ? optionsService.editorWordWrap.get() : optionsService.diffEditorWordWrap.get();
	const inheritedWordWrap = accessor.get(IConfigurationService).getValue<'off' | 'on' | 'wordWrapColumn' | 'bounded'>('editor.wordWrap');
	const isWordWrapEnabled = wordWrap === 'on' || wordWrap === 'inherit' && inheritedWordWrap !== 'off';
	const editors = codeEditor
		? diffEditor
			? [diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor()]
			: [codeEditor]
		: [];
	const nextWordWrap: SessionsWordWrap = isWordWrapEnabled ? 'off' : 'on';
	if (target === 'editor') {
		await optionsService.setEditorWordWrap(nextWordWrap);
	} else {
		await optionsService.setDiffEditorWordWrap(nextWordWrap);
	}

	let didClearTransientState = false;
	for (const editor of editors) {
		const model = editor.getModel();
		if (model && readTransientState(model, codeEditorService)) {
			writeTransientState(model, null, codeEditorService);
			didClearTransientState = true;
		}
	}
	if (didClearTransientState) {
		diffEditor?.updateOptions({});
	}
}

registerAction2(ToggleSessionsDiffEditorWordWrapAction);

// Resize All Diffs Together shows right below the multi diff editors' Word Wrap, except while their diffs are inline.
const resizeAllDiffsTogether = {
	id: ToggleSyncSplitViewAction.ID,
	title: ToggleSyncSplitViewAction.TITLE,
	toggled: ToggleSyncSplitViewAction.TOGGLED,
};
const notInlineDiffView = SessionsDiffViewModeContext.notEqualsTo('inline');
MenuRegistry.appendMenuItem(Menus.SessionsEditorTitle, {
	command: resizeAllDiffsTogether,
	group: '1_diff',
	order: 25,
	when: ContextKeyExpr.and(desktopMultiDiffEditorTitle, MainEditorAreaVisibleContext, notInlineDiffView),
});
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
	command: resizeAllDiffsTogether,
	group: 'secondary/1_diff',
	order: 25,
	when: ContextKeyExpr.and(changesEditorHeaderVisible, notInlineDiffView),
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: resizeAllDiffsTogether,
	group: '1_diff',
	order: 25,
	when: ContextKeyExpr.and(agentsMultiDiffEditorsActive, DesktopLayoutContext.negate(), notInlineDiffView),
});

class CollapseAllSessionChangesDiffsAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.collapseAllDiffs';

	constructor() {
		super({
			id: CollapseAllSessionChangesDiffsAction.ID,
			title: localize2('agentSessions.collapseAllDiffs', "Collapse All Diffs"),
			icon: Codicon.collapseAll,
			f1: false,
			menu: {
				id: Menus.SessionsEditorHeaderSecondary,
				group: 'secondary/1_diff',
				order: 10,
				when: ContextKeyExpr.and(
					changesEditorHeaderVisible,
					ContextKeyExpr.not('multiDiffEditorAllCollapsed'))
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		// The Changes editor of the title it is invoked from, such as in a chat window, else the active one.
		const activeEditorPane = getInvokingEditorPane(accessor, args);
		if (activeEditorPane instanceof SessionChangesEditor) {
			activeEditorPane.collapseAllDiffs();
		}
	}
}

registerAction2(CollapseAllSessionChangesDiffsAction);

class ExpandAllSessionChangesDiffsAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.expandAllDiffs';

	constructor() {
		super({
			id: ExpandAllSessionChangesDiffsAction.ID,
			title: localize2('agentSessions.expandAllDiffs', "Expand All Diffs"),
			icon: Codicon.expandAll,
			f1: false,
			menu: {
				id: Menus.SessionsEditorHeaderSecondary,
				group: 'secondary/1_diff',
				order: 10,
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ContextKeyExpr.and(desktopChangesEditorActive, IsTopRightEditorGroupContext, editorAreaVisible),
						editorWindowChangesEditorHeader),
					ContextKeyExpr.has('multiDiffEditorAllCollapsed'))
			}
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		// The Changes editor of the title it is invoked from, such as in a chat window, else the active one.
		const activeEditorPane = getInvokingEditorPane(accessor, args);
		if (activeEditorPane instanceof SessionChangesEditor) {
			activeEditorPane.expandAllDiffs();
		}
	}
}

registerAction2(ExpandAllSessionChangesDiffsAction);

// The Changes editor reuses the workbench `toggle.diff.renderSideBySide` command so a
// user's keybinding for it carries over (issue #324765). The command updates the Changes
// editor's own preferred layout (see `IDiffEditorViewModeOwner`), and in the Agents window
// its override of IDiffEditorCommandsService does so for every diff editor.

MenuRegistry.appendMenuItem(Menus.SessionsEditorTitle, {
	submenu: Menus.SessionsDiffEditorView,
	title: localize('diffView', "Diff View"),
	group: '1_diff',
	order: 30,
	when: ContextKeyExpr.and(desktopDiffEditorTitleVisible, notChangesEditor),
});
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
	submenu: Menus.SessionsDiffEditorView,
	title: localize('diffView', "Diff View"),
	group: 'secondary/1_diff',
	order: 30,
	when: changesEditorHeaderVisible,
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: Menus.SessionsDiffEditorView,
	title: localize('diffView', "Diff View"),
	group: '1_diff',
	order: 10,
	when: ContextKeyExpr.and(agentsDiffEditorActive, DesktopLayoutContext.negate()),
});
MenuRegistry.appendMenuItem(Menus.SessionsDiffEditorView, {
	command: {
		id: SET_DIFF_VIEW_MODE_INLINE,
		title: localize('diffView.inline', "Inline"),
		toggled: SessionsDiffViewModeContext.isEqualTo('inline'),
	},
	group: '1_view',
	order: 1,
});
MenuRegistry.appendMenuItem(Menus.SessionsDiffEditorView, {
	command: {
		id: SET_DIFF_VIEW_MODE_SIDE_BY_SIDE,
		title: localize('diffView.sideBySide', "Side by Side"),
		toggled: SessionsDiffViewModeContext.isEqualTo('sideBySide'),
	},
	group: '1_view',
	order: 2,
});
for (const [title, when] of [
	[localize('diffView.automaticSideBySide', "Automatic (Currently Side by Side)"), EditorContextKeys.diffEditorAutomaticRenderSideBySide],
	[localize('diffView.automaticInline', "Automatic (Currently Inline)"), EditorContextKeys.diffEditorAutomaticRenderSideBySide.toNegated()],
] as const) {
	MenuRegistry.appendMenuItem(Menus.SessionsDiffEditorView, {
		command: {
			id: SET_DIFF_VIEW_MODE_AUTOMATIC,
			title,
			toggled: ContextKeyExpr.and(
				SessionsDiffViewModeContext.isEqualTo('automatic'),
				EditorContextKeys.diffEditorTemporaryInlineMode.toNegated(),
			),
		},
		group: '1_view',
		order: 3,
		when,
	});
}
MenuRegistry.appendMenuItem(Menus.SessionsDiffEditorView, {
	command: {
		id: DIFF_VIEW_MODE_INLINE_TEMPORARY,
		title: localize('diffView.inlineTemporary', "Inline (Temporary)"),
		toggled: EditorContextKeys.diffEditorTemporaryInlineMode,
		precondition: ContextKeyExpr.false(),
	},
	group: '1_view',
	order: 4,
	when: EditorContextKeys.diffEditorTemporaryInlineMode,
});

// Where the Changes editor draws its header row itself, Toggle Files shows or hides its changed files list, with a dropdown
// that switches the list between a list and a tree, and puts it on either side of the diffs: as Toggle Details does in the
// header row of the Agents window.
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
	submenu: Menus.ChangesEditorFileListToggle,
	title: localize2('filesViewAndPosition', "Files View & Position"),
	icon: Codicon.listFlat,
	isSplitButton: { excludePrimaryActionFromDropdown: true },
	group: 'navigation',
	order: 20,
	when: ContextKeyExpr.and(editorWindowChangesEditorHeader, MultiDiffEditorFileListAvailableContext),
});
MenuRegistry.appendMenuItems([
	{
		id: Menus.ChangesEditorFileListToggle, item: {
			command: { id: TOGGLE_MULTI_DIFF_EDITOR_FILE_LIST_COMMAND_ID, title: localize2('toggleFileList', "Toggle Files"), icon: Codicon.listFlat, toggled: MultiDiffEditorFileListEnabledContext },
			group: 'navigation',
			order: 1,
		}
	},
	...([
		['multiDiffEditor.viewFileListAsList', localize2('fileListViewAsList', "View as List"), 'list', 1],
		['multiDiffEditor.viewFileListAsTree', localize2('fileListViewAsTree', "View as Tree"), 'tree', 2],
	] as const).map(([id, title, viewMode, order]) => ({
		id: Menus.ChangesEditorFileListToggle, item: {
			command: { id, title, toggled: MultiDiffEditorFileListViewModeContext.isEqualTo(viewMode) },
			group: '1_view',
			order,
		}
	})),
	...([
		['multiDiffEditor.positionFileListLeft', localize2('fileListPositionLeft', "Left"), 'left', 1],
		['multiDiffEditor.positionFileListRight', localize2('fileListPositionRight', "Right"), 'right', 2],
	] as const).map(([id, title, position, order]) => ({
		id: Menus.ChangesEditorFileListToggle, item: {
			command: { id, title, toggled: MultiDiffEditorFileListPositionContext.isEqualTo(position) },
			group: '2_organize',
			order,
		}
	})),
]);

// Discoverable in the command palette while a Changes diff editor is visible.
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: TOGGLE_DIFF_SIDE_BY_SIDE,
		title: localize2('togglePreferredDiffView', "Toggle Preferred Diff View"),
		category: localize2('changes', "Changes"),
	},
	when: ContextKeyExpr.or(agentsDiffEditorActive, editorWindowChangesEditorHeader)
});

function getWorkspaceResource(resource: URI, changes: readonly ISessionFileChange[]): URI {
	const change = changes.find(change => isChangesFileResource(change, resource));
	return change ? getChangesFileUri(change) : resource;
}

// --- Open File action (per-file toolbar in the desktop session changes editor)

/**
 * Opens the file shown in a diff row of the Agents window's desktop session
 * Changes editor ({@link SessionChangesEditor}) as a regular editor. The workbench
 * {@link GoToFileAction} only appears for the generic {@link MultiDiffEditor}, so
 * the custom desktop editor needs its own entry in the per-file toolbar. It is
 * scoped to the {@link SessionChangesEditor} rather than the shared
 * `changes-multi-diff-source` scheme so it does not duplicate the workbench action
 * when the same changes are shown in the generic multi-file diff editor.
 */
class OpenChangedFileAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.openFile';

	constructor() {
		super({
			id: OpenChangedFileAction.ID,
			title: localize2('agentSessions.changes.openFile', 'Open File'),
			icon: Codicon.goToFile,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(SessionChangesEditor.ID), changesEditorFileActionsAvailable),
				group: 'navigation',
				order: 22,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		const changesViewService = accessor.get(IChangesViewService);
		const editor = (args[1] as Partial<IChangesEditorFileActionContext> | undefined)?.editor;
		// A Changes editor that follows its own session, as in an editor window, opens the file of the chat of its diffs.
		const scope = editor instanceof SessionChangesEditor && editor.followsInputSession ? editor.changesScope : undefined;
		const target = scope ? { session: scope.session.get(), chat: scope.chat.get() } : resolveSessionCommandTarget(accessor, [args[1]]);
		const session = target?.session;
		if (!session) {
			return;
		}
		const changes = scope?.changes ?? getChangesOfSession(changesViewService, mainWindowChangesOwner(accessor), session, target.chat);
		// From a chat window's Changes editor, in its group, not by focus; in the main window, as ever.
		const group = editor instanceof SessionChangesEditor && !accessor.get(IEditorGroupsService).mainPart.groups.includes(editor.group) ? editor.group : undefined;
		await accessor.get(IEditorService).openEditor({
			resource: getWorkspaceResource(resource, changes.changesObs.get()),
		}, group);
	}
}
registerAction2(OpenChangedFileAction);

// --- Expand Full File action (per-file toolbar in the session changes multi-diff editor)

/**
 * Resolves the {@link DiffEditorWidget} showing `resource` in the active Changes
 * multi-diff editor. The Changes editor opens either as the docked
 * {@link SessionChangesEditor} or, in the non-docked layout, as a plain
 * {@link MultiDiffEditor}; both expose `tryGetCodeEditor`, so the expand/collapse
 * actions work in either mode.
 */
function getChangesDiffEditor(pane: IEditorPane | undefined, resource: URI): DiffEditorWidget | undefined {
	const codeEditor = pane instanceof SessionChangesEditor || pane instanceof MultiDiffEditor
		? pane.tryGetCodeEditor(resource)
		: undefined;
	return codeEditor?.diffEditor instanceof DiffEditorWidget ? codeEditor.diffEditor : undefined;
}

function getExpandedChangesDiffEditor(pane: IEditorPane | undefined, resource: URI): DiffEditorWidget | undefined {
	if (pane instanceof SessionChangesEditor) {
		pane.expand(resource);
	} else if (pane instanceof MultiDiffEditor) {
		const viewModel = pane.viewModel;
		const item = viewModel?.items.read(undefined)
			.find(item => isEqual(item.modifiedUri, resource) || isEqual(item.originalUri, resource));
		if (viewModel && item) {
			viewModel.expand(item);
		}
	}
	return getChangesDiffEditor(pane, resource);
}

/**
 * Reveals all hidden unchanged regions for the file shown in a diff row of the
 * Agents window's Changes editor, showing the whole file at once (a per-file
 * counterpart to the per-region reveal controls).
 */
class ExpandFullFileAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.expandFullFile';

	constructor() {
		super({
			id: ExpandFullFileAction.ID,
			title: localize2('agentSessions.changes.expandFullFile', 'Expand Full File'),
			icon: Codicon.unfold,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'),
					EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.toNegated(),
					changesEditorFileActionsAvailable),
				group: 'navigation',
				order: 21,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		getExpandedChangesDiffEditor(getFileActionEditorPane(accessor.get(IEditorService), args), resource)?.showAllUnchangedRegions();
	}
}
registerAction2(ExpandFullFileAction);

// --- Collapse Unchanged Regions action (per-file toolbar in the session changes multi-diff editor)

/**
 * Collapses all unchanged regions for the file shown in a diff row of the Agents
 * window's Changes editor, hiding the unchanged context so only the changes are
 * shown. The symmetric counterpart of {@link ExpandFullFileAction}: the two
 * occupy the same toolbar slot and swap based on whether the file is fully
 * expanded.
 */
class CollapseUnchangedRegionsAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.collapseUnchangedRegions';

	constructor() {
		super({
			id: CollapseUnchangedRegionsAction.ID,
			title: localize2('agentSessions.changes.collapseUnchangedRegions', 'Collapse Unchanged Regions'),
			icon: Codicon.fold,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'),
					EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown,
					changesEditorFileActionsAvailable),
				group: 'navigation',
				order: 21,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		getExpandedChangesDiffEditor(getFileActionEditorPane(accessor.get(IEditorService), args), resource)?.collapseAllUnchangedRegions();
	}
}
registerAction2(CollapseUnchangedRegionsAction);

/**
 * The changeset operations that the Changes of a session show, each as `<kind>:<operation id>`: `resource` for those on a
 * file of its changeset, `changeset` for those in the title of its Changes editor. Every scope that shows a session's
 * Changes, such as each window, binds them for its session (see {@link bindChangesetOperations}).
 */
export const SessionChangesetOperationsContext = new RawContextKey<string[]>('sessions.changesetOperations', [], localize('sessionChangesetOperations', "The changeset operations that the changes of the session show."));
/** Those of {@link SessionChangesetOperationsContext} that are enabled. */
export const SessionEnabledChangesetOperationsContext = new RawContextKey<string[]>('sessions.changesetOperationsEnabled', [], localize('sessionEnabledChangesetOperations', "The changeset operations that the changes of the session show and that are enabled."));

type ChangesetOperationKind = 'resource' | 'changeset';

interface IChangesetOperationEntry {
	/** `<kind>:<operation id>`, as {@link SessionChangesetOperationsContext} lists it. */
	readonly key: string;
	readonly kind: ChangesetOperationKind;
	readonly operation: ISessionChangesetOperation;
	readonly enabled: boolean;
	readonly order: number;
}

interface IChangesetOperations {
	readonly entries: readonly IChangesetOperationEntry[];
	/** The changeset that the operations in the title of the Changes editor act on. */
	readonly titleChangeset: ISessionChangeset | undefined;
}

function isChangesetOperationBusy(operation: ISessionChangesetOperation): boolean {
	return operation.status === SessionChangesetOperationStatus.Disabled || operation.status === SessionChangesetOperationStatus.Running;
}

/**
 * The changeset operations that the Changes of `session` show. Those on a file are the resource-scoped operations of its
 * changeset. Those in the title of its Changes editor are, for a new (untitled) session, the changeset-scoped operations
 * of its uncommitted changes (except Sync and Checkout), and for an existing session the Commit operation of the
 * changeset selected in its Changes view; the title bar's button bar omits Commit, so that it always lives here.
 */
export function getChangesetOperations(session: ISession | undefined, chat: IChat | undefined, changes: Pick<IChangesSessionObservables, 'changesetObs' | 'changesetOperationsObs'>, reader: IReader | undefined): IChangesetOperations {
	const entries: IChangesetOperationEntry[] = [];
	const changeset = changes.changesetObs.read(reader);
	for (const operation of changeset?.operations.read(reader) ?? []) {
		if (operation.scopes.includes(SessionChangesetOperationScope.Resource)) {
			entries.push({ key: `resource:${operation.id}`, kind: 'resource', operation, enabled: !isChangesetOperationBusy(operation), order: 100 });
		}
	}
	if (!session) {
		return { entries, titleChangeset: undefined };
	}

	let titleChangeset: ISessionChangeset | undefined;
	let operations: readonly ISessionChangesetOperation[];
	let hasUncommittedChanges = true;
	if (session.status.read(reader) === SessionStatus.Untitled) {
		titleChangeset = (chat ?? session.mainChat.read(reader)).changesets.read(reader)
			?.find(candidate => candidate.id === UNCOMMITTED_CHANGES_CHANGESET_ID && candidate.isEnabled.read(reader));
		operations = titleChangeset?.operations.read(reader)
			.filter(operation => operation.id !== AGENT_HOST_SYNC_CHANGESET_OPERATION_ID)
			.filter(operation => operation.id !== AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID)
			.filter(operation => operation.scopes.includes(SessionChangesetOperationScope.Changeset)) ?? [];
		hasUncommittedChanges = (session.workspace.read(reader)?.folders[0]?.gitRepository?.uncommittedChanges ?? 0) > 0;
	} else {
		titleChangeset = changeset;
		operations = titleChangeset
			? changes.changesetOperationsObs.read(reader)
				.filter(operation => operation.id === AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID)
				.filter(operation => operation.scopes.includes(SessionChangesetOperationScope.Changeset))
			: [];
	}
	operations.forEach((operation, order) => entries.push({
		key: `changeset:${operation.id}`,
		kind: 'changeset',
		operation,
		enabled: !isChangesetOperationBusy(operation) && !(operation.id === AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID && !hasUncommittedChanges),
		order,
	}));
	return { entries, titleChangeset };
}

/** Whether the list of the context key `key` has `entry`. */
function listHas(key: RawContextKey<string[]>, entry: string): ContextKeyExpression {
	return ContextKeyExpr.regex(key.key, new RegExp(`(^|,)${escapeRegExpCharacters(entry)}(,|$)`));
}

/** The Changes of the Changes editor whose file toolbar or title an action is invoked from, else those of the main window's session. */
function getInvokingChangesScope(accessor: ServicesAccessor, args: readonly unknown[]): { readonly session: ISession | undefined; readonly chat: IChat | undefined; readonly changes: Pick<IChangesSessionObservables, 'changesObs' | 'changesetObs' | 'changesetOperationsObs'> } {
	const fileContext = args[1] as Partial<IChangesEditorFileActionContext> | undefined;
	const editorContext = args.find(isEditorCommandsContext);
	const editor = fileContext?.editor instanceof SessionChangesEditor
		? fileContext.editor
		: editorContext ? accessor.get(IEditorGroupsService).getGroup(editorContext.groupId)?.activeEditorPane : undefined;
	if (editor instanceof SessionChangesEditor) {
		return { session: editor.changesScope.session.get(), chat: editor.changesScope.chat.get(), changes: editor.changesScope.changes };
	}
	const changesViewService = accessor.get(IChangesViewService);
	const owner = mainWindowChangesOwner(accessor);
	return {
		session: owner.session,
		chat: owner.chat,
		changes: {
			changesObs: changesViewService.activeSessionChangesObs,
			changesetObs: changesViewService.activeSessionChangesetObs,
			changesetOperationsObs: changesViewService.activeSessionChangesetOperationsObs,
		},
	};
}

const CHANGESET_OPERATION_ACTION_PREFIX = 'workbench.contrib.sessions.changesetOperation.';
const CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX = 'workbench.contrib.sessions.changesHeaderChangesetOperation.';
const CHANGES_HEADER_COMMIT_ACTION_ID = `${CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`;

/**
 * Whether the desktop main window shows the Commit of a new session's uncommitted changes in the header row of its
 * Changes editor, beside the changeset picker, instead of in its tab row. That row stays visible above the docked
 * Details, also while the editor content is hidden.
 */
const commitInEditorHeader = ContextKeyExpr.and(DesktopLayoutContext, IsAuxiliaryWindowContext.toNegated(), SessionIsCreatedContext.negate())!;

function registerChangesetOperationAction({ key, kind, operation, order }: IChangesetOperationEntry): IDisposable {
	const shown = listHas(SessionChangesetOperationsContext, key);
	const precondition = listHas(SessionEnabledChangesetOperationsContext, key);
	if (kind === 'resource') {
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `${CHANGESET_OPERATION_ACTION_PREFIX}${operation.id}`,
					title: operation.label,
					icon: operation.icon,
					precondition,
					f1: false,
					menu: [{
						id: MenuId.AgentsChangeInlineToolbar,
						group: 'navigation',
						order,
						when: shown,
					}, {
						id: MenuId.MultiDiffEditorFileToolbar,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'), shown, changesEditorFileActionsAvailable),
						group: 'navigation',
						order,
					}]
				});
			}

			async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
				// The Changes view provides the resource as the third argument (it uses a custom action runner), the
				// toolbar of a file of the Changes editor as the first, followed by the session and editor it shows in.
				const resource = args.length === 3 ? args[2] : args[0];
				if (!URI.isUri(resource)) {
					return;
				}
				const { changes } = getInvokingChangesScope(accessor, args);
				const change = changes.changesObs.get().find(candidate => isChangesFileResource(candidate, resource));
				if (change) {
					await changes.changesetObs.get()?.invokeOperation(operation.id, { kind: 'resource', resource: getChangesFileUri(change) });
				}
			}
		});
	}
	const shownInChangesEditor = ContextKeyExpr.and(ActiveEditorContext.isEqualTo(SessionChangesEditor.ID), shown);
	return registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `${CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX}${operation.id}`,
				title: operation.label,
				tooltip: operation.description,
				icon: operation.icon,
				precondition,
				f1: false,
				menu: operation.id === AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID ? [{
					id: Menus.SessionsEditorTitle,
					group: 'navigation',
					order,
					when: ContextKeyExpr.and(shownInChangesEditor, commitInEditorHeader.negate()),
				}, {
					id: Menus.SessionsEditorHeaderSecondary,
					group: 'navigation',
					order,
					when: ContextKeyExpr.and(shownInChangesEditor, commitInEditorHeader),
				}] : {
					id: Menus.SessionsEditorTitle,
					group: 'navigation',
					order,
					when: shownInChangesEditor,
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			const { session, chat, changes } = getInvokingChangesScope(accessor, args);
			await getChangesetOperations(session, chat, changes, undefined).titleChangeset?.invokeOperation(operation.id);
		}
	});
}

/**
 * The action of each changeset operation, registered once while a scope shows it, whichever scopes show it, and shown
 * and enabled in each scope by its context keys.
 */
const changesetOperationActions = new class {
	private readonly _registrations = new Map<string, { count: number; readonly registration: IDisposable }>();

	acquire(entry: IChangesetOperationEntry): IDisposable {
		let registration = this._registrations.get(entry.key);
		if (!registration) {
			registration = { count: 0, registration: registerChangesetOperationAction(entry) };
			this._registrations.set(entry.key, registration);
		}
		registration.count++;
		const acquired = registration;
		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			if (--acquired.count === 0) {
				acquired.registration.dispose();
				this._registrations.delete(entry.key);
			}
		});
	}
};

/**
 * Binds on `contextKeyService` the changeset operations that the Changes of the session of `source` show, and keeps their
 * actions registered meanwhile. The main window binds those of its session, a chat window those of the session it shows.
 */
export function bindChangesetOperations(source: Pick<ISessionActionContextKeysSource, 'session'> & { readonly chat?: ISessionActionContextKeysSource['chat']; readonly changes: Pick<IChangesSessionObservables, 'changesetObs' | 'changesetOperationsObs'> }, contextKeyService: IContextKeyService): IDisposable {
	const shown = SessionChangesetOperationsContext.bindTo(contextKeyService);
	const enabled = SessionEnabledChangesetOperationsContext.bindTo(contextKeyService);
	return autorun(reader => {
		const { entries } = getChangesetOperations(source.session.read(reader), source.chat?.read(reader), source.changes, reader);
		contextKeyService.bufferChangeEvents(() => {
			shown.set(entries.map(entry => entry.key));
			enabled.set(entries.filter(entry => entry.enabled).map(entry => entry.key));
		});
		for (const entry of entries) {
			reader.store.add(changesetOperationActions.acquire(entry));
		}
	});
}

registerSessionActionContextKeyBinder((_accessor, source, contextKeyService) => bindChangesetOperations(source, contextKeyService));

class CommitActionViewItem extends MenuEntryActionViewItem {

	override render(container: HTMLElement): void {
		this.options.icon = false;
		this.options.label = true;
		container.classList.add('changes-commit-action');
		super.render(container);
	}

	protected override updateLabel(): void {
		if (this.label) {
			const icon = this._commandAction.item.icon;
			const iconElement = icon && ThemeIcon.isThemeIcon(icon) ? renderIcon(icon) : undefined;
			iconElement?.setAttribute('aria-hidden', 'true');
			dom.reset(this.label, ...(iconElement ? [iconElement] : []), dom.$('span.changes-commit-label', undefined, this._commandAction.label));
		}
	}
}

/**
 * Renders the Commit operation with its label in the title of the Changes editor, in every window, and in the header
 * row of the desktop main window's Changes editor that shows it on the new session page.
 */
export class ChangesHeaderChangesetOperationsActionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessions.changesHeaderChangesetOperationsAction';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		for (const menu of [Menus.SessionsEditorTitle, Menus.SessionsEditorHeaderSecondary]) {
			this._register(actionViewItemService.register(menu, CHANGES_HEADER_COMMIT_ACTION_ID, (action, options, instantiationService) => {
				return action instanceof MenuItemAction
					? instantiationService.createInstance(CommitActionViewItem, action, options)
					: undefined;
			}));
		}
	}
}


registerWorkbenchContribution2(ChangesHeaderChangesetOperationsActionContribution.ID, ChangesHeaderChangesetOperationsActionContribution, WorkbenchPhase.AfterRestored);

export class ChangesetReviewAction extends Action2 {
	constructor() {
		super({
			id: CHANGESET_REVIEW_ACTION_ID,
			title: localize('changeset.viewed', "Viewed"),
			f1: false,
			toggled: {
				condition: ContextKeyExpr.in(
					SessionChangesFileResourceContext.key,
					ChangesetReviewedFilesContext.key)
			},
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ChangesetReviewSupportContext.isEqualTo(true),
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'),
					changesEditorFileActionsAvailable,
				),
				group: 'navigation',
				order: 100
			}
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		const changesViewService = accessor.get(IChangesViewService);
		// A Changes editor that follows its own session, as in an editor window, acts on the chat of its diffs. Otherwise the
		// editor passes its own session; the file toolbar and keybindings fall back to the active one.
		const editor = (args[1] as Partial<IChangesEditorFileActionContext> | undefined)?.editor;
		const scope = editor instanceof SessionChangesEditor && editor.followsInputSession ? editor.changesScope : undefined;
		const target = scope ? { session: scope.session.get(), chat: scope.chat.get() } : resolveSessionCommandTarget(accessor, [args[1]]);
		const session = target?.session;
		if (!session) {
			return;
		}
		const changes = scope?.changes ?? getChangesOfSession(changesViewService, mainWindowChangesOwner(accessor), session, target.chat);
		if (changes.changesetObs.get()?.capabilities?.review !== true) {
			return;
		}

		// Guard against a resource forwarded by a stale editor row (e.g. mid session switch).
		const change = findChangesEditorFileChange(resource, changes.changesObs.get());
		if (!change) {
			return;
		}

		const activeEditorPane = getFileActionEditorPane(accessor.get(IEditorService), args);
		const fileResource = getChangesEditorFileResource(change);
		const review = !change.reviewed;

		// Toggle multi-file diff editor item
		if (activeEditorPane instanceof SessionChangesEditor) {
			if (review) {
				activeEditorPane.collapse(resource);
			} else {
				activeEditorPane.expand(resource);
			}
		}

		// Set the review state
		changesViewService.setChangesetFilesReviewState([fileResource], review, session, target.chat);
	}
}

registerAction2(ChangesetReviewAction);

export const sessionsDiffEditorWordWrapConfiguration = {
	id: 'sessions',
	properties: {
		[SESSIONS_DIFF_EDITOR_WORD_WRAP_SETTING]: {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: 'inherit',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownEnumDescriptions: [
				localize('sessions.diffEditor.wordWrap.off', "Lines will never wrap."),
				localize('sessions.diffEditor.wordWrap.on', "Lines will wrap at the viewport width."),
				localize('sessions.diffEditor.wordWrap.inherit', "Lines will wrap according to the {0} setting.", '`#editor.wordWrap#`'),
			],
			description: localize('sessions.diffEditor.wordWrap', "Controls how diff editors in the Agents window and the Changes editor of sessions wrap lines."),
		},
	},
} satisfies IConfigurationNode;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(sessionsDiffEditorWordWrapConfiguration);
