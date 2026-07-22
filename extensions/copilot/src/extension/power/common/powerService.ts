/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { createDecorator } from '../../../util/vs/platform/instantiation/common/instantiation';

export const IPowerService = createDecorator<IPowerService>('IPowerService');

export interface IPowerService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the system is suspending (going to sleep).
	 */
	readonly onDidSuspend: Event<void>;

	/**
	 * Fires when the system is resuming from sleep.
	 */
	readonly onDidResume: Event<void>;

	/**
	 * Acquires a power save blocker that prevents app suspension.
	 * The blocker is reference-counted and will be released 2 minutes after
	 * the last acquisition is disposed.
	 *
	 * @returns A disposable that releases this acquisition when disposed.
	 */
	acquirePowerSaveBlocker(): IDisposable;
}

/**
 * A no-op implementation of {@link IPowerService} for environments where
 * power save blocking is not supported (e.g., web, headless, tests).
 */
export class NullPowerService implements IPowerService {
	declare readonly _serviceBrand: undefined;

	readonly onDidSuspend = Event.None;
	readonly onDidResume = Event.None;

	acquirePowerSaveBlocker(): IDisposable {
		return { dispose: () => { } };
	}
}
