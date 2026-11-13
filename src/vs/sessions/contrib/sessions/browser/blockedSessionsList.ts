/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/blockedSessionsList.css';
import { $, append } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { IApprovedSession, ISessionCIFixModel, ISessionsFlatListOptions, SessionsFlatList, SessionItemStatusContext } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { AgentSessionApprovalModel } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';

export interface ICommandCenterSessionsHeaderActionContext {
	readonly showAllSessions: () => void;
	readonly close: () => void;
}

export interface IBlockedSessionsHeaderActionContext extends ICommandCenterSessionsHeaderActionContext {
	readonly ignoreAllSessions: () => void;
}

export const IGNORE_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreInputNeeded';
export const IGNORE_CI_FAILURE_COMMAND_ID = 'sessions.blockedSessions.ignoreCIFailure';

/** Register the actions shown in blocked-session row toolbars. */
export function registerBlockedSessionsItemActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsItem, {
			command: {
				id: IGNORE_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreInputNeeded', "Ignore Needs Attention Alert"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.equals(SessionItemStatusContext.key, SessionStatus.NeedsInput),
		}),
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsItem, {
			command: {
				id: IGNORE_CI_FAILURE_COMMAND_ID,
				title: localize('ignoreCIFailure', "Ignore CI Failure"),
				icon: Codicon.bellSlash,
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.notEquals(SessionItemStatusContext.key, SessionStatus.NeedsInput),
		}),
	);
}

/** Fixed width of a command-center sessions list, in pixels. */
const COMMAND_CENTER_LIST_WIDTH = 360;
/** Maximum number of rows shown before a command-center sessions list scrolls. */
const COMMAND_CENTER_LIST_MAX_VISIBLE_ROWS = 8;
/** Maximum number of terminal-command lines shown in a session's approval prompt. */
const BLOCKED_LIST_APPROVAL_ROW_MAX_LINES = 5;

interface ICommandCenterSessionsListOptions {
	readonly title: string;
	readonly headerMenuId: MenuId;
	readonly headerActionContext: ICommandCenterSessionsHeaderActionContext;
	readonly listOptions: ISessionsFlatListOptions;
	/** Width of the list, in pixels. Defaults to a fixed width when omitted. */
	readonly width?: number;
	readonly blocked: boolean;
}

export interface ISessionsCommandCenterListOptions {
	/** Session shown as selected in the list. */
	readonly activeSession?: IObservable<ISession | undefined>;
	/** Invoked when a session row is activated (clicked or opened via keyboard). */
	readonly onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => void;
	/** Reports when a rich session hover is shown or hidden. */
	readonly onDidChangeSessionHoverVisibility?: (visible: boolean) => void;
	/** Width of the list, in pixels. Defaults to a fixed width when omitted. */
	readonly width?: number;
	/** Opens the full sessions picker. */
	readonly onShowAllSessions: () => void;
	/** Closes the surrounding command-center overlay. */
	readonly onClose: () => void;
}

export interface IBlockedSessionsListOptions extends ISessionsCommandCenterListOptions {
	/** Approval model forwarded to the underlying list (see {@link ISessionsFlatListOptions.approvalModel}). */
	readonly approvalModel?: AgentSessionApprovalModel;
	/** Fix-CI model forwarded to the underlying list (see {@link ISessionsFlatListOptions.ciFixModel}). */
	readonly ciFixModel?: ISessionCIFixModel;
	/** Ignores the session's current blocked occurrence. */
	readonly onIgnoreSession: (session: ISession) => void;
	/** Ignores every blocked occurrence currently shown. */
	readonly onIgnoreAllSessions: () => void;
}

/**
 * A self-sizing, flat list of sessions shown below the command center.
 *
 * Wraps {@link SessionsFlatList} with the fixed width and bounded height used by
 * the command-center dropdown in the sessions titlebar. Hosts append it to a
 * container, push sessions via {@link setSessions}, and listen to content-height
 * changes to reposition the surrounding context view as rows resolve their heights.
 */
