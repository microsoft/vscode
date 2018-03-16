/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ipcMain as ipc, app } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/common/state';
import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { ReadyState } from 'vs/platform/windows/common/windows';
import { handleVetos } from 'vs/platform/lifecycle/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';

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
	 * Will be true if the program was requested to quit.
	 */
	isQuitRequested: boolean;

	/**
	 * Due to the way we handle lifecycle with eventing, the general app.on('before-quit')
	 * event cannot be used because it can be called twice on shutdown. Instead the onBeforeShutdown
	 * handler in this module can be used and it is only called once on a shutdown sequence.
	 */
	onBeforeShutdown: Event<void>;

	/**
	 * An event that fires after the onBeforeShutdown event has been fired and after no window has
	 * vetoed the shutdown sequence. At this point listeners are ensured that the application will
	 * quit without veto.
	 */
	onShutdown: Event<void>;

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

	unload(window: ICodeWindow, reason: UnloadReason): TPromise<boolean /* veto */>;

	relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): void;

	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;

	kill(code?: number): void;
}

export class LifecycleService implements ILifecycleService {

	_serviceBrand: any;

	private static readonly QUIT_FROM_RESTART_MARKER = 'quit.from.restart'; // use a marker to find out if the session was restarted

	private windowToCloseRequest: { [windowId: string]: boolean };
	private quitRequested: boolean;
	private pendingQuitPromise: TPromise<boolean>;
	private pendingQuitPromiseComplete: TValueCallback<boolean>;
	private oneTimeListenerTokenGenerator: number;
	private _wasRestarted: boolean;
	private windowCounter: number;

	private _onBeforeShutdown = new Emitter<void>();
	onBeforeShutdown: Event<void> = this._onBeforeShutdown.event;

	private _onShutdown = new Emitter<void>();
	onShutdown: Event<void> = this._onShutdown.event;

	private _onBeforeWindowClose = new Emitter<ICodeWindow>();
	onBeforeWindowClose: Event<ICodeWindow> = this._onBeforeWindowClose.event;

	private _onBeforeWindowUnload = new Emitter<IWindowUnloadEvent>();
	onBeforeWindowUnload: Event<IWindowUnloadEvent> = this._onBeforeWindowUnload.event;

	constructor(
		@ILogService private logService: ILogService,
		@IStateService private stateService: IStateService
	) {
		this.windowToCloseRequest = Object.create(null);
		this.quitRequested = false;
		this.oneTimeListenerTokenGenerator = 0;
		this._wasRestarted = false;
		this.windowCounter = 0;

		this.handleRestarted();
	}

	private handleRestarted(): void {
		this._wasRestarted = !!this.stateService.getItem(LifecycleService.QUIT_FROM_RESTART_MARKER);

		if (this._wasRestarted) {
			this.stateService.removeItem(LifecycleService.QUIT_FROM_RESTART_MARKER); // remove the marker right after if found
		}
	}

	public get wasRestarted(): boolean {
		return this._wasRestarted;
	}

	public get isQuitRequested(): boolean {
		return !!this.quitRequested;
	}

	public ready(): void {
		this.registerListeners();
	}

	private registerListeners(): void {

		// before-quit
		app.on('before-quit', e => {
			this.logService.trace('Lifecycle#before-quit');

			if (this.quitRequested) {
				this.logService.trace('Lifecycle#before-quit - returning because quit was already requested');
				return;
			}

			this.quitRequested = true;

			// Emit event to indicate that we are about to shutdown
			this.logService.trace('Lifecycle#onBeforeShutdown.fire()');
			this._onBeforeShutdown.fire();

			// macOS: can run without any window open. in that case we fire
			// the onShutdown() event directly because there is no veto to be expected.
			if (isMacintosh && this.windowCounter === 0) {
				this.logService.trace('Lifecycle#onShutdown.fire()');
				this._onShutdown.fire();
			}
		});

		// window-all-closed
		app.on('window-all-closed', () => {
			this.logService.trace('Lifecycle#window-all-closed');

			// Windows/Linux: we quit when all windows have closed
			// Mac: we only quit when quit was requested
			if (this.quitRequested || process.platform !== 'darwin') {
				app.quit();
			}
		});
	}

