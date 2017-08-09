/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import parseStylesheet from '@emmetio/css-parser';
import { Node, HtmlNode, CssToken, Property } from 'EmmetNode';
import { DocumentStreamReader } from './bufferStream';
import { isStyleSheet } from 'vscode-emmet-helper';

export const LANGUAGE_MODES: Object = {
	'html': ['!', '.', '}', ':', '*', '$'],
	'jade': ['!', '.', '}', ':', '*', '$'],
	'slim': ['!', '.', '}', ':', '*', '$'],
	'haml': ['!', '.', '}', ':', '*', '$'],
	'xml': ['.', '}', '*', '$'],
	'xsl': ['.', '}', '*', '$'],
	'css': [':'],
	'scss': [':'],
	'sass': [':'],
	'less': [':'],
	'stylus': [':'],
	'javascriptreact': ['.', '}', '*', '$'],
	'typescriptreact': ['.', '}', '*', '$']
};

// Explicitly map languages that have built-in grammar in VS Code to their parent language
// to get emmet completion support
// For other languages, users will have to use `emmet.includeLanguages` or
// language specific extensions can provide emmet completion support
export const MAPPED_MODES: Object = {
	'handlebars': 'html',
	'php': 'html'
};

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

export function getMappingForIncludedLanguages(): any {
	let finalMappedModes = {};
	let includeLanguagesConfig = vscode.workspace.getConfiguration('emmet')['includeLanguages'];
	let includeLanguages = Object.assign({}, MAPPED_MODES, includeLanguagesConfig ? includeLanguagesConfig : {});
	Object.keys(includeLanguages).forEach(syntax => {
		if (typeof includeLanguages[syntax] === 'string' && LANGUAGE_MODES[includeLanguages[syntax]]) {
			finalMappedModes[syntax] = includeLanguages[syntax];
		}
	});
	return finalMappedModes;
}

/**
 * Parses the given document using emmet parsing modules
 * @param document
 */
export function parseDocument(document: vscode.TextDocument, showError: boolean = true): Node {
	let parseContent = isStyleSheet(document.languageId) ? parseStylesheet : parse;
	let rootNode: Node;
	try {
		rootNode = parseContent(new DocumentStreamReader(document));
	} catch (e) {
		if (showError) {
			vscode.window.showErrorMessage('Emmet: Failed to parse the file');
		}
	}
	return rootNode;
}

/**
 * Returns node corresponding to given position in the given root node
 * @param root
 * @param position
 * @param includeNodeBoundary
 */
export function getNode(root: Node, position: vscode.Position, includeNodeBoundary: boolean = false) {
	let currentNode = root.firstChild;
	let foundNode: Node = null;

	while (currentNode) {
		const nodeStart: vscode.Position = currentNode.start;
		const nodeEnd: vscode.Position = currentNode.end;
		if ((nodeStart.isBefore(position) && nodeEnd.isAfter(position))
			|| (includeNodeBoundary && (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)))) {

			foundNode = currentNode;
			// Dig deeper
			currentNode = currentNode.firstChild;
		} else {
			currentNode = currentNode.nextSibling;
		}
	}

	return foundNode;
}

/**
 * Returns inner range of an html node.
 * @param currentNode
 */
export function getInnerRange(currentNode: HtmlNode): vscode.Range {
	if (!currentNode.close) {
		return;
	}
	return new vscode.Range(currentNode.open.end, currentNode.close.start);
}

export function getDeepestNode(node: Node): Node {
	if (!node || !node.children || node.children.length === 0 || !node.children.find(x => x.type !== 'comment')) {
		return node;
	}
	for (let i = node.children.length - 1; i >= 0; i--) {
		if (node.children[i].type !== 'comment') {
			return getDeepestNode(node.children[i]);
		}
	}
}

export function findNextWord(propertyValue: string, pos: number): [number, number] {

	let foundSpace = pos === -1;
	let foundStart = false;
	let foundEnd = false;

	let newSelectionStart;
	let newSelectionEnd;
	while (pos < propertyValue.length - 1) {
		pos++;
		if (!foundSpace) {
			if (propertyValue[pos] === ' ') {
				foundSpace = true;
			}
			continue;
		}
		if (foundSpace && !foundStart && propertyValue[pos] === ' ') {
			continue;
		}
		if (!foundStart) {
			newSelectionStart = pos;
			foundStart = true;
			continue;
		}
		if (propertyValue[pos] === ' ') {
			newSelectionEnd = pos;
			foundEnd = true;
			break;
		}
	}

	if (foundStart && !foundEnd) {
		newSelectionEnd = propertyValue.length;
	}

	return [newSelectionStart, newSelectionEnd];
}

