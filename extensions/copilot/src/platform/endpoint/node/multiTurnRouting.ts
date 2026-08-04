/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Multi-turn Auto mode routing.
 *
 * Auto mode normally routes on the first turn and stays sticky. Multi-turn routing instead
 * re-evaluates the model as a conversation evolves, using an exponential-backoff schedule and
 * an escalate-only policy driven by the router's capability vector (`hydra_scores`).
 *
 * This module is intentionally pure (no services, no I/O) so the drift math and the schedule
 * state machine can be unit-tested in isolation. The orchestration lives in `AutomodeService`.
 */

/**
 * A capability vector: capability dimension -> score. Scores are probabilities in `[0, 1]`
 * produced by the router as `hydra_scores` (dimensions: `reasoning`, `code_gen`, `debugging`,
 * `tool_use`).
 */
export type CapabilityVector = Record<string, number>;

/**
 * Raw multi-turn routing policy as returned by the server in the ModelRouter response
 * (`multi_turn` block). All fields are optional for defensive parsing; missing/invalid scalar
 * knobs fall back to {@link MULTI_TURN_DEFAULTS}, and an absent/empty `sigma` disables the
 * feature for that turn.
 */
export interface MultiTurnRoutingConfig {
	/** Explicit server kill switch; `false` disables multi-turn routing. */
	enabled?: boolean;
	/** Config version id, echoed into telemetry for tuning/rollback. */
	schedule_version?: string;
	/** Per-dimension standard deviations used to normalize drift. Same keys as `hydra_scores`. */
	sigma?: Record<string, number>;
	/** Drift threshold (in σ units) at or above which the model escalates. */
	escalate_threshold?: number;
	/** Skip window after the first non-escalating check. */
	initial_skip?: number;
	/** Multiplier applied to the skip window on each non-escalating check. */
	backoff_coefficient?: number;
	/** Upper bound on the skip window (prevents over-skipping in long conversations). */
	max_skip?: number;
}

/** Fallback knobs used when the server omits or partially specifies the config. */
export const MULTI_TURN_DEFAULTS = {
	escalateThreshold: 2,
	initialSkip: 2,
	backoffCoefficient: 2,
	maxSkip: 32,
} as const;

/** Validated, ready-to-use multi-turn config (server values merged with defaults). */
export interface ResolvedMultiTurnConfig {
	readonly sigma: Record<string, number>;
	readonly escalateThreshold: number;
	readonly initialSkip: number;
	readonly backoffCoefficient: number;
	readonly maxSkip: number;
	readonly scheduleVersion?: string;
}

/** Per-conversation multi-turn state persisted between turns. */
export interface MultiTurnState {
	/** The capability vector that caused the current model to be selected. */
	readonly anchorVector: CapabilityVector;
	/** Skip window size to apply after the next non-escalating check. */
	readonly skipWindow: number;
	/** Turns remaining to skip (reuse the current model, no router call) before the next check. */
	readonly skipRemaining: number;
	/** User turns elapsed since {@link anchorVector} was set. */
	readonly turnsSinceAnchor: number;
	/** Server config version that produced the current schedule (for telemetry). */
	readonly scheduleVersion?: string;
}

/** Per-dimension breakdown of a drift computation (for telemetry / diagnostics). */
export interface DriftContribution {
	readonly dimension: string;
	/** One-sided demand increase: `max(current - anchor, 0)`. */
	readonly delta: number;
	/** σ-normalized contribution: `delta / sigma`. */
	readonly normalized: number;
}

export interface DriftResult {
	readonly drift: number;
	readonly contributions: readonly DriftContribution[];
	/** Dimensions present in both vectors but lacking a positive sigma (excluded from drift). */
	readonly missingSigma: readonly string[];
}

export type MultiTurnDecisionKind = 'anchor' | 'escalate' | 'stay';

export interface MultiTurnDecision {
	readonly kind: MultiTurnDecisionKind;
	/**
	 * Whether the caller should adopt `candidate_models[0]` (`anchor` / `escalate`) or keep the
	 * current model (`stay`).
	 */
	readonly adoptCandidate: boolean;
	readonly drift?: number;
	readonly contributions?: readonly DriftContribution[];
	/** Dimensions in the vectors that lacked a positive sigma and were excluded from drift (INV-1). */
	readonly missingSigma?: readonly string[];
	readonly nextState: MultiTurnState;
}

/** Why {@link resolveMultiTurnConfig} could not produce a usable config for a turn. */
export type MultiTurnConfigAbortReason = 'noConfig' | 'serverDisabled' | 'noSigma' | 'invalidSigma';

/** All reasons multi-turn routing can abort to legacy selection while the client arm is on. */
export type MultiTurnAbortReason = MultiTurnConfigAbortReason | 'noHydraScores';

/** Discriminated result of {@link resolveMultiTurnConfig}. */
export type MultiTurnConfigResult =
	| { readonly config: ResolvedMultiTurnConfig; readonly reason?: undefined }
	| { readonly config?: undefined; readonly reason: MultiTurnConfigAbortReason };

