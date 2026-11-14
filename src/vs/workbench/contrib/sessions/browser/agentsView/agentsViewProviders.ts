/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignal } from '../../../../../base/common/observable.js';
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
 * What `find` finds among the sessions and their chats, once it does, or `undefined` once `timeout` passed: among every
 * session the providers know, also outside their listing scope, and the chats they publish, whatever their resources.
 */
export async function waitForAgentsViewSession<T>(sessionsManagementService: ISessionsManagementService, find: () => T | undefined, timeout = AGENTS_VIEW_SESSION_WAIT_TIMEOUT): Promise<T | undefined> {
	const found = find();
	if (found) {
		return found;
	}
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<T>(resolve => {
			// Every session the providers know, also outside their listing scope, such as of another folder, which an open can
			// find; their changes, also of those outside the scope, can add the one it looks for
			const sessionsChanged = observableSignal('waitForAgentsViewSession');
			store.add(sessionsManagementService.onDidChangeSession(() => sessionsChanged.trigger(undefined)));
			store.add(autorun(reader => {
				sessionsChanged.read(reader);
				// A session can list a chat after it is known itself, without a change of it: a peer chat or a subagent's,
				// also of a session without several chats, whose resource need not be derived from the session's
				for (const session of sessionsManagementService.getAllSessions()) {
					session.chats.read(reader);
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
