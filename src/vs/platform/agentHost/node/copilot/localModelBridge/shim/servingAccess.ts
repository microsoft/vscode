/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { LocalModelErrorAction, LocalModelServerState } from '../../../../common/localModel.js';
import type { LocalModelThinkingSupport } from '../localModelThinking.js';

/*
 * The narrow view of the serving side (supervisor + active-model state) that
 * the request router needs. The router never reads a mutable
 * "current active model" to attribute or serve a request it already bound:
 * everything is pinned to an {@link IServingIdentity}.
 */

/**
 * Identity of one load of one model. Every successful start
 * increments {@link servingGeneration}. Route records, request leases and turn
 * attribution bind to this identity.
 */
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

/**
 * A lease on one serving generation (an in-flight stream for usage
 * accounting). While held, the supervisor's user-initiated drain waits for it.
 * `dispose` is idempotent.
 */
export interface IServingLease extends IDisposable {
	readonly identity: IServingIdentity;
}

/**
 * An agent turn's hold on the serving generation its requests ran on: a
 * user-initiated drain waits for the turn to end, not only for its in-flight
 * requests, and admits the turn's later requests meanwhile
 * ({@link IServingAccess.getHeldServing}). Ends with the turn (`TurnLedger`),
 * or when the generation stops. `dispose` is idempotent.
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

/**
 * What the request router needs from the serving side. Implemented by the
 * shim's supervisor/orchestrator; an in-memory fake lives with the tests.
 */
export interface IServingAccess {
	/** Live gates. */
	getGates(): ILocalModelLiveGates;

	/** Increments on sign-out or account switch; older route records are treated as missing. */
	getAccountGeneration(): number;

	/** The active model's serving state, or `undefined` when no model is active. */
	getActiveServing(): IServingSnapshot | undefined;

	/**
	 * The serving state of the generation the open turn of `sessionId` holds,
	 * while that generation still serves the turn: ready, or draining for a
	 * user-initiated stop, swap or reload (then it is reported `ready` and not
	 * {@link IServingSnapshot.swapInProgress}, with its endpoint). `undefined`
	 * otherwise. The turn's requests continue on it until the turn ends.
	 */
	getHeldServing(sessionId: string | undefined): IServingSnapshot | undefined;

	/** Whether the loopback endpoint of `servingGeneration` is down-marked. */
	isEndpointDown(servingGeneration: number): boolean;

	/** Down-mark the endpoint of `servingGeneration` for `DOWN_MARK_MS` after a refused connection or a connect timeout. */
	markEndpointDown(servingGeneration: number): void;

	/**
	 * Take a lease on `identity.servingGeneration`. Returns `undefined` when that
	 * generation is no longer the current one or no longer admits work (a
	 * drain, swap, update or reload is in progress), unless the open turn of
	 * `sessionId` holds it ({@link getHeldServing}). A request of an open turn
	 * makes the turn hold the generation until the turn ends. A request holding
	 * a lease is never served by a different generation.
	 */
	acquireServingLease(identity: IServingIdentity, sessionId?: string): IServingLease | undefined;

	/**
	 * Non-blocking slot acquisition for Auto requests. Returns `undefined` when
	 * every slot is busy or direct requests are already queued.
	 */
	tryAcquireSlot(lease: IServingLease): IServingSlot | undefined;

	/**
	 * FIFO slot acquisition for direct requests. Rejects with a
	 * {@link LocalModelServingError} `busyTimeout` after `QUEUE_TIMEOUT_MS`, or
	 * with the signal's reason when aborted.
	 */
	acquireSlot(lease: IServingLease, options: IQueuedSlotOptions): Promise<IServingSlot>;

	/**
	 * For direct requests: make sure `familyId` (the active family, or the
	 * target of a swap in progress) is loaded and ready. Starts a stopped server
	 * and waits up to `LOAD_TIMEOUT_MS`; during a swap
	 * to `familyId` the call waits for the swap. Rejects with a
	 * {@link LocalModelServingError} carrying the supervisor's code and message
	 * (`modelNotActive` when the family stopped being active while waiting), or
	 * with the signal's reason when aborted. Never triggers a swap.
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
