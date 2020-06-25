/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

declare const WEBWORKER: boolean;

export async function sha1(s: string | Uint8Array): Promise<string> {
	if (WEBWORKER) {
		const hash = await globalThis.crypto.subtle.digest({ name: 'sha-1' }, typeof s === 'string' ? textEncoder.encode(s) : s);
		// Use encodeURIComponent to avoid issues with btoa and Latin-1 characters
		return globalThis.btoa(encodeURIComponent(textDecoder.decode(hash)));
	}
	else {
		return (await import('crypto')).createHash('sha1').update(s).digest('base64');
	}
}
