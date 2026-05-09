/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * H7 — Confidence-driven model escalation.
 *
 * Lightweight heuristics that flag an LLM response as "low confidence" so the
 * harness can decide whether to retry on a stronger model. The signals here
 * are deliberately cheap to compute (regex + length checks) so escalation
 * adds negligible overhead on the happy path where the cheap model nailed it.
 *
 * The thresholds are tuned for "good enough on first hit, escalate on
 * obvious uncertainty" rather than statistically calibrated confidence —
 * frontier model output is too varied for a regex sieve to ever be precise.
 * See §5 of `docs/agent-harness-review.md` for the design rationale.
 */

/**
 * Signals extracted from an LLM response indicating how uncertain it is.
 *
 * `score` is the aggregate the caller actually uses — the per-signal counts
 * are kept for tracing / future tuning.
 */
export interface UncertaintySignals {
	/** Phrases like "I'm not sure", "I think", "maybe", "might be". */
	hedgingPhraseCount: number;
	/** Output text length below a threshold (very short responses on substantive tasks). */
	unusuallyShort: boolean;
	/** Explicit "I don't know" / "I cannot determine" markers. */
	refusalCount: number;
	/** Aggregate score 0..1 — higher means less confident. */
	score: number;
}

/**
 * Hedging patterns. Matched case-insensitively on the response body.
 *
 * Word boundaries (`\b`) keep us from firing on substring matches inside
 * code identifiers (e.g. `i_think_count` won't trip "I think").
 */
const HEDGING_PATTERN = /\b(i think|i believe|i'm not sure|not entirely sure|might be|could be|maybe|perhaps|possibly|unsure|seems like|appears to)\b/gi;

/**
 * Refusal / explicit-uncertainty patterns. These are stronger signals than
 * hedges — a single hit is enough to push the score significantly.
 */
const REFUSAL_PATTERN = /\b(i don't know|i cannot determine|insufficient information|cannot tell|unclear|need more information)\b/gi;

/**
 * Below this character count, a response is treated as "unusually short" —
 * the assumption being that substantive work warrants a substantive answer.
 * Tuned empirically: most legitimate one-line responses ("42", "yes", "no")
 * already have low hedging/refusal scores so the unusually-short bump alone
 * shouldn't push them over the escalation threshold.
 */
const UNUSUALLY_SHORT_THRESHOLD = 100;

/**
 * Score weighting. Sum is bounded to 1.0 by `Math.min`.
 */
const REFUSAL_WEIGHT = 0.3;
const HEDGE_WEIGHT = 0.15;
const HEDGE_MAX_COUNT = 3;
const SHORT_WEIGHT = 0.2;

/**
 * Inspect an LLM response for uncertainty markers and return both the raw
 * counts and an aggregate `score` in `[0, 1]`. Higher scores mean the
 * response looks less confident.
 *
 * Counting strategy: regex `match` with the global flag returns every hit,
 * so a response with three hedges contributes `3 * HEDGE_WEIGHT` (capped).
 * Refusals are counted but each refusal beyond the first contributes the
 * same flat weight — once we know the model has refused once, escalation
 * is already a foregone conclusion.
 */
export function detectUncertainty(text: string): UncertaintySignals {
	const safe = text ?? '';

	const hedgeMatches = safe.match(HEDGING_PATTERN);
	const hedgingPhraseCount = hedgeMatches ? hedgeMatches.length : 0;

	const refusalMatches = safe.match(REFUSAL_PATTERN);
	const refusalCount = refusalMatches ? refusalMatches.length : 0;

	const unusuallyShort = safe.trim().length < UNUSUALLY_SHORT_THRESHOLD;

	const cappedHedges = Math.min(hedgingPhraseCount, HEDGE_MAX_COUNT);
	const refusalContribution = refusalCount > 0 ? REFUSAL_WEIGHT : 0;
	const hedgeContribution = cappedHedges * HEDGE_WEIGHT;
	const shortContribution = unusuallyShort ? SHORT_WEIGHT : 0;

	const score = Math.min(1, refusalContribution + hedgeContribution + shortContribution);

	return {
		hedgingPhraseCount,
		unusuallyShort,
		refusalCount,
		score,
	};
}

/**
 * Threshold above which `BaseAgent.callLlm` will escalate to a stronger
 * model (when `escalateOnUncertainty` is enabled). Exposed so callers /
 * tests can reference the same constant rather than duplicating `0.5`.
 */
export const UNCERTAINTY_ESCALATION_THRESHOLD = 0.5;
