/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('vs/languages/css/common/parser/cssNodes');
import _symbols = require('vs/languages/css/common/parser/cssSymbols');

export function findDeclaration(stylesheet:nodes.Node, offset:number):nodes.Node {

	var symbols = new _symbols.Symbols(stylesheet);
	var node = nodes.getNodeAtOffset(stylesheet, offset);

	if (!node) {
		return null;
	}

	var symbol = symbols.findSymbolFromNode(node);
	if(!symbol) {
		return null;
	}

	return symbol.node;
}

export interface IOccurrence {
	kind:string;
	type:nodes.ReferenceType;
	node:nodes.Node;
}

export function findOccurrences(stylesheet:nodes.Node, offset:number):IOccurrence[] {
	var result:IOccurrence[] = [];
	var node = nodes.getNodeAtOffset(stylesheet, offset);
	if (!node || node.type === nodes.NodeType.Stylesheet || node.type === nodes.NodeType.Declarations) {
		return result;
	}

	var symbols = new _symbols.Symbols(stylesheet);
	var symbol = symbols.findSymbolFromNode(node);
	var name = node.getText();

	stylesheet.accept((candidate) => {
		if (symbol) {
			if (symbols.matchesSymbol(candidate, symbol)) {
				result.push({
					kind: getKind(candidate),
					type: symbol.type,
					node: candidate
				});
				return false;
			}

		} else if (node.type === candidate.type && node.length === candidate.length && name === candidate.getText()) {
			// Same node type and data
			result.push({
				kind: getKind(candidate),
				node: candidate,
				type:nodes.ReferenceType.Unknown
			});
		}
		return true;
	});

	return result;
}

function getKind(node:nodes.Node):string {

	if (node.type === nodes.NodeType.Selector) {
		return 'write';
	}

	if (node.parent) {
		switch (node.parent.type) {
			case nodes.NodeType.FunctionDeclaration:
			case nodes.NodeType.MixinDeclaration:
			case nodes.NodeType.Keyframe:
			case nodes.NodeType.VariableDeclaration:
			case nodes.NodeType.FunctionParameter:
				return 'write';
		}
	}
	return null;
}