class CommandCenterSessionsList extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	/** Fires when the list resizes and the host should re-layout its container. */
	readonly onDidChangeContentHeight: Event<void> = this._onDidChangeContentHeight.event;

	private readonly _onDidApproveSession = this._register(new Emitter<IApprovedSession>());
	/** Fires when a session's pending action is approved from its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;

	private readonly _rowsContainer: HTMLElement;
	private readonly _list: SessionsFlatList;
	private _width: number;

	constructor(
		container: HTMLElement,
		options: ICommandCenterSessionsListOptions,
		instantiationService: IInstantiationService,
	) {
		super();

		this._width = options.width ?? COMMAND_CENTER_LIST_WIDTH;

		this.element = append(container, $('.agent-sessions-command-center-list'));
		this.element.classList.toggle('agent-sessions-blocked-list', options.blocked);

		// Header row: a title on the left and contributed actions on the right.
		const header = append(this.element, $('.agent-sessions-blocked-list-header'));
		const title = append(header, $('.agent-sessions-blocked-list-title'));
		title.textContent = options.title;
		const headerActions = append(header, $('.agent-sessions-blocked-list-header-actions'));
		this._register(instantiationService.createInstance(MenuWorkbenchToolBar, headerActions, options.headerMenuId, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: {
				arg: options.headerActionContext,
			},
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: options.blocked ? 'blockedSessionsList.header' : 'sessionsCommandCenterList.header',
		}));

		this._rowsContainer = append(this.element, $('.agent-sessions-blocked-list-rows'));

		this._list = this._register(instantiationService.createInstance(SessionsFlatList, this._rowsContainer, options.listOptions));

		this._register(this._list.onDidChangeContentHeight(() => {
			this._layout();
			this._onDidChangeContentHeight.fire();
		}));

		this._register(this._list.onDidApproveSession(approved => this._onDidApproveSession.fire(approved)));
	}

	/** Replace the sessions shown in the list and resize to fit their content. */
	setSessions(sessions: readonly ISession[]): void {
		this._list.setSessions(sessions);
		this._layout();
	}

	/** Move keyboard focus into the list. */
	focus(): void {
		this._list.focus();
	}

	/**
	 * Update the list width (e.g. when the anchoring widget reflows as the window
	 * resizes) and re-layout to the new width.
	 */
	setWidth(width: number): void {
		if (this._width === width) {
			return;
		}
		this._width = width;
		this._layout();
	}

	private _layout(): void {
		const maxHeight = COMMAND_CENTER_LIST_MAX_VISIBLE_ROWS * this._list.getRowHeight();
		const height = Math.min(this._list.getContentHeight(), maxHeight);
		this._rowsContainer.style.width = `${this._width}px`;
		this._rowsContainer.style.height = `${height}px`;
		this._list.layout(height, this._width);
	}
}

/** The ordinary command-center preview used for quickly switching sessions. */
export class SessionsCommandCenterList extends CommandCenterSessionsList {

	constructor(
		container: HTMLElement,
		options: ISessionsCommandCenterListOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(container, {
			title: localize('sessions', "Sessions"),
			headerMenuId: Menus.CommandCenterSessionsHeader,
			headerActionContext: {
				showAllSessions: options.onShowAllSessions,
				close: options.onClose,
			},
			listOptions: {
				activeSession: options.activeSession,
				showSessionHover: true,
				onSessionOpen: options.onSessionOpen,
				onDidChangeSessionHoverVisibility: options.onDidChangeSessionHoverVisibility,
				toolbarMenuId: Menus.CommandCenterSessionsItem,
				toolbarTelemetrySource: 'sessionsCommandCenterList.row',
			},
			width: options.width,
			blocked: false,
		}, instantiationService);
	}
}

/** The command-center list used when one or more sessions need attention. */
export class BlockedSessionsList extends CommandCenterSessionsList {

	constructor(
		container: HTMLElement,
		options: IBlockedSessionsListOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const headerActionContext: IBlockedSessionsHeaderActionContext = {
			showAllSessions: options.onShowAllSessions,
			ignoreAllSessions: () => {
				options.onIgnoreAllSessions();
				status(localize('allInputNeededIgnored', "All current blocked sessions were ignored."));
			},
			close: options.onClose,
		};

		super(container, {
			title: localize('sessionsRequiringInput', "Sessions needing attention"),
			headerMenuId: Menus.BlockedSessionsHeader,
			headerActionContext,
			listOptions: {
				activeSession: options.activeSession,
				showSessionHover: true,
				onSessionOpen: options.onSessionOpen,
				onDidChangeSessionHoverVisibility: options.onDidChangeSessionHoverVisibility,
				approvalModel: options.approvalModel,
				ciFixModel: options.ciFixModel,
				approvalRowMaxLines: BLOCKED_LIST_APPROVAL_ROW_MAX_LINES,
				toolbarMenuId: Menus.BlockedSessionsItem,
				toolbarTelemetrySource: 'blockedSessionsList.row',
				onToolbarAction: (action, session) => {
					if (action.id !== IGNORE_INPUT_NEEDED_COMMAND_ID && action.id !== IGNORE_CI_FAILURE_COMMAND_ID) {
						return false;
					}
					options.onIgnoreSession(session);
					status(action.id === IGNORE_INPUT_NEEDED_COMMAND_ID
						? localize('inputNeededIgnored', "Needs attention alert ignored until this session needs attention again.")
						: localize('ciFailureIgnored', "CI failure ignored until this session has another CI failure."));
					return true;
				},
			},
			width: options.width,
			blocked: true,
		}, instantiationService);
	}
}
