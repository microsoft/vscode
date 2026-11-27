/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Whether a value is a non-empty token in the remote protocol's ASCII alphabet. */
export function isValidConnectionToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && !/[^0-9A-Za-z_-]/.test(value);
}

/** Parse a token file, allowing exactly one optional trailing LF or CRLF. */
export function parseConnectionTokenFile(contents: string): string | undefined {
	const token = contents.replace(/\r?\n$/, '');
	return isValidConnectionToken(token) ? token : undefined;
}
