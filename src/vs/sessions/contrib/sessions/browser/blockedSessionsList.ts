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
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../browser/menus.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IApprovedSession, ISessionCIFixModel, SessionsFlatList, SessionItemStatusContext } from './views/sessionsList.js';
import { AgentSessionApprovalModel } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';

export const IGNORE_INPUT_NEEDED_COMMAND_ID = 'sessions.blockedSessions.ignoreInputNeeded';
export const IGNORE_CI_FAILURE_COMMAND_ID = 'sessions.blockedSessions.ignoreCIFailure';

export interface IBlockedSessionsHeaderActionContext {
	readonly showAllSessions: () => void;
	readonly ignoreAllSessions: () => void;
	readonly close: () => void;
}

/** Register the actions shown in blocked-session row toolbars. */
export function registerBlockedSessionsItemActions(): IDisposable {
	return combinedDisposable(
		MenuRegistry.appendMenuItem(Menus.BlockedSessionsItem, {
			command: {
				id: IGNORE_INPUT_NEEDED_COMMAND_ID,
				title: localize('ignoreInputNeeded', "Ignore Input Needed"),
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

/** Fixed width of the blocked-sessions list, in pixels. */
const BLOCKED_LIST_WIDTH = 360;
/** Maximum number of rows shown before the list scrolls. */
const BLOCKED_LIST_MAX_VISIBLE_ROWS = 8;
/** Maximum number of terminal-command lines shown in a session's approval prompt. */
const BLOCKED_LIST_APPROVAL_ROW_MAX_LINES = 5;

export interface IBlockedSessionsListOptions {
	/** Invoked when a session row is activated (clicked or opened via keyboard). */
	readonly onSessionOpen: (resource: URI, preserveFocus: boolean, sideBySide: boolean) => void;
	/** Width of the list, in pixels. Defaults to a fixed width when omitted. */
	readonly width?: number;
	/** Approval model forwarded to the underlying list (see {@link ISessionsFlatListOptions.approvalModel}). */
	readonly approvalModel?: AgentSessionApprovalModel;
	/** Fix-CI model forwarded to the underlying list (see {@link ISessionsFlatListOptions.ciFixModel}). */
	readonly ciFixModel?: ISessionCIFixModel;
	/** Ignores the session's current blocked occurrence. */
	readonly onIgnoreSession: (session: ISession) => void;
	/** Opens the full sessions picker. */
	readonly onShowAllSessions: () => void;
	/** Ignores every blocked occurrence currently shown. */
	readonly onIgnoreAllSessions: () => void;
	/** Closes the surrounding blocked-sessions overlay. */
	readonly onClose: () => void;
}

/**
 * A self-sizing, flat list of blocked sessions.
 *
 * Wraps {@link SessionsFlatList} with the fixed width and bounded height used by
 * the blocked-sessions dropdown in the sessions titlebar. Hosts append it to a
 * container, push sessions via {@link setSessions}, and listen to
 * {@link onDidChangeContentHeight} to reposition the surrounding surface (e.g. a
 * context view) as rows resolve their heights.
 */
export class BlockedSessionsList extends Disposable {

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
		options: IBlockedSessionsListOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._width = options.width ?? BLOCKED_LIST_WIDTH;

		const element = append(container, $('.agent-sessions-blocked-list'));

		// Header row: a title on the left and a toolbar of contributed actions on the
		// right (e.g. the action that opens the full sessions picker).
		const header = append(element, $('.agent-sessions-blocked-list-header'));
		const title = append(header, $('.agent-sessions-blocked-list-title'));
		title.textContent = localize('sessionsRequiringInput', "Sessions requiring input");
		const headerActions = append(header, $('.agent-sessions-blocked-list-header-actions'));
		this._register(instantiationService.createInstance(MenuWorkbenchToolBar, headerActions, Menus.BlockedSessionsHeader, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: {
				arg: {
					showAllSessions: options.onShowAllSessions,
					ignoreAllSessions: () => {
						options.onIgnoreAllSessions();
						status(localize('allInputNeededIgnored', "All current blocked sessions were ignored."));
					},
					close: options.onClose,
				} satisfies IBlockedSessionsHeaderActionContext,
			},
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'blockedSessionsList.header',
		}));

		this._rowsContainer = append(element, $('.agent-sessions-blocked-list-rows'));

		this._list = this._register(instantiationService.createInstance(SessionsFlatList, this._rowsContainer, {
			showSessionHover: true,
			onSessionOpen: options.onSessionOpen,
			approvalModel: options.approvalModel,
			ciFixModel: options.ciFixModel,
			approvalRowMaxLines: BLOCKED_LIST_APPROVAL_ROW_MAX_LINES,
			toolbarMenuId: Menus.BlockedSessionsItem,
			onToolbarAction: (action, session) => {
				if (action.id !== IGNORE_INPUT_NEEDED_COMMAND_ID && action.id !== IGNORE_CI_FAILURE_COMMAND_ID) {
					return false;
				}
				options.onIgnoreSession(session);
				status(action.id === IGNORE_INPUT_NEEDED_COMMAND_ID
					? localize('inputNeededIgnored', "Input needed ignored until this session needs input again.")
					: localize('ciFailureIgnored', "CI failure ignored until this session has another CI failure."));
				return true;
			},
		}));

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
		const maxHeight = BLOCKED_LIST_MAX_VISIBLE_ROWS * this._list.getRowHeight();
		const height = Math.min(this._list.getContentHeight(), maxHeight);
		this._rowsContainer.style.width = `${this._width}px`;
		this._rowsContainer.style.height = `${height}px`;
		this._list.layout(height, this._width);
	}
}
