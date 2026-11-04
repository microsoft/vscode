/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { constObservable, derived, IObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ActiveSessionHost, IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../browser/sessionHost.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

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
	const sessionHostService = store.add(new SessionHostService(mainHost, options?.editorGroupsService ?? upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
	instantiationService.stub(ISessionHost, mainHost);
	instantiationService.stub(ISessionHostService, sessionHostService);
	return { mainHost, sessionHostService };
}

/**
 * Host lookups over the state `ISessionsService` has: the main window shows `mainWindowActiveSession`, a pane of the main
 * window each of `visibleSessions`, and a chat window each of `windowSessions`.
 */
export function sessionHostServiceOf(state: { readonly mainWindowActiveSession: IObservable<IActiveSession | undefined>; readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>; readonly windowSessions: IObservable<readonly IActiveSession[]> }): ISessionHostService {
	const hostOf = (kind: SessionHostKind, parent: ISessionHost | undefined, session: IObservable<IActiveSession | undefined>) => upcastPartial<ISessionHost>({
		kind,
		parent,
		session,
		chat: derived(reader => session.read(reader)?.activeChat?.read(reader)),
	});
	const mainHost = hostOf(SessionHostKind.MainWindow, undefined, state.mainWindowActiveSession);
	const hosts = new Map<IActiveSession, ISessionHost>();
	const hostOfSession = (session: IActiveSession, kind: SessionHostKind, parent: ISessionHost | undefined) => {
		let host = hosts.get(session);
		if (!host) {
			host = hostOf(kind, parent, constObservable(session));
			hosts.set(session, host);
		}
		return host;
	};
	return upcastPartial<ISessionHostService>({
		getHostOfWindow: windowId => windowId === mainWindow.vscodeWindowId ? mainHost : undefined,
		getHostOfChat: (chatResource, reader) => [
			...state.windowSessions.read(reader).map(session => hostOfSession(session, SessionHostKind.ChatWindow, undefined)),
			...state.visibleSessions.read(reader).filter(session => !!session).map(session => hostOfSession(session!, SessionHostKind.Pane, mainHost)),
			mainHost,
		].find(host => isEqual(host.chat.read(reader)?.resource, chatResource)),
		getHostsOfSession: (resource, reader) => [
			...(isEqual(state.mainWindowActiveSession.read(reader)?.resource, resource) ? [mainHost] : []),
			...state.visibleSessions.read(reader).filter(session => !!session && isEqual(session.resource, resource)).map(session => hostOfSession(session!, SessionHostKind.Pane, mainHost)),
			...state.windowSessions.read(reader).filter(session => isEqual(session.resource, resource)).map(session => hostOfSession(session, SessionHostKind.ChatWindow, undefined)),
		],
	});
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
	const sessionsService = instantiationService.get(ISessionsService) as Partial<ISessionsService> | undefined;
	instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(sessionsService?.activeSession ?? constObservable(undefined)));
}
