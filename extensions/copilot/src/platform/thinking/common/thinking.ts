/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ThinkingDataInMessage {
	// Azure Open AI fields for Completions
	cot_id?: string;
	cot_summary?: string;

	// Copilot API fields for Completions
	reasoning_opaque?: string;
	reasoning_text?: string;

	// DeepSeek / Moonshot (Kimi) / Minimax field.
	reasoning_content?: string;
	// OpenRouter field.
	reasoning?: string;
}

export interface RawThinkingDelta {
	// Azure Open AI fields
	cot_id?: string;
	cot_summary?: string;

	// Copilot API fields
	reasoning_opaque?: string;
	reasoning_text?: string;

	// DeepSeek / Moonshot (Kimi) / Minimax field.
	reasoning_content?: string;
	// OpenRouter field.
	reasoning?: string;

	// Anthropic fields
	thinking?: string;
	signature?: string;
}

export type ThinkingDelta = {
	text?: string | string[];
	id: string;
	metadata?: { readonly [key: string]: any };
} | {
	text?: string | string[];
	id?: string;
	metadata: { readonly [key: string]: any };
} |
{
	text: string | string[];
	id?: string;
	metadata?: { readonly [key: string]: any };
};

export type EncryptedThinkingDelta = {
	id: string;
	text?: string;
	encrypted: string;
	/**
	 * True only for genuine Anthropic `redacted_thinking` blocks, where `encrypted`
	 * holds the opaque `data` blob. For regular thinking blocks `encrypted` holds the
	 * signature and this is false/undefined, even when the thinking text is empty
	 * (e.g. `display: "omitted"` or pruned under token budget).
	 */
	redacted?: boolean;
};

export function isEncryptedThinkingDelta(delta: ThinkingDelta | EncryptedThinkingDelta): delta is EncryptedThinkingDelta {
	return (delta as EncryptedThinkingDelta).encrypted !== undefined;
}

export interface ThinkingData {
	id: string;
	text: string | string[];
	metadata?: { [key: string]: any };
	tokens?: number;
	encrypted?: string;
	/**
	 * True only for genuine Anthropic `redacted_thinking` blocks, where `encrypted`
	 * holds the opaque `data` blob. For regular thinking blocks `encrypted` holds the
	 * signature and this is false/undefined, even when the thinking text is empty.
	 */
	redacted?: boolean;
}

/**
 * The wire protocol that produced a thinking payload. Mirrors `IChatEndpoint.apiType`.
 *
 * Encrypted reasoning is opaque protocol state, so it may only be replayed to the API that
 * issued it. The payload's id is not a usable substitute: id formats are provider
 * conventions, not protocol guarantees.
 */
export type ThinkingOriginApi = 'responses' | 'messages' | 'chatCompletions';

const thinkingOriginApis: readonly string[] = ['responses', 'messages', 'chatCompletions'];

/**
 * Narrows an untrusted value — an endpoint's loosely typed `apiType`, or metadata that
 * crossed the `vscode.lm` boundary — to a known origin API.
 */
export function asThinkingOriginApi(value: unknown): ThinkingOriginApi | undefined {
	return typeof value === 'string' && thinkingOriginApis.includes(value) ? value as ThinkingOriginApi : undefined;
}

/**
 * `vscode.lm` transports thinking as flat parts with no envelope, so provenance has to ride
 * per-part metadata and be read back off it on the way in.
 */
export const thinkingOriginApiMetadataKey = 'vscode_thinking_origin_api';

export function thinkingOriginToMetadata(originApi: ThinkingOriginApi): { [key: string]: string } {
	return { [thinkingOriginApiMetadataKey]: originApi };
}

export function thinkingOriginFromMetadata(metadata: { readonly [key: string]: any } | undefined): ThinkingOriginApi | undefined {
	return asThinkingOriginApi(metadata?.[thinkingOriginApiMetadataKey]);
}