	public registerWindow(window: ICodeWindow): void {

		// track window count
		this.windowCounter++;

		// Window Before Closing: Main -> Renderer
		window.win.on('close', e => {
			const windowId = window.id;
			this.logService.trace('Lifecycle#window-before-close', windowId);

			// The window already acknowledged to be closed
			if (this.windowToCloseRequest[windowId]) {
				this.logService.trace('Lifecycle#window-close', windowId);

				delete this.windowToCloseRequest[windowId];

				return;
			}

			// Otherwise prevent unload and handle it from window
			e.preventDefault();
			this.unload(window, UnloadReason.CLOSE).done(veto => {
				if (!veto) {
					this.windowToCloseRequest[windowId] = true;

					this.logService.trace('Lifecycle#onBeforeWindowClose.fire()');
					this._onBeforeWindowClose.fire(window);

					window.close();
				} else {
					this.quitRequested = false;
					delete this.windowToCloseRequest[windowId];
				}
			});
		});

		// Window After Closing
		window.win.on('closed', e => {
			const windowId = window.id;
			this.logService.trace('Lifecycle#window-closed', windowId);

			// update window count
			this.windowCounter--;

			// if there are no more code windows opened, fire the onShutdown event, unless
			// we are on macOS where it is perfectly fine to close the last window and
			// the application continues running (unless quit was actually requested)
			if (this.windowCounter === 0 && (!isMacintosh || this.isQuitRequested)) {
				this.logService.trace('Lifecycle#onShutdown.fire()');
				this._onShutdown.fire();
			}
		});
	}

	public unload(window: ICodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {

		// Always allow to unload a window that is not yet ready
		if (window.readyState !== ReadyState.READY) {
			return TPromise.as<boolean>(false);
		}

		this.logService.trace('Lifecycle#unload()', window.id);

		const windowUnloadReason = this.quitRequested ? UnloadReason.QUIT : reason;

		// first ask the window itself if it vetos the unload
		return this.onBeforeUnloadWindowInRenderer(window, windowUnloadReason).then(veto => {
			if (veto) {
				this.logService.trace('Lifecycle#unload(): veto in renderer', window.id);

				return this.handleVeto(veto);
			}

			// then check for vetos in the main side
			return this.onBeforeUnloadWindowInMain(window, windowUnloadReason).then(veto => {
				if (veto) {
					this.logService.trace('Lifecycle#unload(): veto in main', window.id);

					return this.handleVeto(veto);
				} else {
					this.logService.trace('Lifecycle#unload(): unload continues without veto', window.id);
				}

				// finally if there are no vetos, unload the renderer
				return this.onWillUnloadWindowInRenderer(window, windowUnloadReason).then(() => false);
			});
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

	private onBeforeUnloadWindowInRenderer(window: ICodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {
		return new TPromise<boolean>(c => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const okChannel = `vscode:ok${oneTimeEventToken}`;
			const cancelChannel = `vscode:cancel${oneTimeEventToken}`;

			ipc.once(okChannel, () => {
				c(false); // no veto
			});

			ipc.once(cancelChannel, () => {
				c(true); // veto
			});

			window.send('vscode:onBeforeUnload', { okChannel, cancelChannel, reason });
		});
	}

	private onBeforeUnloadWindowInMain(window: ICodeWindow, reason: UnloadReason): TPromise<boolean /* veto */> {
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

	private onWillUnloadWindowInRenderer(window: ICodeWindow, reason: UnloadReason): TPromise<void> {
		return new TPromise<void>(c => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const replyChannel = `vscode:reply${oneTimeEventToken}`;

			ipc.once(replyChannel, () => c(void 0));

			window.send('vscode:onWillUnload', { replyChannel, reason });
		});
	}

	/**
	 * A promise that completes to indicate if the quit request has been veto'd
	 * by the user or not.
	 */
	public quit(fromUpdate?: boolean): TPromise<boolean /* veto */> {
		this.logService.trace('Lifecycle#quit()');

		if (!this.pendingQuitPromise) {
			this.pendingQuitPromise = new TPromise<boolean>(c => {

				// Store as field to access it from a window cancellation
				this.pendingQuitPromiseComplete = c;

				// The will-quit event is fired when all windows have closed without veto
				app.once('will-quit', () => {
					this.logService.trace('Lifecycle#will-quit');

					if (this.pendingQuitPromiseComplete) {
						if (fromUpdate) {
							this.stateService.setItem(LifecycleService.QUIT_FROM_RESTART_MARKER, true);
						}

						this.pendingQuitPromiseComplete(false /* no veto */);
						this.pendingQuitPromiseComplete = null;
						this.pendingQuitPromise = null;
					}
				});

				// Calling app.quit() will trigger the close handlers of each opened window
				// and only if no window vetoed the shutdown, we will get the will-quit event
				app.quit();
			});
		}

		return this.pendingQuitPromise;
	}

	public kill(code?: number): void {
		this.logService.trace('Lifecycle#kill()');

		app.exit(code);
	}

	public relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): void {
		this.logService.trace('Lifecycle#relaunch()');

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
				this.stateService.setItem(LifecycleService.QUIT_FROM_RESTART_MARKER, true);
				app.relaunch({ args });
			}
		});

		this.quit().then(veto => {
			vetoed = veto;
		});
	}
}
