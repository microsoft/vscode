/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import PHPCompletionItemProvider from './features/completionItemProvider';
import PHPHoverProvider from './features/hoverProvider';
import PHPSignatureHelpProvider from './features/signatureHelpProvider';
import PHPValidationProvider from './features/validationProvider';
import { ExtensionContext, languages, env } from 'vscode';

import * as nls from 'vscode-nls';

export function activate(context: ExtensionContext): any {
	nls.config({locale: env.language});

	// add providers
	context.subscriptions.push(languages.registerCompletionItemProvider('php', new PHPCompletionItemProvider(), '.', '$'));
	context.subscriptions.push(languages.registerHoverProvider('php', new PHPHoverProvider()));
	context.subscriptions.push(languages.registerSignatureHelpProvider('php', new PHPSignatureHelpProvider(), '(', ','));

	let validator = new PHPValidationProvider();
	validator.activate(context.subscriptions);

	// need to set in the extension host as well as the completion provider uses it.
	languages.setLanguageConfiguration('php', {
		wordPattern: /(-?\d*\.\d\w*)|([^\-\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,

		__characterPairSupport: {
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"', notIn: ['string'] },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] }
			]
		}
	});
}