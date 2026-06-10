/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parses the field map encoded in the first colon-delimited segment of a
 * Copilot token (e.g. `"tid=abc;exp=123;rt=1:HMAC..."`).
 *
 * Mirrors `CopilotToken.parseToken` in
 * `extensions/copilot/src/platform/authentication/common/copilotToken.ts`
 * but does not require the full `CopilotToken` class (which imports
 * extension-host-only dependencies that aren't available in the AHP
 * utility process).
 */
export function parseCopilotTokenFields(token: string | undefined): ReadonlyMap<string, string> {
	const result = new Map<string, string>();
	if (!token) {
		return result;
	}
	const firstPart = token.split(':')[0];
	for (const field of firstPart.split(';')) {
		const [key, value] = field.split('=');
		if (key) {
			result.set(key, value);
		}
	}
	return result;
}

/**
 * Returns true if the token has the `rt=1` field set, indicating the user
 * has opted in to restricted (enhanced) GitHub telemetry.
 */
export function isRestrictedTelemetryEnabled(token: string | undefined): boolean {
	return parseCopilotTokenFields(token).get('rt') === '1';
}
