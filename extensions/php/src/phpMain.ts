/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import PHPCompletionItemProvider from './features/completionItemProvider';
import PHPHoverProvider from './features/hoverProvider';
import PHPSignatureHelpProvider from './features/signatureHelpProvider';
import PHPValidationProvider from './features/validationProvider';
import * as vscode from 'vscode';

import * as nls from 'vscode-nls';
nls.config({ locale: vscode.env.language });

export function activate(context: vscode.ExtensionContext): any {

	let validator = new PHPValidationProvider(context.workspaceState);
	validator.activate(context.subscriptions);

	// add providers
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('php', new PHPCompletionItemProvider(), '.', '$'));
	context.subscriptions.push(vscode.languages.registerHoverProvider('php', new PHPHoverProvider()));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('php', new PHPSignatureHelpProvider(), '(', ','));


	// need to set in the extension host as well as the completion provider uses it.
	vscode.languages.setLanguageConfiguration('php', {
		wordPattern: /(-?\d*\.\d\w*)|([^\-\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	});
}