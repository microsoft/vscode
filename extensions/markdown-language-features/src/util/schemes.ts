/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const Schemes = Object.freeze({
	http: 'http',
	https: 'https',
	file: 'file',
	untitled: 'untitled',
	mailto: 'mailto',
	vscode: 'vscode',
	'vscode-insiders': 'vscode-insiders',
	notebookCell: 'vscode-notebook-cell',
});

export function isOfScheme(scheme: string, link: string): boolean {
	return link.toLowerCase().startsWith(scheme + ':');
}
