/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {
	const markdown = vscode.extensions.getExtension('Microsoft.vscode-markdown');
	if (!markdown) {
		return;
	}

	if (!markdown.isActive) {
		markdown.activate();
	}
	markdown.exports.addPlugin(plugin);
}

function plugin(md: any): any {
	const emoji = require('markdown-it-emoji');
	return md.use(emoji);
}