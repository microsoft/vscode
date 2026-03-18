/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/collapsedPanelWidget.css';
import * as dom from '../../base/browser/dom.js';
import { $, append } from '../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../workbench/services/layout/browser/layoutService.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { localize } from '../../nls.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { Codicon } from '../../base/common/codicons.js';
import { IAgentSessionsService } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary, IAgentSession } from '../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ISessionsManagementService } from '../contrib/sessions/browser/sessionsManagementService.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../workbench/common/views.js';

/**
 * Makes an absolutely-positioned element draggable within its offset parent.
 * On first drag, CSS bottom/right are cleared and replaced with top/left for
 * free-form positioning.
 */
export function enableDrag(element: HTMLElement): IDisposable {
	const store = new DisposableStore();
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let moveListener: IDisposable | undefined;
	let upListener: IDisposable | undefined;

	store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, e => {
		// Only primary button; ignore clicks on child buttons
		if (e.button !== 0 || (e.target as HTMLElement).closest('.collapsed-panel-button, .collapsed-sidebar-new-session')) {
			return;
		}

		e.preventDefault();

		const rect = element.getBoundingClientRect();
		dragOffsetX = e.clientX - rect.left;
		dragOffsetY = e.clientY - rect.top;

		// Switch from any bottom/right anchoring to explicit top/left
		element.classList.add('collapsed-panel-dragging');
		element.style.top = `${rect.top}px`;
		element.style.left = `${rect.left}px`;
		element.style.bottom = 'auto';
		element.style.right = 'auto';

		const parentRect = (element.offsetParent ?? element.parentElement)?.getBoundingClientRect();
		const targetWindow = dom.getWindow(element);
		const parentWidth = parentRect?.width ?? targetWindow.innerWidth;
		const parentHeight = parentRect?.height ?? targetWindow.innerHeight;
		const parentLeft = parentRect?.left ?? 0;
		const parentTop = parentRect?.top ?? 0;

		moveListener?.dispose();
		moveListener = dom.addDisposableListener(dom.getWindow(element), dom.EventType.MOUSE_MOVE, ev => {
			const x = Math.max(0, Math.min(ev.clientX - dragOffsetX - parentLeft, parentWidth - element.offsetWidth));
			const y = Math.max(0, Math.min(ev.clientY - dragOffsetY - parentTop, parentHeight - element.offsetHeight));
			element.style.left = `${x}px`;
			element.style.top = `${y}px`;
		});

		upListener?.dispose();
		upListener = dom.addDisposableListener(dom.getWindow(element), dom.EventType.MOUSE_UP, () => {
			element.classList.remove('collapsed-panel-dragging');
			moveListener?.dispose();
			moveListener = undefined;
			upListener?.dispose();
			upListener = undefined;
		});
	}));

	store.add({
		dispose: () => {
			moveListener?.dispose();
			upListener?.dispose();
		}
	});

	return store;
}

/**
 * Collapsed widget shown in the bottom-left corner when the sidebar is hidden.
 * Shows session status counts (active, errors, completed) and a new session button.
 */
export class CollapsedSidebarWidget extends Disposable {

	private readonly element: HTMLElement;
	private readonly indicatorContainer: HTMLElement;
	private readonly indicatorDisposables = this._register(new DisposableStore());

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

		// Enable drag repositioning
		this._register(enableDrag(this.element));

		// Initial build
		this.rebuildIndicators();

