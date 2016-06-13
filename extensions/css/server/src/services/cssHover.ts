/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/cssNodes';
import * as languageFacts from './languageFacts';
import {TextDocument, Range, Position, Hover} from 'vscode-languageserver';
import {selectorToMarkedString, simpleSelectorToMarkedString} from './selectorPrinting';

export class CSSHover {

	constructor() {
	}

	public doHover(document: TextDocument, position: Position, stylesheet: nodes.Stylesheet): Thenable<Hover> {

		function getRange(node: nodes.Node) {
			return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
		}

		let offset = document.offsetAt(position);
		let nodepath = nodes.getNodePath(stylesheet, offset);

		for (let i = 0; i < nodepath.length; i++) {
			let node = nodepath[i];
			if (node instanceof nodes.Selector) {
				return Promise.resolve({
					contents: selectorToMarkedString(<nodes.Selector>node),
					range: getRange(node)
				});
			}
			if (node instanceof nodes.SimpleSelector) {
				return Promise.resolve({
					contents: simpleSelectorToMarkedString(<nodes.SimpleSelector>node),
					range: getRange(node)
				});
			}
			if (node instanceof nodes.Declaration) {
				let propertyName = node.getFullPropertyName();
				let entry = languageFacts.getProperties()[propertyName];
				if (entry && entry.description) {
					return Promise.resolve({
						contents: entry.description,
						range: getRange(node)
					});
				}
			}
		}

		return null;
	}
}

