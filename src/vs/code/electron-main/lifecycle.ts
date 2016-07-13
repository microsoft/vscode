/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EventEmitter } from 'events';
import { ipcMain as ipc, app } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { ReadyState, VSCodeWindow } from 'vs/code/electron-main/window';
import { IEnvironmentService } from 'vs/code/electron-main/env';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/code/electron-main/log';
import { IStorageService } from 'vs/code/electron-main/storage';

const EventTypes = {
	BEFORE_QUIT: 'before-quit'
};

export const ILifecycleService = createDecorator<ILifecycleService>('lifecycleService');

export interface ILifecycleService {
	_serviceBrand: any;

	/**
	 * Will be true if an update was applied. Will only be true for each update once.
	 */
	wasUpdated: boolean;

	onBeforeQuit(clb: () => void): () => void;
	ready(): void;
	registerWindow(vscodeWindow: VSCodeWindow): void;
	unload(vscodeWindow: VSCodeWindow): TPromise<boolean /* veto */>;
	quit(fromUpdate?: boolean): TPromise<boolean /* veto */>;
}

export class LifecycleService implements ILifecycleService {

	_serviceBrand: any;

	private static QUIT_FROM_UPDATE_MARKER = 'quit.from.update'; // use a marker to find out if an update was applied in the previous session

	private eventEmitter = new EventEmitter();
	private windowToCloseRequest: { [windowId: string]: boolean };
	private quitRequested: boolean;
	private pendingQuitPromise: TPromise<boolean>;
	private pendingQuitPromiseComplete: TValueCallback<boolean>;
	private oneTimeListenerTokenGenerator: number;
	private _wasUpdated: boolean;

	constructor(
		@IEnvironmentService private envService: IEnvironmentService,
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

	/**
	 * Due to the way we handle lifecycle with eventing, the general app.on('before-quit')
	 * event cannot be used because it can be called twice on shutdown. Instead the onBeforeQuit
	 * handler in this module can be used and it is only called once on a shutdown sequence.
	 */
	onBeforeQuit(clb: () => void): () => void {
		this.eventEmitter.addListener(EventTypes.BEFORE_QUIT, clb);

		return () => this.eventEmitter.removeListener(EventTypes.BEFORE_QUIT, clb);
	}

	public ready(): void {
		this.registerListeners();
	}

	private registerListeners(): void {

		// before-quit
		app.on('before-quit', (e) => {
			this.logService.log('Lifecycle#before-quit');

			if (!this.quitRequested) {
				this.eventEmitter.emit(EventTypes.BEFORE_QUIT); // only send this if this is the first quit request we have
			}

			this.quitRequested = true;
		});

		// window-all-closed
		app.on('window-all-closed', () => {
			this.logService.log('Lifecycle#window-all-closed');

			// Windows/Linux: we quit when all windows have closed
			// Mac: we only quit when quit was requested
			// --wait: we quit when all windows are closed
			if (this.quitRequested || process.platform !== 'darwin' || this.envService.cliArgs.waitForWindowClose) {
				app.quit();
			}
		});
	}

	public registerWindow(vscodeWindow: VSCodeWindow): void {

		// Window Before Closing: Main -> Renderer
		vscodeWindow.win.on('close', (e) => {
			let windowId = vscodeWindow.id;
			this.logService.log('Lifecycle#window-before-close', windowId);

			// The window already acknowledged to be closed
			if (this.windowToCloseRequest[windowId]) {
				this.logService.log('Lifecycle#window-close', windowId);

				delete this.windowToCloseRequest[windowId];

				return;
			}

			// Otherwise prevent unload and handle it from window
			e.preventDefault();
			this.unload(vscodeWindow).done(veto => {
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

	public unload(vscodeWindow: VSCodeWindow): TPromise<boolean /* veto */> {

		// Always allow to unload a window that is not yet ready
		if (vscodeWindow.readyState !== ReadyState.READY) {
			return TPromise.as<boolean>(false);
		}

		this.logService.log('Lifecycle#unload()', vscodeWindow.id);

		return new TPromise<boolean>((c) => {
			let oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			let oneTimeOkEvent = 'vscode:ok' + oneTimeEventToken;
			let oneTimeCancelEvent = 'vscode:cancel' + oneTimeEventToken;

			ipc.once(oneTimeOkEvent, () => {
				c(false); // no veto
			});

			ipc.once(oneTimeCancelEvent, () => {

				// Any cancellation also cancels a pending quit if present
				if (this.pendingQuitPromiseComplete) {
					this.pendingQuitPromiseComplete(true /* veto */);
					this.pendingQuitPromiseComplete = null;
					this.pendingQuitPromise = null;
				}

				c(true); // veto
			});

			vscodeWindow.send('vscode:beforeUnload', { okChannel: oneTimeOkEvent, cancelChannel: oneTimeCancelEvent });
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