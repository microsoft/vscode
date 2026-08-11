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

/** Existing sessions must exceed this confidence to be shown or selected. */
export const SESSION_ROUTE_CONFIDENCE_THRESHOLD = 0.8;
export const COMMAND_INTENT_CONFIDENCE_THRESHOLD = 0.8;
export const COMMAND_INTENT_MAX_CANDIDATES = 80;
const COMMAND_INTENT_LABEL_CLIP_LENGTH = 120;
const commandIntentSegmenter = typeof Intl.Segmenter === 'function'
	? new Intl.Segmenter(undefined, { granularity: 'word' })
	: undefined;

export function isHighConfidenceSessionRoute(result: ISessionRouteResult): boolean {
	return result.confidence > SESSION_ROUTE_CONFIDENCE_THRESHOLD;
}

export function isHighConfidenceCommandIntent(result: ICommandIntentResult): result is ICommandIntentCommandResult {
	return result.kind === 'command' && result.confidence > COMMAND_INTENT_CONFIDENCE_THRESHOLD;
}

export interface ICommandIntentCandidate {
	readonly commandId: string;
	readonly label: string;
}

export interface ICommandIntentRequest {
	readonly utterance: string;
	readonly commands: readonly ICommandIntentCandidate[];
}

const omniCommandIntentAllowlist = new Set([
	'workbench.action.focusAuxiliaryBar',
	'workbench.action.focusPanel',
	'workbench.action.focusSideBar',
	'workbench.action.openGlobalKeybindings',
	'workbench.action.openSettings',
	'workbench.action.quickOpen',
	'workbench.action.selectIconTheme',
	'workbench.action.selectProductIconTheme',
	'workbench.action.selectTheme',
	'workbench.action.showCommands',
	'workbench.action.terminal.toggleTerminal',
	'workbench.action.toggleAuxiliaryBar',
	'workbench.action.toggleFullScreen',
	'workbench.action.togglePanel',
	'workbench.action.toggleSidebarVisibility',
	'workbench.action.toggleZenMode',
]);

const omniCommandIntentPhrases = new Map<string, readonly string[]>([
	['workbench.action.focusAuxiliaryBar', ['focus auxiliary bar', 'focus secondary side bar', 'focus secondary sidebar']],
	['workbench.action.focusPanel', ['focus panel']],
	['workbench.action.focusSideBar', ['focus primary side bar', 'focus primary sidebar', 'focus side bar', 'focus sidebar']],
	['workbench.action.openGlobalKeybindings', ['open keyboard shortcuts', 'show keyboard shortcuts']],
	['workbench.action.openSettings', ['open settings', 'show settings']],
	['workbench.action.quickOpen', ['open quick open', 'quick open']],
	['workbench.action.selectTheme', ['change theme', 'change color theme', 'choose theme', 'choose color theme', 'select theme', 'select color theme', 'switch theme', 'switch color theme']],
	['workbench.action.selectIconTheme', ['change file icon theme', 'choose file icon theme', 'select file icon theme', 'switch file icon theme']],
	['workbench.action.selectProductIconTheme', ['change product icon theme', 'choose product icon theme', 'select product icon theme', 'switch product icon theme']],
	['workbench.action.showCommands', ['open command palette', 'show command palette']],
	['workbench.action.terminal.toggleTerminal', ['toggle terminal']],
	['workbench.action.toggleAuxiliaryBar', ['toggle auxiliary bar', 'toggle secondary side bar', 'toggle secondary sidebar']],
	['workbench.action.toggleFullScreen', ['toggle full screen', 'toggle fullscreen']],
	['workbench.action.togglePanel', ['toggle panel']],
	['workbench.action.toggleSidebarVisibility', ['toggle primary side bar', 'toggle primary sidebar', 'toggle side bar', 'toggle sidebar']],
	['workbench.action.toggleZenMode', ['toggle zen mode']],
]);

export function filterOmniCommandIntentCandidates(commands: readonly ICommandIntentCandidate[]): ICommandIntentCandidate[] {
	return commands.filter(command => omniCommandIntentAllowlist.has(command.commandId));
}

export interface ICommandIntentCommandResult {
	readonly kind: 'command';
	readonly commandId: string;
	readonly confidence: number;
	readonly reason?: string;
}

export interface ICommandIntentChatResult {
	readonly kind: 'chat';
}

export type ICommandIntentResult = ICommandIntentCommandResult | ICommandIntentChatResult;

export function selectCommandIntentCandidates(
	utterance: string,
	commands: readonly ICommandIntentCandidate[],
	limit: number = COMMAND_INTENT_MAX_CANDIDATES,
): ICommandIntentCandidate[] {
	const utteranceTerms = new Set(tokenizeCommandIntent(utterance));
	if (!utteranceTerms.size) {
		return [];
	}
	return commands
		.map(command => {
			const commandTerms = new Set(tokenizeCommandIntent(command.label));
			let matches = 0;
			for (const term of commandTerms) {
				if (utteranceTerms.has(term)) {
					matches++;
				}
			}
			const coverage = commandTerms.size ? matches / commandTerms.size : 0;
			const precision = matches / utteranceTerms.size;
			return { command, score: matches * 4 + coverage * 2 + precision };
		})
		.filter(candidate => candidate.score > 0)
		.sort((a, b) => b.score - a.score
			|| a.command.label.localeCompare(b.command.label)
			|| a.command.commandId.localeCompare(b.command.commandId))
		.slice(0, limit)
		.map(candidate => candidate.command);
}

