/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isThenable } from 'vs/base/common/async';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

/**
 * An event that is send out when the window is about to close. Clients have a chance to veto
 * the closing by either calling veto with a boolean "true" directly or with a promise that
 * resolves to a boolean. Returning a promise is useful in cases of long running operations
 * on shutdown.
 *
 * Note: It is absolutely important to avoid long running promises if possible. Please try hard
 * to return a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
 */
export interface WillShutdownEvent {

	/**
	 * Allows to veto the shutdown. The veto can be a long running operation but it
	 * will block the application from closing.
	 */
	veto(value: boolean | Thenable<boolean>): void;

	/**
	 * The reason why Code will be shutting down.
	 */
	reason: ShutdownReason;
}

/**
 * An event that is send out when the window closes. Clients have a chance to join the closing
 * by providing a promise from the join method. Returning a promise is useful in cases of long
 * running operations on shutdown.
 *
 * Note: It is absolutely important to avoid long running promises if possible. Please try hard
 * to return a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
 */
export interface ShutdownEvent {

	/**
	 * Allows to join the shutdown. The promise can be a long running operation but it
	 * will block the application from closing.
	 */
	join(promise: Thenable<void>): void;

	/**
	 * The reason why Code is shutting down.
	 */
	reason: ShutdownReason;
}

export const enum ShutdownReason {

	/** Window is closed */
	CLOSE = 1,

	/** Application is quit */
	QUIT = 2,

	/** Window is reloaded */
	RELOAD = 3,

	/** Other configuration loaded into window */
	LOAD = 4
}

export const enum StartupKind {
	NewWindow = 1,
	ReloadedWindow = 3,
	ReopenedWindow = 4,
}

export function StartupKindToString(startupKind: StartupKind): string {
	switch (startupKind) {
		case StartupKind.NewWindow: return 'NewWindow';
		case StartupKind.ReloadedWindow: return 'ReloadedWindow';
		case StartupKind.ReopenedWindow: return 'ReopenedWindow';
	}
}

export const enum LifecyclePhase {
	Starting = 1,
	Restoring = 2,
	Running = 3,
	Eventually = 4
}

export function LifecyclePhaseToString(phase: LifecyclePhase) {
	switch (phase) {
		case LifecyclePhase.Starting: return 'Starting';
		case LifecyclePhase.Restoring: return 'Restoring';
		case LifecyclePhase.Running: return 'Running';
		case LifecyclePhase.Eventually: return 'Eventually';
	}
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
	 * Fired before shutdown happens. Allows listeners to veto against the
	 * shutdown.
	 */
	readonly onWillShutdown: Event<WillShutdownEvent>;

	/**
	 * Fired when no client is preventing the shutdown from happening. Can be used to dispose heavy resources
	 * like running processes. Can also be used to save UI state to storage.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	readonly onShutdown: Event<ShutdownEvent>;

	/**
	 * Returns a promise that resolves when a certain lifecycle phase
	 * has started.
	 */
	when(phase: LifecyclePhase): Thenable<void>;
}

export const NullLifecycleService: ILifecycleService = {
	_serviceBrand: null,
	onWillShutdown: Event.None,
	onShutdown: Event.None,
	phase: LifecyclePhase.Running,
	startupKind: StartupKind.NewWindow,
	when() { return Promise.resolve(); }
};

// Shared veto handling across main and renderer
export function handleVetos(vetos: (boolean | Thenable<boolean>)[], onError: (error: Error) => void): TPromise<boolean /* veto */> {
	if (vetos.length === 0) {
		return TPromise.as(false);
	}

	const promises: Thenable<void>[] = [];
	let lazyValue = false;

	for (let valueOrPromise of vetos) {

		// veto, done
		if (valueOrPromise === true) {
			return TPromise.as(true);
		}

		if (isThenable(valueOrPromise)) {
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
