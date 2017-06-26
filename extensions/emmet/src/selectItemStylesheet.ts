/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getDeepestNode, findNextWord, findPrevWord, getNode } from './util';
import Node from '@emmetio/node';

export function nextItemStylesheet(startOffset: vscode.Position, endOffset: vscode.Position, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, endOffset, true);
	if (!currentNode) {
		currentNode = rootNode;
	}

	// Full property is selected, so select full property value next
	if (currentNode.type === 'property' && startOffset.isEqual(currentNode.start) && endOffset.isEqual(currentNode.end)) {
		return getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, true, 'next');
	}

	// Part or whole of propertyValue is selected, so select the next word in the propertyValue
	if (currentNode.type === 'property' && startOffset.isAfterOrEqual(currentNode.valueToken.start) && endOffset.isBeforeOrEqual(currentNode.valueToken.end)) {
		let singlePropertyValue = getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, false, 'next');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	// Cursor is in the selector or in a property
	if ((currentNode.type === 'rule' && endOffset.isBefore(currentNode.selectorToken.end))
		|| (currentNode.type === 'property' && endOffset.isBefore(currentNode.valueToken.end))) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Get the first child of current node which is right after the cursor
	let nextNode = currentNode.firstChild;
	while (nextNode && endOffset.isAfterOrEqual(nextNode.end)) {
		nextNode = nextNode.nextSibling;
	}

	// Get next sibling of current node or the parent
	while (!nextNode && currentNode) {
		nextNode = currentNode.nextSibling;
		currentNode = currentNode.parent;
	}

	return getSelectionFromNode(nextNode, editor.document);

}

export function prevItemStylesheet(startOffset: vscode.Position, endOffset: vscode.Position, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, startOffset);
	if (!currentNode) {
		currentNode = rootNode;
	}

	// Full property value is selected, so select the whole property next
	if (currentNode.type === 'property' && startOffset.isEqual(currentNode.valueToken.start) && endOffset.isEqual(currentNode.valueToken.end)) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Part of propertyValue is selected, so select the prev word in the propertyValue
	if (currentNode.type === 'property' && startOffset.isAfterOrEqual(currentNode.valueToken.start) && endOffset.isBeforeOrEqual(currentNode.valueToken.end)) {
		let singlePropertyValue = getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, false, 'prev');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	if (currentNode.type === 'property' || !currentNode.firstChild || (currentNode.type === 'rule' && startOffset.isBeforeOrEqual(currentNode.firstChild.start))) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Select the child that appears just before the cursor
	let prevNode = currentNode.firstChild;
	while (prevNode.nextSibling && startOffset.isAfterOrEqual(prevNode.nextSibling.end)) {
		prevNode = prevNode.nextSibling;
	}
	prevNode = getDeepestNode(prevNode);

	return getSelectionFromProperty(prevNode, editor.document, startOffset, endOffset, false, 'prev');

}


function getSelectionFromNode(node: Node, document: vscode.TextDocument): vscode.Selection {
	if (!node) {
		return;
	}

	let nodeToSelect = node.type === 'rule' ? node.selectorToken : node;
	return new vscode.Selection(nodeToSelect.start, nodeToSelect.end);
}


function getSelectionFromProperty(node: Node, document: vscode.TextDocument, selectionStart: vscode.Position, selectionEnd: vscode.Position, selectFullValue: boolean, direction: string): vscode.Selection {
	if (!node || node.type !== 'property') {
		return;
	}

	let propertyValue = node.valueToken.stream.substring(node.valueToken.start, node.valueToken.end);
	selectFullValue = selectFullValue || (direction === 'prev' && selectionStart.isEqual(node.valueToken.start) && selectionEnd.isBefore(node.valueToken.end));

	if (selectFullValue) {
		return new vscode.Selection(node.valueToken.start, node.valueToken.end);
	}

	let pos;
	if (direction === 'prev') {
		if (selectionStart.isEqual(node.valueToken.start)) {
			return;
		}
		pos = selectionStart.isAfter(node.valueToken.end) ? propertyValue.length : selectionStart.character - node.valueToken.start.character;
	}

	if (direction === 'next') {
		if (selectionEnd.isEqual(node.valueToken.end) && (selectionStart.isAfter(node.valueToken.start) || propertyValue.indexOf(' ') === -1)) {
			return;
		}
		pos = selectionEnd.isEqual(node.valueToken.end) ? -1 : selectionEnd.character - node.valueToken.start.character - 1;
	}


	let [newSelectionStartOffset, newSelectionEndOffset] = direction === 'prev' ? findPrevWord(propertyValue, pos) : findNextWord(propertyValue, pos);
	if (!newSelectionStartOffset && !newSelectionEndOffset) {
		return;
	}

	const newSelectionStart = (<vscode.Position>node.valueToken.start).translate(0, newSelectionStartOffset);
	const newSelectionEnd = (<vscode.Position>node.valueToken.start).translate(0, newSelectionEndOffset);

	return new vscode.Selection(newSelectionStart, newSelectionEnd);
}



