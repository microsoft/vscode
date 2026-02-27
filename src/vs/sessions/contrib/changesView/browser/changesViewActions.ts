/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesViewActions.css';
import { $, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, IAction2Options, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { getAgentChangesSummary, hasValidDiff } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CHANGES_VIEW_ID } from './changesView.js';
import { IAction } from '../../../../base/common/actions.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';

import { activeSessionHasChangesContextKey } from '../common/changes.js';

const openChangesViewActionOptions: IAction2Options = {
	id: 'workbench.action.agentSessions.openChangesView',
	title: localize2('openChangesView', "Changes"),
	icon: Codicon.diffMultiple,
	f1: false,
	menu: {
		id: Menus.SessionTitleActions,
		order: 1,
		when: ContextKeyExpr.equals(activeSessionHasChangesContextKey.key, true),
	},
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

/**
 * Custom action view item that renders the changes summary as:
 * [diff-icon] +insertions -deletions
 */
class ChangesActionViewItem extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action, options);

		this._register(autorun(reader => {
			this.sessionManagementService.activeSession.read(reader);
			this._updateLabel();
		}));

		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._updateLabel();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._container = container;
		container.classList.add('changes-action-view-item');
		this._updateLabel();
	}

	private _updateLabel(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		reset(this._container);

		const activeSession = this.sessionManagementService.getActiveSession();
		if (!activeSession) {
			this._container.style.display = 'none';
			return;
		}

		const agentSession = this.agentSessionsService.getSession(activeSession.resource);
		const changes = agentSession?.changes;

		if (!changes || !hasValidDiff(changes)) {
			this._container.style.display = 'none';
			return;
		}

		const summary = getAgentChangesSummary(changes);
		if (!summary) {
			this._container.style.display = 'none';
			return;
		}

		this._container.style.display = '';

		// Diff icon
		const iconEl = $('span.changes-action-icon' + ThemeIcon.asCSSSelector(Codicon.diffMultiple));
		this._container.appendChild(iconEl);

		// Insertions
		const addedEl = $('span.changes-action-added');
		addedEl.textContent = `+${summary.insertions}`;
		this._container.appendChild(addedEl);

		// Deletions
		const removedEl = $('span.changes-action-removed');
		removedEl.textContent = `-${summary.deletions}`;
		this._container.appendChild(removedEl);

		// Hover
		this._renderDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this._container,
			localize('agentSessions.viewChanges', "View All Changes")
		));
	}
}

class ChangesViewActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesViewActions';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
	) {
		super();

		this._register(actionViewItemService.register(Menus.SessionTitleActions, OpenChangesViewAction.ID, (action, options) => {
			return instantiationService.createInstance(ChangesActionViewItem, action, options);
		}));

		// Bind context key: true when the active session has changes
		const sessionsChanged = observableFromEvent(this, agentSessionsService.model.onDidChangeSessions, () => { });
		this._register(bindContextKey(activeSessionHasChangesContextKey, contextKeyService, reader => {
			sessionManagementService.activeSession.read(reader);
			sessionsChanged.read(reader);
			const activeSession = sessionManagementService.getActiveSession();
			if (!activeSession) {
				return false;
			}
			const agentSession = agentSessionsService.getSession(activeSession.resource);
			return !!agentSession?.changes && hasValidDiff(agentSession.changes);
		}));
	}
}

registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);
