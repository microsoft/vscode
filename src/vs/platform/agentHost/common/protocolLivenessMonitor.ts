/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILoadEstimator, LoadEstimator } from '../../../base/parts/ipc/common/ipc.net.js';

interface IProtocolLivenessOptions {
	readonly pingIntervalMs: number;
	readonly timeoutMs: number;
	readonly loadEstimator?: ILoadEstimator;
	readonly canCheck: () => boolean;
	readonly canTimeout?: () => boolean;
	readonly shouldDefer?: () => boolean;
	readonly onPing: () => void;
	readonly onTimeout: (silenceMs: number) => void;
	readonly onDeferred?: (durationMs: number) => void;
}

/** Probes idle peers and times out continued inbound silence, allowing a fresh window after local stalls. */
export class ProtocolLivenessMonitor extends Disposable {
	private readonly _pingTimer = this._register(new TimeoutTimer());
	private readonly _closeTimer = this._register(new TimeoutTimer());
	private readonly _loadEstimator: ILoadEstimator;
	private _deferredSince: number | undefined;
	private _lastReadTime = Date.now();

	get lastReadTime(): number { return this._lastReadTime; }

	constructor(private readonly _options: IProtocolLivenessOptions) {
		super();
		this._loadEstimator = _options.loadEstimator ?? LoadEstimator.getInstance();
	}

	recordInboundTraffic(): void {
		this._lastReadTime = Date.now();
		this.reset();
	}

	reset(): void {
		this.stop();
		if (this._options.canCheck()) {
			this._armTimers();
		}
	}

	stop(): void {
		this._pingTimer.cancel();
		this._closeTimer.cancel();
		this._deferredSince = undefined;
	}

	private _armTimers(): void {
		this._pingTimer.cancelAndSet(() => this._onPingTimer(), this._options.pingIntervalMs);
		this._closeTimer.cancelAndSet(() => this._onCloseTimer(), this._options.pingIntervalMs + this._options.timeoutMs);
	}

	private _onPingTimer(): void {
		if (this._options.canCheck()) {
			this._options.onPing();
		}
	}

	private _onCloseTimer(): void {
		if (!this._options.canCheck() || this._options.canTimeout?.() === false) {
			return;
		}
		if (this._options.shouldDefer?.() || this._loadEstimator.hasHighLoad()) {
			this._deferredSince ??= Date.now();
			this._options.onDeferred?.(Date.now() - this._deferredSince);
			this._pingTimer.cancelAndSet(() => this._onPingTimer(), this._options.pingIntervalMs);
			this._closeTimer.cancelAndSet(() => this._onCloseTimer(), this._options.pingIntervalMs);
			return;
		}
		if (this._deferredSince !== undefined) {
			this._deferredSince = undefined;
			this._armTimers();
			return;
		}
		this._options.onTimeout(Date.now() - this._lastReadTime);
	}
}
