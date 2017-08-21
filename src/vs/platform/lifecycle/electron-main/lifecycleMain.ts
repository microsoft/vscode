/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ipcMain as ipc, app } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/node/storage';
import Event, { Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { ReadyState } from 'vs/platform/windows/common/windows';
import { handleVetos } from 'vs/platform/lifecycle/common/lifecycle';

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

export enum UnloadReason {
	CLOSE = 1,
	QUIT = 2,
	RELOAD = 3,
	LOAD = 4
}

export interface IWindowUnloadEvent {
	window: ICodeWindow;
	reason: UnloadReason;
	veto(value: boolean | TPromise<boolean>): void;
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
	onBeforeWindowClose: Event<ICodeWindow>;

	/**
	 * An even that can be vetoed to prevent a window from being unloaded.
	 */
	onBeforeWindowUnload: Event<IWindowUnloadEvent>;

	ready(): void;
	registerWindow(window: ICodeWindow): void;

	unload(window: ICodeWindow, reason: UnloadReason, payload?: object): TPromise<boolean /* veto */>;

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

	private _onBeforeWindowClose = new Emitter<ICodeWindow>();
	onBeforeWindowClose: Event<ICodeWindow> = this._onBeforeWindowClose.event;

	private _onBeforeWindowUnload = new Emitter<IWindowUnloadEvent>();
	onBeforeWindowUnload: Event<IWindowUnloadEvent> = this._onBeforeWindowUnload.event;

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

	public registerWindow(window: ICodeWindow): void {

		// Window Before Closing: Main -> Renderer
		window.win.on('close', e => {
			const windowId = window.id;
			this.logService.log('Lifecycle#window-before-close', windowId);

			// The window already acknowledged to be closed
			if (this.windowToCloseRequest[windowId]) {
				this.logService.log('Lifecycle#window-close', windowId);

				delete this.windowToCloseRequest[windowId];

				return;
			}

			// Otherwise prevent unload and handle it from window
			e.preventDefault();
			this.unload(window, UnloadReason.CLOSE).done(veto => {
				if (!veto) {
					this.windowToCloseRequest[windowId] = true;
					this._onBeforeWindowClose.fire(window);
					window.close();
				} else {
					this.quitRequested = false;
					delete this.windowToCloseRequest[windowId];
				}
			});
		});
	}

	public unload(window: ICodeWindow, reason: UnloadReason, payload?: object): TPromise<boolean /* veto */> {

		// Always allow to unload a window that is not yet ready
		if (window.readyState !== ReadyState.READY) {
			return TPromise.as<boolean>(false);
		}

		this.logService.log('Lifecycle#unload()', window.id);

		const windowUnloadReason = this.quitRequested ? UnloadReason.QUIT : reason;

		// first ask the window itself if it vetos the unload
		return this.doUnloadWindowInRenderer(window, windowUnloadReason, payload).then(veto => {
			if (veto) {
				return this.handleVeto(veto);
			}

			// then check for vetos in the main side
			return this.doUnloadWindowInMain(window, windowUnloadReason).then(veto => this.handleVeto(veto));
		});
	}

	private handleVeto(veto: boolean): boolean {

		// Any cancellation also cancels a pending quit if present
		if (veto && this.pendingQuitPromiseComplete) {
			this.pendingQuitPromiseComplete(true /* veto */);
			this.pendingQuitPromiseComplete = null;
			this.pendingQuitPromise = null;
		}

		return veto;
	}

	private doUnloadWindowInRenderer(window: ICodeWindow, reason: UnloadReason, payload?: object): TPromise<boolean /* veto */> {
		return new TPromise<boolean>((c) => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const okChannel = `vscode:ok${oneTimeEventToken}`;
			const cancelChannel = `vscode:cancel${oneTimeEventToken}`;

			ipc.once(okChannel, () => {
				c(false); // no veto
			});

			ipc.once(cancelChannel, () => {
				c(true); // veto
			});

			window.send('vscode:beforeUnload', { okChannel, cancelChannel, reason, payload });
		});
	}

	private doUnloadWindowInMain(window: ICodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {
		const vetos: (boolean | TPromise<boolean>)[] = [];

		this._onBeforeWindowUnload.fire({
			reason,
			window,
			veto(value) {
				vetos.push(value);
			}
		});

		return handleVetos(vetos, err => this.logService.error(err));
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

		let vetoed = false;
		app.once('quit', () => {
			if (!vetoed) {
				this.storageService.setItem(LifecycleService.QUIT_FROM_RESTART_MARKER, true);
				app.relaunch({ args });
			}
		});

		this.quit().then(veto => {
			vetoed = veto;
		});
	}

	public isQuitRequested(): boolean {
		return !!this.quitRequested;
	}
}
