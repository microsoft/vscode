/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import parse from '@emmetio/html-matcher';
import Node from '@emmetio/node';
import { DocumentStreamReader } from './bufferStream';
import { isStyleSheet } from 'vscode-emmet-helper';

export const LANGUAGE_MODES: Object = {
	'html': ['!', '.', '}'],
	'jade': ['!', '.', '}'],
	'slim': ['!', '.', '}'],
	'haml': ['!', '.', '}'],
	'xml': ['.', '}'],
	'xsl': ['.', '}'],
	'css': [':'],
	'scss': [':'],
	'sass': [':'],
	'less': [':'],
	'stylus': [':']
};

// Explicitly map languages to their parent language to get emmet completion support
export const MAPPED_MODES: Object = {
	'handlebars': 'html'
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

export function getSyntax(document: vscode.TextDocument): string {
	if (document.languageId === 'jade') {
		return 'pug';
	}
	return document.languageId;
}

export function getMappedModes(): any {
	let finalMappedModes = {};
	let syntaxProfileConfig = vscode.workspace.getConfiguration('emmet')['syntaxProfiles'];
	let syntaxProfiles = Object.assign({}, MAPPED_MODES, syntaxProfileConfig ? syntaxProfileConfig : {});
	Object.keys(syntaxProfiles).forEach(syntax => {
		if (typeof syntaxProfiles[syntax] === 'string' && LANGUAGE_MODES[syntaxProfiles[syntax]]) {
			finalMappedModes[syntax] = syntaxProfiles[syntax];
		}
	});
	return finalMappedModes;
}

export function getExcludedModes(): string[] {
	let excludedConfig = vscode.workspace.getConfiguration('emmet')['excludeLanguages'];
	return Array.isArray(excludedConfig) ? excludedConfig : [];
}
/**
 * Returns node corresponding to given position in the given root node
 * @param root
 * @param position
 * @param includeNodeBoundary
 */
export function getNode(root: Node, position: vscode.Position, includeNodeBoundary: boolean = false) {
	let currentNode: Node = root.firstChild;
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
export function getInnerRange(currentNode: Node): vscode.Range {
	if (!currentNode.close) {
		return;
	}
	return new vscode.Range(currentNode.open.end, currentNode.close.start);
}

export function getOpenCloseRange(document: vscode.TextDocument, position: vscode.Position): [vscode.Range, vscode.Range] {
	let rootNode: Node = parse(new DocumentStreamReader(document));
	let nodeToUpdate = getNode(rootNode, position);
	let openRange = new vscode.Range(nodeToUpdate.open.start, nodeToUpdate.open.end);
	let closeRange = null;
	if (nodeToUpdate.close) {
		closeRange = new vscode.Range(nodeToUpdate.close.start, nodeToUpdate.close.end);
	}
	return [openRange, closeRange];
}

export function getDeepestNode(node: Node): Node {
	if (!node || !node.children || node.children.length === 0) {
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


