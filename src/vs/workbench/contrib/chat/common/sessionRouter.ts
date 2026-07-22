/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Setting that gates the "omni" chat experience — advisory badge routing on omni
 * surfaces such as Quick Chat. See `chat.shared.contribution.ts` for the schema.
 */
export const OmniChatEnabledSettingId = 'chat.omni.enabled';

/**
 * A session that a user request can be routed to. Populated by the caller from
 * the session list (e.g. `IChatSessionsService` / `ISessionsService`).
 */
export interface IRoutableSession {
	/** Stable identifier used to dispatch the request (e.g. via a `send_message` tool). */
	readonly sessionId: string;
	/** Human-readable session name shown to the user. */
	readonly label: string;
	/** Owning repository, when known (e.g. `owner/repo`). */
	readonly repo?: string;
	/** Working directory of the session, when known. */
	readonly cwd?: string;
	/** Coarse activity state (e.g. `idle`, `working`), when known. */
	readonly status?: string;
	/** Epoch milliseconds of the last activity, when known. */
	readonly lastActivity?: number;
}

/** A single scored candidate produced by the router, sorted best-first. */
export interface ISessionRouteResult {
	readonly sessionId: string;
	/** Match confidence in the range [0, 1]. */
	readonly confidence: number;
	/** Optional short rationale for display/debugging. */
	readonly reason?: string;
}

export interface ISessionRouteRequest {
	/** The raw user utterance (e.g. dictated text) to route. */
	readonly utterance: string;
	/** Candidate sessions to score against. */
	readonly sessions: readonly IRoutableSession[];
}

export const ISessionRouter = createDecorator<ISessionRouter>('sessionRouter');

/**
 * Scores which existing session a free-form user request best matches, so a
 * floating input / voice surface can route the request (or disambiguate when no
 * candidate is confident enough).
 */
export interface ISessionRouter {
	readonly _serviceBrand: undefined;

	/**
	 * Rank the candidate sessions for the given utterance, best match first.
	 * Never rejects for routing reasons: on model/parse failure it degrades to a
	 * local heuristic so callers always receive a usable ranking.
	 */
	route(request: ISessionRouteRequest, token: CancellationToken): Promise<ISessionRouteResult[]>;
}

// --- Prompt + parsing helpers (pure; reused by any scoring backend) ---

/** A provider-agnostic chat message used to prompt the scoring model. */
export interface ISessionRouterMessage {
	readonly role: 'system' | 'user';
	readonly content: string;
}

/**
 * Build the chat messages sent to the scoring model. Kept pure and exported so
 * the same prompt can back a renderer language-model request, a CAPI utility
 * completion, or a local model without divergence.
 */
export function buildRouterMessages(request: ISessionRouteRequest): ISessionRouterMessage[] {
	const sessionLines = request.sessions.map(session => {
		const parts = [`id=${session.sessionId}`, `name=${JSON.stringify(session.label)}`];
		if (session.repo) { parts.push(`repo=${session.repo}`); }
		if (session.cwd) { parts.push(`cwd=${session.cwd}`); }
		if (session.status) { parts.push(`status=${session.status}`); }
		return `- ${parts.join(' ')}`;
	}).join('\n');

	const system = [
		'You route a user request to the coding session it most likely refers to.',
		'Score every candidate session from 0 (no match) to 1 (certain match).',
		'Respond with ONLY a JSON array, sorted by confidence descending, of objects:',
		'[{"sessionId": string, "confidence": number, "reason": string}]',
		'Do not include any prose or code fences.'
	].join('\n');

	const user = `Request: ${JSON.stringify(request.utterance)}\nSessions:\n${sessionLines}`;

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
}

/**
 * Parse the scoring model's raw text response into results, keeping only known
 * session ids and clamping confidences to [0, 1]. Tolerates code fences and
 * surrounding prose by extracting the first JSON array. Returns `undefined` when
 * nothing usable can be parsed, signalling callers to fall back.
 */
export function parseRouterResponse(text: string, validSessionIds: ReadonlySet<string>): ISessionRouteResult[] | undefined {
	const match = text.match(/\[[\s\S]*\]/);
	if (!match) {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed)) {
		return undefined;
	}

	const results: ISessionRouteResult[] = [];
	const seen = new Set<string>();
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const record = entry as Record<string, unknown>;
		const sessionId = record.sessionId;
		if (typeof sessionId !== 'string' || !validSessionIds.has(sessionId) || seen.has(sessionId)) {
			continue;
		}
		const rawConfidence = record.confidence;
		const confidence = typeof rawConfidence === 'number' && isFinite(rawConfidence)
			? Math.max(0, Math.min(1, rawConfidence))
			: 0;
		seen.add(sessionId);
		results.push({
			sessionId,
			confidence,
			reason: typeof record.reason === 'string' ? record.reason : undefined
		});
	}

	if (!results.length) {
		return undefined;
	}
	results.sort((a, b) => b.confidence - a.confidence);
	return results;
}

/**
 * Zero-dependency offline ranking used as the fallback when no scoring model is
 * available. Token-overlap heuristic over the session label/repo/cwd.
 *
 * The score is calibrated against the candidate's own metadata rather than the
 * raw utterance length: it blends how much of the session's strongest identity
 * field the utterance covers (recall, taken as the best match across label /
 * repo / cwd so a strong label match is not diluted by repo or path tokens) with
 * how much of the utterance those tokens consume (precision). This keeps an
 * obvious label match routable even for long sentences instead of drowning it in
 * unrelated utterance tokens.
 */
export function heuristicScore(request: ISessionRouteRequest): ISessionRouteResult[] {
	const terms = new Set(tokenize(request.utterance));
	const results = request.sessions.map(session => {
		if (!terms.size) {
			return { sessionId: session.sessionId, confidence: 0 };
		}
		const fields = [session.label, session.repo, session.cwd].filter(isNonEmpty);
		let bestRecall = 0;
		const matchedTerms = new Set<string>();
		for (const field of fields) {
			const fieldTokens = new Set(tokenize(field));
			if (!fieldTokens.size) {
				continue;
			}
			let fieldHits = 0;
			for (const token of fieldTokens) {
				if (terms.has(token)) {
					fieldHits++;
					matchedTerms.add(token);
				}
			}
			bestRecall = Math.max(bestRecall, fieldHits / fieldTokens.size);
		}
		if (!matchedTerms.size) {
			return { sessionId: session.sessionId, confidence: 0 };
		}
		const precision = matchedTerms.size / terms.size;
		const confidence = 0.75 * bestRecall + 0.25 * precision;
		return { sessionId: session.sessionId, confidence };
	});
	results.sort((a, b) => b.confidence - a.confidence);
	return results;
}

function tokenize(text: string): string[] {
	return text.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 1);
}

function isNonEmpty(value: string | undefined): value is string {
	return !!value;
}
