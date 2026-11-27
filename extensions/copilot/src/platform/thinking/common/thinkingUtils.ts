/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EncryptedThinkingDelta, RawThinkingDelta, ReasoningSourceField, reasoningSourceFieldMetadataKey, ThinkingDelta } from './thinking';

function getThinkingDeltaText(thinking: RawThinkingDelta | undefined): string | undefined {
	if (!thinking) {
		return '';
	}
	if (thinking.cot_summary) {
		return thinking.cot_summary;
	}
	if (thinking.reasoning_text) {
		return thinking.reasoning_text;
	}
	if (thinking.reasoning_content) {
		return thinking.reasoning_content;
	}
	if (thinking.reasoning) {
		return thinking.reasoning;
	}
	if (thinking.thinking) {
		return thinking.thinking;
	}
	return undefined;
}

function getThinkingDeltaId(thinking: RawThinkingDelta | undefined): string | undefined {
	if (!thinking) {
		return undefined;
	}
	if (thinking.cot_id) {
		return thinking.cot_id;
	}
	if (thinking.reasoning_opaque) {
		return thinking.reasoning_opaque;
	}
	if (thinking.signature) {
		return thinking.signature;
	}
	return undefined;
}

/**
 * The key the text came from, when it is one of the two names servers disagree on. Follows the same
 * precedence as {@link getThinkingDeltaText}, so it only names a key whose text is the one that was used.
 */
function getReasoningSourceField(thinking: RawThinkingDelta): ReasoningSourceField | undefined {
	if (thinking.cot_summary || thinking.reasoning_text) {
		return undefined;
	}
	if (thinking.reasoning_content) {
		return 'reasoning_content';
	}
	if (thinking.reasoning) {
		return 'reasoning';
	}
	return undefined;
}

export function extractThinkingDeltaFromChoice(choice: { message?: RawThinkingDelta; delta?: RawThinkingDelta }): ThinkingDelta | EncryptedThinkingDelta | undefined {
	const thinking = choice.message || choice.delta;
	if (!thinking) {
		return undefined;
	}

	const id = getThinkingDeltaId(thinking);
	const text = getThinkingDeltaText(thinking);

	// reasoning_opaque is encrypted content that should be marked as such
	if (thinking.reasoning_opaque) {
		return { id: thinking.reasoning_opaque, text, encrypted: thinking.reasoning_opaque };
	}

	const sourceField = text ? getReasoningSourceField(thinking) : undefined;
	const metadata = sourceField ? { metadata: { [reasoningSourceFieldMetadataKey]: sourceField } } : {};
	if (id && text) {
		return { id, text, ...metadata };
	} else if (text) {
		return { text, ...metadata };
	} else if (id) {
		return { id };
	}
	return undefined;
}
