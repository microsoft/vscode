/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, reset } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sessions Title Bar Widget - renders the active chat session
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Repository folder name and active branch/worktree name when available
 *
 * Session actions (changes, terminal, etc.) are rendered via the
 * SessionTitleActions menu toolbar next to this widget.
 *
 * On click, opens the sessions picker.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	/** Cached render state to avoid unnecessary DOM rebuilds */
	private _lastRenderState: string | undefined;

	/** Guard to prevent re-entrant rendering */
	private _isRendering = false;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(undefined, action, options);

		// Re-render when the active session's title or workspace changes
		this._register(autorun(reader => {
			const sessionData = this.sessionsManagementService.activeSession.read(reader);
			if (sessionData) {
				sessionData.title.read(reader);
				sessionData.workspace.read(reader);
			}
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when sessions data changes (e.g., changes info updated)
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			this._lastRenderState = undefined;
			this._render();
		}));

		// Re-render when providers change (affects provider picker visibility)
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
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
			const icon = this._getActiveSessionIcon();
			const sessionTitle = this._getSessionTitle() ?? localize('newSession', "New Session");
			const workspaceLabel = this._getRepositoryLabel();

			// Build a render-state key from all displayed data
			const renderState = `${icon?.id ?? ''}|${sessionTitle ?? ''}|${workspaceLabel ?? ''}`;

			// Skip re-render if state hasn't changed
			if (this._lastRenderState === renderState) {
				return;
			}
			this._lastRenderState = renderState;

			// Clear existing content
			reset(this._container);
			this._dynamicDisposables.clear();

			// Set up container as the button directly
			this._container.removeAttribute('aria-hidden');
			this._container.setAttribute('role', 'button');
			this._container.setAttribute('aria-label', localize('agentSessionsShowSessions', "Show Sessions"));
			this._container.tabIndex = 0;

			// Session pill: icon + title + workspace together
			const sessionPill = $('div.agent-sessions-titlebar-pill');

			// Center group: icon + title + workspace name
			const centerGroup = $('div.agent-sessions-titlebar-center');

			// Kind icon at the beginning
			if (icon) {
				const iconEl = $('div.agent-sessions-titlebar-icon' + ThemeIcon.asCSSSelector(icon));
				centerGroup.appendChild(iconEl);
			}

			// Session title shown next to the icon
			if (sessionTitle) {
				const titleEl = $('div.agent-sessions-titlebar-title');
				titleEl.textContent = sessionTitle;
				centerGroup.appendChild(titleEl);
			}

			// Workspace name shown after the session title
			if (workspaceLabel) {
				const separatorEl = $('div.agent-sessions-titlebar-separator');
				centerGroup.appendChild(separatorEl);

				const workspaceEl = $('div.agent-sessions-titlebar-workspace');
				workspaceEl.textContent = workspaceLabel;
				centerGroup.appendChild(workspaceEl);
			}

			sessionPill.appendChild(centerGroup);

			// Click handler on pill
			this._dynamicDisposables.add(addDisposableGenericMouseDownListener(sessionPill, (e) => {
				e.preventDefault();
				e.stopPropagation();
			}));
			this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
				e.preventDefault();
				e.stopPropagation();
				this._showSessionsPicker();
			}));

			this._container.appendChild(sessionPill);

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
	 * Get the icon for the active session's type.
	 */
	private _getActiveSessionIcon(): ThemeIcon | undefined {
		const sessionData = this.sessionsManagementService.activeSession.get();
		if (sessionData) {
			return sessionData.icon;
		}
		return undefined;
	}

	/**
	 * Get the display title for the active session.
	 */
	private _getSessionTitle(): string | undefined {
		const sessionData = this.sessionsManagementService.activeSession.get();
		return sessionData?.title.get()?.trim() || undefined;
	}

	/**
	 * Get the repository label for the active session.
	 */
	private _getRepositoryLabel(): string | undefined {
		const sessionData = this.sessionsManagementService.activeSession.get();
		if (sessionData) {
			const workspace = sessionData.workspace.get();
			if (workspace) {
				return workspace.label;
			}
		}
		return undefined;
	}

	private _showSessionsPicker(): void {
		this.commandService.executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
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
			submenu: Menus.TitleBarSessionTitle,
			title: localize('agentSessionsControl', "Agent Sessions"),
			order: 101,
			when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate())
		}));

		// Register a placeholder action so the submenu appears
		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionTitle, {
			command: {
				id: SHOW_SESSIONS_PICKER_COMMAND_ID,
				title: localize('showSessions', "Show Sessions"),
			},
			group: 'a_sessions',
			order: 1,
			when: IsAuxiliaryWindowContext.negate()
		}));

		this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SessionsTitleBarWidget, action, options);
		}, undefined));
	}
}