export function findPrevWord(propertyValue: string, pos: number): [number, number] {

	let foundSpace = pos === propertyValue.length;
	let foundStart = false;
	let foundEnd = false;

	let newSelectionStart;
	let newSelectionEnd;
	while (pos > -1) {
		pos--;
		if (!foundSpace) {
			if (propertyValue[pos] === ' ') {
				foundSpace = true;
			}
			continue;
		}
		if (foundSpace && !foundEnd && propertyValue[pos] === ' ') {
			continue;
		}
		if (!foundEnd) {
			newSelectionEnd = pos + 1;
			foundEnd = true;
			continue;
		}
		if (propertyValue[pos] === ' ') {
			newSelectionStart = pos + 1;
			foundStart = true;
			break;
		}
	}

	if (foundEnd && !foundStart) {
		newSelectionStart = 0;
	}

	return [newSelectionStart, newSelectionEnd];
}

export function getNodesInBetween(node1: Node, node2: Node): Node[] {
	// Same node
	if (sameNodes(node1, node2)) {
		return [node1];
	}

	// Same parent
	if (sameNodes(node1.parent, node2.parent)) {
		return getNextSiblingsTillPosition(node1, node2.end);
	}

	// node2 is ancestor of node1
	if (node2.start.isBefore(node1.start)) {
		return [node2];
	}

	// node1 is ancestor of node2
	if (node2.start.isBefore(node1.end)) {
		return [node1];
	}

	// Get the highest ancestor of node1 that should be commented
	while (node1.parent && node1.parent.end.isBefore(node2.start)) {
		node1 = node1.parent;
	}

	// Get the highest ancestor of node2 that should be commented
	while (node2.parent && node2.parent.start.isAfter(node1.start)) {
		node2 = node2.parent;
	}

	return getNextSiblingsTillPosition(node1, node2.end);
}

function getNextSiblingsTillPosition(node: Node, position: vscode.Position): Node[] {
	let siblings: Node[] = [];
	let currentNode = node;
	while (currentNode && position.isAfter(currentNode.start)) {
		siblings.push(currentNode);
		currentNode = currentNode.nextSibling;
	}
	return siblings;
}

export function sameNodes(node1: Node, node2: Node): boolean {
	if (!node1 || !node2) {
		return false;
	}
	return (<vscode.Position>node1.start).isEqual(node2.start) && (<vscode.Position>node1.end).isEqual(node2.end);
}

export function getEmmetConfiguration() {
	const emmetConfig = vscode.workspace.getConfiguration('emmet');
	return {
		useNewEmmet: true,
		showExpandedAbbreviation: emmetConfig['showExpandedAbbreviation'],
		showAbbreviationSuggestions: emmetConfig['showAbbreviationSuggestions'],
		syntaxProfiles: emmetConfig['syntaxProfiles'],
		variables: emmetConfig['variables']
	};
}

/**
 * Itereates by each child, as well as nested child’ children, in their order
 * and invokes `fn` for each. If `fn` function returns `false`, iteration stops
 * @param  {Token}    token
 * @param  {Function} fn
 */
export function iterateCSSToken(token: CssToken, fn) {
	for (let i = 0, il = token.size; i < il; i++) {
		if (fn(token.item(i)) === false || iterateCSSToken(token.item(i), fn) === false) {
			return false;
		}
	}
}

/**
 * Returns `name` CSS property from given `rule`
 * @param  {Node} rule
 * @param  {String} name
 * @return {Property}
 */
export function getCssPropertyFromRule(rule, name): Property {
	return rule.children.find(node => node.type === 'property' && node.name === name);
}

/**
 * Returns css property under caret in given editor or `null` if such node cannot
 * be found
 * @param  {TextEditor}  editor
 * @return {Property}
 */
export function getCssPropertyFromDocument(editor: vscode.TextEditor, position: vscode.Position): Property {
	const rootNode = parseDocument(editor.document);
	const node = getNode(rootNode, position);

	if (isStyleSheet(editor.document.languageId)) {
		return node && node.type === 'property' ? <Property>node : null;
	}

	let htmlNode = <HtmlNode>node;
	if (htmlNode
		&& htmlNode.name === 'style'
		&& htmlNode.open.end.isBefore(position)
		&& htmlNode.close.start.isAfter(position)) {
		let buffer = new DocumentStreamReader(editor.document, htmlNode.start, new vscode.Range(htmlNode.start, htmlNode.end));
		let rootNode = parseStylesheet(buffer);
		const node = getNode(rootNode, position);
		return (node && node.type === 'property') ? <Property>node : null;
	}
}
