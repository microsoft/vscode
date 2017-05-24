/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import * as extract from '@emmetio/extract-abbreviation';


export function validate(allowStylesheet: boolean = true): boolean {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return false;
	}
	if (!allowStylesheet && isStyleSheet(editor.document.languageId)) {
		return false;
	}
	return true;
}

export function getSyntax(document: vscode.TextDocument): string {
	if (document.languageId === 'jade') {
		return 'pug';
	}
	if (document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact') {
		return 'jsx';
	}
	return document.languageId;
}

export function isStyleSheet(syntax): boolean {
	let stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
	return (stylesheetSyntaxes.indexOf(syntax) > -1);
}

export function getProfile(syntax: string): any {
	let config = vscode.workspace.getConfiguration('emmet')['syntaxProfiles'] || {};
	let options = config[syntax];
	if (!options || typeof options === 'string') {
		return {};
	}
	let newOptions = {};
	for (let key in options) {
		switch (key) {
			case 'tag_case':
				newOptions['tagCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_case':
				newOptions['attributeCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_quotes':
				newOptions['attributeQuotes'] = options[key];
				break;
			case 'tag_nl':
				newOptions['format'] = (options[key] === 'true' || options[key] === 'false') ? options[key] : 'true';
				break;
			case 'indent':
				newOptions['attrCase'] = (options[key] === 'true' || options[key] === 'false') ? '\t' : options[key];
				break;
			case 'inline_break':
				newOptions['inlineBreak'] = options[key];
				break;
			case 'self_closing_tag':
				if (options[key] === true) {
					newOptions['selfClosingStyle'] = 'xml'; break;
				}
				if (options[key] === false) {
					newOptions['selfClosingStyle'] = 'html'; break;
				}
				newOptions['selfClosingStyle'] = options[key];
				break;
			default:
				newOptions[key] = options[key];
				break;
		}
	}
	return newOptions;
}

export function getOpenCloseRange(document: vscode.TextDocument, offset: number): [vscode.Range, vscode.Range] {
	let rootNode: Node = parse(document.getText());
	let nodeToUpdate = getNode(rootNode, offset);
	let openRange = new vscode.Range(document.positionAt(nodeToUpdate.open.start), document.positionAt(nodeToUpdate.open.end));
	let closeRange = null;
	if (nodeToUpdate.close) {
		closeRange = new vscode.Range(document.positionAt(nodeToUpdate.close.start), document.positionAt(nodeToUpdate.close.end));
	}
	return [openRange, closeRange];
}

export function getNode(root: Node, offset: number, includeNodeBoundary: boolean = false) {
	let currentNode: Node = root.firstChild;
	let foundNode: Node = null;

	while (currentNode) {
		if ((currentNode.start < offset && currentNode.end > offset)
			|| (includeNodeBoundary && (currentNode.start <= offset && currentNode.end >= offset))) {

			foundNode = currentNode;
			// Dig deeper
			currentNode = currentNode.firstChild;
		} else {
			currentNode = currentNode.nextSibling;
		}
	}

	return foundNode;
}

export function getNodeOuterSelection(document: vscode.TextDocument, node: Node): vscode.Selection {
	return new vscode.Selection(document.positionAt(node.start), document.positionAt(node.end));
}

export function getNodeInnerSelection(document: vscode.TextDocument, node: Node): vscode.Selection {
	return new vscode.Selection(document.positionAt(node.open.end), document.positionAt(node.close.start));
}

export function extractAbbreviation(position: vscode.Position): [vscode.Range, string] {
	let editor = vscode.window.activeTextEditor;
	let currentLine = editor.document.lineAt(position.line).text;
	let result = extract(currentLine, position.character, true);
	if (!result) {
		return [null, ''];
	}

	let rangeToReplace = new vscode.Range(position.line, result.location, position.line, result.location + result.abbreviation.length);
	return [rangeToReplace, result.abbreviation];
}

export function getDeepestNode(node: Node): Node {
	if (!node || !node.children || node.children.length === 0) {
		return node;
	}

	return getDeepestNode(node.children[node.children.length - 1]);
}