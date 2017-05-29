/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, getDeepestNode, findNextWord, findPrevWord } from './util';
import Node from '@emmetio/node';

export function nextItemStylesheet(selection: vscode.Selection, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let startOffset = editor.document.offsetAt(selection.anchor);
	let endOffset = editor.document.offsetAt(selection.active);
	let currentNode = getNode(rootNode, endOffset, true);

	// Full property is selected, so select full property value next
	if (currentNode.type === 'property' && startOffset === currentNode.start && endOffset === currentNode.end) {
		return getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, true, 'next');
	}

	// Part or whole of propertyValue is selected, so select the next word in the propertyValue
	if (currentNode.type === 'property' && startOffset >= currentNode.valueToken.start && endOffset <= currentNode.valueToken.end) {
		let singlePropertyValue = getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, false, 'next');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	// Cursor is in the selector or in a property
	if ((currentNode.type === 'rule' && endOffset < currentNode.selectorToken.end)
		|| (currentNode.type === 'property' && endOffset < currentNode.valueToken.end)) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Get the first child of current node which is right after the cursor
	let nextNode = currentNode.firstChild;
	while (nextNode && endOffset >= nextNode.end) {
		nextNode = nextNode.nextSibling;
	}

	// Get next sibling of current node or the parent
	while (!nextNode && currentNode) {
		nextNode = currentNode.nextSibling;
		currentNode = currentNode.parent;
	}

	return getSelectionFromNode(nextNode, editor.document);

}

export function prevItemStylesheet(selection: vscode.Selection, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let startOffset = editor.document.offsetAt(selection.anchor);
	let endOffset = editor.document.offsetAt(selection.active);
	let currentNode = getNode(rootNode, startOffset);
	if (!currentNode) {
		currentNode = rootNode;
	}

	// Full property value is selected, so select the whole property next
	if (currentNode.type === 'property' && startOffset === currentNode.valueToken.start && endOffset === currentNode.valueToken.end) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Part of propertyValue is selected, so select the prev word in the propertyValue
	if (currentNode.type === 'property' && startOffset >= currentNode.valueToken.start && endOffset <= currentNode.valueToken.end) {
		let singlePropertyValue = getSelectionFromProperty(currentNode, editor.document, startOffset, endOffset, false, 'prev');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	if (currentNode.type === 'property' || !currentNode.firstChild || (currentNode.type === 'rule' && startOffset <= currentNode.firstChild.start)) {
		return getSelectionFromNode(currentNode, editor.document);
	}

	// Select the child that appears just before the cursor
	let prevNode = currentNode.firstChild;
	while (prevNode.nextSibling && prevNode.nextSibling.end <= startOffset) {
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
	return new vscode.Selection(document.positionAt(nodeToSelect.start), document.positionAt(nodeToSelect.end));
}


function getSelectionFromProperty(node: Node, document: vscode.TextDocument, selectionStart: number, selectionEnd: number, selectFullValue: boolean, direction: string): vscode.Selection {
	if (!node || node.type !== 'property') {
		return;
	}

	let propertyValue = node.valueToken.stream.substring(node.valueToken.start, node.valueToken.end);
	selectFullValue = selectFullValue || (direction === 'prev' && selectionStart === node.valueToken.start && selectionEnd < node.valueToken.end);

	if (selectFullValue) {
		return new vscode.Selection(document.positionAt(node.valueToken.start), document.positionAt(node.valueToken.end));
	}

	let pos;
	if (direction === 'prev') {
		if (selectionStart === node.valueToken.start) {
			return;
		}
		pos = selectionStart > node.valueToken.end ? propertyValue.length : selectionStart - node.valueToken.start;
	}

	if (direction === 'next') {
		if (selectionEnd === node.valueToken.end && (selectionStart > node.valueToken.start || propertyValue.indexOf(' ') === -1)) {
			return;
		}
		pos = selectionEnd === node.valueToken.end ? -1 : selectionEnd - node.valueToken.start - 1;
	}


	let [newSelectionStart, newSelectionEnd] = direction === 'prev' ? findPrevWord(propertyValue, pos) : findNextWord(propertyValue, pos);
	if (!newSelectionStart && !newSelectionEnd) {
		return;
	}

	newSelectionStart += node.valueToken.start;
	newSelectionEnd += node.valueToken.start;

	return new vscode.Selection(document.positionAt(newSelectionStart), document.positionAt(newSelectionEnd));
}



