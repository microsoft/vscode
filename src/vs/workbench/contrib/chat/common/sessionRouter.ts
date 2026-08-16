/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatSendRequestOptions } from './chatService/chatService.js';

/**
 * Setting that gates the "omni" chat experience — advisory badge routing on omni
 * surfaces such as Quick Chat. See `chat.shared.contribution.ts` for the schema.
 */
export const OmniChatEnabledSettingId = 'chat.omni.enabled';

/** Existing sessions must exceed this confidence to be shown or selected. */
export const SESSION_ROUTE_CONFIDENCE_THRESHOLD = 0.8;

export function isHighConfidenceSessionRoute(result: ISessionRouteResult): boolean {
	return result.confidence > SESSION_ROUTE_CONFIDENCE_THRESHOLD;
}

/**
 * A session that a user request can be routed to. Populated by the caller from
 * the session list (e.g. `IChatSessionsService` / `ISessionsService`).
 */
export interface IRoutableSession {
	/** Stable identifier used to dispatch the request (e.g. via a `send_message` tool). */
	readonly sessionId: string;
	/** Authoritative provider-owned session resource, when available. */
	readonly resource?: URI;
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
	/** Provider-supplied session summary/description, when known. */
	readonly description?: string;
	/** The session's opening user request, when known. */
	readonly firstRequest?: string;
	/** The session's most recent user request, when known. */
	readonly lastRequest?: string;
	/** The session's most recent response (already truncated by the caller), when known. */
	readonly lastResponse?: string;
}

export type ChatSessionRoutingDispatchReasonCode = 'cancelled' | 'providerRemoved' | 'unsupportedOptions' | 'workspaceNotTrusted';

export interface IChatSessionRoutingDispatchResult {
	readonly status: 'sent' | 'queued' | 'rejected';
	readonly resource?: URI;
	readonly requestId?: string;
	/** Last activity timestamp before dispatch, used to identify completion of this request. */
	readonly activityBaseline?: number;
	readonly reason?: string;
	readonly reasonCode?: ChatSessionRoutingDispatchReasonCode;
	/** Reveals the routed session in its owning presentation service. */
	readonly reveal?: () => Promise<void>;
	readonly completion?: Promise<IChatSessionRoutingDispatchResult>;
}

export interface IChatSessionRoutingWorkspace {
	readonly uri: URI;
	readonly providerId: string;
	readonly group?: string;
	readonly label: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
	readonly disabled?: boolean;
}

export interface IChatSessionRoutingWorkspaceGroup {
	readonly id: string;
	readonly label?: string;
	readonly tooltip?: string;
	readonly icon?: ThemeIcon;
}

export interface IChatSessionRoutingWorkspaceBrowseAction {
	readonly id: string;
	readonly providerId?: string;
	readonly group?: string;
	readonly label: string;
	readonly description?: string;
	readonly icon?: ThemeIcon;
	readonly disabled?: boolean;
}

export interface IChatSessionRoutingWorkspaceCatalog {
	readonly groups: readonly IChatSessionRoutingWorkspaceGroup[];
	readonly workspaces: readonly IChatSessionRoutingWorkspace[];
	readonly browseActions: readonly IChatSessionRoutingWorkspaceBrowseAction[];
	readonly defaultWorkspace?: IChatSessionRoutingWorkspace;
}

export interface IChatSessionRoutingNewSessionTarget {
	readonly folder?: URI;
	readonly providerId?: string;
}

/**
 * Provider-neutral catalog and dispatch boundary used by routing hosts that own
 * a broader session model than the workbench's renderer-local chat catalog.
 */
