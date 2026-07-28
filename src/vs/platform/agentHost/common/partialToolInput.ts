/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from '../../../base/common/json.js';

// Streaming input can contain large file contents. Basic display details are
// expected near the start, so cap and cache the prefix used for tolerant parsing.
const MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH = 4 * 1024;

let lastParsedInput: string | undefined;
let lastParsedValue: Record<string, unknown> | undefined;

export interface IPartialToolInput {
	readonly raw: string;
	readonly value: Record<string, unknown> | undefined;
}

export function parsePartialToolInput(raw: string): IPartialToolInput {
	const input = raw.slice(0, MAX_PARTIAL_TOOL_INPUT_PARSE_LENGTH);
	if (input !== lastParsedInput) {
		const parsed: unknown = parse(input);
		lastParsedInput = input;
		lastParsedValue = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: undefined;
	}
	return {
		raw,
		value: lastParsedValue,
	};
}
