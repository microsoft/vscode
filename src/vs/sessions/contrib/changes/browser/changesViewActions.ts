/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../common/changes.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { ChangesViewPane } from './changesView.js';

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

registerAction2(class FocusChangesViewAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.focusChangesView',
			title: localize2('focusChangesView', "Focus Changes View"),
			category: Categories.View,
			precondition: IsSessionsWindowContext,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
				when: IsSessionsWindowContext,
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewsService = accessor.get(IViewsService);
		await paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar, true);
		const view = await viewsService.openView(CHANGES_VIEW_ID, true);
		view?.focus();
	}
});

registerAction2(class FocusChangesFileViewAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.focusChangesFileView',
			title: localize2('focusChangesFileView', "Focus Files Explorer View"),
			category: Categories.View,
			precondition: IsSessionsWindowContext,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
				when: IsSessionsWindowContext,
			},
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView('sessions.files.explorer', true);
	}
});

class ChangesViewActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesViewActions';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
	) {
		super();

		// Bind context key: true when the active session has changes
		this._register(bindContextKey(ActiveSessionContextKeys.HasChanges, contextKeyService, reader => {
			const activeSession = sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return false;
			}
			const changes = activeSession.changes.read(reader);
			return changes.length > 0;
		}));
	}
}

registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);

export class ViewAllSessionChangesAction extends Action2 {
	static readonly ID = 'chatEditing.viewAllSessionChanges';

	constructor() {
		super({
			id: ViewAllSessionChangesAction.ID,
			title: localize2('chatEditing.viewAllSessionChanges', 'View All Changes'),
			icon: Codicon.diffMultiple,
			f1: false,
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('sessions.hasGitRepository', true),
				ChatContextKeys.hasAgentSessionChanges,
			),
			menu: [
				{
					id: MenuId.ChatEditingSessionChangesToolbar,
					group: 'navigation',
					order: 10,
				}
			],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
		await view?.openChanges();
	}
}
registerAction2(ViewAllSessionChangesAction);

class OpenPullRequestAction extends Action2 {
	static readonly ID = 'workbench.action.agentSessions.openPullRequest';

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('openPullRequest', "Open Pull Request"),
			icon: Codicon.gitPullRequest,
			f1: false,
			precondition: ChatContextKeys.requestInProgress.negate(),
			menu: {
				id: MenuId.ChatEditingSessionChangesToolbar,
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
		const sessionManagementService = accessor.get(ISessionsManagementService);
		const activeSession = sessionManagementService.activeSession.get();
		if (!activeSession) {
			return;
		}

		const gitHubInfo = activeSession.gitHubInfo.get();
		if (!gitHubInfo?.pullRequest?.uri) {
			return;
		}

		await openerService.open(gitHubInfo.pullRequest.uri);
	}
}

registerAction2(OpenPullRequestAction);
