/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

/**
 * Truncates a description string to the first line.
 * The UI applies CSS text-overflow ellipsis for width overflow.
 */
export function truncateToFirstLine(text: string): string {
	const newlineIndex = text.search(/[\r\n]/);
	if (newlineIndex !== -1) {
		return text.substring(0, newlineIndex);
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

	return promptType === PromptsType.hook ? description : truncateToFirstLine(description);
}
