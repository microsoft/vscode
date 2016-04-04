/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import Event from 'vs/base/common/event';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

export interface IBeforeShutdownParticipant {

	/**
	 * Called when the window is about to close. Clients have a chance to veto the closing by either returning
	 * a boolean "true" directly or via a promise that resolves to a boolean. Returning a promise is useful
	 * in cases of long running operations on shutdown.
	 *
	 * Note: It is absolutely important to avoid long running promises on this call. Please try hard to return
	 * a boolean directly. Returning a promise has quite an impact on the shutdown sequence!
	 */
	beforeShutdown(): boolean | winjs.TPromise<boolean>;
}

/**
 * A lifecycle service informs about lifecycle events of the
 * application, such as shutdown.
 */
export interface ILifecycleService {

	serviceId: ServiceIdentifier<any>;

	/**
	 * Participate before shutting down to be able to veto.
	 */
	addBeforeShutdownParticipant(p: IBeforeShutdownParticipant): void;

	/**
	 * Fired when no client is preventing the shutdown from happening. Can be used to dispose heavy resources
	 * like running processes. Can also be used to save UI state to storage.
	 */
	onShutdown: Event<void>;
}