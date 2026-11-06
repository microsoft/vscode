/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IFocusedSessionHostService, ISessionChatSource, ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISessionsPartService, ISessionView } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../services/sessions/browser/sessionGridPane.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IPaneViewState, ISessionPaneContent, ISessionPaneTabs } from '../../../../services/sessions/common/sessionPane.js';

/**
 * What a test's host or pane shows: the provider's session and the chat of it, and, for a pane of the grid, its pin, tab
 * strip and whether it is detached.
 */
export interface ITestShownChat {
	readonly session: ISession;
	/** The chat it shows; none, such as before a session's chats are known, while undefined. */
	readonly chat: IChat | undefined;
	readonly sticky?: IObservable<boolean>;
	readonly tabs?: ISessionPaneTabs;
	readonly detached?: boolean;
}

/**
 * The pane state a legacy fake may carry, as the grid's view of a session in a pane did: its tab strip, its pin, whether it
 * is created, and the chat of a fake of a detached pane.
 */
type LegacyFakePaneMembers = Partial<ISessionPaneTabs> & { readonly sticky?: IObservable<boolean>; readonly isCreated?: IObservable<boolean>; readonly detachedChat?: URI };

/**
 * A legacy fake shape: a session fake that also carries `activeChat`, the chat its host shows, and may carry the pane state of
 * the grid's view of a session, as tests modelled the grid's active session when the grid gave such views. Production only
 * ever sees it as an {@link ISession}. New tests use {@link ITestShownChat} instead.
 */
export type ITestSessionWithChat = ISession & { readonly activeChat: IObservable<IChat> } & LegacyFakePaneMembers;

/** What a test's host or pane shows: an {@link ITestShownChat}, or a legacy {@link ITestSessionWithChat}. */
export type TestShown = ITestShownChat | ITestSessionWithChat;

function isShownChat(shown: TestShown): shown is ITestShownChat {
	// Partial fakes of a view of a session lack most of its members, but never have a `session`, and a shown chat never
	// has a `resource`.
	return 'session' in shown && !('resource' in shown);
}

/** The session `shown` shows: a view of a session itself, as the hosts of such tests show it. */
export function sessionOfShown(shown: TestShown | undefined): ISession | undefined {
	return shown && (isShownChat(shown) ? shown.session : shown);
}

/** The chat `shown` shows. */
export function chatOfShown(shown: TestShown | undefined, reader: IReader | undefined): IChat | undefined {
	if (!shown) {
		return undefined;
	}
	if (isShownChat(shown)) {
		return shown.chat;
	}
	// A legacy fake of a view scoped to one chat shows that chat.
	const detachedChat = (shown as { readonly detachedChat?: URI }).detachedChat;
	return detachedChat ? upcastPartial<IChat>({ resource: detachedChat }) : shown.activeChat?.read(reader);
}

/** A source of the session and the chat `shown` shows, for UI a test gives a source rather than a host. */
export function testChatSourceOf(shown: IObservable<TestShown | undefined>): ISessionChatSource {
	return { session: derived(reader => sessionOfShown(shown.read(reader))), chat: derived(reader => chatOfShown(shown.read(reader), reader)) };
}

/**
 * The grid state a test models on its `ISessionsService` mock, from which the host stubs derive what the windows show:
 * what the grid's active pane shows, the main window's when it differs, and what chat windows show. None of it is part of
 * `ISessionsService`: others read the windows' hosts.
 */
export interface ITestSessionsGridState {
	readonly activeSession?: IObservable<TestShown | undefined>;
	readonly mainWindowActiveSession?: IObservable<TestShown | undefined>;
	readonly windowSessions?: IObservable<readonly TestShown[]>;
	/** What the grid's panes show, a pane each. */
	readonly gridShown?: IObservable<readonly (TestShown | undefined)[]>;
}

/**
 * The `isCreated` of a test session with the `status` that agrees with it, as `isSessionCreated` reads the status: an
 * untitled session is not created. Spread it into a session fake.
 */
export function withCreatedStatus(isCreated: IObservable<boolean>): { readonly isCreated: IObservable<boolean>; readonly status: IObservable<SessionStatus> } {
	return { isCreated, status: isCreated.map(created => created ? SessionStatus.Completed : SessionStatus.Untitled) };
}

/** An `ISessionsService` mock with the grid state the host stubs derive from. */
export type ITestSessionsService = ISessionsService & ITestSessionsGridState;

/** A sessions service whose grid host is `gridHost`, for a real {@link SessionHostService}. */
export function sessionsServiceWithGridHost(gridHost: ISessionHost): ISessionsService {
	// A grid without panes of its own: no pane is its active or a detached one.
	return upcastPartial<ISessionsService>({ gridHost, isActivePane: () => false, isDetachedPane: () => false, getPaneOfHost: () => undefined });
}

/**
 * Stubs the main window host and the host lookups on `instantiationService`, for tests of UI that hosts sessions, such
 * as session views and composers, which nest their hosts in the one they are created in.
 */
