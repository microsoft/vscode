/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ShutdownReason, StartupKind, handleVetos, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ipcRenderer as ipc } from 'electron';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { onUnexpectedError } from 'vs/base/common/errors';
import { AbstractLifecycleService } from 'vs/platform/lifecycle/common/lifecycleService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class LifecycleService extends AbstractLifecycleService {

	private static readonly LAST_SHUTDOWN_REASON_KEY = 'lifecyle.lastShutdownReason';

	_serviceBrand!: ServiceIdentifier<ILifecycleService>;

	private shutdownReason: ShutdownReason;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IWindowService private readonly windowService: IWindowService,
		@IStorageService readonly storageService: IStorageService,
		@ILogService readonly logService: ILogService
	) {
		super(logService);

		this._startupKind = this.resolveStartupKind();

		this.registerListeners();
	}

	private resolveStartupKind(): StartupKind {
		const lastShutdownReason = this.storageService.getNumber(LifecycleService.LAST_SHUTDOWN_REASON_KEY, StorageScope.WORKSPACE);
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
		const windowId = this.windowService.windowId;

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:onBeforeUnload', (_event: unknown, reply: { okChannel: string, cancelChannel: string, reason: ShutdownReason }) => {
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
		ipc.on('vscode:onWillUnload', async (_event: unknown, reply: { replyChannel: string, reason: ShutdownReason }) => {
			this.logService.trace(`lifecycle: onWillUnload (reason: ${reply.reason})`);

			// trigger onWillShutdown events and joining
			await this.handleWillShutdown(reply.reason);

			// trigger onShutdown event now that we know we will quit
			this._onShutdown.fire();

			// acknowledge to main side
			ipc.send(reply.replyChannel, windowId);
		});

		// Save shutdown reason to retrieve on next startup
		this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				this.storageService.store(LifecycleService.LAST_SHUTDOWN_REASON_KEY, this.shutdownReason, StorageScope.WORKSPACE);
			}
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

	private async handleWillShutdown(reason: ShutdownReason): Promise<void> {
		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			join(promise) {
				if (promise) {
					joiners.push(promise);
				}
			},
			reason
		});

		try {
			await Promise.all(joiners);
		} catch (error) {
			this.notificationService.error(toErrorMessage(error));
			onUnexpectedError(error);
		}
	}
}
