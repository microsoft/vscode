/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { vObjAny, vString as vStringValidator } from '../../../../base/common/validation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { parseSubagentSessionUri } from '../../common/state/sessionState.js';
import {
	ResponsePartKind,
	ToolCallStatus,
	type Turn,
} from '../../common/state/protocol/state.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { mapSessionMessagesToTurns } from './claudeReplayMapper.js';
import { scanTranscriptForAgentIds, SUBAGENT_TOOL_NAMES, type SubagentRegistry } from './claudeSubagentRegistry.js';

/**
 * One link in the resolver chain. Each strategy consults a different
 * SDK primitive to map a `toolCallId` back to an `agentId`. Strategies
 * are ordered cheapest-first inside {@link getSubagentTranscript}
 * (TextSuffix → PromptMatch → Native).
 */
export interface ISubagentLookupStrategy {
	/** Short label, used as a category in any future telemetry counter. */
	readonly name: string;
	/** Returns the agentId or `undefined` if this strategy cannot resolve the input. */
	lookup(toolCallId: string, ctx: ISubagentLookupContext): Promise<string | undefined>;
}

export interface ISubagentLookupContext {
	readonly parentUri: URI;
	/** SDK session id (`AgentSession.id(parentUri)`). Precomputed so strategies don't repeat the work. */
	readonly parentSessionId: string;
	/** Pre-fetched parent transcript when available; otherwise the strategy must fetch its own. */
	readonly parentTranscript?: readonly Turn[];
	readonly token: CancellationToken;
}

/**
 * Strategy 1 — scan the parent transcript for the synthetic agentId
 * suffix. Cheapest path: the transcript is usually already in memory
 * from the live session or the parent's own replay fetch.
 */
export class TextSuffixStrategy implements ISubagentLookupStrategy {
	readonly name = 'text_suffix';

	constructor(
		private readonly _sdk: IClaudeAgentSdkService,
		private readonly _logService: ILogService,
	) { }

	async lookup(toolCallId: string, ctx: ISubagentLookupContext): Promise<string | undefined> {
		const transcript = await fetchParentTurns(this._sdk, this._logService, ctx, 'TextSuffix');
		if (!transcript) {
			return undefined;
		}
		return scanTranscriptForAgentIds(transcript).get(toolCallId);
	}
}

/**
 * Shared transcript-fetch helper for strategies that need the parent
 * transcript and weren't given one via {@link ISubagentLookupContext.parentTranscript}.
 * Returns `undefined` (and logs a warning tagged with `strategyLabel`)
 * on any SDK error so callers can short-circuit cleanly.
 */
export async function fetchParentTurns(
	sdk: IClaudeAgentSdkService,
	logService: ILogService,
	ctx: ISubagentLookupContext,
	strategyLabel: string,
): Promise<readonly Turn[] | undefined> {
	if (ctx.parentTranscript) {
		return ctx.parentTranscript;
	}
	try {
		const messages = await sdk.getSessionMessages(ctx.parentSessionId, { includeSystemMessages: true });
		return mapSessionMessagesToTurns(messages, ctx.parentUri, logService);
	} catch (err) {
		logService.warn(`[claudeSubagentResolver] ${strategyLabel}: parent transcript fetch failed: ${err}`);
		return undefined;
	}
}

// #region locally-defined validator adapters

/**
 * Thin convenience wrappers over the base validators in
 * `src/vs/base/common/validation.ts`. The base API returns a
 * `{content, error}` discriminated union (built for full schema
 * validation); these wrappers collapse that to `T | undefined` for the
 * narrow `is-it-this-type?` checks below where we just need a
 * structural narrowing of arbitrary SDK JSON payloads.
 */
function vString(input: unknown): string | undefined {
	const r = vStringValidator().validate(input);
	return r.error ? undefined : r.content;
}

function vObj(input: unknown): Record<string, unknown> | undefined {
	const r = vObjAny().validate(input);
	if (r.error || r.content === null || Array.isArray(r.content)) {
		return undefined;
	}
	return r.content as Record<string, unknown>;
}

