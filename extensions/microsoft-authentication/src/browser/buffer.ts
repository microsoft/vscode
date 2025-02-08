/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function base64Encode(text: string): string {
	return btoa(text);
}

export function base64Decode(text: string): string {
	// modification of https://stackoverflow.com/a/38552302
	const replacedCharacters = text.replace(/-/g, '+').replace(/_/g, '/');
	const decodedText = decodeURIComponent(atob(replacedCharacters).split('').map(function (c) {
		return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
	}).join(''));
	return decodedText;
}
