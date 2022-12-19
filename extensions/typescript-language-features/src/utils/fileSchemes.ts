/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from './platform';
import * as vscode from 'vscode';

export const file = 'file';
export const untitled = 'untitled';
export const git = 'git';
/** Live share scheme */
export const vsls = 'vsls';
export const walkThroughSnippet = 'walkThroughSnippet';
export const vscodeNotebookCell = 'vscode-notebook-cell';
export const memFs = 'memfs';
export const vscodeVfs = 'vscode-vfs';
export const officeScript = 'office-script';

export const semanticSupportedSchemes = isWeb() && vscode.workspace.workspaceFolders ?
	vscode.workspace.workspaceFolders.map(folder => folder.uri.scheme) : [
		file,
		untitled,
		walkThroughSnippet,
		vscodeNotebookCell,
	];

/**
 * File scheme for which JS/TS language feature should be disabled
 */
export const disabledSchemes = new Set([
	git,
	vsls
]);
