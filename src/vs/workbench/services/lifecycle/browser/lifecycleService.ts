/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShutdownReason, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractLifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycleService';
import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class BrowserLifecycleService extends AbstractLifecycleService {

	private beforeUnloadListener: IDisposable | undefined = undefined;

	private disableBeforeUnloadVeto = false;
	private didUnload = false;

	constructor(
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService
	) {
		super(logService, storageService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Listen to `beforeUnload` to support to veto
		this.beforeUnloadListener = addDisposableListener(window, EventType.BEFORE_UNLOAD, (e: BeforeUnloadEvent) => this.onBeforeUnload(e));

		// Listen to `pagehide` to support orderly shutdown
		// We explicitly do not listen to `unload` event
		// which would disable certain browser caching
		// (https://web.dev/bfcache/)
		this._register(addDisposableListener(window, EventType.PAGE_HIDE, () => this.onUnload()));
	}

	private onBeforeUnload(event: BeforeUnloadEvent): void {

		// Unload without veto support
		if (this.disableBeforeUnloadVeto) {
			this.onBeforeUnloadWithoutVetoSupport();
		}

		// Unload with veto support
		else {
			this.onBeforeUnloadWithVetoSupport(event);
		}
	}

	private onBeforeUnloadWithoutVetoSupport(): void {
		this.logService.info('[lifecycle] onBeforeUnload triggered and handled without veto support');

		this.doShutdown();
	}

	private onBeforeUnloadWithVetoSupport(event: BeforeUnloadEvent): void {
		this.logService.info('[lifecycle] onBeforeUnload triggered and handled with veto support');

		this.doShutdown(() => this.vetoBeforeUnload(event));
	}

	private vetoBeforeUnload(event: BeforeUnloadEvent): void {
		event.preventDefault();
		event.returnValue = localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
	}

	withExpectedShutdown(reason: ShutdownReason): void;
	withExpectedShutdown(reason: { disableShutdownHandling: true }, callback: Function): void;
	withExpectedShutdown(reason: ShutdownReason | { disableShutdownHandling: true }, callback?: Function): void {

		// Standard shutdown
		if (typeof reason === 'number') {
			this.shutdownReason = reason;
		}

		// Veto handling disabled for duration of callback
		else {
			this.disableBeforeUnloadVeto = true;
			try {
				callback?.();
			} finally {
				this.disableBeforeUnloadVeto = false;
			}
		}
	}

	shutdown(): void {
		this.logService.info('[lifecycle] shutdown triggered');

		// An explicit shutdown renders `beforeUnload` event
		// handling disabled from here on
		this.beforeUnloadListener?.dispose();

		// Handle shutdown without veto support
		this.doShutdown();
	}

	private doShutdown(handleVeto?: () => void): void {
		const logService = this.logService;

		let veto = false;

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value, id) {
				if (typeof handleVeto === 'function') {
					if (value instanceof Promise) {
						logService.error(`[lifecycle] Long running operations before shutdown are unsupported in the web (id: ${id})`);

						value = true; // implicitly vetos since we cannot handle promises in web
					}

					if (value === true) {
						logService.info(`[lifecycle]: Unload was prevented (id: ${id})`);

						veto = true;
					}
				}
			},
			reason: ShutdownReason.QUIT
		});

		// Veto: handle if provided
		if (veto && typeof handleVeto === 'function') {
			handleVeto();

			return;
		}

		// No veto, continue to shutdown
		return this.onUnload();
	}

	private onUnload(): void {
		if (this.didUnload) {
			return; // only once
		}

		this.didUnload = true;

		const logService = this.logService;

		// First indicate will-shutdown
		this._onWillShutdown.fire({
			join(promise, id) {
				logService.error(`[lifecycle] Long running operations during shutdown are unsupported in the web (id: ${id})`);
			},
			reason: ShutdownReason.QUIT
		});

		// Finally end with did-shutdown
		this._onDidShutdown.fire();
	}
}

registerSingleton(ILifecycleService, BrowserLifecycleService);
