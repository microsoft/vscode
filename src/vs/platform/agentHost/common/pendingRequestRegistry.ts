/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';

type MetadataArgument<TMeta> = [TMeta] extends [void] ? [metadata?: TMeta] : [metadata: TMeta];

/**
 * Registry of parked deferred promises keyed by string id. Used to
 * track request/response round-trips where a callback fires a signal
 * that an external responder may resolve synchronously.
 *
 * The atomic register-then-fire is enforced by {@link registerAndFire}
 * rather than by convention: a synchronous responder (e.g.
 * `agentSideEffects.ts:_handleToolReady` auto-approving writes inside
 * the listener for the fired signal) registered AFTER the fire would
 * miss its response and the awaited promise would deadlock — a
 * regression caught in Claude phase 7.
 */
export class PendingRequestRegistry<TResult, TMeta = void> {
	private readonly _entries = new Map<string, { deferred: DeferredPromise<TResult>; metadata: TMeta }>();
	/**
	 * Results delivered via {@link respondOrBuffer} before any deferred was
	 * parked under the same key. A subsequent {@link register} consumes the
	 * buffered value and resolves immediately, tolerating a completion that
	 * races ahead of the handler that awaits it.
	 */
	private readonly _earlyResults = new Map<string, TResult>();

	/** Atomically park a deferred and optional metadata, then invoke `fire` to prevent synchronous responses racing registration. */
	registerAndFire(key: string, fire: () => void, ...metadata: MetadataArgument<TMeta>): Promise<TResult> {
		if (this._earlyResults.has(key)) {
			const buffered = this._earlyResults.get(key) as TResult;
			this._earlyResults.delete(key);
			return Promise.resolve(buffered);
		}
		const deferred = new DeferredPromise<TResult>();
		this._entries.set(key, { deferred, metadata: metadata[0] as TMeta });
		fire();
		return deferred.p;
	}

	/**
	 * Park a deferred and optional metadata under `key`, then return its promise. Use when there
	 * is no synchronous responder to guard against — the request that
	 * eventually feeds {@link respond} originates from a different code
	 * path (e.g. an MCP handler invoked by the SDK whose completion
	 * arrives via a workbench round-trip).
	 *
	 * If `key` is already registered (duplicate `tool_use_id` from the
	 * SDK, retry, or logic bug), the previous deferred is rejected with
	 * a {@link CancellationError} so its awaiter unwinds instead of
	 * leaking forever.
	 */
	register(key: string, ...metadata: MetadataArgument<TMeta>): Promise<TResult> {
		if (this._earlyResults.has(key)) {
			const buffered = this._earlyResults.get(key) as TResult;
			this._earlyResults.delete(key);
			return Promise.resolve(buffered);
		}
		const existing = this._entries.get(key);
		if (existing && !existing.deferred.isSettled) {
			existing.deferred.error(new CancellationError());
		}
		const deferred = new DeferredPromise<TResult>();
		this._entries.set(key, { deferred, metadata: metadata[0] as TMeta });
		return deferred.p;
	}

	/** Resolve the deferred parked under `key`, returning whether an entry was found. */
	respond(key: string, value: TResult): boolean {
		const entry = this._entries.get(key);
		if (!entry) {
			return false;
		}
		this._entries.delete(key);
		entry.deferred.complete(value);
		return true;
	}

	/** Return the metadata associated with the request parked under `key`. */
	getMetadata(key: string): TMeta | undefined {
		return this._entries.get(key)?.metadata;
	}

	/** Whether a request is currently parked under `key`. */
	has(key: string): boolean {
		return this._entries.has(key);
	}

	/** Iterate the keys and metadata of all currently parked requests. */
	*entries(): IterableIterator<readonly [key: string, metadata: TMeta]> {
		for (const [key, entry] of this._entries) {
			yield [key, entry.metadata];
		}
	}

	/** Resolve every parked request whose metadata matches `predicate`, returning the number resolved. */
	respondWhere(predicate: (metadata: TMeta, key: string) => boolean, value: TResult): number {
		let count = 0;
		for (const [key, entry] of this._entries) {
			if (predicate(entry.metadata, key) && this.respond(key, value)) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Like {@link respond}, but if no deferred is parked under `key`, buffer
	 * the value so a subsequent {@link register} / {@link registerAndFire}
	 * for the same key resolves immediately. Use when the completion may
	 * legitimately arrive before the awaiting handler registers (the
	 * Copilot client-tool round-trip, whose SDK handler and the workbench
	 * completion race).
	 */
	respondOrBuffer(key: string, value: TResult): void {
		if (!this.respond(key, value)) {
			this._earlyResults.set(key, value);
		}
	}

	/** Whether a result arrived before a request registered under `key`. */
	hasBufferedResult(key: string): boolean {
		return this._earlyResults.has(key);
	}

	/**
	 * Resolve every parked deferred with `denyValue` and clear the registry.
	 *
	 * Designed for the permission-deny path: a "deny" answer is itself a
	 * successful round-trip result, so awaiting consumers receive `denyValue`
	 * rather than an error. Use {@link rejectAll} when callers must observe
	 * a thrown error instead (cancellation, dispose).
	 */
	denyAll(denyValue: TResult): void {
		for (const [, entry] of this._entries) {
			if (!entry.deferred.isSettled) {
				entry.deferred.complete(denyValue);
			}
		}
		this._entries.clear();
		this._earlyResults.clear();
	}

	/**
	 * Reject every parked deferred with `error` and clear the registry.
	 *
	 * Use this when in-flight requests must be cancelled rather than
	 * answered (e.g. session dispose, `Query` rebind on tool-set change).
	 * Compare with {@link denyAll}, which *resolves* every deferred with a
	 * supplied value — that is right for the permission-deny path where a
	 * "deny" is itself a successful answer, but wrong for cancellation
	 * where the awaited consumer must observe an error to unwind.
	 */
	rejectAll(error: Error): void {
		for (const [, entry] of this._entries) {
			if (!entry.deferred.isSettled) {
				entry.deferred.error(error);
			}
		}
		this._entries.clear();
		this._earlyResults.clear();
	}
}
