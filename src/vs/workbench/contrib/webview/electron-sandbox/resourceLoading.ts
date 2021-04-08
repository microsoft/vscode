/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';

/**
 * Try to rewrite `vscode-resource:` urls in html
 */
export function rewriteVsCodeResourceUrls(
	id: string,
	html: string,
): string {
	return html
		.replace(/(["'])vscode-resource:(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_match, startQuote, _1, scheme, path, endQuote) => {
			if (scheme) {
				return `${startQuote}${Schemas.vscodeWebviewResource}://${id}/${scheme}${path}${endQuote}`;
			}
			if (!path.startsWith('//')) {
				// Add an empty authority if we don't already have one
				path = '//' + path;
			}
			return `${startQuote}${Schemas.vscodeWebviewResource}://${id}/file${path}${endQuote}`;
		});
}