// #endregion

/**
 * Strategy 2 — list every subagent the SDK knows for this parent and
 * compare each one's first user message against the parent's
 * `Agent.tool_use.input.prompt`. Bulletproof when TextSuffix misses
 * (e.g. SDK reformats the suffix) at the cost of two extra SDK calls.
 */
export class PromptMatchStrategy implements ISubagentLookupStrategy {
	readonly name = 'prompt_match';

	constructor(
		private readonly _sdk: IClaudeAgentSdkService,
		private readonly _logService: ILogService,
	) { }

	async lookup(toolCallId: string, ctx: ISubagentLookupContext): Promise<string | undefined> {
		const prompt = await this._loadParentPrompt(toolCallId, ctx);
		if (!prompt) {
			return undefined;
		}
		let agentIds: readonly string[];
		try {
			agentIds = await this._sdk.listSubagents(ctx.parentSessionId);
		} catch (err) {
			this._logService.warn(`[claudeSubagentResolver] PromptMatch: listSubagents failed: ${err}`);
			return undefined;
		}
		for (const agentId of agentIds) {
			if (ctx.token.isCancellationRequested) {
				return undefined;
			}
			let messages;
			try {
				messages = await this._sdk.getSubagentMessages(ctx.parentSessionId, agentId);
			} catch (err) {
				this._logService.warn(`[claudeSubagentResolver] PromptMatch: getSubagentMessages(${agentId}) failed: ${err}`);
				continue;
			}
			const firstMessage = extractFirstUserText(messages);
			if (firstMessage === undefined) {
				continue;
			}
			if (firstMessage === prompt) {
				return agentId;
			}
		}
		return undefined;
	}

	private async _loadParentPrompt(toolCallId: string, ctx: ISubagentLookupContext): Promise<string | undefined> {
		const transcript = await fetchParentTurns(this._sdk, this._logService, ctx, 'PromptMatch');
		if (!transcript) {
			return undefined;
		}
		return extractSpawningPromptFromTranscript(transcript, toolCallId);
	}
}

/**
 * Pure transcript scan: locate the spawning subagent tool call by id
 * and return its `prompt` input field, or `undefined` if not a
 * subagent tool, still streaming, or input is malformed. Exported so
 * it can be tested independently of SDK fetch behavior.
 */
export function extractSpawningPromptFromTranscript(transcript: readonly Turn[], toolCallId: string): string | undefined {
	for (const turn of transcript) {
		for (const part of turn.responseParts) {
			if (part.kind !== ResponsePartKind.ToolCall) {
				continue;
			}
			const state = part.toolCall;
			if (state.toolCallId !== toolCallId) {
				continue;
			}
			if (!SUBAGENT_TOOL_NAMES.has(state.toolName)) {
				return undefined;
			}
			if (state.status === ToolCallStatus.Streaming) {
				return undefined;
			}
			const inputRaw = state.toolInput;
			if (typeof inputRaw !== 'string') {
				return undefined;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(inputRaw);
			} catch {
				return undefined;
			}
			const bag = vObj(parsed);
			if (!bag) {
				return undefined;
			}
			return vString(bag.prompt);
		}
	}
	return undefined;
}

function extractFirstUserText(messages: readonly { readonly type?: string; readonly message?: unknown }[]): string | undefined {
	for (const msg of messages) {
		if (msg.type !== 'user') {
			continue;
		}
		const inner = vObj(msg.message);
		if (!inner) {
			continue;
		}
		const content = inner.content;
		if (typeof content === 'string') {
			return content;
		}
		if (!Array.isArray(content)) {
			continue;
		}
		for (const block of content) {
			const obj = vObj(block);
			if (!obj || obj.type !== 'text') {
				continue;
			}
			const text = vString(obj.text);
			if (text !== undefined) {
				return text;
			}
		}
	}
	return undefined;
}

