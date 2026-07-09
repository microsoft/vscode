/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';

export const IServerLifetimeService = createDecorator<IServerLifetimeService>('serverLifetimeService');

export const SHUTDOWN_TIMEOUT = 5 * 60 * 1000;

/** Options controlling the auto-shutdown behaviour. */
export interface IServerLifetimeOptions {
	/** When `false` (default), the server never auto-shuts down. */
	readonly enableAutoShutdown?: boolean;
	/** When `true`, skip the 5-minute grace period on non-initial shutdowns. */
	readonly shutdownWithoutDelay?: boolean;
}

/**
 * Tracks active consumers (extension hosts, agent sessions, etc.) that keep
 * the server alive. When auto-shutdown is enabled, the service manages a
 * shutdown timer and fires {@link onDidShutdownRequested} when it is time for
 * the process to exit.
 */
export interface IServerLifetimeService {
	readonly _serviceBrand: undefined;

	/**
	 * Marks a consumer as active. The server will not auto-shutdown until the
	 * returned {@link IDisposable} is disposed.
	 */
	active(consumer: string): IDisposable;

	/**
	 * Delays the auto-shutdown timer. If the server is currently in a shutdown
	 * timeout (all consumers inactive), the timer is reset.
	 */
	delay(): void;

	/** Whether any consumer is currently active. */
	readonly hasActiveConsumers: boolean;
}

export class ServerLifetimeService extends Disposable implements IServerLifetimeService {
	declare readonly _serviceBrand: undefined;

	private readonly _consumers = new Map<string, number>();
	private _totalCount = 0;
	private _shutdownTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly _options: IServerLifetimeOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		if (this._options.enableAutoShutdown) {
			// Start initial shutdown timer (no clients connected yet)
			this._scheduleShutdown(true);
		}
	}

	get hasActiveConsumers(): boolean {
		return this._totalCount > 0;
	}

	active(consumer: string): IDisposable {
		const wasEmpty = this._totalCount === 0;
		const current = this._consumers.get(consumer) ?? 0;
		this._consumers.set(consumer, current + 1);
		this._totalCount++;

		this._logService.debug(`ServerLifetime: consumer '${consumer}' active (total: ${this._totalCount})`);

		if (wasEmpty) {
			this._cancelShutdown();
		}

		let disposed = false;
		return toDisposable(() => {
			if (disposed) {
				return;
			}
			disposed = true;

			const count = this._consumers.get(consumer);
			if (count !== undefined) {
				if (count <= 1) {
					this._consumers.delete(consumer);
				} else {
					this._consumers.set(consumer, count - 1);
				}
			}
			this._totalCount--;

			this._logService.debug(`ServerLifetime: consumer '${consumer}' inactive (total: ${this._totalCount})`);

			if (this._totalCount === 0 && this._options.enableAutoShutdown) {
				this._scheduleShutdown(false);
			}
		});
	}

	delay(): void {
		if (this._shutdownTimer) {
			this._logService.debug('ServerLifetime: delay requested, resetting shutdown timer');
			this._cancelShutdown();
			this._scheduleShutdown(false);
		}
	}

	private _scheduleShutdown(initial: boolean): void {
		if (this._options.shutdownWithoutDelay && !initial) {
			this._tryShutdown();
		} else {
			this._logService.debug('ServerLifetime: scheduling shutdown timer');
			this._shutdownTimer = setTimeout(() => {
				this._shutdownTimer = undefined;
				this._tryShutdown();
			}, SHUTDOWN_TIMEOUT);
		}
	}

	private _tryShutdown(): void {
		if (this._totalCount > 0) {
			this._logService.debug('ServerLifetime: consumer became active, aborting shutdown');
			return;
		}
		console.log('All consumers inactive, shutting down');
		this._logService.info('ServerLifetime: all consumers inactive, shutting down');
		this.dispose();
		process.exit(0);
	}

	private _cancelShutdown(): void {
		if (this._shutdownTimer) {
			this._logService.debug('ServerLifetime: cancelling shutdown timer');
			clearTimeout(this._shutdownTimer);
			this._shutdownTimer = undefined;
		}
	}
}
