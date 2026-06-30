/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISessionTerminalsService = createDecorator<ISessionTerminalsService>('sessionTerminalsService');

/**
 * The terminal counts surfaced for a session in the header meta pill.
 */
export interface ISessionTerminalCounts {
	/**
	 * The number of terminals associated with the session that have had at least
	 * one command sent in them. Empty terminals that never ran a command are
	 * excluded. Drives the pill label and visibility.
	 */
	readonly total: number;

	/**
	 * The number of those terminals that are currently running something (have a
	 * live child process), e.g. an in-progress `npm install` or a watch task.
	 * Drives the pill hover. Always `<= total`.
	 */
	readonly active: number;
}

export const EMPTY_SESSION_TERMINAL_COUNTS: ISessionTerminalCounts = { total: 0, active: 0 };

/**
 * Backing data source for {@link ISessionTerminalsService}. Implemented by the
 * sessions terminal contribution, which owns the per-session terminal tracking,
 * and registered via {@link ISessionTerminalsService.registerProvider}.
 *
 * The contribution lives in the `contrib` layer, so it cannot be depended upon
 * directly by lower-layer consumers (e.g. the `SessionView` that sets the
 * `SessionHasTerminalsContext` key). This provider indirection inverts the
 * dependency: the contribution registers itself into the service instead.
 */
export interface ISessionTerminalsProvider {

	/** Fires when the terminal counts for one or more sessions may have changed. */
	readonly onDidChangeTerminals: Event<void>;

	/** See {@link ISessionTerminalsService.getTerminalCounts}. */
	getTerminalCounts(sessionId: string): ISessionTerminalCounts;
}

/**
 * Exposes the terminal counts (terminals with a command, and of those, the ones
 * currently running) associated with a session, so surfaces such as the session
 * header meta row can show a "{n} terminals" pill without depending on the
 * terminal contribution directly.
 */
export interface ISessionTerminalsService {

	readonly _serviceBrand: undefined;

	/** Fires when the terminal counts for one or more sessions may have changed. */
	readonly onDidChangeTerminals: Event<void>;

	/**
	 * The terminal counts for the given session. Returns
	 * {@link EMPTY_SESSION_TERMINAL_COUNTS} when no provider is registered.
	 */
	getTerminalCounts(sessionId: string): ISessionTerminalCounts;

	/**
	 * Registers the backing provider. Only one provider is supported at a time;
	 * registering a second provider while one is active throws. Dispose the
	 * returned disposable to unregister.
	 */
	registerProvider(provider: ISessionTerminalsProvider): IDisposable;
}

export class SessionTerminalsService extends Disposable implements ISessionTerminalsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeTerminals = this._register(new Emitter<void>());
	readonly onDidChangeTerminals: Event<void> = this._onDidChangeTerminals.event;

	private _provider: ISessionTerminalsProvider | undefined;

	getTerminalCounts(sessionId: string): ISessionTerminalCounts {
		return this._provider?.getTerminalCounts(sessionId) ?? EMPTY_SESSION_TERMINAL_COUNTS;
	}

	registerProvider(provider: ISessionTerminalsProvider): IDisposable {
		if (this._provider) {
			throw new Error('A session terminals provider is already registered');
		}
		this._provider = provider;
		const listener = provider.onDidChangeTerminals(() => this._onDidChangeTerminals.fire());

		// A provider registering may change the answer for any session (from the
		// no-provider default), so announce the change once on registration.
		this._onDidChangeTerminals.fire();

		return toDisposable(() => {
			listener.dispose();
			if (this._provider === provider) {
				this._provider = undefined;
				this._onDidChangeTerminals.fire();
			}
		});
	}
}

registerSingleton(ISessionTerminalsService, SessionTerminalsService, InstantiationType.Delayed);
