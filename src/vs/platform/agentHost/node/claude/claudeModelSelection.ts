/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelGroupMeta } from '../../common/agentModelSource.js';
import { CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT } from '../../common/claudeProviders.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { toSdkModelId } from './claudeModelId.js';
import type { ClaudeTransportMode } from './claudeTransportMode.js';

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
 *
 * `explicitProvider` distinguishes those fallbacks (`false`) from a genuine
 * `@provider=`-qualified id (`true`). {@link resolveClaudeSessionTransport} reads
 * it to keep a bare/legacy id on the host default transport rather than the
 * copilot fallback, so an existing session is never migrated onto a different
 * transport.
 */
export function parseClaudeModelSelection(selection: ModelSelection): { readonly provider: string; readonly modelId: string; readonly explicitProvider: boolean } {
	const { id } = selection;
	if (!id.startsWith(CLAUDE_MODEL_SELECTION_PREFIX)) {
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id, explicitProvider: false };
	}
	const separator = id.indexOf(':', CLAUDE_MODEL_SELECTION_PREFIX.length);
	if (separator < CLAUDE_MODEL_SELECTION_PREFIX.length) {
		// No `:` after the prefix — not a well-formed provider-qualified id.
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id, explicitProvider: false };
	}
	try {
		return {
			provider: decodeURIComponent(id.slice(CLAUDE_MODEL_SELECTION_PREFIX.length, separator)),
			modelId: decodeURIComponent(id.slice(separator + 1)),
			explicitProvider: true,
		};
	} catch {
		return { provider: CLAUDE_PROVIDER_COPILOT, modelId: id, explicitProvider: false };
	}
}

/**
 * Resolves the SDK-canonical model id for a selection, peeling off any provider
 * qualification first. Under the per-session provider feature a selection id is
 * provider-qualified (`@provider=anthropic:claude-sonnet-4-5`); neither the
 * Claude Agent SDK nor CAPI understands that wrapper, so it must be stripped
 * back to the bare model id before {@link toSdkModelId} normalizes the version
 * separators — otherwise the SDK receives `@provider=…` verbatim (it is
 * unparseable, so {@link toSdkModelId} passes it through untouched) and the
 * model 400s. A bare / legacy id (the flag-off path) has no wrapper and
 * round-trips exactly as it did before this feature existed. `undefined` passes
 * through so callers can convert an optional selection in one step.
 */
export function toClaudeSdkModelId(model: ModelSelection): string;
export function toClaudeSdkModelId(model: ModelSelection | undefined): string | undefined;
export function toClaudeSdkModelId(model: ModelSelection | undefined): string | undefined {
	if (!model) {
		return undefined;
	}
	return toSdkModelId(parseClaudeModelSelection(model).modelId);
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

/**
 * Decides the transport a single session should run on. This is the per-session
 * counterpart to the host-global {@link resolveClaudeTransportMode}: when the
 * session has no explicit model yet, it inherits the host default (`defaultMode`);
 * when a model with an explicit provider is selected, its provider decides (via
 * {@link claudeTransportForProvider}), letting two concurrent sessions run on
 * different transports. A bare/legacy id (no explicit provider) also inherits
 * `defaultMode`, so a session persisted before provider qualification existed is
 * never rerouted onto a different transport.
 */
export function resolveClaudeSessionTransport(inputs: {
	readonly model: ModelSelection | undefined;
	readonly defaultMode: ClaudeTransportMode;
}): ClaudeTransportMode {
	const { model, defaultMode } = inputs;
	if (!model) {
		return defaultMode;
	}
	const parsed = parseClaudeModelSelection(model);
	if (!parsed.explicitProvider) {
		// A bare / legacy id carries no explicit provider, so it follows the host
		// default transport exactly like the model-less case above. Without this, a
		// session persisted before provider qualification existed — e.g. a native
		// BYO-Anthropic session, whose id is a bare SDK id — would be rerouted onto
		// the proxy and forced through a spurious GitHub sign-in.
		return defaultMode;
	}
	return claudeTransportForProvider(parsed.provider);
}

/**
 * Merges the two provider catalogs the Claude host fetches — the Copilot-CAPI
 * (`proxy`) list and the native Anthropic (`native`) list — into the single flat
 * catalog the picker renders. Each model's id is rewritten to a
 * provider-qualified {@link toClaudeModelSelectionId} so selecting a row carries
 * the transport with it, and its picker-group vendor token
 * ({@link CLAUDE_PROVIDER_COPILOT} / {@link CLAUDE_PROVIDER_ANTHROPIC}) is stamped
 * into `_meta` (via {@link createAgentModelGroupMeta}) so the picker buckets it
 * under the matching group — the same model offered by both providers thus yields
 * two distinct, separately selectable rows in two groups rather than colliding.
 *
 * Crucially, each model's {@link IAgentModelInfo.provider} is left untouched (the
 * `claude` owner): that field doubles as the owning agent provider for session
 * routing (`sessionServerTools` copies it to `IAgentCreateSessionConfig.provider`),
 * so re-stamping it to a transport token would misroute a model-selected
 * `create_session`. The transport/group token lives only in `_meta`.
 *
 * Array order is *not* what picks the session default. The picker re-buckets the
 * flat list by the `_meta` vendor token and renders group-by-group, so which
 * model is pre-selected follows the group ordering — verified end-to-end: with
 * both halves populated the Anthropic group sorts first, so the pre-selected
 * model is the native group's first row, i.e. the default routes native and
 * bills the user's own Anthropic account. Do not reason about the default
 * from the order here. (Making that choice explicit rather than emergent needs a
 * default/sticky model preference, which does not exist yet.)
 *
 * Every other field is passed through untouched. Either list may be empty — one
 * source failing to fetch contributes nothing but must never blank the other —
 * so merging an empty side just yields the other side's qualified models.
 */
export function mergeClaudeModelCatalogs(proxy: readonly IAgentModelInfo[], native: readonly IAgentModelInfo[]): IAgentModelInfo[] {
	return [
		...withQualifiedProvider(proxy, CLAUDE_PROVIDER_COPILOT),
		...withQualifiedProvider(native, CLAUDE_PROVIDER_ANTHROPIC),
	];
}

/**
 * Re-id each model with its provider-qualified selection id and stamp the
 * transport/group vendor token into `_meta`, leaving {@link IAgentModelInfo.provider}
 * (the routing owner) and every other field intact.
 */
function withQualifiedProvider(models: readonly IAgentModelInfo[], provider: string): IAgentModelInfo[] {
	return models.map(model => ({
		...model,
		id: toClaudeModelSelectionId(provider, model.id),
		_meta: { ...model._meta, ...createAgentModelGroupMeta(provider) },
	}));
}