		this.hide();
	}

	private createNewSessionButton(): DisposableStore {
		const store = new DisposableStore();
		const btn = append(this.element, $('.collapsed-panel-button.collapsed-sidebar-new-session'));
		append(btn, $(ThemeIcon.asCSSSelector(Codicon.add)));

		store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), btn, localize('newSession', "New Session")));

		store.add(dom.addDisposableListener(btn, dom.EventType.CLICK, () => {
			this.commandService.executeCommand('workbench.action.chat.newChat');
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

		this.indicatorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), indicator, tooltip));

		this.indicatorDisposables.add(dom.addDisposableListener(indicator, dom.EventType.CLICK, () => {
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
		this.element.style.top = '';
		this.element.style.left = '';
		this.element.style.bottom = '';
		this.element.style.right = '';
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

	constructor(
		parent: HTMLElement,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IHoverService private readonly hoverService: IHoverService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
	) {
		super();

		this.element = append(parent, $('.collapsed-panel-widget.collapsed-auxbar-widget'));
		this.indicatorContainer = append(this.element, $('.collapsed-panel-buttons'));

		// Listen for session changes to update indicators
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.rebuildIndicators()));

		// Enable drag repositioning
		this._register(enableDrag(this.element));

		// Initial build
		this.rebuildIndicators();

		this.hide();
	}

	private rebuildIndicators(): void {
		this.indicatorDisposables.clear();
		this.indicatorContainer.textContent = '';

		// Always show the diff button
		const diffBtn = append(this.indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator'));
		append(diffBtn, $(ThemeIcon.asCSSSelector(Codicon.diffMultiple)));

		// Always show the files button
		const filesBtn = append(this.indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator'));
		append(filesBtn, $(ThemeIcon.asCSSSelector(Codicon.files)));

		// Get change summary from active session
		const activeSession = this.sessionsManagementService.getActiveSession();
		const session = activeSession ? this.agentSessionsService.getSession(activeSession.resource) : undefined;
		const summary = session ? getAgentChangesSummary(session.changes) : undefined;

		// Populate diff button with file count if available
		if (summary && summary.files > 0) {
			const filesLabel = append(diffBtn, $('span.collapsed-auxbar-count'));
			filesLabel.textContent = `${summary.files}`;
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'), diffBtn,
				localize('filesChanged', "{0} file(s) changed", summary.files)
			));
		} else {
			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'), diffBtn,
				localize('showChanges', "Show Changes")
			));
		}

		this.indicatorDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('element'), filesBtn,
			localize('showFiles', "Show Files")
		));

		// Click handlers — open auxbar to specific view containers
		this.indicatorDisposables.add(dom.addDisposableListener(diffBtn, dom.EventType.CLICK, () => {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			this.paneCompositeService.openPaneComposite('workbench.view.agentSessions.changesContainer', ViewContainerLocation.AuxiliaryBar);
		}));
		this.indicatorDisposables.add(dom.addDisposableListener(filesBtn, dom.EventType.CLICK, () => {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			this.paneCompositeService.openPaneComposite('workbench.sessions.auxiliaryBar.filesContainer', ViewContainerLocation.AuxiliaryBar);
		}));

		// Insertions
		if (summary && summary.insertions > 0) {
			const insIndicator = append(this.indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator.collapsed-auxbar-insertions'));
			const insLabel = append(insIndicator, $('span.collapsed-auxbar-count.collapsed-auxbar-insertions'));
			insLabel.textContent = `+${summary.insertions}`;

			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'), insIndicator,
				localize('insertions', "{0} insertion(s)", summary.insertions)
			));

			this.indicatorDisposables.add(dom.addDisposableListener(insIndicator, dom.EventType.CLICK, () => {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}));
		}

		// Deletions
		if (summary && summary.deletions > 0) {
			const delIndicator = append(this.indicatorContainer, $('.collapsed-panel-button.collapsed-auxbar-indicator.collapsed-auxbar-deletions'));
			const delLabel = append(delIndicator, $('span.collapsed-auxbar-count.collapsed-auxbar-deletions'));
			delLabel.textContent = `-${summary.deletions}`;

			this.indicatorDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'), delIndicator,
				localize('deletions', "{0} deletion(s)", summary.deletions)
			));

			this.indicatorDisposables.add(dom.addDisposableListener(delIndicator, dom.EventType.CLICK, () => {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			}));
		}
	}

	show(): void {
		this.element.style.top = '';
		this.element.style.left = '';
		this.element.style.bottom = '';
		this.element.style.right = '';
		this.element.classList.remove('collapsed-panel-hidden');
	}

	hide(): void {
		this.element.classList.add('collapsed-panel-hidden');
	}
}