export function detectExactCommandTitleIntent(utterance: string, commands: readonly ICommandIntentCandidate[]): ICommandIntentCommandResult | undefined {
	const utteranceTerms = tokenizeCommandIntent(utterance);
	if (!utteranceTerms.length) {
		return undefined;
	}
	const exactTitleMatches = commands.filter(command => {
		const titleSeparator = command.label.indexOf(':');
		const title = titleSeparator >= 0 ? command.label.slice(titleSeparator + 1) : command.label;
		const titleTerms = tokenizeCommandIntent(title);
		return titleTerms.length === utteranceTerms.length && titleTerms.every((term, index) => term === utteranceTerms[index]);
	});
	if (exactTitleMatches.length === 1) {
		return {
			kind: 'command',
			commandId: exactTitleMatches[0].commandId,
			confidence: 1,
			reason: 'Exact command title match',
		};
	}
	if (exactTitleMatches.length > 1) {
		return undefined;
	}
	const phraseMatches = commands.filter(command => omniCommandIntentPhrases.get(command.commandId)?.some(phrase => {
		const phraseTerms = tokenizeCommandIntent(phrase);
		return phraseTerms.length === utteranceTerms.length && phraseTerms.every((term, index) => term === utteranceTerms[index]);
	}));
	if (new Set(phraseMatches.map(command => command.commandId)).size !== 1) {
		return undefined;
	}
	return {
		kind: 'command',
		commandId: phraseMatches[0].commandId,
		confidence: 1,
		reason: 'Exact built-in command phrase match',
	};
}

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
	/** Provider-supplied session summary/description, when known. */
	readonly description?: string;
	/** The session's opening user request, when known. */
	readonly firstRequest?: string;
	/** The session's most recent user request, when known. */
	readonly lastRequest?: string;
	/** The session's most recent response (already truncated by the caller), when known. */
	readonly lastResponse?: string;
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
	 * First determine whether the utterance asks to run an available VS Code
	 * command. Chat intent continues to session routing.
	 */
	detectIntent(request: ICommandIntentRequest, token: CancellationToken): Promise<ICommandIntentResult>;

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

export function buildCommandIntentMessages(request: ICommandIntentRequest): ISessionRouterMessage[] {
	const commandLines = request.commands
		.slice(0, COMMAND_INTENT_MAX_CANDIDATES)
		.map((command, index) => `- candidate=c${index} title=${JSON.stringify(clip(command.label, COMMAND_INTENT_LABEL_CLIP_LENGTH))}`)
		.join('\n');
	const system = [
		'Determine whether the user wants to run one available VS Code command or continue to a coding chat.',
		'Choose command only for a clear application or editor action that exactly matches one listed command and needs no arguments.',
		'An imperative directive that controls the VS Code user interface is command intent when a matching command is listed. This includes opening, closing, showing, hiding, toggling, focusing, or navigating VS Code views, panels, editors, and settings UI.',
		'For a direct match such as "toggle terminal" with a listed Toggle Terminal command, choose command with high confidence.',
		'Changing the VS Code color theme, file icon theme, or product icon theme through a listed theme picker is command intent.',
		'Distinguish UI directives from coding tasks: "toggle terminal" is command, while "fix terminal toggling" is chat.',
		'Questions, explanations, coding tasks, repository work, file edits, debugging, and requests that need command arguments are chat.',
		'When uncertain, choose chat.',
		'Respond with ONLY one JSON object and no prose:',
		'{"intent":"command","candidate":string,"confidence":number,"reason":string}',
		'or {"intent":"chat"}.',
	].join('\n');
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: `Request: ${JSON.stringify(request.utterance)}\nAvailable commands:\n${commandLines}` },
	];
}

function tokenizeCommandIntent(text: string): string[] {
	const normalized = text
		.replace(/([\p{Ll}\p{Nd}])([\p{Lu}])/gu, '$1 $2')
		.replace(/\bvs\s+code\b/giu, 'vscode')
		.toLocaleLowerCase();
	const terms = commandIntentSegmenter
		? [...commandIntentSegmenter.segment(normalized)]
			.filter(segment => segment.isWordLike)
			.map(segment => segment.segment)
		: normalized.split(/[^\p{L}\p{N}]+/u);
	return terms
		.map(term => term.trim())
		.filter(term => term.length > 0 && (term.length > 1 || /[^\x00-\x7f]/.test(term)))
		.filter(term => !COMMAND_INTENT_STOP_WORDS.has(term));
}

const COMMAND_INTENT_STOP_WORDS = new Set([
	'action', 'and', 'can', 'command', 'could', 'execute', 'for', 'in', 'my', 'of', 'on', 'please', 'run', 'the', 'to', 'vscode', 'want', 'workbench', 'would',
]);

export function parseCommandIntentResponse(text: string, commands: readonly ICommandIntentCandidate[]): ICommandIntentResult | undefined {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end <= start) {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	if (record.intent === 'chat') {
		return { kind: 'chat' };
	}
	if (record.intent !== 'command'
		|| typeof record.candidate !== 'string'
		|| typeof record.confidence !== 'number'
		|| !isFinite(record.confidence)) {
		return undefined;
	}
	const candidateMatch = /^c(?<index>\d+)$/.exec(record.candidate);
	const candidateIndex = candidateMatch?.groups?.index ? Number(candidateMatch.groups.index) : NaN;
	const command = commands[candidateIndex];
	if (!command) {
		return undefined;
	}
	return {
		kind: 'command',
		commandId: command.commandId,
		confidence: Math.max(0, Math.min(1, record.confidence)),
		reason: typeof record.reason === 'string' ? record.reason : undefined,
	};
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
