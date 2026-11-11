/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';

export const IAgentsViewProvidersService = createDecorator<IAgentsViewProvidersService>('agentsViewProvidersService');

/**
 * Holds the sessions providers of the Sessions view of an editor window with the Agents view. Their sessions are known only
 * while something holds them: the Sessions view or the chat part while either shows, or an open of a session until it shows.
 */
export interface IAgentsViewProvidersService {
	readonly _serviceBrand: undefined;

	/** Registers the providers, unless they are, and holds them until the returned disposable is disposed. */
	acquire(): IDisposable;
}

/** How long an open waits for the session it opens to be known, such as while its provider lists its sessions. */
export const AGENTS_VIEW_SESSION_WAIT_TIMEOUT = 5_000;

/** What `find` finds among the sessions and their chats, once it does, or `undefined` once `timeout` passed. */
export async function waitForAgentsViewSession<T>(sessionsManagementService: ISessionsManagementService, find: () => T | undefined, timeout = AGENTS_VIEW_SESSION_WAIT_TIMEOUT): Promise<T | undefined> {
	const found = find();
	if (found) {
		return found;
	}
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<T>(resolve => {
			// Also of the sessions a provider's listing scope hides, such as of another folder, which an open can find
			const sessionsChanged = observableSignalFromEvent('waitForAgentsViewSession', sessionsManagementService.onDidChangeAllSessions);
			store.add(autorun(reader => {
				sessionsChanged.read(reader);
				// A session can list a chat after it is listed itself, such as a peer chat its chats publish later: only a
				// session that has several chats can
				for (const session of sessionsManagementService.getAllSessions()) {
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
