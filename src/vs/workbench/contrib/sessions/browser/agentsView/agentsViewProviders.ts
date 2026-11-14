/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignal } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';

export const IAgentsViewProvidersService = createDecorator<IAgentsViewProvidersService>('agentsViewProvidersService');

/**
 * Holds the sessions providers of an editor window. Their sessions are known only while something holds them: what shows
 * sessions while it shows (see `IEditorWindowSessionsRuntime`), or an open of a session until it shows.
 */
export interface IAgentsViewProvidersService {
	readonly _serviceBrand: undefined;

	/** Registers the providers, unless they are, and holds them until the returned disposable is disposed. */
	acquire(): IDisposable;
}

/** How long an open waits for the session it opens to be known, such as while its provider lists its sessions. */
export const AGENTS_VIEW_SESSION_WAIT_TIMEOUT = 5_000;

/**
 * What `find` finds among the sessions and their chats, once it does, or `undefined` once `timeout` passed. `resource` is
 * what it looks for, a session or a chat: a peer chat of a session is the session's resource with the chat's id as its
 * fragment, so the session it may appear in is known by lookup, also outside a provider's listing scope.
 */
export async function waitForAgentsViewSession<T>(sessionsManagementService: ISessionsManagementService, resource: URI, find: () => T | undefined, timeout = AGENTS_VIEW_SESSION_WAIT_TIMEOUT): Promise<T | undefined> {
	const found = find();
	if (found) {
		return found;
	}
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<T>(resolve => {
			// The sessions it knows of, by their ID: those listed, and those that change, also outside a provider's listing
			// scope, such as of another folder, which an open can find
			const sessions = new Map(sessionsManagementService.getSessions().map(session => [session.sessionId, session]));
			const sessionsChanged = observableSignal('waitForAgentsViewSession');
			store.add(sessionsManagementService.onDidChangeSession(changes => {
				for (const { session, kind } of changes) {
					if (kind === 'removed') {
						sessions.delete(session.sessionId);
					} else {
						sessions.set(session.sessionId, session);
					}
				}
				sessionsChanged.trigger(undefined);
			}));
			store.add(autorun(reader => {
				sessionsChanged.read(reader);
				// The session of `resource`, or whose peer chat it is, which a provider can know without listing it or
				// reporting a change of it as it publishes the chat
				const candidates = new Map(sessions);
				for (const lookup of [resource, resource.with({ fragment: '' })]) {
					const session = sessionsManagementService.getSession(lookup);
					if (session) {
						candidates.set(session.sessionId, session);
					}
				}
				// A session can list a chat after it is listed itself, such as a peer chat its chats publish later: only a
				// session that has several chats can
				for (const session of candidates.values()) {
					if (session.capabilities.read(reader).supportsMultipleChats) {
						session.chats.read(reader);
					}
				}
				const value = find();
				if (value) {
					resolve(value);
				}
			}));
		}), timeout);
	} finally {
		store.dispose();
	}
}
