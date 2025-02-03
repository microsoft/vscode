/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function base64Encode(text: string): string {
	return Buffer.from(text, 'binary').toString('base64');
}

export function base64Decode(text: string): string {
	return Buffer.from(text, 'base64').toString('utf8');
}
