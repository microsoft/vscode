/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILifecycleService, WillShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase, handleVetos, LifecyclePhaseToString, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ipcRenderer as ipc } from 'electron';
import { Event, Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mark } from 'vs/base/common/performance';
import { Barrier } from 'vs/base/common/async';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Disposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';

export class LifecycleService extends Disposable implements ILifecycleService {

	private static readonly LAST_SHUTDOWN_REASON_KEY = 'lifecyle.lastShutdownReason';

	_serviceBrand: any;

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private readonly _onShutdown = this._register(new Emitter<ShutdownEvent>());
	get onShutdown(): Event<ShutdownEvent> { return this._onShutdown.event; }

	private readonly _startupKind: StartupKind;
	get startupKind(): StartupKind { return this._startupKind; }

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	get phase(): LifecyclePhase { return this._phase; }

	private phaseWhen = new Map<LifecyclePhase, Barrier>();

	constructor(
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService,
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService
	) {
		super();

		this._startupKind = this.resolveStartupKind();

		this.registerListeners();
	}

	private resolveStartupKind(): StartupKind {
		const lastShutdownReason = this.storageService.getInteger(LifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);
		this.storageService.remove(LifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);

		let startupKind: StartupKind;
		if (lastShutdownReason === ShutdownReason.RELOAD) {
			startupKind = StartupKind.ReloadedWindow;
		} else if (lastShutdownReason === ShutdownReason.LOAD) {
			startupKind = StartupKind.ReopenedWindow;
		} else {
			startupKind = StartupKind.NewWindow;
		}

		this.logService.trace(`lifecycle: starting up (startup kind: ${this._startupKind})`);

		return startupKind;
	}

	private registerListeners(): void {
		const windowId = this.windowService.getCurrentWindowId();

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:onBeforeUnload', (event, reply: { okChannel: string, cancelChannel: string, reason: ShutdownReason }) => {
			this.logService.trace(`lifecycle: onBeforeUnload (reason: ${reply.reason})`);

			// store shutdown reason to retrieve next startup
			this.storageService.store(LifecycleService.LAST_SHUTDOWN_REASON_KEY, JSON.stringify(reply.reason), StorageScope.WORKSPACE);

			// trigger onWillShutdown events and veto collecting
			this.handleWillShutdown(reply.reason).then(veto => {
				if (veto) {
					this.logService.trace('lifecycle: onBeforeUnload prevented via veto');
					this.storageService.remove(LifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);
					ipc.send(reply.cancelChannel, windowId);
				} else {
					this.logService.trace('lifecycle: onBeforeUnload continues without veto');
					ipc.send(reply.okChannel, windowId);
				}
			});
		});

		// Main side indicates that we will indeed shutdown
		ipc.on('vscode:onWillUnload', (event, reply: { replyChannel: string, reason: ShutdownReason }) => {
			this.logService.trace(`lifecycle: onWillUnload (reason: ${reply.reason})`);

			// trigger onShutdown events and joining
			return this.handleShutdown(reply.reason).then(() => {
				ipc.send(reply.replyChannel, windowId);
			});
		});
	}

	private handleWillShutdown(reason: ShutdownReason): TPromise<boolean> {
		const vetos: (boolean | Thenable<boolean>)[] = [];

		this._onWillShutdown.fire({
			veto(value) {
				vetos.push(value);
			},
			reason
		});

		return handleVetos(vetos, err => {
			this.notificationService.error(toErrorMessage(err));
			onUnexpectedError(err);
		});
	}

	private handleShutdown(reason: ShutdownReason): Thenable<void> {
		const joiners: Thenable<void>[] = [];

		this._onShutdown.fire({
			join(promise) {
				if (promise) {
					joiners.push(promise);
				}
			},
			reason
		});

		return TPromise.join(joiners).then(() => void 0, err => {
			this.notificationService.error(toErrorMessage(err));
			onUnexpectedError(err);
		});
	}

	set phase(value: LifecyclePhase) {
		if (value < this.phase) {
			throw new Error('Lifecycle cannot go backwards');
		}

		if (this._phase === value) {
			return;
		}

		this.logService.trace(`lifecycle: phase changed (value: ${value})`);

		this._phase = value;
		mark(`LifecyclePhase/${LifecyclePhaseToString(value)}`);

		if (this.phaseWhen.has(this._phase)) {
			this.phaseWhen.get(this._phase).open();
			this.phaseWhen.delete(this._phase);
		}
	}

	when(phase: LifecyclePhase): Thenable<any> {
		if (phase <= this._phase) {
			return Promise.resolve();
		}

		let barrier = this.phaseWhen.get(phase);
		if (!barrier) {
			barrier = new Barrier();
			this.phaseWhen.set(phase, barrier);
		}

		return barrier.wait();
	}
}
