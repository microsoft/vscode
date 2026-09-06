/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../base/common/json.js';

const MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH = 4 * 1024;
let lastDisplayInput: string | undefined;
let lastDisplayValue: Record<string, unknown> | undefined;

export function parsePartialToolInput(raw: string, maxLength?: number): Record<string, unknown> | undefined {
	const parsed: unknown = parse(maxLength === undefined ? raw : raw.slice(0, maxLength));
	return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0
		? { ...parsed as Record<string, unknown> }
		: undefined;
}

export function parsePartialToolInputForDisplay(raw: string): Record<string, unknown> | undefined {
	const input = raw.slice(0, MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH);
	if (input !== lastDisplayInput) {
		lastDisplayInput = input;
		lastDisplayValue = parsePartialToolInput(input);
	}
	return lastDisplayValue ? { ...lastDisplayValue } : undefined;
}
