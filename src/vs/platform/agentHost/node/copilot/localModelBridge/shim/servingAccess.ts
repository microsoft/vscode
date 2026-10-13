/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { LocalModelErrorAction, LocalModelServerState } from '../../../../common/localModel.js';
import type { LocalModelThinkingSupport } from '../localModelThinking.js';

/* The router's narrow view of the serving side: everything it bound is pinned to an {@link IServingIdentity}, never to the mutable current active model. */

/** Identity of one load of one model; each successful start increments {@link servingGeneration}, and routes, leases and attribution bind to it. */
export interface IServingIdentity {
	readonly familyId: string;
	readonly contentId: string;
	/** CAPI on-device id, e.g. `mai-code-1.1-flash-local`. Never sent to a loopback server. */
	readonly capiId: string;
	/** `llama-server --alias` (the Azure ML asset name), e.g. `mai-code-1.1-flash`. */
	readonly alias: string;
	readonly servingGeneration: number;
}

/** Loopback endpoint of a ready `llama-server`. Never logged. */
export interface ILocalModelLoopbackEndpoint {
	/** `http://127.0.0.1:<port>`, without a trailing slash. */
	readonly baseUrl: string;
	/** Per-spawn API key (`LLAMA_API_KEY`), held only in memory. */
	readonly apiKey: string;
}

/** `GET /props` of a ready server. */
export interface ILocalModelServerProps {
	readonly nCtx: number;
	readonly totalSlots: number;
}

/** The family's tag limits. */
export interface ILocalModelFamilyLimits {
	readonly maxContextWindowTokens: number;
	readonly maxPromptTokens: number;
	readonly maxOutputTokens: number;
}

/** A snapshot of the active model's serving state, read at decision time. */
export interface IServingSnapshot {
	/** The current (or, when stopped, the last) load of the active model. */
	readonly identity: IServingIdentity;
	/** Localized, sanitized display name of the active family. */
	readonly displayName: string;
	readonly server: LocalModelServerState;
	/** Passed the Auto performance gate. */
	readonly autoEligible: boolean;
	/** A user-initiated swap, update or reload is in progress; the current generation admits no new Auto work. */
	readonly swapInProgress: boolean;
	/** Present while {@link server} is `ready`. */
	readonly endpoint?: ILocalModelLoopbackEndpoint;
	/** Present while {@link server} is `ready`. */
	readonly props?: ILocalModelServerProps;
	readonly limits: ILocalModelFamilyLimits;
	/** How the active model's chat template controls thinking, when it does: requests' `reasoning_effort` maps to `chat_template_kwargs`. */
	readonly thinking?: LocalModelThinkingSupport;
}

/** Live gates, re-read on every `/auto` and every local dispatch. */
export interface ILocalModelLiveGates {
	/** `chat.copilot.localModel.enabled`. */
	readonly enabled: boolean;
	/** Workbench-computed account gate. */
	readonly accountGate: boolean;
	/** `chat.copilot.localModel.useInAuto`. */
	readonly useInAuto: boolean;
}

/** A lease on one serving generation (an in-flight stream); a user-initiated drain waits for it. `dispose` is idempotent. */
export interface IServingLease extends IDisposable {
	readonly identity: IServingIdentity;
}

/**
 * An agent turn's hold on the generation its requests ran on: a user-initiated drain waits for the turn to end and
 * admits its later requests meanwhile. Ends with the turn or the generation. `dispose` is idempotent.
 */
export interface IServingHold extends IDisposable {
	readonly servingGeneration: number;
}

/** One of `llama-server`'s parallel slots. `dispose` is idempotent and frees the slot. */
export interface IServingSlot extends IDisposable {
	readonly servingGeneration: number;
}

/** Options for a queued (direct) slot acquisition. */
export interface IQueuedSlotOptions {
	/** Aborting removes the request from the queue and rejects with the signal's reason. */
	readonly signal: AbortSignal;
	/** Called with the 1-based queue position whenever it changes while waiting. */
	readonly onQueuePosition?: (position: number) => void;
}

/** A direct-row alias resolved to an installed family. */
export interface IDirectFamilyLookup {
	readonly familyId: string;
	readonly displayName: string;
	/**
	 * - `active`: the active family (any server state; a stopped server is started on demand).
	 * - `incoming`: a swap to this family is in progress; direct requests wait for it.
	 * - `inactive`: installed but not active; requests fail with `modelNotActive` and never trigger a swap.
	 */
	readonly state: 'active' | 'incoming' | 'inactive';
}

/** A serving-side failure. {@link message} is localized and safe to show. */
export class LocalModelServingError extends Error {
	constructor(
		/** For example `busyTimeout`, `modelNotActive`, `startFailed` or a supervisor error code. */
		readonly code: string,
		message: string,
		/** The recovery actions to offer; when absent, the supervisor's actions for {@link code}. */
		readonly actions?: readonly LocalModelErrorAction[],
	) {
		super(message);
		this.name = 'LocalModelServingError';
	}
}

/** What the request router needs from the serving side; tests use an in-memory fake. */
export interface IServingAccess {
	getGates(): ILocalModelLiveGates;

	/** Increments on sign-out or account switch; older route records are treated as missing. */
	getAccountGeneration(): number;

	/** The active model's serving state, or `undefined` when no model is active. */
	getActiveServing(): IServingSnapshot | undefined;

	/**
	 * The serving state of the generation the open turn of `sessionId` holds while it still serves the turn (ready, or
	 * draining for a user stop, swap or reload, then reported as `ready`); `undefined` otherwise.
	 */
	getHeldServing(sessionId: string | undefined): IServingSnapshot | undefined;

	/** Whether the loopback endpoint of `servingGeneration` is down-marked. */
	isEndpointDown(servingGeneration: number): boolean;

	/** Down-mark the endpoint of `servingGeneration` for `DOWN_MARK_MS` after a refused connection or a connect timeout. */
	markEndpointDown(servingGeneration: number): void;

	/**
	 * Leases `identity.servingGeneration`, or `undefined` when it is no longer current or admitting work, unless the open
	 * turn of `sessionId` holds it. A leased request is never served by a different generation.
	 */
	acquireServingLease(identity: IServingIdentity, sessionId?: string): IServingLease | undefined;

	/** Non-blocking slot acquisition for Auto requests; `undefined` when every slot is busy or direct requests are queued. */
	tryAcquireSlot(lease: IServingLease): IServingSlot | undefined;

	/** FIFO slot acquisition for direct requests; rejects with `busyTimeout` after `QUEUE_TIMEOUT_MS`, or with the signal's reason when aborted. */
	acquireSlot(lease: IServingLease, options: IQueuedSlotOptions): Promise<IServingSlot>;

	/**
	 * For direct requests: makes sure `familyId` (active, or the target of a swap in progress) is loaded and ready, starting
	 * a stopped server and waiting up to `LOAD_TIMEOUT_MS`. Rejects with a {@link LocalModelServingError}; never swaps.
	 */
	ensureStarted(familyId: string, signal: AbortSignal): Promise<IServingSnapshot>;

	/** Resolve a direct row's alias (`body.model` of a sentinel request). */
	findFamilyByAlias(alias: string): IDirectFamilyLookup | undefined;
}

/** Time source used by the router, the route table and the serving fakes. */
export interface ILocalModelClock {
	now(): number;
	setTimeout(callback: () => void, ms: number): IDisposable;
}

/** The real clock. */
export const systemLocalModelClock: ILocalModelClock = {
	now: () => Date.now(),
	setTimeout: (callback, ms) => {
		const handle = setTimeout(callback, ms);
		return toDisposable(() => clearTimeout(handle));
	},
};
