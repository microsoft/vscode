/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { HoverProvider, Hover, MarkedString, TextDocument, CancellationToken, Position, workspace } from 'vscode';
import phpGlobals = require('./phpGlobals');
import { textToMarkedString } from './utils/markedTextUtil';

export default class PHPHoverProvider implements HoverProvider {

	public provideHover(document: TextDocument, position: Position, token: CancellationToken): Hover {
		let enable = workspace.getConfiguration('php').get<boolean>('suggest.basic', true);
		if (!enable) {
			return null;
		}

		let wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return;
		}

		let name = document.getText(wordRange);

		var entry = phpGlobals.globalfunctions[name] || phpGlobals.compiletimeconstants[name] || phpGlobals.globalvariables[name] || phpGlobals.keywords[name];
		if (entry && entry.description) {
			let signature = name + (entry.signature || '');
			let contents: MarkedString[] = [textToMarkedString(entry.description), { language: 'php', value: signature }];
			return new Hover(contents, wordRange);
		}
	}
}
