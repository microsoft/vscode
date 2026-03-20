/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/collapsedPanelWidget.css';
import { $, addDisposableListener, append, EventType } from '../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { createInstantHoverDelegate } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { localize } from '../../nls.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { Codicon } from '../../base/common/codicons.js';
import { IAgentSessionsService } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary, IAgentSession } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../workbench/common/views.js';
import { URI } from '../../base/common/uri.js';
import { Event } from '../../base/common/event.js';

// Duplicated from vs/sessions/contrib/changes/browser/changesView.ts to avoid a layering import.
const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';

/**
 * Collapsed widget shown in the bottom-left corner when the sidebar is hidden.
 * Shows session status counts (active, errors, completed) and a new session button.
 */
export class CollapsedSidebarWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly indicatorContainer: HTMLElement;
	private readonly indicatorDisposables = this._register(new DisposableStore());
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());

	constructor(
		parent: HTMLElement,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.element = append(parent, $('.collapsed-panel-widget.collapsed-sidebar-widget'));
		this.indicatorContainer = append(this.element, $('.collapsed-panel-buttons'));

		// New session button
		this._register(this.createNewSessionButton());

		// Listen for session changes
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.rebuildIndicators()));

		// Initial build
		this.rebuildIndicators();

		this.hide();
	}

	private createNewSessionButton(): DisposableStore {
		const store = new DisposableStore();
		const btn = append(this.element, $('.collapsed-panel-button.collapsed-sidebar-new-session'));
		append(btn, $(ThemeIcon.asCSSSelector(Codicon.newSession)));

		store.add(this.hoverService.setupManagedHover(this.hoverDelegate, btn, localize('newSession', "New Session")));

		store.add(addDisposableListener(btn, EventType.CLICK, () => {
			this.commandService.executeCommand('workbench.action.sessions.newChat');
		}));

		return store;
	}

	private rebuildIndicators(): void {
		this.indicatorDisposables.clear();
		this.indicatorContainer.textContent = '';

		const sessions = this.agentSessionsService.model.sessions;
		const counts = this.countSessionsByStatus(sessions);

		// In-progress indicator
		if (counts.inProgress > 0) {
			this.createIndicator(
				Codicon.loading,
				`${counts.inProgress}`,
				localize('sessionsInProgress', "{0} session(s) in progress", counts.inProgress),
				'collapsed-sidebar-indicator-active'
			);
		}

		// Needs input indicator
		if (counts.needsInput > 0) {
			this.createIndicator(
				Codicon.bell,
				`${counts.needsInput}`,
				localize('sessionsNeedInput', "{0} session(s) need input", counts.needsInput),
				'collapsed-sidebar-indicator-input'
			);
		}

		// Error indicator
		if (counts.failed > 0) {
			this.createIndicator(
				Codicon.error,
				`${counts.failed}`,
				localize('sessionsFailed', "{0} session(s) with errors", counts.failed),
				'collapsed-sidebar-indicator-error'
			);
		}

		// Completed indicator
		if (counts.completed > 0) {
			this.createIndicator(
				Codicon.check,
				`${counts.completed}`,
				localize('sessionsCompleted', "{0} session(s) completed", counts.completed),
				'collapsed-sidebar-indicator-done'
			);
		}

		// If no sessions at all, show a total count
		if (sessions.length === 0) {
			this.createIndicator(
				Codicon.commentDiscussion,
				'0',
				localize('noSessions', "No sessions"),
				'collapsed-sidebar-indicator-empty'
			);
		}
	}

	private createIndicator(icon: ThemeIcon, count: string, tooltip: string, className: string): void {
		const indicator = append(this.indicatorContainer, $(`.collapsed-panel-button.${className}`));
		append(indicator, $(ThemeIcon.asCSSSelector(icon)));
		const label = append(indicator, $('span.collapsed-sidebar-count'));
		label.textContent = count;

		this.indicatorDisposables.add(this.hoverService.setupManagedHover(this.hoverDelegate, indicator, tooltip));

		this.indicatorDisposables.add(addDisposableListener(indicator, EventType.CLICK, () => {
			this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}));
	}

	private countSessionsByStatus(sessions: IAgentSession[]): { inProgress: number; needsInput: number; failed: number; completed: number } {
		let inProgress = 0;
		let needsInput = 0;
		let failed = 0;
		let completed = 0;

		for (const session of sessions) {
			if (session.isArchived()) {
				continue;
			}
			switch (session.status) {
				case AgentSessionStatus.InProgress:
					inProgress++;
					break;
				case AgentSessionStatus.NeedsInput:
					needsInput++;
					break;
				case AgentSessionStatus.Failed:
					failed++;
					break;
				case AgentSessionStatus.Completed:
					completed++;
					break;
			}
		}

		return { inProgress, needsInput, failed, completed };
	}

	show(): void {
		this.element.classList.remove('collapsed-panel-hidden');
	}

	hide(): void {
		this.element.classList.add('collapsed-panel-hidden');
	}
}

