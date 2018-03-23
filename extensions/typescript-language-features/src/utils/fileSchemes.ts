/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const file = 'file';

export const untitled = 'untitled';

export const walkThroughSnippet = 'walkThroughSnippet';

export const supportedSchemes = [
	file,
	untitled,
	walkThroughSnippet
];

export function isSupportedScheme(scheme: string): boolean {
	return supportedSchemes.indexOf(scheme) >= 0;
}