/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../base/common/json.js';

const MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH = 4 * 1024;

let lastParsedInput: string | undefined;
let lastParsedValue: Record<string, unknown> | undefined;

export function parsePartialToolInputForDisplay(raw: string): Record<string, unknown> | undefined {
	const input = raw.slice(0, MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH);
	if (input !== lastParsedInput) {
		const parsed: unknown = parse(input);
		lastParsedInput = input;
		lastParsedValue = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			&& Object.keys(parsed).length > 0
			? parsed as Record<string, unknown>
			: undefined;
	}
	return lastParsedValue ? { ...lastParsedValue } : undefined;
}
