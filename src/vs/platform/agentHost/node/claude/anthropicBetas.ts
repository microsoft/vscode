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
	'mid-conversation-output-config',
];

/** CAPI compatibility betas added independently of the SDK's beta selection. */
const ADDITIONAL_ANTHROPIC_BETAS: readonly string[] = [
	'mid-conversation-output-config-2026-07-01',
];

/**
 * Filters an `anthropic-beta` header for CAPI and appends {@link ADDITIONAL_ANTHROPIC_BETAS} without duplicating them.
 * Returns `undefined` when no supported betas remain, in which case callers must omit the header.
 */
export function filterSupportedBetas(headerValue: string): string | undefined {
	const betas = headerValue
		.split(',')
		.map(b => b.trim())
		.filter(b => b && SUPPORTED_ANTHROPIC_BETAS.some(supported => b.startsWith(supported + '-')));

	for (const beta of ADDITIONAL_ANTHROPIC_BETAS) {
		if (!betas.includes(beta)) {
			betas.push(beta);
		}
	}

	return betas.length > 0 ? betas.join(',') : undefined;
}
