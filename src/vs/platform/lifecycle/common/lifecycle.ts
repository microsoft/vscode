/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

/**
 * An event that is send out when the window is about to close. Clients have a chance to veto the closing by either calling veto
 * with a boolean "true" directly or with a promise that resolves to a boolean. Returning a promise is useful
 * in cases of long running operations on shutdown.
 *
 * Note: It is absolutely important to avoid long running promises on this call. Please try hard to return
 * a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
 */
export interface ShutdownEvent {
	veto(value: boolean | TPromise<boolean>): void;
	reason: ShutdownReason;
	payload?: object;
}

export enum ShutdownReason {

	/** Window is closed */
	CLOSE = 1,

	/** Application is quit */
	QUIT = 2,

	/** Window is reloaded */
	RELOAD = 3,

	/** Other configuration loaded into window */
	LOAD = 4
}

export enum StartupKind {
	NewWindow = 1,
	ReloadedWindow = 3,
	ReopenedWindow = 4,
}

export enum LifecyclePhase {
	Starting = 1,
	Running = 2,
	ShuttingDown = 3
}

/**
 * A lifecycle service informs about lifecycle events of the
 * application, such as shutdown.
 */
export interface ILifecycleService {

	_serviceBrand: any;

	/**
	 * Value indicates how this window got loaded.
	 */
	readonly startupKind: StartupKind;

	/**
	 * A flag indicating in what phase of the lifecycle we currently are.
	 */
	readonly phase: LifecyclePhase;

	/**
	 * An event that fire when the lifecycle phase has changed
	 */
	readonly onDidChangePhase: Event<LifecyclePhase>;

	/**
	 * Fired before shutdown happens. Allows listeners to veto against the
	 * shutdown.
	 */
	readonly onWillShutdown: Event<ShutdownEvent>;

	/**
	 * Fired when no client is preventing the shutdown from happening. Can be used to dispose heavy resources
	 * like running processes. Can also be used to save UI state to storage.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	readonly onShutdown: Event<ShutdownReason>;
}

export const NullLifecycleService: ILifecycleService = {
	_serviceBrand: null,
	phase: LifecyclePhase.Running,
	startupKind: StartupKind.NewWindow,
	onDidChangePhase: Event.None,
	onWillShutdown: Event.None,
	onShutdown: Event.None
};

// Shared veto handling across main and renderer
export function handleVetos(vetos: (boolean | TPromise<boolean>)[], onError: (error: Error) => void): TPromise<boolean /* veto */> {
	if (vetos.length === 0) {
		return TPromise.as(false);
	}

	const promises: TPromise<void>[] = [];
	let lazyValue = false;

	for (let valueOrPromise of vetos) {

		// veto, done
		if (valueOrPromise === true) {
			return TPromise.as(true);
		}

		if (TPromise.is(valueOrPromise)) {
			promises.push(valueOrPromise.then(value => {
				if (value) {
					lazyValue = true; // veto, done
				}
			}, err => {
				onError(err); // error, treated like a veto, done
				lazyValue = true;
			}));
		}
	}

	return TPromise.join(promises).then(() => lazyValue);
}