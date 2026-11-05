/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ActiveSessionHost, IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../browser/sessionHost.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { IChat } from '../../common/session.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

/**
 * The grid state a test models on its `ISessionsService` mock, from which the host stubs derive what the windows show:
 * the session of the grid's active pane, the main window's when it differs, and the sessions of chat windows. None of it
 * is part of `ISessionsService`: others read the windows' hosts.
 */
export interface ITestSessionsGridState {
	readonly activeSession?: IObservable<IActiveSession | undefined>;
	readonly mainWindowActiveSession?: IObservable<IActiveSession | undefined>;
	readonly windowSessions?: IObservable<readonly IActiveSession[]>;
}

/** An `ISessionsService` mock with the grid state the host stubs derive from. */
export type ITestSessionsService = ISessionsService & ITestSessionsGridState;

/** A sessions service whose grid host is `gridHost`, for a real {@link SessionHostService}. */
export function sessionsServiceWithGridHost(gridHost: ISessionHost): ISessionsService {
	// A grid without panes of its own: no pane is its active or a detached one.
	return upcastPartial<ISessionsService>({ gridHost, isActivePane: () => false, isDetachedPane: () => false });
}

/**
 * Stubs the main window host and the host lookups on `instantiationService`, for tests of UI that hosts sessions, such
 * as session views and composers, which nest their hosts in the one they are created in.
 */
