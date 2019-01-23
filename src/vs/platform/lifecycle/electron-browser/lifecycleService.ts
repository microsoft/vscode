/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILifecycleService, BeforeShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase, handleVetos, LifecyclePhaseToString, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
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

	private readonly _onBeforeShutdown = this._register(new Emitter<BeforeShutdownEvent>());
	get onBeforeShutdown(): Event<BeforeShutdownEvent> { return this._onBeforeShutdown.event; }

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private readonly _onShutdown = this._register(new Emitter<void>());
	get onShutdown(): Event<void> { return this._onShutdown.event; }

	private readonly _startupKind: StartupKind;
	get startupKind(): StartupKind { return this._startupKind; }

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	get phase(): LifecyclePhase { return this._phase; }

	private phaseWhen = new Map<LifecyclePhase, Barrier>();

	private shutdownReason: ShutdownReason;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IWindowService private readonly windowService: IWindowService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService
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

			// trigger onBeforeShutdown events and veto collecting
			this.handleBeforeShutdown(reply.reason).then(veto => {
				if (veto) {
					this.logService.trace('lifecycle: onBeforeUnload prevented via veto');

					ipc.send(reply.cancelChannel, windowId);
				} else {
					this.logService.trace('lifecycle: onBeforeUnload continues without veto');

					this.shutdownReason = reply.reason;
					ipc.send(reply.okChannel, windowId);
				}
			});
		});

		// Main side indicates that we will indeed shutdown
		ipc.on('vscode:onWillUnload', (event, reply: { replyChannel: string, reason: ShutdownReason }) => {
			this.logService.trace(`lifecycle: onWillUnload (reason: ${reply.reason})`);

			// trigger onWillShutdown events and joining
			return this.handleWillShutdown(reply.reason).then(() => {

				// trigger onShutdown event now that we know we will quit
				this._onShutdown.fire();

				// acknowledge to main side
				ipc.send(reply.replyChannel, windowId);
			});
		});

		// Save shutdown reason to retrieve on next startup
		this.storageService.onWillSaveState(() => {
			this.storageService.store(LifecycleService.LAST_SHUTDOWN_REASON_KEY, this.shutdownReason, StorageScope.WORKSPACE);
		});
	}

	private handleBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
		const vetos: (boolean | Promise<boolean>)[] = [];

		this._onBeforeShutdown.fire({
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

	private handleWillShutdown(reason: ShutdownReason): Promise<void> {
		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			join(promise) {
				if (promise) {
					joiners.push(promise);
				}
			},
			reason
		});

		return Promise.all(joiners).then(() => undefined, err => {
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

		const barrier = this.phaseWhen.get(this._phase);
		if (barrier) {
			barrier.open();
			this.phaseWhen.delete(this._phase);
		}
	}

	when(phase: LifecyclePhase): Promise<any> {
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
