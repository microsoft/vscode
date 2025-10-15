/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


const _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
	return _UUIDPattern.test(value);
}

export const generateUuid = (function (): () => string {

	// use `randomUUID` if possible
	if (typeof crypto.randomUUID === 'function') {
		// see https://developer.mozilla.org/en-US/docs/Web/API/Window/crypto
		// > Although crypto is available on all windows, the returned Crypto object only has one
		// > usable feature in insecure contexts: the getRandomValues() method.
		// > In general, you should use this API only in secure contexts.

		return crypto.randomUUID.bind(crypto);
	}

	// prep-work
	const _data = new Uint8Array(16);
	const _hex: string[] = [];
	for (let i = 0; i < 256; i++) {
		_hex.push(i.toString(16).padStart(2, '0'));
	}

	return function generateUuid(): string {
		// get data
		crypto.getRandomValues(_data);

		// set version bits
		_data[6] = (_data[6] & 0x0f) | 0x40;
		_data[8] = (_data[8] & 0x3f) | 0x80;

		// print as string
		let i = 0;
		let result = '';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += '-';
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		result += _hex[_data[i++]];
		return result;
	};
})();

/** Namespace should be 3 letter. */
export function prefixedUuid(namespace: string): string {
	return `${namespace}-${generateUuid()}`;
}
