/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export const ISharedProcessLifecycleService = createDecorator<ISharedProcessLifecycleService>('lifecycleSharedProcessService');

export interface ISharedProcessLifecycleService {
	readonly _serviceBrand: undefined;

	/**
	 * An event that fires after after no window has vetoed the shutdown sequence. At
	 * this point listeners are ensured that the application will quit without veto.
	 */
	readonly onWillShutdown: Event<ShutdownEvent>;
}

export interface ShutdownEvent {

	/**
	 * Allows to join the shutdown. The promise can be a long running operation but it
	 * will block the application from closing.
	 */
	join(promise: Promise<void>): void;
}

export class SharedProcessLifecycleService extends Disposable implements ISharedProcessLifecycleService {

	declare readonly _serviceBrand: undefined;

	private pendingWillShutdownPromise: Promise<void> | undefined = undefined;

	private readonly _onWillShutdown = this._register(new Emitter<ShutdownEvent>());
	readonly onWillShutdown = this._onWillShutdown.event;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	public fireOnWillShutdown(): Promise<void> {
		if (this.pendingWillShutdownPromise) {
			return this.pendingWillShutdownPromise; // shutdown is already running
		}

		this.logService.trace('Lifecycle#onWillShutdown.fire()');

		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			join(promise) {
				joiners.push(promise);
			}
		});

		this.pendingWillShutdownPromise = (async () => {

			// Settle all shutdown event joiners
			try {
				await Promises.settled(joiners);
			} catch (error) {
				this.logService.error(error);
			}
		})();

		return this.pendingWillShutdownPromise;
	}

}
