/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IToolResultContentRenderer } from '../common/toolResultRenderer';

export class ToolResultContentRenderer implements IToolResultContentRenderer {
	readonly _serviceBrand: undefined;

	/**
	 * Extracts a text representation from the content parts of a tool result.
	 * Handles LanguageModelTextPart, LanguageModelPromptTsxPart, and LanguageModelDataPart.
	 * Uses lightweight string conversion to avoid expensive rendering on the hot path.
	 */
	renderToolResultContent(content: Iterable<unknown>): string[] {
		if (!content) {
			return [];
		}

		const results: string[] = [];
		
		for (const part of content) {
			if (!part || typeof part !== 'object') {
				continue;
			}

			// Defensive narrowing for known language model part structures
			if ('value' in part && typeof (part as { value: unknown }).value === 'string') {
				results.push((part as { value: string }).value);
			} else if ('data' in part && typeof (part as { data: unknown }).data === 'string') {
				results.push((part as { data: string }).data);
			} else {
				// Future-proofing / Exhaustive type guard check fallback
				// If an unhandled part type passes through on the hot path, we safely stringify or skip
				const stringified = String(part);
				if (stringified && stringified !== '[object Object]') {
					results.push(stringified);
				}
			}
		}

		return results;
	}
}
