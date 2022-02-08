/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Uri } from 'vscode';

const VALID_DESKTOP_CALLBACK_SCHEMES = [
	'vscode',
	'vscode-insiders',
	'code-oss',
	'vscode-wsl',
	'vscode-exploration'
];

// This comes from the GitHub Authentication server
export function isSupportedEnvironment(url: Uri): boolean {
	return VALID_DESKTOP_CALLBACK_SCHEMES.includes(url.scheme) || url.authority.endsWith('vscode.dev') || url.authority.endsWith('github.dev');
}
