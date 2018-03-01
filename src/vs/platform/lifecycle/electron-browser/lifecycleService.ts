/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILifecycleService, ShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase, handleVetos } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ipcRenderer as ipc } from 'electron';
import Event, { Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mark } from 'vs/base/common/performance';
import { Barrier } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class LifecycleService implements ILifecycleService {

	private static readonly _lastShutdownReasonKey = 'lifecyle.lastShutdownReason';

	public _serviceBrand: any;

	private readonly _onWillShutdown = new Emitter<ShutdownEvent>();
	private readonly _onShutdown = new Emitter<ShutdownReason>();
	private readonly _startupKind: StartupKind;

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	private _phaseWhen = new Map<LifecyclePhase, Barrier>();

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IWindowService private readonly _windowService: IWindowService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService
	) {
		const lastShutdownReason = this._storageService.getInteger(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
		this._storageService.remove(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
		if (lastShutdownReason === ShutdownReason.RELOAD) {
			this._startupKind = StartupKind.ReloadedWindow;
		} else if (lastShutdownReason === ShutdownReason.LOAD) {
			this._startupKind = StartupKind.ReopenedWindow;
		} else {
			this._startupKind = StartupKind.NewWindow;
		}

		this._logService.trace(`lifecycle: starting up (startup kind: ${this._startupKind})`);

		this._registerListeners();
	}

	private _registerListeners(): void {
		const windowId = this._windowService.getCurrentWindowId();

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:onBeforeUnload', (event, reply: { okChannel: string, cancelChannel: string, reason: ShutdownReason }) => {
			this._logService.trace(`lifecycle: onBeforeUnload (reason: ${reply.reason})`);

			// store shutdown reason to retrieve next startup
			this._storageService.store(LifecycleService._lastShutdownReasonKey, JSON.stringify(reply.reason), StorageScope.WORKSPACE);

			// trigger onWillShutdown events and veto collecting
			this.onBeforeUnload(reply.reason).done(veto => {
				if (veto) {
					this._logService.trace('lifecycle: onBeforeUnload prevented via veto');
					this._storageService.remove(LifecycleService._lastShutdownReasonKey, StorageScope.WORKSPACE);
					ipc.send(reply.cancelChannel, windowId);
				} else {
					this._logService.trace('lifecycle: onBeforeUnload continues without veto');
					ipc.send(reply.okChannel, windowId);
				}
			});
		});

		// Main side indicates that we will indeed shutdown
		ipc.on('vscode:onWillUnload', (event, reply: { replyChannel: string, reason: ShutdownReason }) => {
			this._logService.trace(`lifecycle: onWillUnload (reason: ${reply.reason})`);

			this._onShutdown.fire(reply.reason);
			ipc.send(reply.replyChannel, windowId);
		});
	}

	private onBeforeUnload(reason: ShutdownReason): TPromise<boolean> {
		const vetos: (boolean | TPromise<boolean>)[] = [];

		this._onWillShutdown.fire({
			veto(value) {
				vetos.push(value);
			},
			reason
		});

		return handleVetos(vetos, err => this._notificationService.error(toErrorMessage(err)));
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

		this._logService.trace(`lifecycle: phase changed (value: ${value})`);

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
}
