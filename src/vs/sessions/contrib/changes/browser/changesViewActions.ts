/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from '../common/changes.js';
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { DOCK_DETAIL_PANEL_SETTING } from '../../../common/sessionConfig.js';
import { Menus } from '../../../browser/menus.js';
import { SessionChangesEditor } from './sessionChangesEditor.js';
import { CHANGES_HEADER_ACTIONS_ID } from './changesView.js';
import { SessionHasChangesContext } from '../../../common/contextkeys.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';

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
		@ISessionsService sessionsService: ISessionsService,
		@IChangesViewService changesViewService: IChangesViewService,
	) {
		super();

		// Bind context key: true when the active session has changes
		this._register(bindContextKey(ActiveSessionContextKeys.HasChanges, contextKeyService, reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		}));

		this._register(bindContextKey(ChangesContextKeys.ViewMode, contextKeyService, reader => {
			return changesViewService.viewModeObs.read(reader);
		}));
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
					ActiveSessionContextKeys.HasPullRequest)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const sessionsService = accessor.get(ISessionsService);
		const activeSession = sessionsService.activeSession.get();
		if (!activeSession) {
			return;
		}

		const gitHubInfo = activeSession.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo?.pullRequest?.uri) {
			return;
		}

		await openerService.open(gitHubInfo.pullRequest.uri);
	}
}

registerAction2(OpenPullRequestAction);

const singlePaneChangesEditorActive = ContextKeyExpr.and(
	IsSessionsWindowContext,
	ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
	ContextKeyExpr.equals(`config.${DOCK_DETAIL_PANEL_SETTING}`, true)
);

// Title-bar (tab-row) gate that does NOT require the editor content area to be
// visible, so session-level title actions (e.g. Create Pull Request) stay available
// when the editor area is closed but the docked tab bar is still shown.
const singlePaneChangesEditorTitle = ContextKeyExpr.and(
	singlePaneChangesEditorActive,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext
);

const singlePaneChangesEditorTitleVisible = ContextKeyExpr.and(
	singlePaneChangesEditorTitle,
	MainEditorAreaVisibleContext
);

/**
 * Anchor action hosting the Create Pull Request button bar ({@link ChangesActionsBar})
 * in the single-pane title bar (right side — the session actions area). The custom action
 * view item is registered for {@link Menus.TitleBarSessionMenu} via IActionViewItemService
 * in changesView.ts. The bar hides itself when its underlying menu has no actions.
 */
class ChangesHeaderActionsAction extends Action2 {
	constructor() {
		super({
			id: CHANGES_HEADER_ACTIONS_ID,
			title: localize2('changesView.headerActions', "Changes Actions"),
			f1: false,
			menu: {
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 5,
				when: ContextKeyExpr.and(
					IsSessionsWindowContext,
					IsAuxiliaryWindowContext.toNegated(),
					ContextKeyExpr.equals(`config.${DOCK_DETAIL_PANEL_SETTING}`, true),
					SessionHasChangesContext
				)
			},
		});
	}
	override async run(): Promise<void> { }
}

registerAction2(ChangesHeaderActionsAction);


class SetChangesListViewModeAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.setChangesListViewMode';

	constructor() {
		super({
			id: SetChangesListViewModeAction.ID,
			title: localize2('agentSessions.setChangesListViewMode', "View as List"),
			icon: Codicon.listFlat,
			f1: false,
			menu: {
				// Always in the overflow ("…") of the right header, whether the editor
				// area is visible or collapsed (as long as the changes list is shown).
				id: Menus.SessionsEditorHeaderSecondary,
				group: 'secondary',
				order: 20,
				when: ContextKeyExpr.and(
					singlePaneChangesEditorTitle,
					AuxiliaryBarVisibleContext,
					ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree))
			}
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
			menu: {
				// Always in the overflow ("…") of the right header, whether the editor
				// area is visible or collapsed (as long as the changes list is shown).
				id: Menus.SessionsEditorHeaderSecondary,
				group: 'secondary',
				order: 20,
				when: ContextKeyExpr.and(
					singlePaneChangesEditorTitle,
					AuxiliaryBarVisibleContext,
					ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List))
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
		accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
	}
}

registerAction2(SetChangesTreeViewModeAction);

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
				group: '1_diff',
				order: 10,
				when: ContextKeyExpr.and(
					singlePaneChangesEditorTitleVisible,
					ContextKeyExpr.not('multiDiffEditorAllCollapsed'))
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
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
				group: '1_diff',
				order: 10,
				when: ContextKeyExpr.and(
					singlePaneChangesEditorActive,
					IsAuxiliaryWindowContext.toNegated(),
					IsTopRightEditorGroupContext,
					MainEditorAreaVisibleContext,
					ContextKeyExpr.has('multiDiffEditorAllCollapsed'))
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
		if (activeEditorPane instanceof SessionChangesEditor) {
			activeEditorPane.expandAllDiffs();
		}
	}
}

registerAction2(ExpandAllSessionChangesDiffsAction);

class ToggleSessionChangesInlineViewAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.toggleInlineView';

	constructor() {
		super({
			id: ToggleSessionChangesInlineViewAction.ID,
			title: localize2('toggleDiffView', "Toggle Diff View"),
			category: localize2('changes', "Changes"),
			f1: true,
			precondition: singlePaneChangesEditorTitleVisible,
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const renderSideBySide = configurationService.getValue<boolean>('diffEditor.renderSideBySide') ?? true;
		return configurationService.updateValue('diffEditor.renderSideBySide', !renderSideBySide, ConfigurationTarget.WORKSPACE);
	}
}

registerAction2(ToggleSessionChangesInlineViewAction);

// Primary header button with state-specific titles: "Show Side by Side Diff" when
// currently inline, and (checked) "Show Inline Diff" when currently side by side.
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
	command: {
		id: ToggleSessionChangesInlineViewAction.ID,
		title: localize('showSideBySideDiff', "Show Side by Side Diff"),
		icon: Codicon.diffSidebyside,
		toggled: {
			condition: EditorContextKeys.multiDiffEditorRenderSideBySide,
			title: localize('showInlineDiff', "Show Inline Diff"),
		},
	},
	group: '1_diff',
	order: 20,
	when: singlePaneChangesEditorTitleVisible
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

	async run(accessor: ServicesAccessor, _sessionResource: URI, _ref: string, ...resources: URI[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const changesViewService = accessor.get(IChangesViewService);

		const sessionChanges = changesViewService.activeSessionChangesObs.get();

		const changes = sessionChanges?.filter(change =>
			resources.some(resource => isEqual(change.modifiedUri ?? change.originalUri, resource))
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