/**
 * Strategy 3 — placeholder for a future SDK primitive that returns the
 * spawning `tool_use_id` alongside each subagent id. Currently the SDK
 * exposes no such API; this class returns `undefined` and the resolver
 * falls back to the other strategies.
 */
export class NativeStrategy implements ISubagentLookupStrategy {
	readonly name = 'native';
	async lookup(): Promise<string | undefined> {
		return undefined;
	}
}

/**
 * Side-effecting collaborators the strategy chain uses. Pulled out so
 * {@link resolveAgentIdViaChain} is a pure orchestrator: tests can
 * drive it with in-memory stubs without standing up a full SDK or
 * registry.
 */
interface IResolveChainDeps {
	readonly strategies: readonly ISubagentLookupStrategy[];
	readonly cacheGet: (toolCallId: string) => string | undefined;
	readonly cacheSet: (toolCallId: string, agentId: string) => void;
}

/**
 * Chain orchestration extracted so it can be tested in isolation. Cache
 * hit short-circuits the chain; otherwise strategies run in order, the
 * first non-undefined hit wins, the cache is populated.
 *
 * Cancellation is checked between strategies — a cancelled token resolves
 * to `undefined`.
 */
export async function resolveAgentIdViaChain(
	toolCallId: string,
	ctx: ISubagentLookupContext,
	deps: IResolveChainDeps,
): Promise<string | undefined> {
	const cached = deps.cacheGet(toolCallId);
	if (cached) {
		return cached;
	}
	for (const strategy of deps.strategies) {
		if (ctx.token.isCancellationRequested) {
			return undefined;
		}
		const hit = await strategy.lookup(toolCallId, ctx);
		if (hit) {
			deps.cacheSet(toolCallId, hit);
			return hit;
		}
	}
	return undefined;
}

/**
 * Build the production strategy chain. Pulled out so callers
 * ({@link getSubagentTranscript}, tests, etc.) construct a single
 * canonical ordering instead of inlining it.
 */
function buildDefaultStrategies(sdk: IClaudeAgentSdkService, logService: ILogService): readonly ISubagentLookupStrategy[] {
	return [
		new TextSuffixStrategy(sdk, logService),
		new PromptMatchStrategy(sdk, logService),
		new NativeStrategy(),
	];
}

/**
 * Phase 12 — fetch a subagent's transcript by URI. Cache lookup goes
 * through the parent session's {@link SubagentRegistry} (each spawn
 * carries its `agentId`); on a miss, the strategy chain runs and the
 * resolved agentId is recorded back onto the spawn (first-writer-wins)
 * for future calls.
 *
 * Resilient: returns `[]` on any unresolvable agentId or SDK error
 * after warn-logging. Throws only on a malformed (non-subagent) URI,
 * which indicates a programming error in the caller.
 */
export async function getSubagentTranscript(
	subagentUri: URI,
	parentRegistry: SubagentRegistry,
	sdk: IClaudeAgentSdkService,
	logService: ILogService,
	token: CancellationToken,
): Promise<readonly Turn[]> {
	const parsed = parseSubagentSessionUri(subagentUri);
	if (!parsed) {
		throw new Error(`getSubagentTranscript: not a subagent URI: ${subagentUri.toString()}`);
	}
	const { parentSession, toolCallId } = parsed;
	const parentSessionId = AgentSession.id(parentSession);
	const agentId = await resolveAgentIdViaChain(toolCallId, {
		parentUri: parentSession,
		parentSessionId,
		token,
	}, {
		strategies: buildDefaultStrategies(sdk, logService),
		cacheGet: id => parentRegistry.getSpawn(id)?.agentId,
		cacheSet: (id, resolved) => { parentRegistry.recordSpawn(id, { agentId: resolved }); },
	});
	if (!agentId) {
		return [];
	}
	let messages;
	try {
		messages = await sdk.getSubagentMessages(parentSessionId, agentId);
	} catch (err) {
		logService.warn(`[getSubagentTranscript] getSubagentMessages(${agentId}) failed: ${err}`);
		return [];
	}
	return mapSessionMessagesToTurns(messages, subagentUri, logService);
}
