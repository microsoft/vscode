/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsTitleBarWidget.css';
import { $, reset } from '../../../../base/browser/dom.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Menus } from '../../../browser/menus.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from './sessionsActions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getUntitledSessionTitle } from '../../../services/sessions/common/session.js';
import { IBlockedSessionsHeaderActionContext } from './blockedSessionsList.js';

const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = 'sessions.blockedSessions.showAllSessions';
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreAllInputNeeded';
const HIDE_BLOCKED_SESSIONS_COMMAND_ID = 'sessions.blockedSessions.hide';

export function registerBlockedSessionsHeaderActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
				title: localize('showAllSessions', "Show All Sessions"),
				icon: Codicon.listSelection,
			},
			group: 'navigation',
			order: 1,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreAllInputNeeded', "Ignore All Input Needed"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 2,
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
			command: {
				id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
				title: localize('closeBlockedSessions', "Close"),
				icon: Codicon.close,
			},
			group: 'z_close',
			order: 1,
		}),
	);
}

export function registerBlockedSessionsHeaderCommands(): IDisposable {
	return combinedDisposable(
		CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.showAllSessions()),
		CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.ignoreAllSessions()),
		CommandsRegistry.registerCommand(HIDE_BLOCKED_SESSIONS_COMMAND_ID, (_accessor, context: IBlockedSessionsHeaderActionContext) => context.close()),
	);
}

/**
 * Renders the active session identity in the Agents window title bar.
 */
export class SessionsTitleBarWidget extends BaseActionViewItem {

	private _container: HTMLElement | undefined;
	private _lastRenderState: string | undefined;

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super(undefined, action, options);
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			activeSession?.title.read(reader);
			activeSession?.workspace.read(reader);
			activeSession?.isQuickChat?.read(reader);
			activeSession?.isCreated.read(reader);
			this._render();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		this._container = container;
		container.classList.add('agent-sessions-titlebar-container');

		this._render();
	}

	override setFocusable(_focusable: boolean): void {
		this._container?.setAttribute('tabindex', '-1');
	}

	override onClick(): void { }

	private _render(): void {
		if (!this._container) {
			return;
		}

		const icon = this._getActiveSessionIcon();
		const sessionTitle = this._getSessionTitle();
		const workspaceLabel = this._getRepositoryLabel();
		const renderState = `${icon?.id ?? ''}|${sessionTitle}|${workspaceLabel ?? ''}`;
		if (this._lastRenderState === renderState) {
			return;
		}
		this._lastRenderState = renderState;

		reset(this._container);
		this._container.removeAttribute('role');
		this._container.removeAttribute('aria-label');
		this._container.tabIndex = -1;
		this._renderActiveSession();
	}

	/**
	 * Render the active-session identity: icon + title + workspace.
	 */
	private _renderActiveSession(): void {
		const container = this._container!;

		const icon = this._getActiveSessionIcon();
		const sessionTitle = this._getSessionTitle();
		const workspaceLabel = this._getRepositoryLabel();

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

		container.appendChild(sessionPill);
	}

	/**
	 * Get the icon for the active session's type.
	 */
	private _getActiveSessionIcon(): ThemeIcon | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			return sessionData.icon;
		}
		return undefined;
	}

	/**
	 * Get the display title for the active session.
	 */
	private _getSessionTitle(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (!sessionData) {
			return undefined;
		}
		if (!sessionData.isCreated.get()) {
			return sessionData.isQuickChat?.get()
				? localize('newChat', "New chat")
				: localize('newSession', "New session");
		}
		return sessionData.title.get()?.trim() || getUntitledSessionTitle(sessionData.isQuickChat?.get() ?? false);
	}

	/**
	 * Get the repository label for the active session.
	 */
	private _getRepositoryLabel(): string | undefined {
		const sessionData = this.sessionsService.activeSession.get();
		if (sessionData) {
			const workspace = sessionData.workspace.get();
			if (workspace) {
				return workspace.label;
			}
		}
		return undefined;
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
