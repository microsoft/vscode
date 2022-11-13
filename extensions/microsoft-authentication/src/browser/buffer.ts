/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function base64Encode(text: string): string {
	return btoa(text);
}

export function base64Decode(text: string): string {
	const data = atob(text);
	return data;
}
