/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import parseStylesheet from '@emmetio/css-parser';
import { Node, HtmlNode, CssToken, Property, Rule, Stylesheet } from 'EmmetNode';
import { DocumentStreamReader } from './bufferStream';

let _emmetHelper: any;
let _currentExtensionsPath: string | undefined = undefined;

export function getEmmetHelper() {
	if (!_emmetHelper) {
		_emmetHelper = require('vscode-emmet-helper');
	}
	resolveUpdateExtensionsPath();
	return _emmetHelper;
}

export function resolveUpdateExtensionsPath() {
	if (!_emmetHelper) {
		return;
	}
	let extensionsPath = vscode.workspace.getConfiguration('emmet')['extensionsPath'];
	if (_currentExtensionsPath !== extensionsPath) {
		_currentExtensionsPath = extensionsPath;
		_emmetHelper.updateExtensionsPath(extensionsPath, vscode.workspace.rootPath).then(null, (err: string) => vscode.window.showErrorMessage(err));
	}
}

export const LANGUAGE_MODES: any = {
	'html': ['!', '.', '}', ':', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'jade': ['!', '.', '}', ':', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'slim': ['!', '.', '}', ':', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'haml': ['!', '.', '}', ':', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'xml': ['.', '}', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'xsl': ['!', '.', '}', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'css': [':', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'scss': [':', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'sass': [':', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'less': [':', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'stylus': [':', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'javascriptreact': ['!', '.', '}', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
	'typescriptreact': ['!', '.', '}', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
};

const emmetModes = ['html', 'pug', 'slim', 'haml', 'xml', 'xsl', 'jsx', 'css', 'scss', 'sass', 'less', 'stylus'];

// Explicitly map languages that have built-in grammar in VS Code to their parent language
// to get emmet completion support
// For other languages, users will have to use `emmet.includeLanguages` or
// language specific extensions can provide emmet completion support
export const MAPPED_MODES: Object = {
	'php': 'html'
};

export function isStyleSheet(syntax: string): boolean {
	let stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
	return (stylesheetSyntaxes.indexOf(syntax) > -1);
}

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
	const finalMappedModes = Object.create(null);
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
* Get the corresponding emmet mode for given vscode language mode
* Eg: jsx for typescriptreact/javascriptreact or pug for jade
* If the language is not supported by emmet or has been exlcuded via `exlcudeLanguages` setting,
* then nothing is returned
*
* @param language
* @param exlcudedLanguages Array of language ids that user has chosen to exlcude for emmet
*/
export function getEmmetMode(language: string, excludedLanguages: string[]): string | undefined {
	if (!language || excludedLanguages.indexOf(language) > -1) {
		return;
	}
	if (/\b(typescriptreact|javascriptreact|jsx-tags)\b/.test(language)) { // treat tsx like jsx
		return 'jsx';
	}
	if (language === 'sass-indented') { // map sass-indented to sass
		return 'sass';
	}
	if (language === 'jade') {
		return 'pug';
	}
	if (emmetModes.indexOf(language) > -1) {
		return language;
	}
}

/**
 * Parses the given document using emmet parsing modules
 */
export function parseDocument(document: vscode.TextDocument, showError: boolean = true): Node | undefined {
	let parseContent = isStyleSheet(document.languageId) ? parseStylesheet : parse;
	try {
		return parseContent(new DocumentStreamReader(document));
	} catch (e) {
		if (showError) {
			vscode.window.showErrorMessage('Emmet: Failed to parse the file');
		}
	}
	return undefined;
}

export function parsePartialStylesheet(document: vscode.TextDocument, position: vscode.Position): Stylesheet | undefined {

	let startPosition = new vscode.Position(0, 0);
	let endPosition = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
	const closeBrace = 125;
	const openBrace = 123;
	let slash = 47;
	let star = 42;
	let isCSS = document.languageId === 'css';

	let singleLineCommentIndex = document.lineAt(position.line).text.indexOf('//');
	if (!isCSS && singleLineCommentIndex > -1 && singleLineCommentIndex < position.character) {
		return;
	}

	// Go forward until we found a closing brace.
	let stream = new DocumentStreamReader(document, position);
	while (!stream.eof() && !stream.eat(closeBrace)) {
		if (stream.eat(slash)) {
			if (stream.eat(slash) && !isCSS) {
				// Single line Comment, we continue searching from next line.
				stream.pos = new vscode.Position(stream.pos.line + 1, 0);
			} else if (stream.eat(star)) {
				stream.pos = findClosingCommentAfterPosition(document, stream.pos) || endPosition;
			}
		} else {
			stream.next();
		}
	}

	if (!stream.eof()) {
		endPosition = stream.pos;
	}

	// Go back until we found an opening brace. If we find a closing one, we first find its opening brace and then we continue.
	stream.pos = position;
	let openBracesRemaining = 1;
	let currentLine = position.line;
	let limitCharacter = document.offsetAt(position) - 5000;
	let limitPosition = limitCharacter > 0 ? document.positionAt(limitCharacter) : startPosition;

	while (openBracesRemaining > 0 && !stream.sof()) {
		if (position.line - stream.pos.line > 100 || stream.pos.isBeforeOrEqual(limitPosition)) {
			return parseStylesheet(new DocumentStreamReader(document, startPosition, new vscode.Range(startPosition, endPosition)));
		} else if (!isCSS && stream.pos.line !== currentLine) {
			// In not CSS stylesheets, we need to skip singleLine comments.
			currentLine = stream.pos.line;
			let startLineComment = document.lineAt(currentLine).text.indexOf('//');
			if (startLineComment > -1) {
				stream.pos = new vscode.Position(currentLine, startLineComment);
			}
		}
		let ch = stream.backUp(1);
		if (ch === openBrace) {
			openBracesRemaining--;
		} else if (ch === closeBrace) {
			if (isCSS) {
				stream.next();
				return parseStylesheet(new DocumentStreamReader(document, stream.pos, new vscode.Range(stream.pos, endPosition)));
			}
			openBracesRemaining++;
		} else if (ch === slash) {
			stream.backUp(1);
			if (stream.peek() === star) {
				stream.pos = findOpeningCommentBeforePosition(document, stream.pos) || startPosition;
			} else {
				stream.next();
			}
		}
	}
	// We are at an opening brace. We need to include its selector, but with one nonspace character is enough.
	while (!stream.sof() && String.fromCharCode(stream.backUp(1)).match(/\s/)) { }

	startPosition = stream.pos;
	try {
		return parseStylesheet(new DocumentStreamReader(document, startPosition, new vscode.Range(startPosition, endPosition)));
	} catch (e) {
	}
}

function findOpeningCommentBeforePosition(document: vscode.TextDocument, position: vscode.Position): vscode.Position | undefined {
	let text = document.getText(new vscode.Range(0, 0, position.line, position.character));
	let offset = text.lastIndexOf('/*');
	if (offset === -1) {
		return;
	}
	return document.positionAt(offset);
}

function findClosingCommentAfterPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Position | undefined {
	let text = document.getText(new vscode.Range(position.line, position.character, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length));
	let offset = text.indexOf('*/');
	if (offset === -1) {
		return;
	}
	offset += 2 + document.offsetAt(position);
	return document.positionAt(offset);
}

/**
 * Returns node corresponding to given position in the given root node
 */
export function getNode(root: Node | undefined, position: vscode.Position, includeNodeBoundary: boolean = false) {
	if (!root) {
		return null;
	}

	let currentNode = root.firstChild;
	let foundNode: Node | null = null;

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
export function getInnerRange(currentNode: HtmlNode): vscode.Range | undefined {
	if (!currentNode.close) {
		return undefined;
	}
	return new vscode.Range(currentNode.open.end, currentNode.close.start);
}

export function getDeepestNode(node: Node | undefined): Node | undefined {
	if (!node || !node.children || node.children.length === 0 || !node.children.find(x => x.type !== 'comment')) {
		return node;
	}
	for (let i = node.children.length - 1; i >= 0; i--) {
		if (node.children[i].type !== 'comment') {
			return getDeepestNode(node.children[i]);
		}
	}
	return undefined;
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

export function getEmmetConfiguration(syntax: string) {
	const emmetConfig = vscode.workspace.getConfiguration('emmet');
	const syntaxProfiles = Object.assign({}, emmetConfig['syntaxProfiles'] || {});
	const preferences = Object.assign({}, emmetConfig['preferences'] || {});
	// jsx, xml and xsl syntaxes need to have self closing tags unless otherwise configured by user
	if (syntax === 'jsx' || syntax === 'xml' || syntax === 'xsl') {
		syntaxProfiles[syntax] = syntaxProfiles[syntax] || {};
		if (typeof syntaxProfiles[syntax] === 'object'
			&& !syntaxProfiles[syntax].hasOwnProperty('self_closing_tag') // Old Emmet format
			&& !syntaxProfiles[syntax].hasOwnProperty('selfClosingStyle') // Emmet 2.0 format
		) {
			syntaxProfiles[syntax]['selfClosingStyle'] = 'xml';
		}
	}

	return {
		preferences,
		showExpandedAbbreviation: emmetConfig['showExpandedAbbreviation'],
		showAbbreviationSuggestions: emmetConfig['showAbbreviationSuggestions'],
		syntaxProfiles,
		variables: emmetConfig['variables'],
		excludeLanguages: emmetConfig['excludeLanguages'],
		showSuggestionsAsSnippets: emmetConfig['showSuggestionsAsSnippets']
	};
}

/**
 * Itereates by each child, as well as nested child’ children, in their order
 * and invokes `fn` for each. If `fn` function returns `false`, iteration stops
 */
export function iterateCSSToken(token: CssToken, fn: (x: any) => any) {
	for (let i = 0, il = token.size; i < il; i++) {
		if (fn(token.item(i)) === false || iterateCSSToken(token.item(i), fn) === false) {
			return false;
		}
	}
}

/**
 * Returns `name` CSS property from given `rule`
 */
export function getCssPropertyFromRule(rule: Rule, name: string): Property | undefined {
	return rule.children.find(node => node.type === 'property' && node.name === name) as Property;
}

/**
 * Returns css property under caret in given editor or `null` if such node cannot
 * be found
 */
export function getCssPropertyFromDocument(editor: vscode.TextEditor, position: vscode.Position): Property | null | undefined {
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
