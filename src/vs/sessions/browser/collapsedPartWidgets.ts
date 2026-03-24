/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/collapsedPanelWidget.css';
import { $, addDisposableListener, append, EventType } from '../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
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

		// Sidebar toggle button (leftmost)
		this._register(this.createSidebarToggleButton());

		// New session button (next to panel toggle)
		this._register(this.createNewSessionButton());

		// Session status indicators (rightmost)
		this.indicatorContainer = append(this.element, $('.collapsed-panel-button.collapsed-sidebar-status'));

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

	private createSidebarToggleButton(): DisposableStore {
		const store = new DisposableStore();
		const btn = append(this.element, $('.collapsed-panel-button.collapsed-sidebar-panel-toggle'));
		let iconElement: HTMLElement | undefined;

		const updateIcon = () => {
			const sidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			const icon = sidebarVisible ? Codicon.layoutSidebarLeft : Codicon.layoutSidebarLeftOff;
			iconElement?.remove();
			iconElement = append(btn, $(ThemeIcon.asCSSSelector(icon)));
		};

		updateIcon();

		store.add(this.hoverService.setupManagedHover(this.hoverDelegate, btn, localize('toggleSidebar', "Toggle Side Bar")));

		store.add(addDisposableListener(btn, EventType.CLICK, () => {
			this.commandService.executeCommand('workbench.action.agentToggleSidebarVisibility');
		}));

		store.add(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.SIDEBAR_PART) {
				updateIcon();
			}
		}));

		return store;
	}

	private rebuildIndicators(): void {
		this.indicatorDisposables.clear();
		this.indicatorContainer.textContent = '';

		const sessions = this.agentSessionsService.model.sessions;
		const counts = this.countSessionsByStatus(sessions);

		const tooltipParts: string[] = [];

		// In-progress (matches agentSessionsViewer: sessionInProgress)
		if (counts.inProgress > 0) {
			this.appendStatusSegment(Codicon.sessionInProgress, `${counts.inProgress}`, 'collapsed-sidebar-indicator-active');
			tooltipParts.push(localize('sessionsInProgress', "{0} session(s) in progress", counts.inProgress));
		}

		// Needs input (matches agentSessionsViewer: circleFilled)
		if (counts.needsInput > 0) {
			this.appendStatusSegment(Codicon.circleFilled, `${counts.needsInput}`, 'collapsed-sidebar-indicator-input');
			tooltipParts.push(localize('sessionsNeedInput', "{0} session(s) need input", counts.needsInput));
		}

		// Failed (matches agentSessionsViewer: error)
		if (counts.failed > 0) {
			this.appendStatusSegment(Codicon.error, `${counts.failed}`, 'collapsed-sidebar-indicator-error');
			tooltipParts.push(localize('sessionsFailed', "{0} session(s) with errors", counts.failed));
		}

		// Unread (matches agentSessionsViewer: circleFilled with textLink-foreground)
		if (counts.unread > 0) {
			this.appendStatusSegment(Codicon.circleFilled, `${counts.unread}`, 'collapsed-sidebar-indicator-unread');
			tooltipParts.push(localize('sessionsUnread', "{0} unread session(s)", counts.unread));
		}

		// If no sessions at all
		if (sessions.length === 0) {
			this.appendStatusSegment(Codicon.commentDiscussion, '0', 'collapsed-sidebar-indicator-empty');
			tooltipParts.push(localize('noSessions', "No sessions"));
		}

		if (tooltipParts.length > 0) {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, this.indicatorContainer, tooltipParts.join('\n')
			));

			this.indicatorDisposables.add(addDisposableListener(this.indicatorContainer, EventType.CLICK, () => {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			}));
		}
	}

	private appendStatusSegment(icon: ThemeIcon, count: string, className: string): void {
		const segment = append(this.indicatorContainer, $(`span.collapsed-sidebar-segment.${className}`));
		append(segment, $(ThemeIcon.asCSSSelector(icon)));
		const label = append(segment, $('span.collapsed-sidebar-count'));
		label.textContent = count;
	}

	private countSessionsByStatus(sessions: IAgentSession[]): { inProgress: number; needsInput: number; failed: number; unread: number } {
		let inProgress = 0;
		let needsInput = 0;
		let failed = 0;
		let unread = 0;

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
					if (!session.isRead()) {
						unread++;
					}
					break;
			}
		}

		return { inProgress, needsInput, failed, unread };
	}

	show(): void {
		this.element.classList.remove('collapsed-panel-hidden');
	}

	hide(): void {
		this.element.classList.add('collapsed-panel-hidden');
	}
}

/**
 * Widget shown in the titlebar right area showing file change counts
 * (files, insertions, deletions) from the active session.
 * Always visible — acts as a toggle for the auxiliary bar.
 */
export class CollapsedAuxiliaryBarWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly changesBtn: HTMLElement;
	private readonly indicatorDisposables = this._register(new DisposableStore());
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());
	private activeSessionResource: (() => URI | undefined) | undefined;
	private readonly activeSessionDisposable = this._register(new MutableDisposable());

	constructor(
		parent: HTMLElement,
		windowControlsContainer: HTMLElement | undefined,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
	) {
		super();

		this.element = $('div.collapsed-panel-widget.collapsed-auxbar-widget');

		// Insert before the window-controls-container so the widget is not
		// hidden behind the WCO on Windows.
		if (windowControlsContainer && windowControlsContainer.parentElement === parent) {
			parent.insertBefore(this.element, windowControlsContainer);
		} else {
			append(parent, this.element);
		}

		this._register(toDisposable(() => this.element.remove()));

		const indicatorContainer = append(this.element, $('.collapsed-panel-buttons'));
		this.changesBtn = append(indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator'));

		// Click handler lives on the persistent button
		this._register(addDisposableListener(this.changesBtn, EventType.CLICK, () => {
			const isVisible = !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
			this.layoutService.setPartHidden(!isVisible, Parts.AUXILIARYBAR_PART);
			if (isVisible) {
				this.paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar);
			}
		}));

		// Listen for session changes to update indicators
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.rebuildIndicators()));

		// Initial build
		this.rebuildIndicators();
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
		this.changesBtn.textContent = '';

		// Get change summary from the active session
		const resource = this.activeSessionResource?.();
		const session = resource ? this.agentSessionsService.getSession(resource) : undefined;
		const summary = session ? getAgentChangesSummary(session.changes) : undefined;

		// Rebuild inner content: [diff icon] +insertions -deletions
		append(this.changesBtn, $(ThemeIcon.asCSSSelector(Codicon.diffMultiple)));

		if (summary && summary.insertions > 0) {
			const insLabel = append(this.changesBtn, $('span.collapsed-auxbar-count.collapsed-auxbar-insertions'));
			insLabel.textContent = `+${summary.insertions}`;
		}

		if (summary && summary.deletions > 0) {
			const delLabel = append(this.changesBtn, $('span.collapsed-auxbar-count.collapsed-auxbar-deletions'));
			delLabel.textContent = `-${summary.deletions}`;
		}

		if (summary) {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, this.changesBtn,
				localize('changesSummary', "{0} file(s) changed, {1} insertion(s), {2} deletion(s)", summary.files, summary.insertions, summary.deletions)
			));
		} else {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, this.changesBtn,
				localize('showChanges', "Show Changes")
			));
		}
	}

	/**
	 * Update the active visual state of the widget based on
	 * whether the auxiliary bar is currently visible.
	 */
	updateActiveState(auxiliaryBarVisible: boolean): void {
		this.element.classList.toggle('active', auxiliaryBarVisible);
	}
}
