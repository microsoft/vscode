/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import type { ConfigSchema, ModelSelection } from './state/protocol/state.js';

/**
 * Sub-key in `ModelSelection.config` carrying the user's reasoning-effort
 * pick from the model picker. Mirror of CopilotAgent's
 * `ThinkingLevelConfigKey` (copilotAgent.ts:83) so a single picker contract
 * spans both providers — the picker writes `model.config.thinkingLevel`,
 * and each provider narrows that string at materialize.
 */
export const CLAUDE_THINKING_LEVEL_KEY = 'thinkingLevel';

/**
 * Reasoning-effort values accepted by the Claude SDK's `Options.effort`
 * (sdk.d.ts:443 + sdk.d.ts:1214). Hand-rolled here — not imported from the
 * SDK — to keep `common/` SDK-free; structurally identical to the SDK's
 * `EffortLevel` so it assigns into `Options.effort` without a cast.
 *
 * NOTE: the live hot-swap path `applyFlagSettings({ effortLevel })`
 * (sdk.d.ts:4292) only accepts a 4-value subset that omits `'max'`; that
 * clamp lives at the hot-swap seam (Phase 9), not here.
 */
export type ClaudeEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Pull `thinkingLevel` out of `ModelSelection.config` and narrow it to
 * {@link ClaudeEffortLevel}. Returns `undefined` when the model selection
 * is absent or carries an unrecognized value (the SDK then falls through
 * to its own default). Mirror of CopilotAgent's `_getReasoningEffort`
 * (copilotAgent.ts:487).
 */
export function resolveClaudeEffort(model: ModelSelection | undefined): ClaudeEffortLevel | undefined {
	const raw = model?.config?.[CLAUDE_THINKING_LEVEL_KEY];
	switch (raw) {
		case 'low':
		case 'medium':
		case 'high':
		case 'xhigh':
		case 'max':
			return raw;
		default:
			return undefined;
	}
}

/** Canonical ordered list of {@link ClaudeEffortLevel} values; used for sort + guard. */
const CLAUDE_EFFORT_LEVELS: readonly ClaudeEffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Type guard narrowing an arbitrary string to {@link ClaudeEffortLevel}. */
export function isClaudeEffortLevel(value: string): value is ClaudeEffortLevel {
	return (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(value);
}

function labelForClaudeEffort(level: ClaudeEffortLevel): string {
	switch (level) {
		case 'low': return localize('claude.modelThinkingLevel.low', "Low");
		case 'medium': return localize('claude.modelThinkingLevel.medium', "Medium");
		case 'high': return localize('claude.modelThinkingLevel.high', "High");
		case 'xhigh': return localize('claude.modelThinkingLevel.xhigh', "Extra High");
		case 'max': return localize('claude.modelThinkingLevel.max', "Max");
	}
}

/**
 * Synthesize the per-model `configSchema` advertising the `thinkingLevel`
 * picker entry on Claude models that support adaptive thinking. Mirror of
 * CopilotAgent's `_createThinkingLevelConfigSchema` (copilotAgent.ts:457).
 *
 * The `enum` is sourced from each model's own `reasoning_effort` list (a
 * runtime field on CAPI's `/models` payload — different Claude models
 * support different effort subsets, e.g. `['low','medium','high']`,
 * `['high']`, or `[]`). Callers narrow that list to {@link ClaudeEffortLevel}
 * via {@link isClaudeEffortLevel} before passing it in.
 *
 * The `default` is `'high'` when the model supports it, otherwise omitted
 * — Claude's own server-side default for adaptive thinking is `'high'`,
 * and the extension mirrors the same fallback rule at
 * `extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeModels.ts:230`.
 * (Anthropic's `CCAModel` rows don't carry a server-supplied default
 * field; tracked at microsoft/vscode-capi#85.)
 *
 * Returns `undefined` for an empty list — the picker then renders no
 * thinkingLevel control for that model.
 */
export function createClaudeThinkingLevelSchema(supportedEfforts: readonly ClaudeEffortLevel[]): ConfigSchema | undefined {
	if (supportedEfforts.length === 0) {
		return undefined;
	}
	const defaultEffort: ClaudeEffortLevel | undefined = supportedEfforts.includes('high') ? 'high' : undefined;
	return {
		type: 'object',
		properties: {
			[CLAUDE_THINKING_LEVEL_KEY]: {
				type: 'string',
				title: localize('claude.modelThinkingLevel.title', "Thinking Level"),
				description: localize('claude.modelThinkingLevel.description', "Controls how much reasoning effort Claude uses."),
				enum: [...supportedEfforts],
				enumLabels: supportedEfforts.map(labelForClaudeEffort),
				...(defaultEffort !== undefined ? { default: defaultEffort } : {}),
			},
		},
	};
}
