/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PersistentProtocol, ISocket, ProtocolConstants } from '../../base/parts/ipc/common/ipc.net.js';
import { ILogService } from '../../platform/log/common/log.js';
import { Emitter, Event } from '../../base/common/event.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { ProcessTimeRunOnceScheduler } from '../../base/common/async.js';

function printTime(ms: number): string {
	let h = 0;
	let m = 0;
	let s = 0;
	if (ms >= 1000) {
		s = Math.floor(ms / 1000);
		ms -= s * 1000;
	}
	if (s >= 60) {
		m = Math.floor(s / 60);
		s -= m * 60;
	}
	if (m >= 60) {
		h = Math.floor(m / 60);
		m -= h * 60;
	}
	const _h = h ? `${h}h` : ``;
	const _m = m ? `${m}m` : ``;
	const _s = s ? `${s}s` : ``;
	const _ms = ms ? `${ms}ms` : ``;
	return `${_h}${_m}${_s}${_ms}`;
}

export class ManagementConnection {

	private _onClose = new Emitter<void>();
	public readonly onClose: Event<void> = this._onClose.event;

	private readonly _reconnectionGraceTime: number;
	private readonly _reconnectionShortGraceTime: number;
	private _remoteAddress: string;

	public readonly protocol: PersistentProtocol;
	private _disposed: boolean;
	private _disconnectRunner1: ProcessTimeRunOnceScheduler;
	private _disconnectRunner2: ProcessTimeRunOnceScheduler;

	constructor(
		private readonly _logService: ILogService,
		private readonly _reconnectionToken: string,
		remoteAddress: string,
		protocol: PersistentProtocol,
		reconnectionGraceTime: number
	) {
		this._reconnectionGraceTime = reconnectionGraceTime;
		const defaultShortGrace = ProtocolConstants.ReconnectionShortGraceTime;
		this._reconnectionShortGraceTime = reconnectionGraceTime > 0 ? Math.min(defaultShortGrace, reconnectionGraceTime) : 0;
		this._remoteAddress = remoteAddress;

		this.protocol = protocol;
		this._disposed = false;
		this._disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => {
			this._log(`The reconnection grace time of ${printTime(this._reconnectionGraceTime)} has expired, so the connection will be disposed.`);
			this._cleanResources();
		}, this._reconnectionGraceTime);
		this._disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => {
			this._log(`The reconnection short grace time of ${printTime(this._reconnectionShortGraceTime)} has expired, so the connection will be disposed.`);
			this._cleanResources();
		}, this._reconnectionShortGraceTime);

		this.protocol.onDidDispose(() => {
			this._log(`The client has disconnected gracefully, so the connection will be disposed.`);
			this._cleanResources();
		});
		this.protocol.onSocketClose(() => {
			this._log(`The client has disconnected, will wait for reconnection ${printTime(this._reconnectionGraceTime)} before disposing...`);
			// The socket has closed, let's give the renderer a certain amount of time to reconnect
			this._disconnectRunner1.schedule();
		});

		this._log(`New connection established.`);
	}

	private _log(_str: string): void {
		this._logService.info(`[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ManagementConnection] ${_str}`);
	}

	public shortenReconnectionGraceTimeIfNecessary(): void {
		if (this._disconnectRunner2.isScheduled()) {
			// we are disconnected and already running the short reconnection timer
			return;
		}
		if (this._disconnectRunner1.isScheduled()) {
			this._log(`Another client has connected, will shorten the wait for reconnection ${printTime(this._reconnectionShortGraceTime)} before disposing...`);
			// we are disconnected and running the long reconnection timer
			this._disconnectRunner2.schedule();
		}
	}

	private _cleanResources(): void {
		if (this._disposed) {
			// already called
			return;
		}
		this._disposed = true;
		this._disconnectRunner1.dispose();
		this._disconnectRunner2.dispose();
		const socket = this.protocol.getSocket();
		this.protocol.sendDisconnect();
		this.protocol.dispose();
		socket.end();
		this._onClose.fire(undefined);
	}

	public acceptReconnection(remoteAddress: string, socket: ISocket, initialDataChunk: VSBuffer): void {
		this._remoteAddress = remoteAddress;
		this._log(`The client has reconnected.`);
		this._disconnectRunner1.cancel();
		this._disconnectRunner2.cancel();
		this.protocol.beginAcceptReconnection(socket, initialDataChunk);
		this.protocol.endAcceptReconnection();
	}
}
