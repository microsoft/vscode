/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isEditorCommandsContext } from '../../../common/editor.js';
import { isWindowCommandContext } from '../../../common/windowCommandContext.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { getChatHostOpenerOfHost, IChatHostOpener, IChatHostOpenerService } from '../../../services/sessions/browser/chatHostOpener.js';
import { getHostOfSession, getWindowHost, IFocusedSessionHostService, ISessionGridPanes, ISessionHost, ISessionHostService, isSessionHostCommandContext, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';
import { ISessionsPartService, ISessionView } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionGridPane } from '../../../services/sessions/browser/sessionGridPane.js';
import { ISessionsService } from './sessionsService.js';

/** What a Sessions command acts on; see {@link resolveSessionCommandTarget}. */
export interface ISessionCommandTarget {
	/** The host the arguments name, or that shows the target; `undefined` when none or several do. */
	readonly host: ISessionHost | undefined;
	/**
	 * The session of {@link host} when there is one. Otherwise the session the arguments name, which no host shows, so it
	 * is an {@link ISession}, without the view state of a host session.
	 */
	readonly session: ISession | undefined;
	readonly chat: IChat | undefined;
}

function isChat(value: unknown): value is IChat {
	const candidate = value as Partial<IChat> | undefined;
	return !!candidate && typeof candidate === 'object' && candidate.resource instanceof URI && typeof (candidate as Partial<ISession>).sessionId !== 'string' && 'title' in candidate;
}

function isSession(value: unknown): value is ISession {
	const candidate = value as Partial<ISession> | undefined;
	return !!candidate && typeof candidate === 'object' && typeof candidate.sessionId === 'string' && candidate.resource instanceof URI;
}

function ofHost(host: ISessionHost): ISessionCommandTarget {
	return { host, session: host.session.get(), chat: host.chat.get() };
}

function ofSession(sessionHostService: ISessionHostService, gridPanes: ISessionGridPanes, session: ISession, focusedWindowHost: ISessionHost): ISessionCommandTarget {
	// A session names the host that shows it, never a pane by its own object: a pane's toolbars pass the pane's host.
	const host = getHostOfSession(sessionHostService, gridPanes, session.resource, focusedWindowHost);
	return host ? { host, session: host.session.get() ?? session, chat: host.chat.get() ?? session.mainChat.get() } : { host, session, chat: session.mainChat.get() };
}

function ofChat(sessionHostService: ISessionHostService, session: ISession, chat: IChat): ISessionCommandTarget {
	const host = sessionHostService.getHostOfChat(chat.resource);
	return { host, session: host && isEqual(host.session.get()?.resource, session.resource) ? host.session.get() : session, chat };
}

/**
 * Resolves what a Sessions command acts on from the arguments it runs with, the first that matches:
 *
 * - a host's {@link ISessionHostCommandContext}, as its toolbars and menus pass: that host;
 * - an editor command context: the host of the window of its group;
 * - a window command context: the host of that window;
 * - a chat, `{ chat }` or a chat resource: that chat, its session, and the host that shows it, if any;
 * - a session, `{ session }` or a session resource: that session and the host that shows it, with the chat that host shows; when
 *   several hosts show it, the one in the focused window; without a host, its main chat;
 * - no arguments, as from keybindings and the Command Palette: the window host that has focus.
 *
 * Arguments that name something that is not found, or that are none of these, resolve to `undefined`: the command does
 * nothing. It never falls back to the focused host.
 */
export function resolveSessionCommandTarget(accessor: ServicesAccessor, args: readonly unknown[]): ISessionCommandTarget | undefined {
	const sessionHostService = accessor.get(ISessionHostService);
	const values = args.filter(arg => arg !== undefined && arg !== null);
	const result = resolve();
	if (!result) {
		accessor.get(ILogService).trace('[sessionCommandTarget] the arguments did not resolve to a target, the command does nothing');
	}
	return result;

	function resolve(): ISessionCommandTarget | undefined {
		if (values.length === 0) {
			return ofHost(accessor.get(IFocusedSessionHostService).getFocusedHost());
		}
		const hostContext = values.find(isSessionHostCommandContext);
		if (hostContext) {
			const host = sessionHostService.getHost(hostContext.sessionHostId);
			return host && ofHost(host);
		}
		const editorContext = values.find(isEditorCommandsContext);
		if (editorContext) {
			const host = sessionHostService.getHostOfGroup(editorContext.groupId);
			return host && ofHost(host);
		}
		const windowContext = values.find(isWindowCommandContext);
		if (windowContext) {
			const host = sessionHostService.getHostOfWindow(windowContext.windowId);
			return host && ofHost(host);
		}
		const managementService = accessor.get(ISessionsManagementService);
		const value = values[0];
		const chatContext = value && typeof value === 'object' ? (value as { readonly chat?: unknown }).chat : undefined;
		const chat = isChat(value) ? value : isChat(chatContext) ? chatContext : undefined;
		if (chat) {
			const owner = managementService.getSessionForChatResource(chat.resource);
			return owner && ofChat(sessionHostService, owner.session, owner.chat);
		}
		const sessionContext = value && typeof value === 'object' ? (value as { readonly session?: unknown }).session : undefined;
		const session = isSession(value) ? value : isSession(sessionContext) ? sessionContext : undefined;
		if (session) {
			return ofSession(sessionHostService, accessor.get(ISessionsService), session, accessor.get(IFocusedSessionHostService).getFocusedHost());
		}
		if (value instanceof URI) {
			const ofResource = managementService.getSession(value);
			if (ofResource) {
				return ofSession(sessionHostService, accessor.get(ISessionsService), ofResource, accessor.get(IFocusedSessionHostService).getFocusedHost());
			}
			const owner = managementService.getSessionForChatResource(value);
			return owner && ofChat(sessionHostService, owner.session, owner.chat);
		}
		return undefined;
	}
}

