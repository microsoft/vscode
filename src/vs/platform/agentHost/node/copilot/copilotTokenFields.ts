/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Parses the `key=value;...` field map from the leading colon-delimited segment of a Copilot token (e.g. `tid=abc;exp=123;rt=1:HMAC...`). */
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

export function isRestrictedTelemetryEnabled(token: string | undefined): boolean {
	return parseCopilotTokenFields(token).get('rt') === '1';
}
