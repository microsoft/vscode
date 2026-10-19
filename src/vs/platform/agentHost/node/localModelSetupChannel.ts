/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { ILogService } from '../../log/common/log.js';
import { isLocalModelRequest, LOCAL_MODEL_REQUEST_KEY, LOCAL_MODEL_STATUS_KEY, type ILocalModelRequest, type ILocalModelStatusV1 } from '../common/localModel.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import type { ILocalModelProvider } from './copilot/localModelBridge/localModelProvider.js';

/** Minimum interval between status publications that only move byte counters. */
export const LOCAL_MODEL_STATUS_PROGRESS_PUBLISH_INTERVAL_MS = 1000;

const MAX_REMEMBERED_NONCES = 128;

/** Keys whose changes alone do not warrant an immediate status publication. */
const VOLATILE_STATUS_KEYS = new Set(['completedBytes', 'bytesPerSecond']);

function statusShape(status: ILocalModelStatusV1): string {
	return JSON.stringify(status, (key, value) => VOLATILE_STATUS_KEYS.has(key) ? undefined : value);
}

/**
 * The Agent Host side of the local-model protocol; provider-neutral. Publishes the provider's status as
 * `vscode.localModel.status`, coalescing changes that only move byte counters to one per
 * {@link LOCAL_MODEL_STATUS_PROGRESS_PUBLISH_INTERVAL_MS}, because every root config change fans out to every agent.
 * Claims a request's nonce synchronously and clears the key before acting, so a nonce is never handled twice; a
 * request present before the channel existed is discarded. `cancel` and `pause` run immediately; other transitions
 * go through a {@link Sequencer} that never waits for a download or a drain.
 */
export class LocalModelSetupChannel extends Disposable {

	private readonly _seenNonces = new Set<string>();
	private readonly _transitions = new Sequencer();
	private readonly _cancellation = this._register(new CancellationTokenSource());
	private readonly _publishScheduler: RunOnceScheduler;
	private _pendingStatus: ILocalModelStatusV1 | undefined;
	private _publishedShape: string | undefined;

	constructor(
		private readonly _provider: ILocalModelProvider,
		private readonly _configurationService: IAgentConfigurationService,
		private readonly _logService: ILogService,
		publishIntervalMs = LOCAL_MODEL_STATUS_PROGRESS_PUBLISH_INTERVAL_MS,
	) {
		super();
		this._publishScheduler = this._register(new RunOnceScheduler(() => this._publish(), publishIntervalMs));
		this._discardStaleRequest();
		this._register(autorun(reader => this._onStatus(this._provider.status.read(reader))));
		this._register(this._configurationService.onDidRootConfigChange(() => this._handleRequest()));
		this._register(toDisposable(() => {
			this._cancellation.cancel();
			this._configurationService.publishRootTransientValues?.({ [LOCAL_MODEL_STATUS_KEY]: undefined });
		}));
	}

	private _onStatus(status: ILocalModelStatusV1): void {
		this._pendingStatus = status;
		const shape = statusShape(status);
		if (shape !== this._publishedShape) {
			this._publishScheduler.cancel();
			this._publish();
		} else if (!this._publishScheduler.isScheduled()) {
			this._publishScheduler.schedule();
		}
	}

	private _publish(): void {
		const status = this._pendingStatus;
		if (!status || this._store.isDisposed) {
			return;
		}
		this._publishedShape = statusShape(status);
		this._configurationService.publishRootTransientValues?.({ [LOCAL_MODEL_STATUS_KEY]: status });
	}

	private _discardStaleRequest(): void {
		const value = this._configurationService.getRootConfigValues?.()[LOCAL_MODEL_REQUEST_KEY];
		if (value !== undefined) {
			this._logService.info('[LocalModel] Discarding a request written before on-device models were available');
			this._configurationService.updateRootConfig({ [LOCAL_MODEL_REQUEST_KEY]: undefined });
		}
	}

	private _handleRequest(): void {
		const value = this._configurationService.getRootConfigValues?.()[LOCAL_MODEL_REQUEST_KEY];
		if (value === undefined) {
			return;
		}
		const request = isLocalModelRequest(value) ? value : undefined;
		const isNew = !!request && !this._seenNonces.has(request.nonce);
		if (request) {
			this._rememberNonce(request.nonce);
		}
		// Clearing re-enters this handler synchronously; the claim above makes that a no-op.
		this._configurationService.updateRootConfig({ [LOCAL_MODEL_REQUEST_KEY]: undefined });
		if (!request) {
			this._logService.warn('[LocalModel] Ignoring a malformed on-device model request');
			return;
		}
		if (isNew) {
			this._dispatch(request);
		}
	}

	private _rememberNonce(nonce: string): void {
		this._seenNonces.add(nonce);
		if (this._seenNonces.size > MAX_REMEMBERED_NONCES) {
			const oldest = this._seenNonces.values().next().value;
			if (oldest !== undefined) {
				this._seenNonces.delete(oldest);
			}
		}
	}

	private _dispatch(request: ILocalModelRequest): void {
		this._logService.info(`[LocalModel] Request: ${request.action}`);
		const { familyId, operationId, consent, contextTokens } = request;
		const token = this._cancellation.token;
		switch (request.action) {
			case 'cancel':
				if (operationId) {
					this._runNow(request, () => this._provider.cancel(operationId));
				}
				return;
			case 'pause':
				if (operationId) {
					this._runNow(request, () => this._provider.pause(operationId));
				}
				return;
			case 'refreshCatalog':
				this._track(request, this._provider.refreshCatalog());
				return;
			case 'setUp':
				if (familyId && consent) {
					this._queue(request, () => this._provider.setUp(familyId, consent, token));
				}
				return;
			case 'update':
				if (familyId) {
					this._queue(request, () => this._provider.update(familyId, consent, token));
				}
				return;
			case 'remove':
				if (familyId) {
					this._queue(request, () => this._provider.remove(familyId));
				}
				return;
			case 'makeActive':
				if (familyId) {
					this._queue(request, () => this._provider.makeActive(familyId));
				}
				return;
			case 'setContextSize':
				if (familyId && contextTokens !== undefined) {
					this._queue(request, () => this._provider.setContextSize(familyId, contextTokens));
				}
				return;
			case 'resume':
				if (operationId) {
					this._queue(request, () => this._provider.resume(operationId));
				}
				return;
			case 'retry':
				if (operationId) {
					this._queue(request, () => this._provider.retry(operationId));
				}
				return;
			case 'start':
				this._queue(request, () => this._provider.start());
				return;
			case 'stop':
				this._queue(request, () => this._provider.stop({ stopNow: false }));
				return;
			case 'stopNow':
				this._queue(request, () => this._provider.stop({ stopNow: true }));
				return;
			case 'stopPrevious':
				this._queue(request, () => this._provider.stopPrevious());
				return;
		}
	}

	private _runNow(request: ILocalModelRequest, action: () => void): void {
		try {
			action();
		} catch (error) {
			this._logService.error(error, `[LocalModel] ${request.action} failed`);
		}
	}

	private _queue(request: ILocalModelRequest, transition: () => Promise<void>): void {
		this._track(request, this._transitions.queue(async () => {
			if (!this._cancellation.token.isCancellationRequested) {
				await transition();
			}
		}));
	}

	private _track(request: ILocalModelRequest, operation: Promise<void>): void {
		operation.catch(error => this._logService.error(error, `[LocalModel] ${request.action} was not admitted`));
	}
}
