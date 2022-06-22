/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import Parser = require('web-tree-sitter');

export async function loadMarkdownTreeSitter(path: vscode.Uri): Promise<Parser.Language> {
	await Parser.init();
	return Parser.Language.load(path.fsPath);
}
