/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { TimeoutTimer } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const ICrossAppIPCService = createDecorator<ICrossAppIPCService>('crossAppIPCService');

export interface ICrossAppIPCMessage {
	readonly type: string;
	readonly data?: unknown;
}

export interface ICrossAppIPCService {
	readonly _serviceBrand: undefined;

	/** Whether the Electron crossAppIPC API is supported in this build. */
	readonly isSupported: boolean;

	/** Whether initialize() has been called and successfully set up the IPC. */
	readonly initialized: boolean;

	/** Whether the IPC connection is active. */
	readonly connected: boolean;

	/** Whether this app is the IPC server (`true`) or client (`false`). Only meaningful when connected. */
	readonly isServer: boolean;

	/** Fires when the peer connects. The boolean indicates whether this app is the server. */
	readonly onDidConnect: Event<boolean /* isServer */>;

	/** Fires when the peer disconnects. The string is the disconnect reason. */
	readonly onDidDisconnect: Event<string /* reason */>;

	/** Fires when a message is received from the peer. */
	readonly onDidReceiveMessage: Event<ICrossAppIPCMessage>;

	/** Send a message to the peer. No-op if not connected. */
	sendMessage(msg: ICrossAppIPCMessage): void;

	/** Initialize the IPC connection. Call once during startup. */
	initialize(): void;
}

/**
 * Manages the single crossAppIPC connection for the entire application.
 */
export class CrossAppIPCService extends Disposable implements ICrossAppIPCService {

	declare readonly _serviceBrand: undefined;

	private ipc: Electron.CrossAppIPC | undefined;
	private _connected = false;
	private _isServer = false;
	private readonly reconnectTimer = this._register(new TimeoutTimer());

	private readonly _onDidConnect = this._register(new Emitter<boolean>());
	readonly onDidConnect: Event<boolean> = this._onDidConnect.event;

	private readonly _onDidDisconnect = this._register(new Emitter<string>());
	readonly onDidDisconnect: Event<string> = this._onDidDisconnect.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<ICrossAppIPCMessage>());
	readonly onDidReceiveMessage: Event<ICrossAppIPCMessage> = this._onDidReceiveMessage.event;

	get isSupported(): boolean {
		const crossAppIPC: Electron.CrossAppIPCModule | undefined = (electron as typeof electron & { crossAppIPC?: Electron.CrossAppIPCModule }).crossAppIPC;
		return crossAppIPC !== undefined;
	}
	get initialized(): boolean { return this.ipc !== undefined; }
	get connected(): boolean { return this._connected; }
	get isServer(): boolean { return this._isServer; }

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	initialize(): void {
		if (this.ipc) {
			return; // Already initialized
		}

		const crossAppIPC: Electron.CrossAppIPCModule | undefined = (electron as typeof electron & { crossAppIPC?: Electron.CrossAppIPCModule }).crossAppIPC;

		if (!crossAppIPC) {
			this.logService.info('CrossAppIPCService: crossAppIPC not available');
			return;
		}

		const ipc = crossAppIPC.createCrossAppIPC();
		this.ipc = ipc;

		ipc.on('connected', () => {
			this._connected = true;
			this._isServer = ipc.isServer;
			this.logService.info(`CrossAppIPCService: connected (isServer=${ipc.isServer})`);
			this._onDidConnect.fire(ipc.isServer);
		});

		ipc.on('message', (messageEvent) => {
			this._onDidReceiveMessage.fire(messageEvent.data as ICrossAppIPCMessage);
		});

		ipc.on('disconnected', (reason) => {
			this.logService.info(`CrossAppIPCService: disconnected (${reason})`);
			this._connected = false;
			this._isServer = false;
			this._onDidDisconnect.fire(reason);

			// Reconnect to wait for the peer's next launch.
			// Delay briefly to allow the old Mach bootstrap service to be
			// deregistered before re-creating the server endpoint (macOS).
			if (reason === 'peer-disconnected') {
				this.reconnectTimer.cancelAndSet(() => ipc.connect(), 1000);
			}
		});

		ipc.connect();
		this.logService.info('CrossAppIPCService: connecting to peer');
	}

	sendMessage(msg: ICrossAppIPCMessage): void {
		if (this.ipc?.connected) {
			this.ipc.postMessage(msg);
		}
	}

	override dispose(): void {
		this.ipc?.close();
		super.dispose();
	}
}
