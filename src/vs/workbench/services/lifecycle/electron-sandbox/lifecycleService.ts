/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { handleVetos } from 'vs/platform/lifecycle/common/lifecycle';
import { ShutdownReason, ILifecycleService, IWillShutdownEventJoiner, WillShutdownJoinerOrder } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractLifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycleService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeHostService } from 'vs/platform/native/common/native';
import { Promises, disposableTimeout, raceCancellation } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export class NativeLifecycleService extends AbstractLifecycleService {

	private static readonly BEFORE_SHUTDOWN_WARNING_DELAY = 5000;
	private static readonly WILL_SHUTDOWN_WARNING_DELAY = 800;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService
	) {
		super(logService, storageService);

		this.registerListeners();
	}

	private registerListeners(): void {
		const windowId = this.nativeHostService.windowId;

		// Main side indicates that window is about to unload, check for vetos
		ipcRenderer.on('vscode:onBeforeUnload', async (event: unknown, reply: { okChannel: string; cancelChannel: string; reason: ShutdownReason }) => {
			this.logService.trace(`[lifecycle] onBeforeUnload (reason: ${reply.reason})`);

			// trigger onBeforeShutdown events and veto collecting
			const veto = await this.handleBeforeShutdown(reply.reason);

			// veto: cancel unload
			if (veto) {
				this.logService.trace('[lifecycle] onBeforeUnload prevented via veto');

				// Indicate as event
				this._onShutdownVeto.fire();

				ipcRenderer.send(reply.cancelChannel, windowId);
			}

			// no veto: allow unload
			else {
				this.logService.trace('[lifecycle] onBeforeUnload continues without veto');

				this.shutdownReason = reply.reason;
				ipcRenderer.send(reply.okChannel, windowId);
			}
		});

		// Main side indicates that we will indeed shutdown
		ipcRenderer.on('vscode:onWillUnload', async (event: unknown, reply: { replyChannel: string; reason: ShutdownReason }) => {
			this.logService.trace(`[lifecycle] onWillUnload (reason: ${reply.reason})`);

			// trigger onWillShutdown events and joining
			await this.handleWillShutdown(reply.reason);

			// trigger onDidShutdown event now that we know we will quit
			this._onDidShutdown.fire();

			// acknowledge to main side
			ipcRenderer.send(reply.replyChannel, windowId);
		});
	}

	protected async handleBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
		const logService = this.logService;

		const vetos: (boolean | Promise<boolean>)[] = [];
		const pendingVetos = new Set<string>();

		let finalVeto: (() => boolean | Promise<boolean>) | undefined = undefined;
		let finalVetoId: string | undefined = undefined;

		// before-shutdown event with veto support
		this._onBeforeShutdown.fire({
			reason,
			veto(value, id) {
				vetos.push(value);

				// Log any veto instantly
				if (value === true) {
					logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
				}

				// Track promise completion
				else if (value instanceof Promise) {
					pendingVetos.add(id);
					value.then(veto => {
						if (veto === true) {
							logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
						}
					}).finally(() => pendingVetos.delete(id));
				}
			},
			finalVeto(value, id) {
				if (!finalVeto) {
					finalVeto = value;
					finalVetoId = id;
				} else {
					throw new Error(`[lifecycle]: Final veto is already defined (id: ${id})`);
				}
			}
		});

		const longRunningBeforeShutdownWarning = disposableTimeout(() => {
			logService.warn(`[lifecycle] onBeforeShutdown is taking a long time, pending operations: ${Array.from(pendingVetos).join(', ')}`);
		}, NativeLifecycleService.BEFORE_SHUTDOWN_WARNING_DELAY);

		try {

			// First: run list of vetos in parallel
			let veto = await handleVetos(vetos, error => this.handleBeforeShutdownError(error, reason));
			if (veto) {
				return veto;
			}

			// Second: run the final veto if defined
			if (finalVeto) {
				try {
					pendingVetos.add(finalVetoId as unknown as string);
					veto = await (finalVeto as () => Promise<boolean>)();
					if (veto) {
						logService.info(`[lifecycle]: Shutdown was prevented by final veto (id: ${finalVetoId})`);
					}
				} catch (error) {
					veto = true; // treat error as veto

					this.handleBeforeShutdownError(error, reason);
				}
			}

			return veto;
		} finally {
			longRunningBeforeShutdownWarning.dispose();
		}
	}

	private handleBeforeShutdownError(error: Error, reason: ShutdownReason): void {
		this.logService.error(`[lifecycle]: Error during before-shutdown phase (error: ${toErrorMessage(error)})`);

		this._onBeforeShutdownError.fire({ reason, error });
	}

	protected async handleWillShutdown(reason: ShutdownReason): Promise<void> {
		const joiners: Promise<void>[] = [];
		const lastJoiners: (() => Promise<void>)[] = [];
		const pendingJoiners = new Set<IWillShutdownEventJoiner>();
		const cts = new CancellationTokenSource();
		this._onWillShutdown.fire({
			reason,
			token: cts.token,
			joiners: () => Array.from(pendingJoiners.values()),
			join(promiseOrPromiseFn, joiner) {
				pendingJoiners.add(joiner);

				if (joiner.order === WillShutdownJoinerOrder.Last) {
					const promiseFn = typeof promiseOrPromiseFn === 'function' ? promiseOrPromiseFn : () => promiseOrPromiseFn;
					lastJoiners.push(() => promiseFn().finally(() => pendingJoiners.delete(joiner)));
				} else {
					const promise = typeof promiseOrPromiseFn === 'function' ? promiseOrPromiseFn() : promiseOrPromiseFn;
					promise.finally(() => pendingJoiners.delete(joiner));
					joiners.push(promise);
				}
			},
			force: () => {
				cts.dispose(true);
			}
		});

		const longRunningWillShutdownWarning = disposableTimeout(() => {
			this.logService.warn(`[lifecycle] onWillShutdown is taking a long time, pending operations: ${Array.from(pendingJoiners).map(joiner => joiner.id).join(', ')}`);
		}, NativeLifecycleService.WILL_SHUTDOWN_WARNING_DELAY);

		try {
			await raceCancellation(Promises.settled(joiners), cts.token);
		} catch (error) {
			this.logService.error(`[lifecycle]: Error during will-shutdown phase in default joiners (error: ${toErrorMessage(error)})`);
		}

		try {
			await raceCancellation(Promises.settled(lastJoiners.map(lastJoiner => lastJoiner())), cts.token);
		} catch (error) {
			this.logService.error(`[lifecycle]: Error during will-shutdown phase in last joiners (error: ${toErrorMessage(error)})`);
		}

		longRunningWillShutdownWarning.dispose();
	}

	shutdown(): Promise<void> {
		return this.nativeHostService.closeWindow();
	}
}

registerSingleton(ILifecycleService, NativeLifecycleService, InstantiationType.Eager);
