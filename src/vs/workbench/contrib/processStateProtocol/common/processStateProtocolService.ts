/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWatchDoc } from '../../../../platform/processStateProtocol/common/protocol.js';

export const IProcessStateProtocolService = createDecorator<IProcessStateProtocolService>('processStateProtocolService');

/**
 * Renderer-side view of a live PSP session. `doc` is an observable that ticks every time the
 * publisher updates the watch document.
 */
export interface IPspSession {
	readonly id: string;
	readonly token: string;
	readonly client?: { readonly name?: string; readonly version?: string };
	readonly doc: IObservable<IWatchDoc>;
}

/**
 * Workbench-side facade over the main-process Process State Protocol hub. Assigns a unique token
 * to every terminal at creation time, injects the standard env vars, and exposes incoming
 * publisher connections as observable sessions.
 */
export interface IProcessStateProtocolService {
	readonly _serviceBrand: undefined;

	/** All currently connected publisher sessions, keyed by sessionId. */
	readonly sessions: IObservable<ReadonlyMap<string, IPspSession>>;

	/** Looks up the live session that was published from a given terminal instance, if any. */
	getSessionForTerminal(terminalInstanceId: number): IPspSession | undefined;

	/**
	 * Returns an observable for the session currently bound to the given terminal. Updates when
	 * the publisher connects, disconnects, or updates its doc.
	 */
	observeSessionForTerminal(terminalInstanceId: number): IObservable<IPspSession | undefined>;
}

