/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { base64Encode } from './node/buffer';

export function randomUUID() {
	return crypto.randomUUID();
}

function dec2hex(dec: number): string {
	return ('0' + dec.toString(16)).slice(-2);
}

export function generateCodeVerifier(): string {
	const array = new Uint32Array(56 / 2);
	crypto.getRandomValues(array);
	return Array.from(array, dec2hex).join('');
}

function sha256(plain: string | undefined) {
	const encoder = new TextEncoder();
	const data = encoder.encode(plain);
	return crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer) {
	let str = '';
	const bytes = new Uint8Array(a);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		str += String.fromCharCode(bytes[i]);
	}
	return base64Encode(str)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export async function generateCodeChallenge(v: string) {
	const hashed = await sha256(v);
	const base64encoded = base64urlencode(hashed);
	return base64encoded;
}
