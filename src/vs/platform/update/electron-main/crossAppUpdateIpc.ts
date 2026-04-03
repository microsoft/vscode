/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { crossAppIPC } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IUpdateService, State } from '../common/update.js';
import { AbstractUpdateService } from './abstractUpdateService.js';

/**
 * Message types exchanged between apps over crossAppIPC.
 */
const enum CrossAppUpdateMessageType {
	/** Server → Client: Update state changed */
	StateChange = 'update/stateChange',
	/** Client → Server: Request to check for updates */
	CheckForUpdates = 'update/checkForUpdates',
	/** Client → Server: Request to download an available update */
	DownloadUpdate = 'update/downloadUpdate',
	/** Client → Server: Request to apply a downloaded update */
	ApplyUpdate = 'update/applyUpdate',
	/** Client → Server: Request to quit and install */
	QuitAndInstall = 'update/quitAndInstall',
	/** Server → Client: Initial state sync after connection */
	InitialState = 'update/initialState',
	/** Client → Server: Request initial state */
	RequestInitialState = 'update/requestInitialState',
	/** Server → Client: Quit for update (the server will restart after installing) */
	QuitForUpdate = 'update/quitForUpdate',
}

interface CrossAppUpdateMessage {
	type: CrossAppUpdateMessageType;
	data?: State | boolean;
}

/**
 * Coordinates update ownership between host and embedded Electron apps
 * using crossAppIPC. Whichever app starts first becomes the IPC server
 * and owns the update client. The second app becomes the client and
 * proxies update operations to the server.
 *
 * When only one app is running, it uses its local update service directly.
 * When both apps are running, the IPC server owns the update client and
 * the IPC client's local service is suspended to prevent duplicate
 * checks and downloads.
 *
 * This class implements {@link IUpdateService} so it can be used directly
 * as the update channel source for renderer processes while transparently
 * handling the coordination.
 */
export class CrossAppUpdateCoordinator extends Disposable implements IUpdateService {

	declare readonly _serviceBrand: undefined;

	private ipc: Electron.CrossAppIPC | undefined;
	private mode: 'standalone' | 'server' | 'client' = 'standalone';

	private _state: State;

	private readonly _onStateChange = this._register(new Emitter<State>());
	readonly onStateChange: Event<State> = this._onStateChange.event;

	get state(): State { return this._state; }

	constructor(
		private readonly localUpdateService: AbstractUpdateService,
		private readonly logService: ILogService,
		private readonly lifecycleMainService: ILifecycleMainService,
	) {
		super();

		// Start with the local service's current state
		this._state = this.localUpdateService.state;

		// Track local service state changes (used in standalone/server mode)
		this._register(this.localUpdateService.onStateChange(state => {
			if (this.mode !== 'client') {
				this.updateState(state);
				this.broadcastState(state);
			}
		}));
	}

	initialize(): void {
		if (!crossAppIPC) {
			this.logService.info('CrossAppUpdateCoordinator: crossAppIPC not available, running in standalone mode');
			return;
		}

		const ipc = crossAppIPC.createCrossAppIPC();
		this.ipc = ipc;

		ipc.on('connected', () => {
			this.logService.info(`CrossAppUpdateCoordinator: connected (isServer=${ipc.isServer})`);

			if (ipc.isServer) {
				this.mode = 'server';
				// Broadcast current state to the newly connected client
				this.broadcastState(this.localUpdateService.state);
			} else {
				this.mode = 'client';
				// Suspend the local update service to prevent duplicate checks/downloads
				this.localUpdateService.suspend();
				// Request current state from the server
				this.sendMessage({ type: CrossAppUpdateMessageType.RequestInitialState });
			}
		});

		ipc.on('message', (messageEvent) => {
			this.handleMessage(messageEvent.data as CrossAppUpdateMessage);
		});

		ipc.on('disconnected', (reason) => {
			this.logService.info(`CrossAppUpdateCoordinator: disconnected (${reason}), was ${this.mode}`);

			if (this.mode === 'client') {
				// Resume the local update service — we're now the only app
				this.localUpdateService.resume();
				// Sync coordinator state with the local service
				this.updateState(this.localUpdateService.state);
			}

			this.mode = 'standalone';

			// Reconnect to wait for the peer's next launch
			if (reason === 'peer-disconnected') {
				ipc.connect();
			}
		});

		ipc.connect();
		this.logService.info('CrossAppUpdateCoordinator: connecting to peer');
	}

