/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

/**
 * Truncates a description string to the first sentence, with a maximum character fallback.
 */
export function truncateToFirstSentence(text: string, maxChars = 120): string {
	const match = text.match(/^[^.!?]*[.!?]/);
	if (match && match[0].length <= maxChars) {
		return match[0];
	}
	if (text.length > maxChars) {
		return text.substring(0, maxChars).trimEnd() + '\u2026';
	}
	return text;
}

/**
 * Returns the secondary text shown for a customization item.
 */
export function getCustomizationSecondaryText(description: string | undefined, filename: string, promptType: PromptsType): string {
	if (!description) {
		return filename;
	}

	return promptType === PromptsType.hook ? description : truncateToFirstSentence(description);
}
