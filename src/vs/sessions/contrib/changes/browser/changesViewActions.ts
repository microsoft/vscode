/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, IAction2Options, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { isEditorCommandsContext } from '../../../../workbench/common/editor.js';
import { DiffEditorInput } from '../../../../workbench/common/editor/diffEditorInput.js';
import { TEXT_FILE_EDITOR_ID } from '../../../../workbench/contrib/files/common/files.js';
import { OpenMultiDiffEditorLayoutDebugAction } from '../../../../workbench/contrib/multiDiffEditor/browser/actions.js';
import { ActiveMultiDiffEditorHasFileListContext, MultiDiffEditorFilesViewAndPositionMenu } from '../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { SessionArtifactIntegrationsEnabledContext, SessionIsCreatedContext, DesktopDiffEditorInputActiveContext, DesktopLayoutContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { CustomViewVisibleContext } from '../../../common/agentsWindowContextKeys.js';
import { logChangesViewViewModeChange } from '../../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { getMainWindowHost, ISessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { OPEN_PULL_REQUEST_ACTION_ID } from '../../../../workbench/contrib/sessions/common/github/types.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from '../../../../workbench/contrib/sessions/common/changes.js';
import { getChangesOfSession, IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';
import { SESSIONS_EDITOR_WORD_WRAP_SETTING } from '../../../../workbench/services/editor/common/diffEditorOptionsService.js';
import { CHANGES_HEADER_ACTIONS_ID } from '../../../../workbench/contrib/sessionChanges/browser/changesView.js';
import { SessionChangesEditor } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditor.js';
import { isChangesFileResource } from '../../../../workbench/contrib/sessionChanges/browser/changesViewRenderer.js';
import { mainWindowChangesOwner } from '../../../../workbench/contrib/sessionChanges/browser/changesViewService.js';
import { desktopChangesEditorActive, desktopDiffEditorTitle, desktopMultiDiffEditorTitle, notChangesEditor, toggleSessionsWordWrap, wordWrapToggled } from '../../../../workbench/contrib/sessionChanges/browser/changesEditorActions.js';

const openChangesViewActionOptions: IAction2Options = {
	id: 'workbench.action.agentSessions.openChangesView',
	title: localize2('openChangesView', "Changes"),
	icon: Codicon.diffMultiple,
	f1: false,
};

class OpenChangesViewAction extends Action2 {

	static readonly ID = openChangesViewActionOptions.id;

	constructor() {
		super(openChangesViewActionOptions);
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(CHANGES_VIEW_ID, true);
	}
}

registerAction2(OpenChangesViewAction);

class ChangesViewActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesViewActions';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionHostService sessionHostService: ISessionHostService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IEditorService editorService: IEditorService,
	) {
		super();

		// Bind context key: true when the chat the main window shows has changes
		const mainWindowHost = getMainWindowHost(sessionHostService);
		this._register(bindContextKey(ActiveSessionContextKeys.HasChanges, contextKeyService, reader => {
			const changes = mainWindowHost.chat.read(reader)?.changes.read(reader);
			return !!changes && changes.length > 0;
		}));

		this._register(bindContextKey(ChangesContextKeys.ViewMode, contextKeyService, reader => {
			return changesViewService.viewModeObs.read(reader);
		}));

		const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);
		this._register(bindContextKey(DesktopDiffEditorInputActiveContext, contextKeyService, reader => activeEditor.read(reader) instanceof DiffEditorInput));
	}
}

registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);

class OpenPullRequestAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openPullRequest';

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('openPullRequest', "Open Pull Request"),
			icon: Codicon.gitPullRequest,
			f1: false,
			menu: {
				id: MenuId.AgentsChangesToolbar,
				group: 'navigation',
				order: 9,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					ActiveSessionContextKeys.HasPullRequest,
					// The pull request artifact opens the pull request.
					SessionArtifactIntegrationsEnabledContext.negate())
			}
		});
	}

	async run(accessor: ServicesAccessor, sessionArg?: unknown): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const session = resolveSessionCommandTarget(accessor, [sessionArg])?.session;
		if (!session) {
			return;
		}

		await commandService.executeCommand(OPEN_PULL_REQUEST_ACTION_ID, session);
	}
}

registerAction2(OpenPullRequestAction);

const agentsTextEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
);

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: OpenMultiDiffEditorLayoutDebugAction.ID,
		title: OpenMultiDiffEditorLayoutDebugAction.TITLE,
		category: Categories.Developer,
	},
	when: desktopChangesEditorActive
});

const desktopTextEditorTitle = ContextKeyExpr.and(
	agentsTextEditorActive,
	DesktopLayoutContext,
	IsTopRightEditorGroupContext
);

const desktopTextEditorTitleVisible = ContextKeyExpr.and(
	desktopTextEditorTitle,
	MainEditorAreaVisibleContext
);

class ToggleSessionsEditorWordWrapAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.toggleEditorWordWrap';

	constructor() {
		super({
			id: ToggleSessionsEditorWordWrapAction.ID,
			title: localize2('agentSessions.editorWordWrap', "Word Wrap"),
			f1: false,
			menu: [{
				id: Menus.SessionsEditorTitle,
				group: '1_diff',
				order: 20,
				when: desktopTextEditorTitleVisible,
			}, {
				id: MenuId.EditorTitle,
				group: '1_diff',
				order: 20,
				when: ContextKeyExpr.and(agentsTextEditorActive, DesktopLayoutContext.negate()),
			}],
			toggled: wordWrapToggled(SESSIONS_EDITOR_WORD_WRAP_SETTING),
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		await toggleSessionsWordWrap(accessor, 'editor', args.find(isEditorCommandsContext));
	}
}

registerAction2(ToggleSessionsEditorWordWrapAction);

/** Anchor action hosting the Create Pull Request button bar in the title bar. */
class ChangesHeaderActionsAction extends Action2 {
	constructor() {
		super({
			id: CHANGES_HEADER_ACTIONS_ID,
			title: localize2('changesView.headerActions', "Changes Actions"),
			f1: false,
			menu: {
				id: AgentsWindowMenus.TitleBarSessionMenu,
				group: 'navigation',
				order: 5,
				// Read in each window's own context: for the session it shows, which an editor window's title bar has none of.
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					CustomViewVisibleContext.negate(),
					DesktopLayoutContext,
					SessionIsCreatedContext
				)
			},
		});
	}
	override async run(): Promise<void> { }
}

registerAction2(ChangesHeaderActionsAction);

MenuRegistry.appendMenuItem(Menus.SessionsEditorTitle, {
	submenu: Menus.ChangesFilesView,
	title: localize('filesView', "Files View"),
	group: 'z_filesView',
	order: 20,
	when: ContextKeyExpr.and(desktopDiffEditorTitle, AuxiliaryBarVisibleContext, notChangesEditor),
});

// The Changes editor offers how the Changes view shows its files in the dropdown of Toggle Details, above the details positions.
const changesEditorActive = ActiveEditorContext.isEqualTo(SessionChangesEditor.ID);

class SetChangesListViewModeAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.setChangesListViewMode';

	constructor() {
		super({
			id: SetChangesListViewModeAction.ID,
			title: localize2('agentSessions.setChangesListViewMode', "View as List"),
			icon: Codicon.listFlat,
			f1: false,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
			menu: [{
				id: Menus.ChangesFilesView,
				group: '1_viewMode',
				order: 1,
			}, {
				id: Menus.DetailsToggle,
				group: '1_viewMode',
				order: 1,
				when: changesEditorActive,
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
		accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
	}
}

registerAction2(SetChangesListViewModeAction);

class SetChangesTreeViewModeAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.setChangesTreeViewMode';

	constructor() {
		super({
			id: SetChangesTreeViewModeAction.ID,
			title: localize2('agentSessions.setChangesTreeViewMode', "View as Tree"),
			icon: Codicon.listTree,
			f1: false,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
			menu: [{
				id: Menus.ChangesFilesView,
				group: '1_viewMode',
				order: 2,
			}, {
				id: Menus.DetailsToggle,
				group: '1_viewMode',
				order: 2,
				when: changesEditorActive,
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
		accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
	}
}

registerAction2(SetChangesTreeViewModeAction);

// The main window offers how a multi diff editor shows its files list and where in the dropdown of Toggle Details. A chat
// window offers neither Toggle Details nor Toggle Files, so its editor title overflow offers them instead.
MenuRegistry.appendMenuItem(Menus.SessionsEditorTitle, {
	submenu: MultiDiffEditorFilesViewAndPositionMenu,
	title: localize('filesViewAndPosition', "Files View & Position"),
	group: '2_viewMode',
	order: 10,
	when: ContextKeyExpr.and(desktopMultiDiffEditorTitle, MainEditorAreaVisibleContext, ActiveMultiDiffEditorHasFileListContext, IsAuxiliaryWindowContext),
});

class OpenChangesAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openChanges';

	constructor() {
		super({
			id: OpenChangesAction.ID,
			title: localize2('openChanges', "Open Changes"),
			icon: Codicon.gitCompare,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, sessionResource: URI, _ref: string, ...resources: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const changesViewService = accessor.get(IChangesViewService);

		const target = resolveSessionCommandTarget(accessor, [sessionResource]);
		const session = target?.session;
		if (!session) {
			return;
		}
		const sessionChanges = getChangesOfSession(changesViewService, mainWindowChangesOwner(accessor), session, target.chat).changesObs.get();

		const changes = sessionChanges?.filter(change =>
			resources.some(resource => isChangesFileResource(change, resource))
		) ?? [];

		await Promise.all(changes.map(change => editorService.openEditor({
			original: { resource: change.originalUri },
			modified: { resource: change.modifiedUri }
		})));
	}
}

registerAction2(OpenChangesAction);

const openSingleFileDiffEnabled = ContextKeyExpr.equals(`config.${SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING}`, true);

class OpenFileAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openFile';

	constructor() {
		super({
			id: OpenFileAction.ID,
			title: localize2('openFile', "Open File"),
			icon: Codicon.goToFile,
			f1: false,
			menu: [
				// When opening a file already shows a single file diff, the "Open
				// Changes" alt action is redundant and is therefore omitted.
				{
					id: MenuId.AgentsChangeInlineToolbar,
					group: 'navigation',
					order: 1,
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						ChangesContextKeys.ChangeKind.isEqualTo('file'),
						openSingleFileDiffEnabled)
				},
				// Default behavior: the alt action ("Open Changes") opens a diff
				// editor for the selected change(s).
				{
					id: MenuId.AgentsChangeInlineToolbar,
					group: 'navigation',
					order: 1,
					alt: {
						id: OpenChangesAction.ID,
						title: localize2('openChanges', "Open Changes"),
						icon: Codicon.gitCompare,
					},
					when: ContextKeyExpr.and(
						IsSessionsWindowContext,
						ChangesContextKeys.ChangeKind.isEqualTo('file'),
						openSingleFileDiffEnabled.negate())
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, _sessionResource: URI, _ref: string, ...resources: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await Promise.all(resources.map(resource => editorService.openEditor({ resource })));
	}
}

registerAction2(OpenFileAction);