export function stubSessionHosts(instantiationService: TestInstantiationService, store: Pick<DisposableStore, 'add'>, options?: { readonly session?: IObservable<TestShown | undefined>; readonly editorGroupsService?: IEditorGroupsService }): { readonly mainHost: ISessionHost; readonly sessionHostService: SessionHostService } {
	const shown = options?.session ?? constObservable(undefined);
	const mainHost = new SessionHost({
		kind: SessionHostKind.MainWindow,
		parent: undefined,
		session: derived(reader => sessionOfShown(shown.read(reader))),
		chat: derived(reader => chatOfShown(shown.read(reader), reader)),
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
 * `mainWindowActiveSession` (else `activeSession`), a pane of the main window each of `gridShown`, and a chat window
 * each of `windowSessions`. Each host shows the active chat of its session.
 */
export function sessionHostServiceOf(store: Pick<DisposableStore, 'add'>, grid: Partial<ITestSessionsService>): SessionHostService {
	const state = {
		mainWindowActiveSession: grid.mainWindowActiveSession ?? grid.activeSession ?? constObservable(undefined),
		visibleSessions: grid.gridShown ?? constObservable<readonly (TestShown | undefined)[]>([]),
		windowSessions: grid.windowSessions ?? constObservable<readonly TestShown[]>([]),
	};
	let nextChatWindowId = 1000;
	const hostOf = (kind: SessionHostKind, parent: ISessionHost | undefined, shown: IObservable<TestShown | undefined>, windowId: number | undefined): ISessionHost => {
		// A chat window shows the chat it is scoped to; other hosts the active chat of their session.
		const chat = derived(reader => chatOfShown(shown.read(reader), reader));
		return upcastPartial<ISessionHost>({
			id: `${kind}:${windowId ?? 'pane'}`,
			kind,
			parent,
			session: derived(reader => sessionOfShown(shown.read(reader))),
			chat,
			chatResource: derived(reader => chat.read(reader)?.resource),
			windowId: constObservable(windowId),
		});
	};
	const mainHost = hostOf(SessionHostKind.MainWindow, undefined, state.mainWindowActiveSession, mainWindow.vscodeWindowId);
	const service = store.add(new SessionHostService(sessionsServiceWithGridHost(mainHost), upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
	const registered = store.add(new DisposableMap<TestShown>());
	store.add(autorun(reader => {
		const shown = new Map<TestShown, SessionHostKind>();
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
export function focusedSessionHostServiceOf(shown: IObservable<TestShown | undefined>): IFocusedSessionHostService {
	const host = upcastPartial<ISessionHost>({
		kind: SessionHostKind.MainWindow,
		session: derived(reader => sessionOfShown(shown.read(reader))),
		chat: derived(reader => chatOfShown(shown.read(reader), reader)),
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
 * `mainWindowActiveSession` (else `activeSession`), a pane of it each of `gridShown`, a chat window each of
 * `windowSessions`, with a pane of its own, and the focused host is the window host that shows `activeSession`, else the
 * main window's. Lookups return the innermost hosts, as {@link SessionHostService} does.
 */
export function stubSessionHostsFromSessionsService(instantiationService: TestInstantiationService, onlyMissing = false): void {
	const sessionsService = instantiationService.get(ISessionsService) as Partial<ITestSessionsService> | undefined;
	const none = constObservable(undefined);
	const activeSession = sessionsService?.activeSession ?? none;
	let hostIds = 0;
	const hostOf = (kind: SessionHostKind, shown: IObservable<TestShown | undefined>, windowId: number | undefined, parent?: ISessionHost): ISessionHost => {
		const chat = derived(reader => chatOfShown(shown.read(reader), reader));
		const session = derived(reader => sessionOfShown(shown.read(reader)));
		return upcastPartial<ISessionHost>({ id: `${kind}:${windowId}:${hostIds++}`, kind, parent, session, chat, chatResource: derived(reader => chat.read(reader)?.resource), windowId: constObservable(windowId) });
	};
	const mainHost = hostOf(SessionHostKind.MainWindow, sessionsService?.mainWindowActiveSession ?? activeSession, mainWindow.vscodeWindowId);
	const panes = new Map<TestShown, ISessionHost>();
	const chatWindows = new Map<TestShown, readonly [ISessionHost, ISessionHost]>();
	let nextWindowId = 1000;
	const readPanes = (reader: IReader | undefined) => (sessionsService?.gridShown?.read(reader) ?? []).filter(session => !!session).map(session => {
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
		const windows = readChatWindows(reader);
		// The window of the active entry: two windows can show the same session, so a window is never found by its session.
		const index = active ? (sessionsService?.windowSessions?.read(reader) ?? []).indexOf(active) : -1;
		return index >= 0 ? windows[index][0] : mainHost;
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

let paneHostIds = 0;

/** A legacy {@link ITestSessionWithChat} that may lack `activeChat`, such as a partial fake: its host shows its main chat then. */
export type LegacyFakePaneState = ISession & { readonly activeChat?: IObservable<IChat> } & LegacyFakePaneMembers;

/** A pane of the grid with `id` that shows `shown`, and `chat` when given; see {@link testGridPane}. */
function paneOfShown(shown: TestShown | undefined, id: string, chat?: IChat): ISessionGridPane {
	const view: LegacyFakePaneState | undefined = shown && !isShownChat(shown) ? shown : undefined;
	const pane = shown && isShownChat(shown) ? shown : undefined;
	return upcastPartial<ISessionGridPane>({
		id,
		kind: (pane?.detached ?? !!view?.detachedChat) ? SessionGridPaneKind.Detached : SessionGridPaneKind.Slot,
		session: constObservable(sessionOfShown(shown)),
		chat: chat ? constObservable(chat) : view ? (view.activeChat ?? constObservable(undefined)) : constObservable(pane?.chat),
		// A test's view of a session carries the pin and the tab strip of its pane.
		sticky: (pane ?? view)?.sticky ?? constObservable(false),
		tabs: pane ? pane.tabs : view && upcastPartial<ISessionPaneTabs>(view),
	});
}

/**
 * A pane of the grid that shows `shown` and `chat`, the chat `shown` shows by default: a detached pane when `shown` is
 * detached (a view of a session scoped to one chat), else a slot; the new-session slot without a session.
 */
export function testGridPane(shown: TestShown | undefined, chat: IChat | undefined = chatOfShown(shown, undefined), id = `pane:test:${paneHostIds++}`): ISessionGridPane {
	return paneOfShown(shown, id, chat);
}

/**
 * The panes of a fake grid that shows `shown`, as `ISessionsService.panes` gives them: one per entry, the new-session slot
 * for `undefined`, a detached pane for a detached entry. An entry keeps its pane while it stays in the list.
 */
export function testGridPanes(shown: IObservable<readonly (TestShown | undefined)[]>): IObservable<readonly ISessionGridPane[]> {
	const panes = new Map<TestShown | undefined, ISessionGridPane>();
	return derived(reader => shown.read(reader).map(entry => {
		let pane = panes.get(entry);
		if (!pane) {
			pane = paneOfShown(entry, `pane:test:${paneHostIds++}`);
			panes.set(entry, pane);
		}
		return pane;
	}));
}

/**
 * Stubs the host of a pane for tests of the commands its menus run, which find the pane by its host
 * (`resolvePaneCommandTarget`): the host lookups know the host, and, for a pane of the grid, the sessions and part services
 * take it for the pane of `session` and `view`; else, as a chat editor's, for no pane. Keeps the other lookups of the
 * services the test stubbed, and stubs them when it did not. Returns the arguments the pane's menus pass.
 */
export function stubPaneHost(instantiationService: TestInstantiationService, options: { readonly grid: boolean; readonly session: TestShown | undefined; readonly view?: ISessionView; readonly chat?: IChat }): unknown[] {
	const id = `pane:test:${paneHostIds++}`;
	// Partial session fakes may have no active chat.
	const shown = options.chat ?? chatOfShown(options.session, undefined);
	const session = sessionOfShown(options.session);
	const host = upcastPartial<ISessionHost>({
		id,
		kind: SessionHostKind.Pane,
		session: constObservable(session),
		chat: constObservable(shown),
		chatResource: constObservable(shown?.resource),
		commandContext: { sessionHostId: id },
	});
	const existing = <T>(service: ServiceIdentifier<T>): T | undefined => {
		try {
			return instantiationService.get(service);
		} catch {
			return undefined;
		}
	};
	// Stubs `service` with `members` over the stub the test has, which keeps its other members and answers for other hosts.
	const extend = <T extends object>(service: ServiceIdentifier<T>, members: (current: T | undefined) => Partial<T>) => {
		const current = existing(service);
		instantiationService.stub(service, Object.assign(Object.create(current ?? null), members(current)));
	};
	extend(ISessionHostService, current => ({ getHost: candidate => candidate === id ? host : current?.getHost?.(candidate) }));
	const pane = options.grid ? testGridPane(options.session, shown, id) : undefined;
	extend(ISessionsService, current => ({
		getPaneOfHost: (candidate, reader) => candidate === host ? pane : current?.getPaneOfHost?.(candidate, reader),
	}));
	extend(ISessionsPartService, current => ({
		getSessionViewOfHost: candidate => candidate === host ? (options.grid ? options.view : undefined) : current?.getSessionViewOfHost?.(candidate),
	}));
	return [session, options.chat, host.commandContext];
}

const contentsOfFakes = new WeakMap<LegacyFakePaneState, ISessionPaneContent>();

/**
 * The content of a pane that shows `session`, a session fake, as the views of a pane take it: the fake's chat, else its main
 * chat, as a session view gives its content, and the pane state it carries, closed through `close`. The same content for
 * the same fake, as a view keeps what it shows while it is given the same content.
 */
export function testPaneContentOf(session: LegacyFakePaneState, close: () => void): ISessionPaneContent {
	let content = contentsOfFakes.get(session);
	if (!content) {
		const state = upcastPartial<IPaneViewState>({ sticky: session.sticky, tabs: upcastPartial<ISessionPaneTabs>(session), isDetached: !!session.detachedChat });
		content = upcastPartial<ISessionPaneContent>({ session, chat: session.activeChat ?? session.mainChat, state, close });
		contentsOfFakes.set(session, content);
	}
	return content;
}