/**
 * The view of the grid pane a grid command without arguments acts on: the grid's active pane while the main window, whose
 * grid it is, is the focused host. In a chat window, which has no grid, none: the command does nothing.
 */
export function resolveGridCommandView(accessor: ServicesAccessor): ISessionView | undefined {
	const host = resolveSessionCommandTarget(accessor, [])?.host;
	return host && getWindowHost(host).kind === SessionHostKind.MainWindow ? accessor.get(ISessionsPartService).getActiveSessionView() : undefined;
}

/**
 * The pane of the grid a command without arguments acts on, with its session and the host of its view, which navigation
 * from it comes from: the grid's active pane, while it shows one.
 */
export function resolveGridCommandPane(accessor: ServicesAccessor): { readonly pane: ISessionGridPane; readonly session: ISession; readonly host: ISessionHost } | undefined {
	const view = resolveGridCommandView(accessor);
	const pane = view?.pane.get();
	const session = pane?.session.get();
	return view && pane && session ? { pane, session, host: view.host } : undefined;
}

/**
 * The host a command's navigation comes from: the host its arguments name, as a host's menus and toolbars pass, or, without
 * arguments, the view of the grid's active pane. A command given only a session, such as from the sessions list, comes
 * from none.
 */
export function resolveCommandOriginHost(accessor: ServicesAccessor, args: readonly unknown[]): ISessionHost | undefined {
	const hostContext = args.find(isSessionHostCommandContext);
	if (hostContext) {
		return accessor.get(ISessionHostService).getHost(hostContext.sessionHostId);
	}
	return args.every(arg => arg === undefined || arg === null) ? resolveGridCommandView(accessor)?.host : undefined;
}

/** What a pane command acts on; see {@link resolvePaneCommandTarget}. */
export interface IPaneCommandTarget {
	/** The host the arguments name, or the host of the grid's active pane. */
	readonly host: ISessionHost;
	/** The view of the grid pane the host stands for; `undefined` for a host outside the grid, such as a chat editor's. */
	readonly view: ISessionView | undefined;
	/** The pane of the grid the host stands for; `undefined` for a host outside the grid. */
	readonly pane: ISessionGridPane | undefined;
	/** For a host outside the grid, the opener of the surface that shows its chat, through which a command acts instead. */
	readonly opener: IChatHostOpener | undefined;
}

/**
 * Resolves the pane a pane command, such as Pin or Close, acts on from its arguments: the pane of the host they name, as a
 * pane's toolbars and menus pass it (`createHostMenuOptions`). Without one, as from keybindings and the Command Palette, the
 * grid's active pane while the main window is the focused host, else none. A host outside the grid, such as a chat editor's,
 * has no pane: the command acts through the opener of the surface that shows its chat, if at all. Never by the identity of a
 * session object.
 */
export function resolvePaneCommandTarget(accessor: ServicesAccessor, args: readonly unknown[]): IPaneCommandTarget | undefined {
	const hostContext = args.find(isSessionHostCommandContext);
	if (!hostContext) {
		const view = resolveGridCommandView(accessor);
		return view && { host: view.host, view, pane: accessor.get(ISessionsService).getPaneOfHost(view.host), opener: undefined };
	}
	const host = accessor.get(ISessionHostService).getHost(hostContext.sessionHostId);
	if (!host) {
		accessor.get(ILogService).trace('[sessionCommandTarget] the pane command names a host that is gone, the command does nothing');
		return undefined;
	}
	const sessionsService = accessor.get(ISessionsService);
	const pane = sessionsService.getPaneOfHost(host);
	if (pane || host === sessionsService.gridHost) {
		const sessionsPartService = accessor.get(ISessionsPartService);
		const view = host === sessionsService.gridHost ? sessionsPartService.getActiveSessionView() : sessionsPartService.getSessionViewOfHost(host);
		return { host, view, pane, opener: undefined };
	}
	return { host, view: undefined, pane: undefined, opener: getChatHostOpenerOfHost(accessor.get(IChatHostOpenerService), sessionsService, host) };
}
