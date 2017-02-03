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
}

export enum ShutdownReason {

	/** Window is closed */
	CLOSE,

	/** Application is quit */
	QUIT,

	/** Window is reloaded */
	RELOAD,

	/** Other configuration loaded into window */
	LOAD
}

/**
 * A lifecycle service informs about lifecycle events of the
 * application, such as shutdown.
 */
export interface ILifecycleService {

	_serviceBrand: any;

	/**
	 * A flag indicating if the application is in the process of shutting down. This will be true
	 * before the onWillShutdown event is fired and false if the shutdown is being vetoed.
	 */
	willShutdown: boolean;

	/**
	 * Fired before shutdown happens. Allows listeners to veto against the
	 * shutdown.
	 */
	onWillShutdown: Event<ShutdownEvent>;

	/**
	 * Fired when no client is preventing the shutdown from happening. Can be used to dispose heavy resources
	 * like running processes. Can also be used to save UI state to storage.
	 *
	 * The event carries a shutdown reason that indicates how the shutdown was triggered.
	 */
	onShutdown: Event<ShutdownReason>;
}

export const NullLifecycleService: ILifecycleService = {
	_serviceBrand: null,
	willShutdown: false,
	onWillShutdown: () => ({ dispose() { } }),
	onShutdown: (reason) => ({ dispose() { } })
};