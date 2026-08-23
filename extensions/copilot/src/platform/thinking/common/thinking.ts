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
