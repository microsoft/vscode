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
	const colonIdx = token.indexOf(':');
	const header = colonIdx === -1 ? token : token.substring(0, colonIdx);
	for (const field of header.split(';')) {
		const eqIdx = field.indexOf('=');
		if (eqIdx <= 0) {
			continue;
		}
		result.set(field.substring(0, eqIdx), field.substring(eqIdx + 1));
	}
	return result;
}

export function isRestrictedTelemetryEnabled(token: string | undefined): boolean {
	return parseCopilotTokenFields(token).get('rt') === '1';
}