export interface IChatSessionRoutingProvider {
	readonly onDidChangeSessions?: Event<void>;
	readonly onDidChangeNewSessionWorkspaceCatalog?: Event<void>;
	getCandidateSessions(token: CancellationToken): readonly IRoutableSession[] | Promise<readonly IRoutableSession[]>;
	getSessionSnapshot?(resource: URI, token: CancellationToken): IRoutableSession | undefined | Promise<IRoutableSession | undefined>;
	watchSession?(resource: URI, listener: () => void): IDisposable;
	getNewSessionWorkspaceCatalog?(): IChatSessionRoutingWorkspaceCatalog | Promise<IChatSessionRoutingWorkspaceCatalog>;
	selectNewSessionWorkspace?(workspace: IChatSessionRoutingWorkspace): void | Promise<void>;
	browseNewSessionWorkspace?(actionId: string, token: CancellationToken): Promise<IChatSessionRoutingWorkspace | undefined>;
	resolveSessionResource(sessionId: string): URI | undefined;
	dispatchToSession(
		sessionId: string,
		message: string,
		options: IChatSendRequestOptions,
		token: CancellationToken,
	): Promise<IChatSessionRoutingDispatchResult>;
	dispatchToNewSession(
		target: IChatSessionRoutingNewSessionTarget,
		message: string,
		options: IChatSendRequestOptions,
		token: CancellationToken,
	): Promise<IChatSessionRoutingDispatchResult>;
	revealSession(resource: URI): Promise<void>;
}

export const IChatSessionRoutingProviderService = createDecorator<IChatSessionRoutingProviderService>('chatSessionRoutingProviderService');

export interface IChatSessionRoutingProviderService {
	readonly _serviceBrand: undefined;

	registerProvider(provider: IChatSessionRoutingProvider): IDisposable;
	getProvider(): IChatSessionRoutingProvider | undefined;
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
	 * Returns no matches when model scoring is unavailable so callers safely
	 * create a new session instead of guessing from lexical overlap.
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
 * Upper bound on any single free-text field embedded in the router prompt, so
 * one verbose session (e.g. a long response) can't dominate or blow the prompt.
 */
export const ROUTER_FIELD_CLIP_LENGTH = 240;

/** Collapse whitespace and clip a free-text field for embedding in the prompt. */
function clip(text: string, max: number = ROUTER_FIELD_CLIP_LENGTH): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
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
		if (session.description) { parts.push(`summary=${JSON.stringify(clip(session.description))}`); }
		if (session.firstRequest) { parts.push(`firstRequest=${JSON.stringify(clip(session.firstRequest))}`); }
		if (session.lastRequest) { parts.push(`lastRequest=${JSON.stringify(clip(session.lastRequest))}`); }
		if (session.lastResponse) { parts.push(`lastResponse=${JSON.stringify(clip(session.lastResponse))}`); }
		return `- ${parts.join(' ')}`;
	}).join('\n');

	const system = [
		'Decide from the user request whether it is best handled as a continuation of an existing coding session or whether it warrants a new session.',
		'Route to an existing session only when continuing that session preserves useful task context; prefer a new session for a distinct task, even when it is in the same repository.',
		'Each candidate may include a summary plus its first request, most recent request, and most recent response; weigh these more heavily than the name when present.',
		'Score every candidate session from 0 (no match) to 1 (certain match).',
		'Reserve scores above 0.8 for a clear continuation of the same concrete task; shared repository names or generic coding terms are not enough.',
		'When the request could reasonably start a new task, score every existing session at 0.8 or below.',
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
		if (typeof rawConfidence !== 'number' || !isFinite(rawConfidence)) {
			continue;
		}
		const confidence = Math.max(0, Math.min(1, rawConfidence));
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
 * Zero-dependency lexical ranking used only to break equal model scores.
 * Token-overlap heuristic over the session's identity/content fields (label,
 * repo, cwd, description, and, when enriched, its first/most-recent request and
 * most-recent response).
 *
 * The score is calibrated against the candidate's own metadata rather than the
 * raw utterance length: it blends how much of the session's strongest identity
 * field the utterance covers (recall, taken as the best match across the fields
 * so a strong label match is not diluted by repo or path tokens) with
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
		const fields = [session.label, session.repo, session.cwd, session.description, session.firstRequest, session.lastRequest, session.lastResponse].filter(isNonEmpty);
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
	return text.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 1 && !ROUTER_STOP_WORDS.has(term));
}

function isNonEmpty(value: string | undefined): value is string {
	return !!value;
}

const ROUTER_STOP_WORDS = new Set([
	'about', 'agent', 'and', 'are', 'can', 'change', 'chat', 'code', 'fix', 'for', 'from', 'have', 'into', 'its', 'make',
	'on', 'please', 'project', 'repo', 'repository', 'session', 'task', 'that', 'the', 'this', 'to', 'update', 'was', 'with', 'work',
]);
