/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable } from '../../../../../base/common/observable.js';
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
 * A real {@link SessionHostService} with hosts for the state `ISessionsService` has: the main window shows
 * `mainWindowActiveSession`, a pane of the main window each of `visibleSessions`, and a chat window each of
 * `windowSessions`. Each host shows the active chat of its session.
 */
export function sessionHostServiceOf(store: Pick<DisposableStore, 'add'>, state: { readonly mainWindowActiveSession: IObservable<IActiveSession | undefined>; readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>; readonly windowSessions: IObservable<readonly IActiveSession[]> }): SessionHostService {
	let nextChatWindowId = 1000;
	const hostOf = (kind: SessionHostKind, parent: ISessionHost | undefined, session: IObservable<IActiveSession | undefined>, windowId: number | undefined): ISessionHost => {
		const chat = derived(reader => session.read(reader)?.activeChat?.read(reader));
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
	const service = store.add(new SessionHostService(mainHost, upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
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
	const sessionsService = instantiationService.get(ISessionsService) as Partial<ISessionsService> | undefined;
	instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(sessionsService?.activeSession ?? constObservable(undefined)));
}
