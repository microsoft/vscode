/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/collapsedPanelWidget.css';
import { $, addDisposableListener, append, EventType, prepend } from '../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { createInstantHoverDelegate } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { localize } from '../../nls.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { Codicon } from '../../base/common/codicons.js';
import { IAgentSessionsService } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary, IAgentSession } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';

import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../workbench/common/views.js';
import { URI } from '../../base/common/uri.js';
import { Event } from '../../base/common/event.js';

// Duplicated from vs/sessions/contrib/changes/browser/changesView.ts to avoid a layering import.
const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';

/**
 * Session status widget displaying a tasklist icon with the number of unread sessions.
 * Can be placed in either the sidebar title area or the titlebar.
 * When `prepend` option is true, the element is prepended to the parent instead of appended.
 */
export class SessionStatusWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly statusBtn: HTMLElement;
	private readonly indicatorDisposables = this._register(new DisposableStore());
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());

	constructor(
		parent: HTMLElement,
		options: { prependToParent?: boolean } | undefined,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
	) {
		super();

		this.element = options?.prependToParent
			? prepend(parent, $('.collapsed-panel-widget.collapsed-sidebar-widget'))
			: append(parent, $('.collapsed-panel-widget.collapsed-sidebar-widget'));

		// Status button: tasklist icon + unread badge
		this.statusBtn = append(this.element, $('.collapsed-panel-button.collapsed-sidebar-status'));

		// Click toggles sidebar visibility
		this._register(addDisposableListener(this.statusBtn, EventType.CLICK, () => {
			const isVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
			this.layoutService.setPartHidden(isVisible, Parts.SIDEBAR_PART);
		}));

		// Listen for session changes
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.rebuildIndicators()));

		// Initial build
		this.rebuildIndicators();

		this.hide();
	}

	private rebuildIndicators(): void {
		this.indicatorDisposables.clear();
		this.statusBtn.textContent = '';

		const sessions = this.agentSessionsService.model.sessions;
		const unreadCount = this.countUnreadSessions(sessions);

		// Always show the tasklist icon
		append(this.statusBtn, $(ThemeIcon.asCSSSelector(Codicon.tasklist)));

		// Show unread count badge only when there are unread sessions
		if (unreadCount > 0) {
			const badge = append(this.statusBtn, $('span.collapsed-sidebar-count'));
			badge.textContent = `${unreadCount}`;

			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, this.statusBtn,
				localize('sessionsUnread', "{0} unread session(s)", unreadCount)
			));
		} else {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				this.hoverDelegate, this.statusBtn,
				localize('toggleSidebar', "Toggle Side Bar")
			));
		}
	}

	private countUnreadSessions(sessions: IAgentSession[]): number {
		let unread = 0;
		for (const session of sessions) {
			if (session.isArchived()) {
				continue;
			}
			if (session.status === AgentSessionStatus.Completed && !session.isRead()) {
				unread++;
			}
		}
		return unread;
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
