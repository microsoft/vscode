/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
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
	/** Server → Client: Ask client to quit for an upcoming update */
	PrepareForQuit = 'update/prepareForQuit',
	/** Client → Server: Client confirms it will quit */
	QuitConfirmed = 'update/quitConfirmed',
	/** Client → Server: Client's quit was vetoed by the user */
	QuitVetoed = 'update/quitVetoed',
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

	/** Disposed when entering client mode, re-registered on disconnect. */
	private localStateListener: IDisposable | undefined;

	/** True when the server has sent PrepareForQuit and is waiting for a response. */
	private pendingQuitAndInstall = false;

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
		this.registerLocalStateListener();
	}

	private registerLocalStateListener(): void {
		this.localStateListener = this.localUpdateService.onStateChange(state => {
			this.updateState(state);
			this.broadcastState(state);
		});
	}

	initialize(): void {
		const crossAppIPC: Electron.CrossAppIPCModule | undefined = electron.crossAppIPC;

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
				// Suspend the local update service and stop listening to its state
				// changes. All update operations are proxied to the server, so
				// neither automatic nor manual checks go through the local service.
				this.localUpdateService.suspend();
				this.localStateListener?.dispose();
				this.localStateListener = undefined;
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
				this.registerLocalStateListener();
				// Sync coordinator state with the local service
				this.updateState(this.localUpdateService.state);
			}

			// If the server was waiting for a quit confirmation and the client
			// disconnected, treat it as an implicit confirmation — the client
			// quit successfully but the IPC pipe was torn down before the
			// QuitConfirmed message could be delivered.
			if (this.mode === 'server' && this.pendingQuitAndInstall) {
				this.logService.info('CrossAppUpdateCoordinator: client disconnected during pending quit, treating as confirmed');
				this.pendingQuitAndInstall = false;
				this.mode = 'standalone';
				this.localUpdateService.quitAndInstall();
				return;
			}

			this.mode = 'standalone';

			// Reconnect to wait for the peer's next launch.
			// Delay briefly to allow the old Mach bootstrap service to be
			// deregistered before re-creating the server endpoint (macOS).
			if (reason === 'peer-disconnected') {
				setTimeout(() => ipc.connect(), 1000);
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

			case CrossAppUpdateMessageType.PrepareForQuit:
				if (this.mode === 'client') {
					this.logService.info('CrossAppUpdateCoordinator: server requested quit for update');
					this.lifecycleMainService.quit().then(veto => {
						if (veto) {
							this.logService.info('CrossAppUpdateCoordinator: client quit was vetoed');
							this.sendMessage({ type: CrossAppUpdateMessageType.QuitVetoed });
						} else {
							this.sendMessage({ type: CrossAppUpdateMessageType.QuitConfirmed });
						}
					});
				}
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
					this.doCoordinatedQuitAndInstall();
				}
				break;

			case CrossAppUpdateMessageType.QuitConfirmed:
				if (this.mode === 'server') {
					this.logService.info('CrossAppUpdateCoordinator: client confirmed quit, proceeding with quitAndInstall');
					this.pendingQuitAndInstall = false;
					this.localUpdateService.quitAndInstall();
				}
				break;

			case CrossAppUpdateMessageType.QuitVetoed:
				if (this.mode === 'server') {
					this.logService.info('CrossAppUpdateCoordinator: client vetoed quit, aborting quitAndInstall');
					this.pendingQuitAndInstall = false;
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

	/**
	 * Coordinates quit-and-install when a peer is connected.
	 * Asks the client to quit first; only proceeds with the server's
	 * quitAndInstall if the client confirms. If the client's quit is
	 * vetoed (e.g. unsaved editors), the whole operation is aborted.
	 *
	 * If no peer is connected (standalone), proceeds directly.
	 */
	private doCoordinatedQuitAndInstall(): void {
		if (this.ipc?.connected) {
			// Ask the client to quit; it will respond with QuitConfirmed/QuitVetoed,
			// or disconnect (treated as implicit confirmation).
			this.pendingQuitAndInstall = true;
			this.sendMessage({ type: CrossAppUpdateMessageType.PrepareForQuit });
		} else {
			this.localUpdateService.quitAndInstall();
		}
	}

	async quitAndInstall(): Promise<void> {
		if (this.mode === 'client') {
			// Ask the server to start the coordinated quit flow
			this.sendMessage({ type: CrossAppUpdateMessageType.QuitAndInstall });
		} else {
			this.doCoordinatedQuitAndInstall();
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
		this.localStateListener?.dispose();
		this.ipc?.close();
		super.dispose();
	}
}
