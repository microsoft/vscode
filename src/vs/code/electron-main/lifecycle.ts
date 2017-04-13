/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ipcMain as ipc, app } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { ReadyState, VSCodeWindow } from 'vs/code/electron-main/window';
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
	 * Will be true if the program was restarted (e.g. due to explicit request or update).
	 */
	wasRestarted: boolean;

	/**
	 * Due to the way we handle lifecycle with eventing, the general app.on('before-quit')
	 * event cannot be used because it can be called twice on shutdown. Instead the onBeforeQuit
	 * handler in this module can be used and it is only called once on a shutdown sequence.
	 */
	onBeforeQuit: Event<void>;

	/**
	 * We provide our own event when we close a window because the general window.on('close')
	 * is called even when the window prevents the closing. We want an event that truly fires
	 * before the window gets closed for real.
	 */
	onBeforeWindowClose: Event<VSCodeWindow>;

	ready(): void;
	registerWindow(vscodeWindow: VSCodeWindow): void;

	unload(vscodeWindow: VSCodeWindow, reason: UnloadReason): TPromise<boolean /* veto */>;

	relaunch(options?: { addArgs?: string[], removeArgs?: string[] });

	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;
	isQuitRequested(): boolean;

	kill(code?: number);
}

export class LifecycleService implements ILifecycleService {

	_serviceBrand: any;

	private static QUIT_FROM_RESTART_MARKER = 'quit.from.restart'; // use a marker to find out if the session was restarted

	private windowToCloseRequest: { [windowId: string]: boolean };
	private quitRequested: boolean;
	private pendingQuitPromise: TPromise<boolean>;
	private pendingQuitPromiseComplete: TValueCallback<boolean>;
	private oneTimeListenerTokenGenerator: number;
	private _wasRestarted: boolean;

	private _onBeforeQuit = new Emitter<void>();
	onBeforeQuit: Event<void> = this._onBeforeQuit.event;

	private _onBeforeWindowClose = new Emitter<VSCodeWindow>();
	onBeforeWindowClose: Event<VSCodeWindow> = this._onBeforeWindowClose.event;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILogService private logService: ILogService,
		@IStorageService private storageService: IStorageService
	) {
		this.windowToCloseRequest = Object.create(null);
		this.quitRequested = false;
		this.oneTimeListenerTokenGenerator = 0;
		this._wasRestarted = false;

		this.handleRestarted();
	}

	private handleRestarted(): void {
		this._wasRestarted = !!this.storageService.getItem(LifecycleService.QUIT_FROM_RESTART_MARKER);

		if (this._wasRestarted) {
			this.storageService.removeItem(LifecycleService.QUIT_FROM_RESTART_MARKER); // remove the marker right after if found
		}
	}

	public get wasRestarted(): boolean {
		return this._wasRestarted;
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

	public registerWindow(vscodeWindow: VSCodeWindow): void {

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
					this._onBeforeWindowClose.fire(vscodeWindow);
					vscodeWindow.win.close();
				} else {
					this.quitRequested = false;
					delete this.windowToCloseRequest[windowId];
				}
			});
		});
	}

	public unload(vscodeWindow: VSCodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {

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
							this.storageService.setItem(LifecycleService.QUIT_FROM_RESTART_MARKER, true);
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

	public kill(code?: number): void {
		app.exit(code);
	}

	public relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): void {
		const args = process.argv.slice(1);
		if (options && options.addArgs) {
			args.push(...options.addArgs);
		}

		if (options && options.removeArgs) {
			for (const a of options.removeArgs) {
				const idx = args.indexOf(a);
				if (idx >= 0) {
					args.splice(idx, 1);
				}
			}
		}

		let vetod = false;
		app.once('quit', () => {
			if (!vetod) {
				this.storageService.setItem(LifecycleService.QUIT_FROM_RESTART_MARKER, true);
				app.relaunch({ args });
			}
		});

		this.quit().then(veto => {
			vetod = veto;
		});
	}

	public isQuitRequested(): boolean {
		return !!this.quitRequested;
	}
}