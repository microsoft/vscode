/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mirror of {@link
 * file://./../../../../../extensions/copilot/src/extension/chatSessions/claude/node/claudeLanguageModelServer.ts
 * `extensions/copilot/.../claudeLanguageModelServer.ts`}'s `filterSupportedBetas`
 * + `SUPPORTED_ANTHROPIC_BETAS` allowlist.
 *
 * **Keep in sync with the extension copy.** When CAPI gains support for
 * a new Anthropic beta, add it here. The filter is applied at the
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
];

/**
 * Filters a comma-separated `anthropic-beta` header value to only include
 * betas that match {@link SUPPORTED_ANTHROPIC_BETAS}. Entries are matched by
 * prefix so that e.g. `'context-management'` allows `'context-management-2025-06-27'`.
 *
 * Returns the filtered comma-separated string, or `undefined` if no betas matched.
 * Callers must omit the outbound header entirely when this returns `undefined`
 * — never forward an empty string.
 */
export function filterSupportedBetas(headerValue: string): string | undefined {
	const filtered = headerValue
		.split(',')
		.map(b => b.trim())
		.filter(b => b && SUPPORTED_ANTHROPIC_BETAS.some(supported => b.startsWith(supported + '-')));

	return filtered.length > 0 ? filtered.join(',') : undefined;
}