/**
 * Collapsed widget shown in the bottom-right corner when the auxiliary bar is hidden.
 * Shows file change counts (files, insertions, deletions) from the active session.
 */
export class CollapsedAuxiliaryBarWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly indicatorContainer: HTMLElement;
	private readonly indicatorDisposables = this._register(new DisposableStore());
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());
	private activeSessionResource: (() => URI | undefined) | undefined;
	private readonly activeSessionDisposable = this._register(new MutableDisposable());

	constructor(
		parent: HTMLElement,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
	) {
		super();

		this.element = append(parent, $('.collapsed-panel-widget.collapsed-auxbar-widget'));
		this.indicatorContainer = append(this.element, $('.collapsed-panel-buttons'));

		// Listen for session changes to update indicators
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.rebuildIndicators()));

		// Initial build
		this.rebuildIndicators();

		this.hide();
	}

	/**
	 * Bind an active-session provider so indicators reflect the currently
	 * selected session rather than aggregating all sessions.
	 */
	setActiveSessionProvider(getResource: () => URI | undefined, onDidChange: Event<void>): void {
		this.activeSessionResource = getResource;
		this.activeSessionDisposable.value = onDidChange(() => this.rebuildIndicators());
		this.rebuildIndicators();
	}

	private rebuildIndicators(): void {
		this.indicatorDisposables.clear();
		this.indicatorContainer.textContent = '';

		// Get change summary from the active session
		const resource = this.activeSessionResource?.();
		const session = resource ? this.agentSessionsService.getSession(resource) : undefined;
		const summary = session ? getAgentChangesSummary(session.changes) : undefined;

		// Combined changes button: [diff icon] +insertions -deletions fileCount
		const changesBtn = append(this.indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator'));

		append(changesBtn, $(ThemeIcon.asCSSSelector(Codicon.diffMultiple)));

		if (summary && summary.insertions > 0) {
			const insLabel = append(changesBtn, $('span.collapsed-auxbar-count.collapsed-auxbar-insertions'));
			insLabel.textContent = `+${summary.insertions}`;
		}

		if (summary && summary.deletions > 0) {
			const delLabel = append(changesBtn, $('span.collapsed-auxbar-count.collapsed-auxbar-deletions'));
			delLabel.textContent = `-${summary.deletions}`;
		}

		if (summary) {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, changesBtn,
				localize('changesSummary', "{0} file(s) changed, {1} insertion(s), {2} deletion(s)", summary.files, summary.insertions, summary.deletions)
			));
		} else {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, changesBtn,
				localize('showChanges', "Show Changes")
			));
		}

		this.indicatorDisposables.add(addDisposableListener(changesBtn, EventType.CLICK, () => {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			this.paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar);
		}));
	}

	show(): void {
		this.element.classList.remove('collapsed-panel-hidden');
	}

	hide(): void {
		this.element.classList.add('collapsed-panel-hidden');
	}
}
