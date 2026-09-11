/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { stableStringify } from '../../../base/common/objects.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { isAgentHostCanvasJson, type AgentHostCanvasJson } from '../common/agentHostCanvases.js';

export class CanvasRequestConflictError extends Error {
	constructor() {
		super('The canvas request ID has already been used with different parameters.');
		this.name = 'CanvasRequestConflictError';
	}
}

export class CanvasStaleTargetError extends Error {
	constructor() {
		super('The canvas operation targets a stale incarnation or generation.');
		this.name = 'CanvasStaleTargetError';
	}
}

export class CanvasOperationIndeterminateError extends Error {
	constructor(cause: Error) {
		super('The canvas operation may have taken effect. Refresh its state before making a new request; do not replay it automatically.', { cause });
		this.name = 'CanvasOperationIndeterminateError';
	}
}

export interface ICanvasOperationIdentity {
	readonly clientId: string;
	readonly chat: URI;
	readonly requestId: string;
}

export interface ICanvasOperationExecution {
	/** Must be called immediately before invoking an effectful provider method. */
	startEffects(): void;
	assertCurrent(): void;
}

interface ILedgerEntry<T> {
	readonly chat: URI;
	readonly fingerprint: string;
	readonly result: DeferredPromise<T>;
	started: boolean;
	completedAt: number | undefined;
}

/** A bounded, host-lifetime retry window; only an identical request from the same sender is deduplicated. */
export class AgentHostCanvasOperationLedger<T> extends Disposable {
	private readonly _entries = new Map<string, ILedgerEntry<T>>();

	constructor(
		private readonly _maxEntries = 256,
		private readonly _retentionMs = 5 * 60 * 1000,
		private readonly _now: () => number = Date.now,
	) {
		super();
	}

	execute(identity: ICanvasOperationIdentity, parameters: AgentHostCanvasJson, operation: (execution: ICanvasOperationExecution) => Promise<T>): Promise<T> {
		if (this._store.isDisposed || !identity.clientId || !identity.requestId || identity.requestId.length > 256 || !isAgentHostCanvasJson(parameters)) {
			throw new Error('Invalid or unavailable canvas operation.');
		}
		this._prune();
		const key = JSON.stringify([identity.clientId, identity.requestId]);
		const fingerprint = stableStringify(parameters);
		const previous = this._entries.get(key);
		if (previous) {
			if (!isEqual(previous.chat, identity.chat) || previous.fingerprint !== fingerprint) {
				throw new CanvasRequestConflictError();
			}
			return previous.result.p;
		}
		if (this._entries.size >= this._maxEntries) {
			throw new Error('The canvas retry window is full. Wait for outstanding operations to settle.');
		}
		const entry: ILedgerEntry<T> = { chat: identity.chat, fingerprint, result: new DeferredPromise<T>(), started: false, completedAt: undefined };
		this._entries.set(key, entry);
		const assertCurrent = () => {
			if (entry.result.isSettled || this._store.isDisposed) {
				throw new CancellationError();
			}
		};
		void (async () => {
			try {
				const value = await operation({
					assertCurrent,
					startEffects: () => {
						assertCurrent();
						entry.started = true;
					},
				});
				if (!entry.result.isSettled) {
					entry.completedAt = this._now();
					await entry.result.complete(value);
				}
			} catch (error) {
				this._reject(entry, error instanceof Error ? error : new Error('The canvas provider failed without an Error result.', { cause: error }));
			}
		})();
		return entry.result.p;
	}

	replay(clientId: string, requestId: string, parameters: AgentHostCanvasJson): Promise<T> | undefined {
		this._prune();
		const previous = this._entries.get(JSON.stringify([clientId, requestId]));
		if (!previous) {
			return undefined;
		}
		if (previous.fingerprint !== stableStringify(parameters)) {
			throw new CanvasRequestConflictError();
		}
		return previous.result.p;
	}

	invalidateChat(chat: URI): void {
		for (const entry of this._entries.values()) {
			if (isEqual(entry.chat, chat)) {
				this._reject(entry, new CancellationError());
			}
		}
	}

	private _reject(entry: ILedgerEntry<T>, error: Error): void {
		if (!entry.result.isSettled) {
			entry.completedAt = this._now();
			void entry.result.error(entry.started ? new CanvasOperationIndeterminateError(error) : error);
		}
	}

	private _prune(): void {
		const oldest = this._now() - this._retentionMs;
		for (const [key, entry] of this._entries) {
			if (entry.completedAt !== undefined && entry.completedAt <= oldest) {
				this._entries.delete(key);
			}
		}
	}

	override dispose(): void {
		for (const entry of this._entries.values()) {
			this._reject(entry, new CancellationError());
		}
		this._entries.clear();
		super.dispose();
	}
}
