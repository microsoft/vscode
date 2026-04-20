/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, getActiveWindow, reset } from '../../../../base/browser/dom.js';
import { Separator } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMenuService, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatSessionProviderIdContext, IsNewChatSessionContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsListModelService } from './views/sessionsListModelService.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { IsSessionArchivedContext, IsSessionPinnedContext, IsSessionReadContext, SessionItemContextMenuId } from './views/sessionsList.js';
import { basename } from '../../../../base/common/resources.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sessions Title Bar Widget - renders the active chat session title
 * in the command center of the agent sessions workbench.
 *
 * Shows the current chat session label as a clickable pill with:
 * - Kind icon at the beginning (provider type icon)
 * - Session title
 * - Repository folder name and active branch/worktree name when available
 *
 * Session actions (changes, terminal, etc.) are rendered via the
 * SessionTitleActions menu toolbar next to the session title.
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
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsListModelService private readonly sessionsListModelService: ISessionsListModelService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(undefined, action, options);

		// Re-render when the active session, its data, or the active provider changes
		this._register(autorun(reader => {
			const sessionData = this.sessionsManagementService.activeSession.read(reader);
			if (sessionData) {
				sessionData.title.read(reader);
				sessionData.status.read(reader);
				sessionData.workspace.read(reader);
			}
			this.sessionsManagementService.activeProviderId.read(reader);
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
			const label = this._getActiveSessionLabel();
			const icon = this._getActiveSessionIcon();
			const repoLabel = this._getRepositoryLabel();
			const repoDetailLabel = this._getRepositoryDetailLabel();
			const pillLabel = repoLabel ? `${label} \u00B7 ${repoLabel}${repoDetailLabel ? ` (${repoDetailLabel})` : ''}` : label;
			// Build a render-state key from all displayed data
			const renderState = `${icon?.id ?? ''}|${label}|${repoLabel ?? ''}|${repoDetailLabel ?? ''}`;

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

			// Session pill: icon + label + folder together
			const sessionPill = $('span.agent-sessions-titlebar-pill');

			// Center group: icon + label + folder
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

			// Folder shown next to the title
			if (repoLabel) {
				const detailsEl = $('span.agent-sessions-titlebar-details');

				const separator1 = $('span.agent-sessions-titlebar-separator');
				separator1.textContent = '\u00B7';
				separator1.setAttribute('aria-hidden', 'true');
				detailsEl.appendChild(separator1);

				const repoEl = $('span.agent-sessions-titlebar-repo');
				repoEl.textContent = repoDetailLabel ? `${repoLabel} (${repoDetailLabel})` : repoLabel;
				detailsEl.appendChild(repoEl);

				centerGroup.appendChild(detailsEl);
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
			this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CONTEXT_MENU, (e) => {
				e.preventDefault();
				e.stopPropagation();
				this._showContextMenu(e);
			}));

			this._container.appendChild(sessionPill);

			// Hover
			this._dynamicDisposables.add(this.hoverService.setupManagedHover(
				getDefaultHoverDelegate('mouse'),
				sessionPill,
				pillLabel
			));

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
	 * Get the label of the active chat session.
	 */
	private _getActiveSessionLabel(): string {
		const sessionData = this.sessionsManagementService.activeSession.get();
		if (sessionData) {
			return sessionData.title.get() || localize('agentSessions.newSession', "New Session");
		}
		return localize('agentSessions.newSession', "New Session");
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

	private _getRepositoryDetailLabel(): string | undefined {
		const sessionData = this.sessionsManagementService.activeSession.get();
		const workspace = sessionData?.workspace.get();
		const repository = workspace?.repositories[0];
		if (!workspace || !repository) {
			return undefined;
		}

		if (repository.detail && !workspace.label.includes(`[${repository.detail}]`)) {
			return repository.detail;
		}

		if (!repository.workingDirectory) {
			return undefined;
		}

		const worktreeName = basename(repository.workingDirectory);
		if (!worktreeName) {
			return undefined;
		}

		const repositoryName = basename(repository.uri);
		if (worktreeName === workspace.label || worktreeName === repositoryName) {
			return undefined;
		}

		return worktreeName;
	}

	private _showContextMenu(e: MouseEvent): void {
		const sessionData = this.sessionsManagementService.activeSession.get();
		if (!sessionData) {
			return;
		}

		if (this.contextKeyService.getContextKeyValue<boolean>(IsNewChatSessionContext.key)) {
			return;
		}

		const isPinned = this.sessionsListModelService.isSessionPinned(sessionData);
		const isArchived = sessionData.isArchived.get();
		const isRead = this.sessionsListModelService.isSessionRead(sessionData);
		const contextOverlay: [string, boolean | string][] = [
			[IsSessionPinnedContext.key, isPinned],
			[IsSessionArchivedContext.key, isArchived],
			[IsSessionReadContext.key, isRead],
			['chatSessionType', sessionData.sessionType],
			[ChatSessionProviderIdContext.key, sessionData.providerId],
		];

		const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));

		this.contextMenuService.showContextMenu({
			getActions: () => Separator.join(...menu.getActions({ arg: sessionData, shouldForwardArgs: true }).map(([, actions]) => actions)),
			getAnchor: () => new StandardMouseEvent(getActiveWindow(), e),
		});

		menu.dispose();
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