export function stubSessionHosts(instantiationService: TestInstantiationService, store: Pick<DisposableStore, 'add'>, options?: { readonly session?: IObservable<IActiveSession | undefined>; readonly editorGroupsService?: IEditorGroupsService }): { readonly mainHost: ISessionHost; readonly sessionHostService: SessionHostService } {
	const mainHost = new ActiveSessionHost({
		kind: SessionHostKind.MainWindow,
		parent: undefined,
		session: options?.session ?? constObservable(undefined),
		contextKeyService: upcastPartial<IContextKeyService>({}),
		windowId: constObservable(mainWindow.vscodeWindowId),
	});
	const sessionHostService = store.add(new SessionHostService(sessionsServiceWithGridHost(mainHost), options?.editorGroupsService ?? upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
	instantiationService.stub(ISessionHost, mainHost);
	instantiationService.stub(ISessionHostService, sessionHostService);
	return { mainHost, sessionHostService };
}

/**
 * A real {@link SessionHostService} with hosts for the state `ISessionsService` has: the main window shows
 * `mainWindowActiveSession` (else `activeSession`), a pane of the main window each of `visibleSessions`, and a chat window
 * each of `windowSessions`. Each host shows the active chat of its session.
 */
export function sessionHostServiceOf(store: Pick<DisposableStore, 'add'>, grid: Partial<ITestSessionsService>): SessionHostService {
	const state = {
		mainWindowActiveSession: grid.mainWindowActiveSession ?? grid.activeSession ?? constObservable(undefined),
		visibleSessions: grid.visibleSessions ?? constObservable<readonly (IActiveSession | undefined)[]>([]),
		windowSessions: grid.windowSessions ?? constObservable<readonly IActiveSession[]>([]),
	};
	let nextChatWindowId = 1000;
	const hostOf = (kind: SessionHostKind, parent: ISessionHost | undefined, session: IObservable<IActiveSession | undefined>, windowId: number | undefined): ISessionHost => {
		// A chat window shows the chat it is scoped to; other hosts the active chat of their session.
		const chat = derived(reader => {
			const shown = session.read(reader);
			return shown?.scopedChatResource ? upcastPartial<IChat>({ resource: shown.scopedChatResource }) : shown?.activeChat?.read(reader);
		});
		return upcastPartial<ISessionHost>({
			id: `${kind}:${windowId ?? 'pane'}`,
			kind,
			parent,
			session,
			chat,
			chatResource: derived(reader => chat.read(reader)?.resource),
			windowId: constObservable(windowId),
		});
	};
	const mainHost = hostOf(SessionHostKind.MainWindow, undefined, state.mainWindowActiveSession, mainWindow.vscodeWindowId);
	const service = store.add(new SessionHostService(sessionsServiceWithGridHost(mainHost), upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
	const registered = store.add(new DisposableMap<IActiveSession>());
	store.add(autorun(reader => {
		const shown = new Map<IActiveSession, SessionHostKind>();
		for (const session of state.visibleSessions.read(reader)) {
			if (session) {
				shown.set(session, SessionHostKind.Pane);
			}
		}
		for (const session of state.windowSessions.read(reader)) {
			shown.set(session, SessionHostKind.ChatWindow);
		}
		for (const session of [...registered.keys()]) {
			if (!shown.has(session)) {
				registered.deleteAndDispose(session);
			}
		}
		for (const [session, kind] of shown) {
			if (!registered.has(session)) {
				registered.set(session, service.registerHost(kind === SessionHostKind.Pane
					? hostOf(kind, mainHost, constObservable(session), undefined)
					: hostOf(kind, undefined, constObservable(session), nextChatWindowId++)));
			}
		}
	}));
	return service;
}

/** A focused host that shows `session`, for tests modelled on the active session of `ISessionsService`. */
export function focusedSessionHostServiceOf(session: IObservable<IActiveSession | undefined>): IFocusedSessionHostService {
	const host = upcastPartial<ISessionHost>({
		kind: SessionHostKind.MainWindow,
		session,
		chat: derived(reader => session.read(reader)?.activeChat?.read(reader)),
	});
	return upcastPartial<IFocusedSessionHostService>({ focusedHost: constObservable(host), getFocusedHost: () => host });
}

/**
 * Stubs the focused host on `instantiationService` from the active session of the `ISessionsService` it has, for tests
 * of focus-following services that model focus with that active session.
 */
export function stubFocusedSessionHostFromSessionsService(instantiationService: TestInstantiationService): void {
	const sessionsService = instantiationService.get(ISessionsService) as Partial<ITestSessionsService> | undefined;
	instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(sessionsService?.activeSession ?? constObservable(undefined)));
}

/**
 * Stubs the host lookups and the focused host on `instantiationService` from the `ISessionsService` it has, for tests of
 * commands that model the windows with its state, as the real services see them: the main window shows
 * `mainWindowActiveSession` (else `activeSession`), a pane of it each of `visibleSessions`, a chat window each of
 * `windowSessions`, with a pane of its own, and the focused host is the window host that shows `activeSession`, else the
 * main window's. Lookups return the innermost hosts, as {@link SessionHostService} does.
 */
export function stubSessionHostsFromSessionsService(instantiationService: TestInstantiationService, onlyMissing = false): void {
	const sessionsService = instantiationService.get(ISessionsService) as Partial<ITestSessionsService> | undefined;
	const none = constObservable(undefined);
	const activeSession = sessionsService?.activeSession ?? none;
	let hostIds = 0;
	const hostOf = (kind: SessionHostKind, session: IObservable<IActiveSession | undefined>, windowId: number | undefined, parent?: ISessionHost): ISessionHost => {
		const chat = derived(reader => {
			const shown = session.read(reader);
			return shown?.scopedChatResource ? upcastPartial<IChat>({ resource: shown.scopedChatResource }) : shown?.activeChat?.read(reader);
		});
		return upcastPartial<ISessionHost>({ id: `${kind}:${windowId}:${hostIds++}`, kind, parent, session, chat, chatResource: derived(reader => chat.read(reader)?.resource), windowId: constObservable(windowId) });
	};
	const mainHost = hostOf(SessionHostKind.MainWindow, sessionsService?.mainWindowActiveSession ?? activeSession, mainWindow.vscodeWindowId);
	const panes = new Map<IActiveSession, ISessionHost>();
	const chatWindows = new Map<IActiveSession, readonly [ISessionHost, ISessionHost]>();
	let nextWindowId = 1000;
	const readPanes = (reader: IReader | undefined) => (sessionsService?.visibleSessions?.read(reader) ?? []).filter(session => !!session).map(session => {
		let host = panes.get(session!);
		if (!host) {
			host = hostOf(SessionHostKind.Pane, constObservable(session), mainWindow.vscodeWindowId, mainHost);
			panes.set(session!, host);
		}
		return host;
	});
	const readChatWindows = (reader: IReader | undefined) => (sessionsService?.windowSessions?.read(reader) ?? []).map(session => {
		let hosts = chatWindows.get(session);
		if (!hosts) {
			const windowHost = hostOf(SessionHostKind.ChatWindow, constObservable(session), nextWindowId++);
			hosts = [windowHost, hostOf(SessionHostKind.Pane, constObservable(session), windowHost.windowId.get(), windowHost)];
			chatWindows.set(session, hosts);
		}
		return hosts;
	});
	const readHosts = (reader: IReader | undefined) => [mainHost, ...readPanes(reader), ...readChatWindows(reader).flat()];
	const isNestedIn = (host: ISessionHost, ancestor: ISessionHost) => {
		for (let current = host.parent; current; current = current.parent) {
			if (current === ancestor) {
				return true;
			}
		}
		return false;
	};
	const innermost = (hosts: readonly ISessionHost[]) => hosts.filter(host => !hosts.some(other => other !== host && isNestedIn(other, host)));
	const sessionHostService = upcastPartial<ISessionHostService>({
		hosts: derived(reader => readHosts(reader)),
		getHost: id => readHosts(undefined).find(host => host.id === id),
		getHostOfWindow: (windowId, reader) => readHosts(reader).find(host => !host.parent && host.windowId.read(reader) === windowId),
		getHostOfChat: (chatResource, reader) => innermost(readHosts(reader).filter(host => isEqual(host.chatResource.read(reader), chatResource)))[0],
		getHostsOfSession: (resource, reader) => innermost(readHosts(reader).filter(host => isEqual(host.session.read(reader)?.resource, resource))),
		isShown: (resource, reader) => readHosts(reader).some(host => isEqual(host.session.read(reader)?.resource, resource) || isEqual(host.chatResource.read(reader), resource)),
	});
	const focusedHost = derived(reader => {
		const active = activeSession.read(reader);
		return readChatWindows(reader).find(([windowHost]) => !!active && windowHost.session.read(reader) === active)?.[0] ?? mainHost;
	});
	const focusedSessionHostService = upcastPartial<IFocusedSessionHostService>({ focusedHost, getFocusedHost: () => focusedHost.get() });
	if (!onlyMissing || isMissingOrDerived(instantiationService, ISessionHostService)) {
		instantiationService.stub(ISessionHostService, sessionHostService);
	}
	if (!onlyMissing || isMissingOrDerived(instantiationService, IFocusedSessionHostService)) {
		instantiationService.stub(IFocusedSessionHostService, focusedSessionHostService);
	}
	derivedStubs.add(sessionHostService);
	derivedStubs.add(focusedSessionHostService);
}

/** The host stubs {@link stubSessionHostsFromSessionsService} made, which it may replace when the sessions service changes. */
const derivedStubs = new WeakSet<object>();

function isMissingOrDerived(instantiationService: TestInstantiationService, id: ServiceIdentifier<unknown>): boolean {
	let service: unknown;
	try {
		service = instantiationService.get(id);
	} catch {
		return true;
	}
	return !service || derivedStubs.has(service as object);
}

/**
 * Stubs the host lookups and the focused host from the `ISessionsService` of `instantiationService`, as
 * {@link stubSessionHostsFromSessionsService} does, but only those the test has not stubbed itself: for tests whose
 * subject now reads the windows' hosts but which model the windows with the sessions service.
 */
export function stubMissingSessionHostsFromSessionsService(instantiationService: TestInstantiationService): void {
	stubSessionHostsFromSessionsService(instantiationService, true);
}
