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
import { IStorageService, WillSaveStateReason } from 'vs/platform/storage/common/storage';

export class BrowserLifecycleService extends AbstractLifecycleService {

	private beforeUnloadListener: IDisposable | undefined = undefined;
	private unloadListener: IDisposable | undefined = undefined;

	private ignoreBeforeUnload = false;

	private didBeforeUnload = false;
	private didUnload = false;

	constructor(
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService
	) {
		super(logService, storageService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Listen to `pageshow` to handle unsupported `persisted: true` cases
		this._register(addDisposableListener(window, EventType.PAGE_SHOW, (e: PageTransitionEvent) => this.onLoad(e)));

		// Listen to `beforeUnload` to support to veto
		this.beforeUnloadListener = addDisposableListener(window, EventType.BEFORE_UNLOAD, (e: BeforeUnloadEvent) => this.onBeforeUnload(e));

		// Listen to `pagehide` to support orderly shutdown
		// We explicitly do not listen to `unload` event
		// which would disable certain browser caching.
		// We currently do not handle the `persisted` property
		// (https://github.com/microsoft/vscode/issues/136216)
		this.unloadListener = addDisposableListener(window, EventType.PAGE_HIDE, () => this.onUnload());
	}

	private onLoad(event: PageTransitionEvent): void {

		// We only really care about page-show events
		// where the browser indicates to us that the
		// page was restored from cache and not freshly
		// loaded.
		const wasRestoredFromCache = event.persisted;
		if (!wasRestoredFromCache) {
			return;
		}

		// We only really care about `persisted` page-show
		// events if there is a chance that we were unloaded
		// before and now potentially have a disposed workbench
		// that is non-functional.
		// To be on the safe side, we ignore this event in any
		// other cases to not accidentally reload the workbench.
		const handleLoadEvent = this.didBeforeUnload;
		if (!handleLoadEvent) {
			return;
		}

		// At this point, we know that the page was restored from
		// cache even though it was potentially unloaded before,
		// so in order to get back to a functional workbench, we
		// currently can only reload the window
		// Docs: https://web.dev/bfcache/#optimize-your-pages-for-bfcache
		// Refs: https://github.com/microsoft/vscode/issues/136035
		this.withExpectedShutdown({ disableShutdownHandling: true }, () => window.location.reload());
	}

	private onBeforeUnload(event: BeforeUnloadEvent): void {

		// Before unload ignored (once)
		if (this.ignoreBeforeUnload) {
			this.logService.info('[lifecycle] onBeforeUnload triggered but ignored once');

			this.ignoreBeforeUnload = false;
		}

		// Before unload with veto support
		else {
			this.logService.info('[lifecycle] onBeforeUnload triggered and handled with veto support');

			this.doShutdown(() => this.vetoBeforeUnload(event));
		}
	}

	private vetoBeforeUnload(event: BeforeUnloadEvent): void {
		event.preventDefault();
		event.returnValue = localize('lifecycleVeto', "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
	}

	withExpectedShutdown(reason: ShutdownReason): Promise<void>;
	withExpectedShutdown(reason: { disableShutdownHandling: true }, callback: Function): void;
	withExpectedShutdown(reason: ShutdownReason | { disableShutdownHandling: true }, callback?: Function): Promise<void> | void {

		// Standard shutdown
		if (typeof reason === 'number') {
			this.shutdownReason = reason;

			// Ensure UI state is persisted
			return this.storageService.flush(WillSaveStateReason.SHUTDOWN);
		}

		// Before unload handling ignored for duration of callback
		else {
			this.ignoreBeforeUnload = true;
			try {
				callback?.();
			} finally {
				this.ignoreBeforeUnload = false;
			}
		}
	}

	async shutdown(): Promise<void> {
		this.logService.info('[lifecycle] shutdown triggered');

		// An explicit shutdown renders our unload
		// event handlers disabled, so dispose them.
		this.beforeUnloadListener?.dispose();
		this.unloadListener?.dispose();

		// Ensure UI state is persisted
		await this.storageService.flush(WillSaveStateReason.SHUTDOWN);

		// Handle shutdown without veto support
		this.doShutdown();
	}

	private doShutdown(vetoShutdown?: () => void): void {
		const logService = this.logService;

		this.didBeforeUnload = true;

		// Optimistically trigger a UI state flush
		// without waiting for it. The browser does
		// not guarantee that this is being executed
		// but if a dialog opens, we have a chance
		// to succeed.
		this.storageService.flush(WillSaveStateReason.SHUTDOWN);

		let veto = false;

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value, id) {
				if (typeof vetoShutdown === 'function') {
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
		if (veto && typeof vetoShutdown === 'function') {
			return vetoShutdown();
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
