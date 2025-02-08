/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const Schemes = Object.freeze({
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
