/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Normalized key for comparing session links irrespective of case and trailing slash. */
export function linkKey(link: string): string {
	return link.replace(/\/+$/, '').toLowerCase();
}
