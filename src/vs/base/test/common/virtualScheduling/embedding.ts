/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setTimeout0, setTimeout0IsFaster } from '../../../common/platform.js';
import { TimeApi } from './timeApi.js';
import { VirtualEvent } from './virtualClock.js';

/**
 * # The processor/host embedding
 *
 * An {@link Embedding} is the contract between the processor's pure state
 * machine and the host event loop. It is invoked once per virtual step that
 * produced progress, and decides *how* the processor reaches the host before
 * the next step.
 *
 * ## Contract
 *
 * On each invocation the embedding MUST do exactly one of:
 *
 * 1. Return `'continueSync'` **without** calling `then`. The processor will
 *    loop in place on the same host stack frame.
 *
 * 2. Schedule `then` on a host primitive (microtask, macrotask, paint frame)
 *    and return `'cbScheduled'`. The processor will return and wait for the
 *    callback to re-enter the trampoline.
 *
 * The embedding MUST NOT call `then` synchronously and also return
 * `'cbScheduled'` (that would re-enter the trampoline before this call
 * completed). Likewise, returning `'continueSync'` while having scheduled
 * `then` async would cause `then` to fire after the trampoline already
 * looped — also a bug.
 *
 * ## Why a callback contract instead of async/await
 *
 * Every `await` is an implicit microtask hop. For code whose job is to
 * decide host hops, that's the wrong abstraction: the reader has to mentally
 * compile the `await` to a boundary. With this contract, every host hop is
 * a named call to a single primitive (`api.setTimeout`, `setTimeout0`,
 * `api.requestAnimationFrame`, …) at exactly one site in this file.
 */
export type Embedding = (
	nextEvent: VirtualEvent,
	then: () => void,
) => 'continueSync' | 'cbScheduled';

/**
 * Tasks never schedule via promise chains. The processor runs virtual events
 * back-to-back on a single host stack frame — fastest possible, but starves
 * the host event loop for the duration of the run.
 *
 * Use only for tests where no `await` / `.then` chains are involved between
 * scheduling and execution of virtual events.
 */
export const syncEmbedding: Embedding = () => 'continueSync';

/**
 * Tasks may schedule via `await` / `.then`. Between virtual events, yield to
 * the host so the *microtask closure* — the current microtask plus every
 * microtask it transitively enqueues — drains before the next event runs.
 *
 * This is the embedding to use for almost all integration-style tests.
 */
export function drainMicrotasksEmbedding(realApi: TimeApi): Embedding {
	return (next, then) => {
		if (next.preferRealAnimationFrame && realApi.requestAnimationFrame) {
			realApi.requestAnimationFrame(() => then());
		} else {
			nextMacrotask(realApi, then);
		}
		return 'cbScheduled';
	};
}

/**
 * Schedule `cb` after the closure of the current microtask queue: `cb`
 * fires only after the current microtask AND every microtask it
 * (recursively, transitively) enqueues has settled.
 *
 * Per the HTML spec, a macrotask runs only when the microtask queue is
 * empty, so any macrotask primitive achieves this. We pick the fastest
 * one available on the host.
 */
export function nextMacrotask(api: TimeApi, cb: () => void): void {
	if (setTimeout0IsFaster) { setTimeout0(cb); return; }
	if (api.setImmediate) { api.setImmediate(cb); return; }
	api.setTimeout(cb, 0);
}
