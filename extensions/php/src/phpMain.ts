/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import PHPCompletionItemProvider from './features/completionItemProvider';
import PHPHoverProvider from './features/hoverProvider';
import PHPSignatureHelpProvider from './features/signatureHelpProvider';
import PHPValidationProvider from './features/validationProvider';
import {ExtensionContext, languages, extensions} from 'vscode';

export function activate(context: ExtensionContext): any {

	// add providers
	context.subscriptions.push(languages.registerCompletionItemProvider('php', new PHPCompletionItemProvider(), '.', ':', '$'));
	context.subscriptions.push(languages.registerHoverProvider('php', new PHPHoverProvider()));
	context.subscriptions.push(languages.registerSignatureHelpProvider('php', new PHPSignatureHelpProvider(), '(', ','));

	let validator = new PHPValidationProvider();
	validator.activate(context.subscriptions);
}