	private handleMessage(msg: CrossAppUpdateMessage): void {
		this.logService.trace(`CrossAppUpdateCoordinator: received ${msg.type} (mode=${this.mode})`);

		switch (msg.type) {
			// --- Messages handled by the client ---
			case CrossAppUpdateMessageType.StateChange:
			case CrossAppUpdateMessageType.InitialState:
				if (this.mode === 'client') {
					this.updateState(msg.data as State);
				}
				break;

			case CrossAppUpdateMessageType.QuitForUpdate:
				this.logService.info('CrossAppUpdateCoordinator: peer requested quit for update');
				this.lifecycleMainService.quit();
				break;

			// --- Messages handled by the server ---
			case CrossAppUpdateMessageType.RequestInitialState:
				if (this.mode === 'server') {
					this.sendMessage({ type: CrossAppUpdateMessageType.InitialState, data: this.localUpdateService.state });
				}
				break;

			case CrossAppUpdateMessageType.CheckForUpdates:
				if (this.mode === 'server') {
					this.localUpdateService.checkForUpdates(typeof msg.data === 'boolean' ? msg.data : true);
				}
				break;

			case CrossAppUpdateMessageType.DownloadUpdate:
				if (this.mode === 'server') {
					this.localUpdateService.downloadUpdate(typeof msg.data === 'boolean' ? msg.data : true);
				}
				break;

			case CrossAppUpdateMessageType.ApplyUpdate:
				if (this.mode === 'server') {
					this.localUpdateService.applyUpdate();
				}
				break;

			case CrossAppUpdateMessageType.QuitAndInstall:
				if (this.mode === 'server') {
					// Client requested quit-and-install; the client quits itself
					this.localUpdateService.quitAndInstall();
				}
				break;
		}
	}

	private updateState(state: State): void {
		this._state = state;
		this._onStateChange.fire(state);
	}

	private broadcastState(state: State): void {
		if (this.mode === 'server') {
			this.sendMessage({ type: CrossAppUpdateMessageType.StateChange, data: state });
		}
	}

	private sendMessage(msg: CrossAppUpdateMessage): void {
		if (this.ipc?.connected) {
			this.ipc.postMessage(msg);
		}
	}

	// --- IUpdateService implementation ---

	async checkForUpdates(explicit: boolean): Promise<void> {
		if (this.mode === 'client') {
			this.sendMessage({ type: CrossAppUpdateMessageType.CheckForUpdates, data: explicit });
		} else {
			await this.localUpdateService.checkForUpdates(explicit);
		}
	}

	async downloadUpdate(explicit: boolean): Promise<void> {
		if (this.mode === 'client') {
			this.sendMessage({ type: CrossAppUpdateMessageType.DownloadUpdate, data: explicit });
		} else {
			await this.localUpdateService.downloadUpdate(explicit);
		}
	}

	async applyUpdate(): Promise<void> {
		if (this.mode === 'client') {
			this.sendMessage({ type: CrossAppUpdateMessageType.ApplyUpdate });
		} else {
			await this.localUpdateService.applyUpdate();
		}
	}

	async quitAndInstall(): Promise<void> {
		if (this.mode === 'client') {
			// Tell the server to quit-and-install, then quit ourselves
			this.sendMessage({ type: CrossAppUpdateMessageType.QuitAndInstall });
			this.lifecycleMainService.quit();
		} else {
			// Tell the client to quit, then do the local quit-and-install
			this.sendMessage({ type: CrossAppUpdateMessageType.QuitForUpdate });
			await this.localUpdateService.quitAndInstall();
		}
	}

	async isLatestVersion(): Promise<boolean | undefined> {
		return this.localUpdateService.isLatestVersion();
	}

	async _applySpecificUpdate(packagePath: string): Promise<void> {
		return this.localUpdateService._applySpecificUpdate(packagePath);
	}

	async setInternalOrg(internalOrg: string | undefined): Promise<void> {
		return this.localUpdateService.setInternalOrg(internalOrg);
	}

	override dispose(): void {
		this.ipc?.close();
		super.dispose();
	}
}
