/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function createSHA1(content: string): Thenable<string> {
	if (typeof require !== 'undefined') {
		const _crypto: typeof crypto = require.__$__nodeRequire('crypto');
		return Promise.resolve(_crypto['createHash']('sha1').update(content).digest('hex'));
	}
	return crypto.subtle.digest('SHA-1', new TextEncoder().encode(content)).then(buffer => {
		// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#Converting_a_digest_to_a_hex_string
		return Array.prototype.map.call(new Uint8Array(buffer), (value: number) => `00${value.toString(16)}`.slice(-2)).join('');
	});
}