/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace CustomDataPartMimeTypes {
	export const CacheControl = 'cache_control';
	export const StatefulMarker = 'stateful_marker';
	export const ThinkingData = 'thinking';
	export const ContextManagement = 'context_management';
	export const PhaseData = 'phase_data';
	/**
	 * Mime type for an extension-contributed token-usage payload, emitted by a
	 * `vscode.LanguageModelChatProvider` as a `LanguageModelDataPart` in its
	 * response stream. The `data` is a UTF-8 JSON encoding of an `APIUsage`-shaped
	 * object. Individual numeric fields are optional — missing or non-finite
	 * values are treated as 0, negatives are clamped, and nested detail objects
	 * that are themselves missing or malformed are omitted. The payload must
	 * carry at least one positive numeric signal (a non-zero top-level counter
	 * or a non-zero nested detail field) to be accepted; payloads that coerce
	 * down to all zeros are rejected so a stray empty/malformed chunk can't
	 * overwrite an earlier valid reading at the dispatch site. Fully-shaped
	 * payloads (those that satisfy the strict `APIUsage` shape with all three
	 * top-level counters as `number`) additionally carry a
	 * `prompt_tokens_details: { cached_tokens: 0 }` placeholder when the
	 * provider didn't supply that nested object, matching the historical
	 * zero-fallback shape downstream consumers depend on.
	 *
	 * Consumed by `ExtensionContributedChatEndpoint.makeChatRequest2`. When no
	 * Usage part is emitted, the host falls back to zero counts (which leaves
	 * the Context Window indicator stuck at 0 — see microsoft/vscode#314722).
	 */
	export const Usage = 'usage';
}

export const CacheType = 'ephemeral';