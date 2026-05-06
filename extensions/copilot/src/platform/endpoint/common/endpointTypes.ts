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
	 * object. All fields are optional — missing or non-finite numeric values
	 * are treated as 0, and missing nested objects (`prompt_tokens_details`,
	 * `completion_tokens_details`) are simply omitted from the parsed result.
	 * A provider that only knows `prompt_tokens` is free to send just that.
	 *
	 * Consumed by `ExtensionContributedChatEndpoint.makeChatRequest2`. When no
	 * Usage part is emitted, the host falls back to zero counts (which leaves
	 * the Context Window indicator stuck at 0 — see microsoft/vscode#314722).
	 */
	export const Usage = 'usage';
}

export const CacheType = 'ephemeral';