/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILifecycleService, ShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase, handleVetos } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ipcRenderer as ipc } from 'electron';
import Event, { Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mark } from 'vs/base/common/performance';
import { Barrier } from 'vs/base/common/async';

export class LifecycleService implements ILifecycleService {

	private static readonly _lastShutdownReasonKey = 'lifecyle.lastShutdownReason';

	public _serviceBrand: any;

	private readonly _onWillShutdown = new Emitter<ShutdownEvent>();
	private readonly _onShutdown = new Emitter<ShutdownReason>();
	private readonly _startupKind: StartupKind;

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	private _phaseWhen = new Map<LifecyclePhase, Barrier>();

	constructor(
		@IMessageService private _messageService: IMessageService,
		@IWindowService private _windowService: IWindowService,
		@IStorageService private _storageService: IStorageService
	) {
		this._registerListeners();

		const lastShutdownReason = this._storageService.getInteger(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
		this._storageService.remove(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
		if (lastShutdownReason === ShutdownReason.RELOAD) {
			this._startupKind = StartupKind.ReloadedWindow;
		} else if (lastShutdownReason === ShutdownReason.LOAD) {
			this._startupKind = StartupKind.ReopenedWindow;
		} else {
			this._startupKind = StartupKind.NewWindow;
		}
	}

	public get phase(): LifecyclePhase {
		return this._phase;
	}

	public set phase(value: LifecyclePhase) {
		if (value < this.phase) {
			throw new Error('Lifecycle cannot go backwards');
		}
		if (this._phase === value) {
			return;
		}

		this._phase = value;
		mark(`LifecyclePhase/${LifecyclePhase[value]}`);

		if (this._phaseWhen.has(this._phase)) {
			this._phaseWhen.get(this._phase).open();
			this._phaseWhen.delete(this._phase);
		}
	}

	public when(phase: LifecyclePhase): Thenable<any> {
		if (phase <= this._phase) {
			return Promise.resolve();
		}
		let barrier = this._phaseWhen.get(phase);
		if (!barrier) {
			barrier = new Barrier();
			this._phaseWhen.set(phase, barrier);
		}
		return barrier.wait();
	}

	public get startupKind(): StartupKind {
		return this._startupKind;
	}

	public get onWillShutdown(): Event<ShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<ShutdownReason> {
		return this._onShutdown.event;
	}

	private _registerListeners(): void {
		const windowId = this._windowService.getCurrentWindowId();

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:beforeUnload', (event, reply: { okChannel: string, cancelChannel: string, reason: ShutdownReason, payload: object }) => {
			this._storageService.store(LifecycleService._lastShutdownReasonKey, JSON.stringify(reply.reason), StorageScope.WORKSPACE);

			// trigger onWillShutdown events and veto collecting
			this.onBeforeUnload(reply.reason, reply.payload).done(veto => {
				if (veto) {
					this._storageService.remove(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
					ipc.send(reply.cancelChannel, windowId);
				} else {
					this._onShutdown.fire(reply.reason);
					ipc.send(reply.okChannel, windowId);
				}
			});
		});
	}

	private onBeforeUnload(reason: ShutdownReason, payload?: object): TPromise<boolean> {
		const vetos: (boolean | TPromise<boolean>)[] = [];

		this._onWillShutdown.fire({
			veto(value) {
				vetos.push(value);
			},
			reason,
			payload
		});

		return handleVetos(vetos, err => this._messageService.show(Severity.Error, toErrorMessage(err)));
	}
}
