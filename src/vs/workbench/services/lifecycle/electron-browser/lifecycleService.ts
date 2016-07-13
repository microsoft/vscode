/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import errors = require('vs/base/common/errors');
import {ILifecycleService, ShutdownEvent} from 'vs/platform/lifecycle/common/lifecycle';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {ipcRenderer as ipc} from 'electron';
import Event, {Emitter} from 'vs/base/common/event';

export class LifecycleService implements ILifecycleService {

	public _serviceBrand: any;

	private _onWillShutdown = new Emitter<ShutdownEvent>();
	private _onShutdown = new Emitter<void>();

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWindowService private windowService: IWindowService
	) {
		this.registerListeners();
	}

	public get onWillShutdown(): Event<ShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}

	private registerListeners(): void {
		const windowId = this.windowService.getWindowId();

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:beforeUnload', (event, reply: { okChannel: string, cancelChannel: string }) => {
			this.onBeforeUnload().done(veto => {
				if (veto) {
					ipc.send(reply.cancelChannel, windowId);
				} else {
					this._onShutdown.fire();
					ipc.send(reply.okChannel, windowId);
				}
			});
		});
	}

	private onBeforeUnload(): TPromise<boolean> {
		const vetos: (boolean | TPromise<boolean>)[] = [];

		this._onWillShutdown.fire({
			veto(value) {
				vetos.push(value);
			}
		});

		if (vetos.length === 0) {
			return TPromise.as(false);
		}

		const promises: TPromise<void>[] = [];
		let lazyValue = false;

		for (let valueOrPromise of vetos) {

			// veto, done
			if (valueOrPromise === true) {
				return TPromise.as(true);
			}

			if (TPromise.is(valueOrPromise)) {
				promises.push(valueOrPromise.then(value => {
					if (value) {
						lazyValue = true; // veto, done
					}
				}, err => {
					// error, treated like a veto, done
					this.messageService.show(Severity.Error, errors.toErrorMessage(err));
					lazyValue = true;
				}));
			}
		}
		return TPromise.join(promises).then(() => lazyValue);
	}
}