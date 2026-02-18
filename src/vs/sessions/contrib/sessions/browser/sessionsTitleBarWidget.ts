/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableListener, EventType, reset } from '../../../../base/browser/dom.js';

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { FocusAgentSessionsAction } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsActions.js';
import { AgentSessionsPicker } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsPicker.js';
import { autorun } from '../../../../base/common/observable.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getAgentChangesSummary, hasValidDiff, IAgentSession, isAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { getAgentSessionProvider, getAgentSessionProviderIcon } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { basename } from '../../../../base/common/resources.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ViewAllSessionChangesAction } from '../../../../workbench/contrib/chat/browser/chatEditing/chatEditingActions.js';

/**
 * Sessions Title Bar Widget - renders the active chat session title
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session label as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Session title
 * - Repository folder name
 * - Changes summary (+insertions -deletions)
 *
 * On click, opens the sessions picker.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());
	private readonly _modelChangeListener = this._register(new MutableDisposable());

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(undefined, action, options);

		// Re-render when the active session changes
		this._register(autorun(reader => {
			const activeSession = this.activeSessionService.activeSession.read(reader);
			this._trackModelTitleChanges(activeSession?.resource);
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when sessions data changes (e.g., changes info updated)
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._lastRenderState = undefined;
			this._render();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('agent-sessions-titlebar-container');

		// Initial render
		this._render();
	}

	override setFocusable(_focusable: boolean): void {
		// Don't set focusable on the container
	}

	// Override onClick to prevent the base class from running the underlying
	// submenu action when the widget handles clicks itself.
	override onClick(): void {
		// No-op: click handling is done by the pill handler
	}

	private _render(): void {
		if (!this._container) {
			return;
		}

		if (this._isRendering) {
			return;
		}
		this._isRendering = true;

		try {
			const label = this._getActiveSessionLabel();
			const icon = this._getActiveSessionIcon();
			const repoLabel = this._getRepositoryLabel();
			const changes = this._getChanges();

			// Build a render-state key from all displayed data
			const renderState = `${icon?.id ?? ''}|${label}|${repoLabel ?? ''}|${changes?.insertions ?? ''}|${changes?.deletions ?? ''}`;

			// Skip re-render if state hasn't changed
			if (this._lastRenderState === renderState) {
				return;
			}
			this._lastRenderState = renderState;

			// Clear existing content
			reset(this._container);
			this._dynamicDisposables.clear();

			// Set up container as the button directly
			this._container.setAttribute('role', 'button');
			this._container.setAttribute('aria-label', localize('agentSessionsShowSessions', "Show Sessions"));
			this._container.tabIndex = 0;

			// Center group: icon + label + folder + changes together
			const centerGroup = $('span.agent-sessions-titlebar-center');

			// Kind icon at the beginning
			if (icon) {
				const iconEl = $('span.agent-sessions-titlebar-icon' + ThemeIcon.asCSSSelector(icon));
				centerGroup.appendChild(iconEl);
			}

			// Label
			const labelEl = $('span.agent-sessions-titlebar-label');
			labelEl.textContent = label;
			centerGroup.appendChild(labelEl);

			// Folder and changes shown next to the title
			if (repoLabel || changes) {
				if (repoLabel) {
					const separator1 = $('span.agent-sessions-titlebar-separator');
					separator1.textContent = '\u00B7';
					centerGroup.appendChild(separator1);

					const repoEl = $('span.agent-sessions-titlebar-repo');
					repoEl.textContent = repoLabel;
					centerGroup.appendChild(repoEl);
				}

				if (changes) {
					const separator2 = $('span.agent-sessions-titlebar-separator');
					separator2.textContent = '\u00B7';
					centerGroup.appendChild(separator2);

					const changesEl = $('span.agent-sessions-titlebar-changes');

					// Diff icon
					const changesIconEl = $('span.agent-sessions-titlebar-changes-icon' + ThemeIcon.asCSSSelector(Codicon.diffMultiple));
					changesEl.appendChild(changesIconEl);

					const addedEl = $('span.agent-sessions-titlebar-added');
					addedEl.textContent = `+${changes.insertions}`;
					changesEl.appendChild(addedEl);

					const removedEl = $('span.agent-sessions-titlebar-removed');
					removedEl.textContent = `-${changes.deletions}`;
					changesEl.appendChild(removedEl);

					centerGroup.appendChild(changesEl);

					// Separate hover for changes
					this._dynamicDisposables.add(this.hoverService.setupManagedHover(
						getDefaultHoverDelegate('mouse'),
						changesEl,
						localize('agentSessions.viewChanges', "View All Changes")
					));

					// Click on changes opens multi-diff editor
					this._dynamicDisposables.add(addDisposableListener(changesEl, EventType.CLICK, (e) => {
						e.preventDefault();
						e.stopPropagation();
						this._openChanges();
					}));
				}
			}

			this._container.appendChild(centerGroup);

			// Hover
			this._dynamicDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('mouse'),
				this._container,
				label
			));

			// Click handler - show sessions picker
			this._dynamicDisposables.add(addDisposableListener(this._container, EventType.MOUSE_DOWN, (e) => {
				e.preventDefault();
				e.stopPropagation();
			}));
			this._dynamicDisposables.add(addDisposableListener(this._container, EventType.CLICK, (e) => {
				e.preventDefault();
				e.stopPropagation();
				this._showSessionsPicker();
			}));

			// Keyboard handler
			this._dynamicDisposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					e.stopPropagation();
					this._showSessionsPicker();
				}
			}));
		} finally {
			this._isRendering = false;
		}
	}

	/**
	 * Track title changes on the chat model for the given session resource.
	 * When the model title changes, re-render the widget.
	 */
	private _trackModelTitleChanges(sessionResource: URI | undefined): void {
		this._modelChangeListener.clear();

		if (!sessionResource) {
			return;
		}

		const model = this.chatService.getSession(sessionResource);
		if (!model) {
			return;
		}

		this._modelChangeListener.value = model.onDidChange(e => {
			if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
				this._lastRenderState = undefined;
				this._render();
			}
		});
	}

	/**
	 * Get the label of the active chat session.
	 * Prefers the live model title over the snapshot label from the active session service.
	 * Falls back to a generic label if no active session is found.
	 */
	private _getActiveSessionLabel(): string {
		const activeSession = this.activeSessionService.getActiveSession();
		if (activeSession?.resource) {
			const model = this.chatService.getSession(activeSession.resource);
			if (model?.title) {
				return model.title;
			}
		}

		if (activeSession?.label) {
			return activeSession.label;
		}

		return localize('agentSessions.newSession', "New Session");
	}

	/**
	 * Get the icon for the active session's kind/provider.
	 */
	private _getActiveSessionIcon(): ThemeIcon | undefined {
		const activeSession = this.activeSessionService.getActiveSession();
		if (!activeSession) {
			return undefined;
		}

		// Try to get icon from the agent session model (has provider-resolved icon)
		const agentSession = this.agentSessionsService.getSession(activeSession.resource);
		if (agentSession) {
			return agentSession.icon;
		}

		// Fall back to provider icon from the resource
		const provider = getAgentSessionProvider(activeSession.resource);
		if (provider !== undefined) {
			return getAgentSessionProviderIcon(provider);
		}

		return undefined;
	}

	/**
	 * Get the repository label for the active session.
	 */
	private _getRepositoryLabel(): string | undefined {
		const activeSession = this.activeSessionService.getActiveSession();
		if (!activeSession) {
			return undefined;
		}

		const uri = activeSession.repository;
		if (!uri) {
			return undefined;
		}

		return basename(uri);
	}

	/**
	 * Get the changes summary (insertions/deletions) for the active session.
	 */
	private _getChanges(): { insertions: number; deletions: number } | undefined {
		const activeSession = this.activeSessionService.getActiveSession();
		if (!activeSession) {
			return undefined;
		}

		let changes: IAgentSession['changes'] | undefined;

		if (isAgentSession(activeSession)) {
			changes = activeSession.changes;
		} else {
			const agentSession = this.agentSessionsService.getSession(activeSession.resource);
			changes = agentSession?.changes;
		}

		if (!changes || !hasValidDiff(changes)) {
			return undefined;
		}

		return getAgentChangesSummary(changes) ?? undefined;
	}

	private _showSessionsPicker(): void {
		const picker = this.instantiationService.createInstance(AgentSessionsPicker, undefined, {
			overrideSessionOpen: (session, openOptions) => this.activeSessionService.openSession(session.resource, openOptions)
		});
		picker.pickAgentSession();
	}

	private _openChanges(): void {
		const activeSession = this.activeSessionService.getActiveSession();
		if (!activeSession) {
			return;
		}

		this.commandService.executeCommand(ViewAllSessionChangesAction.ID, activeSession.resource);
	}
}

/**
 * Provides custom rendering for the sessions title bar widget
 * in the command center. Uses IActionViewItemService to render a custom widget
 * for the TitleBarControlMenu submenu.
 */
export class SessionsTitleBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessionsTitleBar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Register the submenu item in the Agent Sessions command center
		this._register(MenuRegistry.appendMenuItem(Menus.CommandCenter, {
			submenu: Menus.TitleBarControlMenu,
			title: localize('agentSessionsControl', "Agent Sessions"),
			order: 101,
		}));

		// Register a placeholder action so the submenu appears
		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarControlMenu, {
			command: {
				id: FocusAgentSessionsAction.id,
				title: localize('showSessions', "Show Sessions"),
			},
			group: 'a_sessions',
			order: 1
		}));

		this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarControlMenu, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionsTitleBarWidget, action, options);
		}, undefined));
	}
}
