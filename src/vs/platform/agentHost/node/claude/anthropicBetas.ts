/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * When CAPI gains support for a new Anthropic beta, add it here. The filter is applied at the
 * inbound `POST /v1/messages` boundary on the `anthropic-beta` header
 * before forwarding to {@link ICopilotApiService.messages}.
 */

/**
 * Beta identifiers (without date suffix) that CAPI is known to honor.
 * The match is prefix + `-`, so an entry like `'context-management'`
 * accepts `'context-management-2025-06-27'` but rejects
 * `'context-management'` (no date) — date-suffix discipline.
 */
const SUPPORTED_ANTHROPIC_BETAS: readonly string[] = [
	'interleaved-thinking',
	'context-management',
	'advanced-tool-use',
	'per-turn-control',
];

/**
 * Filters an `anthropic-beta` header to the {@link SUPPORTED_ANTHROPIC_BETAS} families without adding betas.
 * Returns `undefined` when no supported betas remain, in which case callers must omit the header.
 */
export function filterSupportedBetas(headerValue: string): string | undefined {
	const filtered = headerValue
		.split(',')
		.map(b => b.trim())
		.filter(b => b && SUPPORTED_ANTHROPIC_BETAS.some(supported => b.startsWith(supported + '-')));

	return filtered.length > 0 ? filtered.join(',') : undefined;
}
