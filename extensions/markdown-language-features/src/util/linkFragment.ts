/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getFragmentFromLinkText(linkText: string): string | undefined {
	const fragmentStart = linkText.indexOf('#');
	if (fragmentStart < 0) {
		return undefined;
	}

	try {
		return decodeURIComponent(linkText.slice(fragmentStart + 1)) || undefined;
	} catch {
		return undefined;
	}
}
