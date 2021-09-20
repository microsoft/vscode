/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const Schemes = {
	http: 'http:',
	https: 'https:',
	file: 'file:',
	untitled: 'untitled',
	mailto: 'mailto:',
	data: 'data:',
	vscode: 'vscode:',
	'vscode-insiders': 'vscode-insiders:',
};

const knownSchemes = [
	...Object.values(Schemes),
	`${vscode.env.uriScheme}:`
];

export function getUriForLinkWithKnownExternalScheme(link: string): vscode.Uri | undefined {
	const cleanLink = stripAngleBrackets(link);
	if (knownSchemes.some(knownScheme => isOfScheme(knownScheme, cleanLink))) {
		return vscode.Uri.parse(link);
	}

	return undefined;
}

/* Used to strip brackets from the markdown link
	<http://example.com> will be transformed to
	http://example.com
*/
export function stripAngleBrackets(link: string) {
	const bracketMatcher = /^<(.*)>$/;
	const matches = link.match(bracketMatcher);

	if (Array.isArray(matches) && matches.length > 1) {
		return matches[1];
	}

	return link;
}

export function isOfScheme(scheme: string, link: string): boolean {
	return link.toLowerCase().startsWith(scheme);
}

export const MarkdownFileExtensions: readonly string[] = [
	'.md',
	'.mkd',
	'.mdwn',
	'.mdown',
	'.markdown',
	'.markdn',
	'.mdtxt',
	'.mdtext',
	'.workbook',
];
