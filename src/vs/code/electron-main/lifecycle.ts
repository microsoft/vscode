/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ipcMain as ipc, app } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { ReadyState, IVSCodeWindow } from 'vs/code/electron-main/window';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/code/electron-main/log';
import { IStorageService } from 'vs/code/electron-main/storage';
import Event, { Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

export enum UnloadReason {
	CLOSE,
	QUIT,
	RELOAD,
	LOAD
}

export interface ILifecycleService {
	_serviceBrand: any;

	/**
	 * Will be true if an update was applied. Will only be true for each update once.
	 */
	wasUpdated: boolean;

	/**
	 * Due to the way we handle lifecycle with eventing, the general app.on('before-quit')
	 * event cannot be used because it can be called twice on shutdown. Instead the onBeforeQuit
	 * handler in this module can be used and it is only called once on a shutdown sequence.
	 */
	onBeforeQuit: Event<void>;

	ready(): void;
	registerWindow(vscodeWindow: IVSCodeWindow): void;
	unload(vscodeWindow: IVSCodeWindow, reason: UnloadReason): TPromise<boolean /* veto */>;
	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;
}

export class LifecycleService implements ILifecycleService {

	_serviceBrand: any;

	private static QUIT_FROM_UPDATE_MARKER = 'quit.from.update'; // use a marker to find out if an update was applied in the previous session

	private windowToCloseRequest: { [windowId: string]: boolean };
	private quitRequested: boolean;
	private pendingQuitPromise: TPromise<boolean>;
	private pendingQuitPromiseComplete: TValueCallback<boolean>;
	private oneTimeListenerTokenGenerator: number;
	private _wasUpdated: boolean;

	private _onBeforeQuit = new Emitter<void>();
	onBeforeQuit: Event<void> = this._onBeforeQuit.event;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILogService private logService: ILogService,
		@IStorageService private storageService: IStorageService
	) {
		this.windowToCloseRequest = Object.create(null);
		this.quitRequested = false;
		this.oneTimeListenerTokenGenerator = 0;
		this._wasUpdated = false;

		this.handleUpdated();
	}

	private handleUpdated(): void {
		this._wasUpdated = !!this.storageService.getItem(LifecycleService.QUIT_FROM_UPDATE_MARKER);

		if (this._wasUpdated) {
			this.storageService.removeItem(LifecycleService.QUIT_FROM_UPDATE_MARKER); // remove the marker right after if found
		}
	}

	public get wasUpdated(): boolean {
		return this._wasUpdated;
	}

	public ready(): void {
		this.registerListeners();
	}

	private registerListeners(): void {

		// before-quit
		app.on('before-quit', (e) => {
			this.logService.log('Lifecycle#before-quit');

			if (!this.quitRequested) {
				this._onBeforeQuit.fire(); // only send this if this is the first quit request we have
			}

			this.quitRequested = true;
		});

		// window-all-closed
		app.on('window-all-closed', () => {
			this.logService.log('Lifecycle#window-all-closed');

			// Windows/Linux: we quit when all windows have closed
			// Mac: we only quit when quit was requested
			// --wait: we quit when all windows are closed
			if (this.quitRequested || process.platform !== 'darwin' || this.environmentService.wait) {
				app.quit();
			}
		});
	}

	public registerWindow(vscodeWindow: IVSCodeWindow): void {

		// Window Before Closing: Main -> Renderer
		vscodeWindow.win.on('close', (e) => {
			const windowId = vscodeWindow.id;
			this.logService.log('Lifecycle#window-before-close', windowId);

			// The window already acknowledged to be closed
			if (this.windowToCloseRequest[windowId]) {
				this.logService.log('Lifecycle#window-close', windowId);

				delete this.windowToCloseRequest[windowId];

				return;
			}

			// Otherwise prevent unload and handle it from window
			e.preventDefault();
			this.unload(vscodeWindow, UnloadReason.CLOSE).done(veto => {
				if (!veto) {
					this.windowToCloseRequest[windowId] = true;
					vscodeWindow.win.close();
				} else {
					this.quitRequested = false;
					delete this.windowToCloseRequest[windowId];
				}
			});
		});
	}

	public unload(vscodeWindow: IVSCodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {

		// Always allow to unload a window that is not yet ready
		if (vscodeWindow.readyState !== ReadyState.READY) {
			return TPromise.as<boolean>(false);
		}

		this.logService.log('Lifecycle#unload()', vscodeWindow.id);

		return new TPromise<boolean>((c) => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const okChannel = `vscode:ok${oneTimeEventToken}`;
			const cancelChannel = `vscode:cancel${oneTimeEventToken}`;

			ipc.once(okChannel, () => {
				c(false); // no veto
			});

			ipc.once(cancelChannel, () => {

				// Any cancellation also cancels a pending quit if present
				if (this.pendingQuitPromiseComplete) {
					this.pendingQuitPromiseComplete(true /* veto */);
					this.pendingQuitPromiseComplete = null;
					this.pendingQuitPromise = null;
				}

				c(true); // veto
			});

			vscodeWindow.send('vscode:beforeUnload', { okChannel, cancelChannel, reason: this.quitRequested ? UnloadReason.QUIT : reason });
		});
	}

	/**
	 * A promise that completes to indicate if the quit request has been veto'd
	 * by the user or not.
	 */
	public quit(fromUpdate?: boolean): TPromise<boolean /* veto */> {
		this.logService.log('Lifecycle#quit()');

		if (!this.pendingQuitPromise) {
			this.pendingQuitPromise = new TPromise<boolean>(c => {

				// Store as field to access it from a window cancellation
				this.pendingQuitPromiseComplete = c;

				app.once('will-quit', () => {
					if (this.pendingQuitPromiseComplete) {
						if (fromUpdate) {
							this.storageService.setItem(LifecycleService.QUIT_FROM_UPDATE_MARKER, true);
						}
						this.pendingQuitPromiseComplete(false /* no veto */);
						this.pendingQuitPromiseComplete = null;
						this.pendingQuitPromise = null;
					}
				});

				app.quit();
			});
		}

		return this.pendingQuitPromise;
	}
}