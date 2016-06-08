/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('../parser/cssNodes');
import {SymbolInformation, SymbolKind, TextDocument, Range, Location} from 'vscode-languageserver';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class CSSDocumentSymbols {

	constructor() {
	}

	public compute(document: TextDocument, stylesheet: nodes.Stylesheet): Promise<SymbolInformation[]> {

		let result: SymbolInformation[] = [];

		stylesheet.accept((node) => {

			let entry: SymbolInformation = {
				name: null,
				kind: SymbolKind.Class, // TODO@Martin: find a good SymbolKind
				location: null
			};

			if (node instanceof nodes.Selector) {
				entry.name = node.getText();
			} else if (node instanceof nodes.VariableDeclaration) {
				entry.name = (<nodes.VariableDeclaration>node).getName();
				entry.kind = SymbolKind.Variable;
			} else if (node instanceof nodes.MixinDeclaration) {
				entry.name = (<nodes.MixinDeclaration>node).getName();
				entry.kind = SymbolKind.Method;
			} else if (node instanceof nodes.FunctionDeclaration) {
				entry.name = (<nodes.FunctionDeclaration>node).getName();
				entry.kind = SymbolKind.Function;
			} else if (node instanceof nodes.Keyframe) {
				entry.name = localize('literal.keyframes', "@keyframes {0}", (<nodes.Keyframe>node).getName());
			} else if (node instanceof nodes.FontFace) {
				entry.name = localize('literal.fontface', "@font-face");
			}

			if (entry.name) {
				entry.location = Location.create(document.uri, Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length)));
				result.push(entry);
			}

			return true;
		});

		return Promise.resolve(result);
	}

}