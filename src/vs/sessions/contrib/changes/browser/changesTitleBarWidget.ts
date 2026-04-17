/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesTitleBarWidget.css';

import { $, append } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, AuxiliaryBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { getAgentChangesSummary } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ViewContainerLocation } from '../../../../workbench/common/views.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { logChangesViewToggle } from '../../../common/sessionsTelemetry.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CHANGES_VIEW_CONTAINER_ID } from '../common/changes.js';

const TOGGLE_CHANGES_VIEW_ID = 'workbench.action.agentSessions.toggleChangesView';

/**
 * Action view item that renders the diff stats indicator (file change counts)
 * in the titlebar session toolbar. Shows [diff icon] +insertions -deletions.
 * Clicking toggles the auxiliary bar with the Changes view.
 */
class ChangesTitleBarActionViewItem extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _indicatorDisposables = this._register(new DisposableStore());
	private readonly _hoverDelegate = this._register(createInstantHoverDelegate());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(undefined, action, options);

		// Re-render when the active session changes
		this._register(autorun(reader => {
			this.activeSessionService.activeSession.read(reader);
			this._rebuildIndicators();
		}));

		// Re-render when sessions data changes
		this._register(this.activeSessionService.onDidChangeSessions(() => {
			this._rebuildIndicators();
		}));

		// Update active state when auxiliary bar visibility changes
		this._register(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.AUXILIARYBAR_PART) {
				this._updateActiveState();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('changes-titlebar-indicator');
		container.setAttribute('role', 'button');

		this._rebuildIndicators();
		this._updateActiveState();
	}

	private _updateActiveState(): void {
		const isVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this._container?.classList.toggle('toggled', isVisible);
		this._container?.setAttribute('aria-pressed', String(isVisible));
	}

	private _rebuildIndicators(): void {
		if (!this._container) {
			return;
		}

		this._indicatorDisposables.clear();

		const btn = this._container;
		btn.textContent = '';

		// Get change summary from the active session
		const activeSession = this.activeSessionService.activeSession.get();
		const resource = activeSession?.resource;
		const session = resource ? this.activeSessionService.getSession(resource) : undefined;
		const summary = session ? getAgentChangesSummary(session.changes.get()) : undefined;

		// Rebuild inner content: [diff icon] +insertions -deletions
		append(btn, $(ThemeIcon.asCSSSelector(Codicon.diffMultiple)));

		if (summary && summary.insertions > 0) {
			const insLabel = append(btn, $('span.changes-titlebar-count.changes-titlebar-insertions'));
			insLabel.textContent = `+${summary.insertions}`;
		}

		if (summary && summary.deletions > 0) {
			const delLabel = append(btn, $('span.changes-titlebar-count.changes-titlebar-deletions'));
			delLabel.textContent = `-${summary.deletions}`;
		}

		if (summary) {
			const label = localize('changesSummary', "{0} file(s) changed, {1} insertion(s), {2} deletion(s)", summary.files, summary.insertions, summary.deletions);
			btn.setAttribute('aria-label', label);
			this._indicatorDisposables.add(this.hoverService.setupManagedHover(
				this._hoverDelegate, btn, label
			));
		} else {
			btn.setAttribute('aria-label', localize('showChanges', "Show Changes"));
			this._indicatorDisposables.add(this.hoverService.setupManagedHover(
				this._hoverDelegate, btn,
				localize('showChanges', "Show Changes")
			));
		}
	}
}

/**
 * Registers the changes indicator action in the titlebar session toolbar
 * (`TitleBarSessionMenu`) and provides a custom action view item to render
 * the diff stats widget.
 */
export class ChangesTitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesTitleBar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Register the toggle action in the session toolbar
		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
			command: {
				id: TOGGLE_CHANGES_VIEW_ID,
				title: localize('toggleChanges', "Toggle Changes"),
				icon: Codicon.diffMultiple,
				toggled: AuxiliaryBarVisibleContext,
			},
			group: 'navigation',
			order: 11, // After Run Script (8), Open in VS Code (9), and Open Terminal (10)
			when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
		}));

		// Provide a custom action view item that renders the diff stats
		this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, TOGGLE_CHANGES_VIEW_ID, (action, options) => {
			return instantiationService.createInstance(ChangesTitleBarActionViewItem, action, options);
		}));
	}
}

// Register the toggle action
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHANGES_VIEW_ID,
			title: localize('toggleChanges', "Toggle Changes"),
			icon: Codicon.diffMultiple,
			precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
		});
	}

	run(accessor: ServicesAccessor): void {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const telemetryService = accessor.get(ITelemetryService);

		const isVisible = !layoutService.isVisible(Parts.AUXILIARYBAR_PART);

		if (isVisible) {
			// Editor part
			const hasEditors = editorGroupService.groups.some(group => !group.isEmpty);
			if (hasEditors && !layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
				layoutService.setPartHidden(false, Parts.EDITOR_PART);
			}

			// Auxiliary bar part
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar);
		} else {
			layoutService.setPartHidden(true, Parts.EDITOR_PART);
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}

		logChangesViewToggle(telemetryService, isVisible);
	}
});
