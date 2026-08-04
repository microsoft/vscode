/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelSelection } from '../../common/state/protocol/state.js';
import type { ClaudeTransportMode } from './claudeTransportMode.js';

/**
 * Model-selection id provider token for Copilot-CAPI routing (the `proxy`
 * transport). This is the default: a bare, un-prefixed id decodes to it, so
 * every model id persisted before per-session provider selection existed keeps
 * routing through the proxy with no migration.
 */
export const CLAUDE_PROVIDER_COPILOT = 'copilot';

/**
 * Model-selection id provider token for the user's own Anthropic account (the
 * `native` transport — API key or Claude subscription).
 */
export const CLAUDE_PROVIDER_ANTHROPIC = 'anthropic';

/**
 * Prefix that marks a {@link ModelSelection.id} as carrying an explicit
 * provider. Mirrors Codex's `@provider=` convention so the two harnesses read
 * the same way. Kept module-private: callers encode/decode through the
 * functions below rather than string-matching the id themselves.
 */
const CLAUDE_MODEL_SELECTION_PREFIX = '@provider=';

/**
 * Encodes a provider + model id into a single opaque {@link ModelSelection.id}
 * string of the form `@provider=<provider>:<modelId>`. Both halves are
 * url-encoded so provider/model names containing `:` or `/` round-trip cleanly.
 *
 * The same model name under two providers yields two distinct ids, which is
 * what lets "a model via Copilot" and "the same model via Anthropic" appear as
 * separately selectable picker rows.
 */
export function toClaudeModelSelectionId(provider: string, modelId: string): string {
	return `${CLAUDE_MODEL_SELECTION_PREFIX}${encodeURIComponent(provider)}:${encodeURIComponent(modelId)}`;
}

/**
 * Splits a {@link ModelSelection} back into its provider and model id. A bare
 * id (no prefix), a prefixed id with no `:` separator, or an id whose halves
 * fail to url-decode all fall back to the default {@link CLAUDE_PROVIDER_COPILOT}
 * provider with the original id as the model — so a malformed or legacy value
 * routes through the proxy rather than throwing.
 */
export function parseClaudeModelSelection(selection: ModelSelection): { readonly provider: string; readonly modelId: string } {
	const { id } = selection;
	if (!id.startsWith(CLAUDE_MODEL_SELECTION_PREFIX)) {
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id };
	}
	const separator = id.indexOf(':', CLAUDE_MODEL_SELECTION_PREFIX.length);
	if (separator < CLAUDE_MODEL_SELECTION_PREFIX.length) {
		// No `:` after the prefix — not a well-formed provider-qualified id.
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id };
	}
	try {
		return {
			provider: decodeURIComponent(id.slice(CLAUDE_MODEL_SELECTION_PREFIX.length, separator)),
			modelId: decodeURIComponent(id.slice(separator + 1)),
		};
	} catch {
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id };
	}
}

/**
 * Maps a provider token to the transport it routes through. The relationship is
 * fixed and total: only {@link CLAUDE_PROVIDER_ANTHROPIC} is native; every other
 * token — Copilot, or anything unrecognized — is proxy. Defaulting the unknown
 * case to `proxy` keeps an unexpected token on the safe, GitHub-gated path
 * rather than silently attempting a native run without a credential.
 */
export function claudeTransportForProvider(provider: string): ClaudeTransportMode {
	return provider === CLAUDE_PROVIDER_ANTHROPIC ? 'native' : 'proxy';
}
