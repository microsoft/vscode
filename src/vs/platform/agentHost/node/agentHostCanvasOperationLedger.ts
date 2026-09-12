/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import type { IAgentCanvasOperation } from '../common/agentHostCanvases.js';
import { isBoundedCanvasJson } from '../common/agentHostCanvasValidation.js';
import { CANVAS_REQUEST_ID_MAX_LENGTH } from '../common/state/protocol/channels-canvas/state.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

interface ICanvasOperationEntry<T> {
	readonly fingerprint: string;
	readonly result: DeferredPromise<T>;
	started: boolean;
	cancellation?: CancellationTokenSource;
	completedAt?: number;
}

export class CanvasOperationIndeterminateError extends ProtocolError {
	constructor(cause?: unknown) {
		super(AhpErrorCodes.Conflict, 'The canvas operation may have taken effect. Reconcile its state; do not automatically replay it.', { outcome: 'indeterminate' });
		this.cause = cause;
	}
}

/** One bounded retry window for one authenticated transport, never shared across reconnects. */
export class AgentHostCanvasOperationLedger<T> extends Disposable {
	private readonly _entries = new Map<string, ICanvasOperationEntry<T>>();
	private readonly _cancellation = this._register(new CancellationTokenSource());

	constructor(
		private readonly _capacity = 128,
		private readonly _retentionMs = 5 * 60 * 1000,
		private readonly _now: () => number = Date.now,
		private readonly _operationTimeoutMs = 120_000,
	) {
		super();
	}

	get token() { return this._cancellation.token; }

	execute(requestId: string, parameters: object, operation: (context: IAgentCanvasOperation) => Promise<T>, token?: CancellationToken): Promise<T> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > CANVAS_REQUEST_ID_MAX_LENGTH || !isBoundedCanvasJson(parameters, 128 * 1024)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Canvas request parameters must be bounded JSON.');
		}
		for (const [key, entry] of this._entries) {
			if (entry.completedAt !== undefined && entry.completedAt + this._retentionMs <= this._now()) {
				this._entries.delete(key);
			}
		}
		const fingerprint = JSON.stringify(parameters);
		const previous = this._entries.get(requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas request ID was already used with different parameters.');
			}
			return previous.result.p;
		}
		if (this._entries.size >= this._capacity) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas retry window is full.');
		}
		const entry: ICanvasOperationEntry<T> = { fingerprint, result: new DeferredPromise<T>(), started: false };
		this._entries.set(requestId, entry);
		void (async () => {
			const store = new DisposableStore();
			const cancellation = store.add(new CancellationTokenSource(this.token));
			entry.cancellation = cancellation;
			if (token) {
				store.add(token.onCancellationRequested(() => cancellation.cancel()));
				if (token.isCancellationRequested) {
					cancellation.cancel();
				}
			}
			store.add(disposableTimeout(() => cancellation.cancel(), this._operationTimeoutMs));
			try {
				const result = await raceCancellationError(operation({
					token: cancellation.token,
					willExecute: () => {
						if (cancellation.token.isCancellationRequested) {
							throw new CancellationError();
						}
						entry.started = true;
					},
				}), cancellation.token);
				if (!entry.result.isSettled) {
					entry.completedAt = this._now();
					await entry.result.complete(result);
				}
			} catch (error) {
				if (!entry.result.isSettled) {
					entry.completedAt = this._now();
					await entry.result.error(entry.started && !(error instanceof CanvasOperationIndeterminateError) ? new CanvasOperationIndeterminateError(error) : error);
				}
			} finally {
				entry.cancellation = undefined;
				store.dispose();
			}
		})();
		return entry.result.p;
	}

	cancel(requestId: string, parameters: object): void {
		const entry = this._entries.get(requestId);
		if (entry && entry.fingerprint !== JSON.stringify(parameters)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas cancellation does not match its original request.');
		}
		entry?.cancellation?.cancel();
	}

	override dispose(): void {
		this._cancellation.cancel();
		for (const entry of this._entries.values()) {
			if (!entry.result.isSettled) {
				void entry.result.error(entry.started ? new CanvasOperationIndeterminateError() : new CancellationError());
			}
		}
		this._entries.clear();
		super.dispose();
	}
}