/**
 * One-sided, σ-normalized L2 drift between the current capability vector and the anchor.
 *
 * Only dimensions where demand *increased* relative to the anchor contribute, so drift measures
 * escalating demand and never fires on a decrease:
 *
 * ```
 * drift = sqrt( Σ_d ( max(current[d] - anchor[d], 0) / sigma[d] )² )
 * ```
 *
 * The dimensions considered are the intersection of the two vectors; a dimension without a
 * positive, finite sigma is excluded and reported in {@link DriftResult.missingSigma}.
 */
export function computeDrift(current: CapabilityVector, anchor: CapabilityVector, sigma: Record<string, number>): DriftResult {
	const contributions: DriftContribution[] = [];
	const missingSigma: string[] = [];
	let sumSquares = 0;

	for (const dimension of Object.keys(anchor)) {
		if (!(dimension in current)) {
			continue;
		}
		const s = sigma[dimension];
		if (!(typeof s === 'number' && Number.isFinite(s) && s > 0)) {
			missingSigma.push(dimension);
			continue;
		}
		const delta = Math.max(current[dimension] - anchor[dimension], 0);
		if (delta <= 0) {
			continue;
		}
		const normalized = delta / s;
		sumSquares += normalized * normalized;
		contributions.push({ dimension, delta, normalized });
	}

	return { drift: Math.sqrt(sumSquares), contributions, missingSigma };
}

/**
 * Decide the multi-turn action after a router "check" call.
 *
 * - No previous state (first turn / post-compaction): `anchor` — adopt `candidate_models[0]` and
 *   set the anchor from the current vector.
 * - `drift >= escalateThreshold`: `escalate` — adopt `candidate_models[0]`, re-anchor, and reset
 *   the backoff schedule.
 * - Otherwise: `stay` — keep the current model, arm the current skip window, then grow it
 *   (capped at `maxSkip`).
 */
export function decideMultiTurn(current: CapabilityVector, previous: MultiTurnState | undefined, config: ResolvedMultiTurnConfig): MultiTurnDecision {
	if (!previous) {
		return {
			kind: 'anchor',
			adoptCandidate: true,
			nextState: anchorState(current, config),
		};
	}

	const { drift, contributions, missingSigma } = computeDrift(current, previous.anchorVector, config.sigma);
	if (drift >= config.escalateThreshold) {
		return {
			kind: 'escalate',
			adoptCandidate: true,
			drift,
			contributions,
			missingSigma,
			nextState: anchorState(current, config),
		};
	}

	return {
		kind: 'stay',
		adoptCandidate: false,
		drift,
		contributions,
		missingSigma,
		nextState: {
			anchorVector: previous.anchorVector,
			// Floor so a fractional backoff_coefficient can't produce a fractional window/schedule.
			skipWindow: Math.floor(Math.min(previous.skipWindow * config.backoffCoefficient, config.maxSkip)),
			skipRemaining: previous.skipWindow,
			turnsSinceAnchor: previous.turnsSinceAnchor + 1,
			scheduleVersion: config.scheduleVersion,
		},
	};
}

/**
 * Validate and merge a raw server config with {@link MULTI_TURN_DEFAULTS}. Returns `undefined`
 * when the feature should be off for this turn: the server disabled it (`enabled === false`) or
 * did not provide a usable `sigma` (at least one positive value is required to compute drift). The
 * returned {@link MultiTurnConfigResult} carries an abort `reason` in that case so callers can
 * report the specific failure mode instead of silently falling back.
 */
export function resolveMultiTurnConfig(raw: MultiTurnRoutingConfig | undefined): MultiTurnConfigResult {
	if (!raw) {
		return { reason: 'noConfig' };
	}
	if (raw.enabled === false) {
		return { reason: 'serverDisabled' };
	}
	const sigma = raw.sigma;
	if (!sigma || typeof sigma !== 'object') {
		return { reason: 'noSigma' };
	}
	const hasUsableSigma = Object.values(sigma).some(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
	if (!hasUsableSigma) {
		return { reason: 'invalidSigma' };
	}

	const initialSkip = toNonNegativeInt(raw.initial_skip, MULTI_TURN_DEFAULTS.initialSkip);
	return {
		config: {
			sigma,
			escalateThreshold: toPositiveNumber(raw.escalate_threshold, MULTI_TURN_DEFAULTS.escalateThreshold),
			initialSkip,
			backoffCoefficient: toCoefficient(raw.backoff_coefficient, MULTI_TURN_DEFAULTS.backoffCoefficient),
			maxSkip: Math.max(initialSkip, toNonNegativeInt(raw.max_skip, MULTI_TURN_DEFAULTS.maxSkip)),
			scheduleVersion: typeof raw.schedule_version === 'string' ? raw.schedule_version : undefined,
		},
	};
}

function anchorState(current: CapabilityVector, config: ResolvedMultiTurnConfig): MultiTurnState {
	return {
		anchorVector: current,
		skipWindow: config.initialSkip,
		skipRemaining: 0,
		turnsSinceAnchor: 0,
		scheduleVersion: config.scheduleVersion,
	};
}

function toPositiveNumber(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function toNonNegativeInt(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function toCoefficient(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : fallback;
}
