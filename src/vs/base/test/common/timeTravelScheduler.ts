/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @deprecated The contents of this file have moved to
 * `./virtualScheduling/index.js`. This re-export is kept for backwards
 * compatibility and will be removed once all callers have migrated.
 *
 * Notes for migration:
 *  - `TimeTravelScheduler` is now {@link VirtualClock} (same constructor).
 *  - `AsyncSchedulerProcessor` is now {@link VirtualTimeProcessor}; its
 *    constructor takes an explicit {@link Embedding}, and {@link Run.options}
 *    use `until` (a {@link TerminationPolicy}) instead of the implicit
 *    "drain queue" behaviour. See {@link runWithFakedTimers} for a
 *    drop-in helper.
 *  - `originalGlobalValues` is now {@link realTimeApi}.
 */

export {
	captureGlobalTimeApi,
	createLoggingTimeApi,
	createVirtualTimeApi,
	pushGlobalTimeApi,
	realTimeApi as originalGlobalValues,
	runWithFakedTimers,
	VirtualClock as TimeTravelScheduler,
} from './virtualScheduling/index.js';

export type {
	CreateVirtualTimeApiOptions,
	RunWithFakedTimersOptions,
	TimeApi,
} from './virtualScheduling/index.js';
