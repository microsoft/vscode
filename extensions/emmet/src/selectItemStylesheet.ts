/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getDeepestFlatNode, findNextWord, findPrevWord, getFlatNode, offsetRangeToSelection } from './util';
import { Node, CssNode, Rule, Property } from 'EmmetFlatNode';

export function nextItemStylesheet(document: vscode.TextDocument, startPosition: vscode.Position, endPosition: vscode.Position, rootNode: Node): vscode.Selection | undefined {
	const startOffset = document.offsetAt(startPosition);
	const endOffset = document.offsetAt(endPosition);
	let currentNode: CssNode | undefined = <CssNode>getFlatNode(rootNode, endOffset, true);
	if (!currentNode) {
		currentNode = <CssNode>rootNode;
	}
	if (!currentNode) {
		return;
	}
	// Full property is selected, so select full property value next
	if (currentNode.type === 'property' &&
		startOffset === currentNode.start &&
		endOffset === currentNode.end) {
		return getSelectionFromProperty(document, currentNode, startOffset, endOffset, true, 'next');
	}

	// Part or whole of propertyValue is selected, so select the next word in the propertyValue
	if (currentNode.type === 'property' &&
		startOffset >= (<Property>currentNode).valueToken.start &&
		endOffset <= (<Property>currentNode).valueToken.end) {
		const singlePropertyValue = getSelectionFromProperty(document, currentNode, startOffset, endOffset, false, 'next');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	// Cursor is in the selector or in a property
	if ((currentNode.type === 'rule' && endOffset < (<Rule>currentNode).selectorToken.end)
		|| (currentNode.type === 'property' && endOffset < (<Property>currentNode).valueToken.end)) {
		return getSelectionFromNode(document, currentNode);
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

	return nextNode ? getSelectionFromNode(document, nextNode) : undefined;
}

export function prevItemStylesheet(document: vscode.TextDocument, startPosition: vscode.Position, endPosition: vscode.Position, rootNode: CssNode): vscode.Selection | undefined {
	const startOffset = document.offsetAt(startPosition);
	const endOffset = document.offsetAt(endPosition);
	let currentNode = <CssNode>getFlatNode(rootNode, startOffset, false);
	if (!currentNode) {
		currentNode = rootNode;
	}
	if (!currentNode) {
		return;
	}

	// Full property value is selected, so select the whole property next
	if (currentNode.type === 'property' &&
		startOffset === (<Property>currentNode).valueToken.start &&
		endOffset === (<Property>currentNode).valueToken.end) {
		return getSelectionFromNode(document, currentNode);
	}

	// Part of propertyValue is selected, so select the prev word in the propertyValue
	if (currentNode.type === 'property' &&
		startOffset >= (<Property>currentNode).valueToken.start &&
		endOffset <= (<Property>currentNode).valueToken.end) {
		const singlePropertyValue = getSelectionFromProperty(document, currentNode, startOffset, endOffset, false, 'prev');
		if (singlePropertyValue) {
			return singlePropertyValue;
		}
	}

	if (currentNode.type === 'property' || !currentNode.firstChild ||
		(currentNode.type === 'rule' && startOffset <= currentNode.firstChild.start)) {
		return getSelectionFromNode(document, currentNode);
	}

	// Select the child that appears just before the cursor
	let prevNode: CssNode | undefined = currentNode.firstChild;
	while (prevNode.nextSibling && startOffset >= prevNode.nextSibling.end) {
		prevNode = prevNode.nextSibling;
	}
	prevNode = <CssNode | undefined>getDeepestFlatNode(prevNode);

	return getSelectionFromProperty(document, prevNode, startOffset, endOffset, false, 'prev');
}


function getSelectionFromNode(document: vscode.TextDocument, node: Node | undefined): vscode.Selection | undefined {
	if (!node) {
		return;
	}

	const nodeToSelect = node.type === 'rule' ? (<Rule>node).selectorToken : node;
	return offsetRangeToSelection(document, nodeToSelect.start, nodeToSelect.end);
}


function getSelectionFromProperty(document: vscode.TextDocument, node: Node | undefined, selectionStart: number, selectionEnd: number, selectFullValue: boolean, direction: string): vscode.Selection | undefined {
	if (!node || node.type !== 'property') {
		return;
	}
	const propertyNode = <Property>node;

	const propertyValue = propertyNode.valueToken.stream.substring(propertyNode.valueToken.start, propertyNode.valueToken.end);
	selectFullValue = selectFullValue ||
		(direction === 'prev' && selectionStart === propertyNode.valueToken.start && selectionEnd < propertyNode.valueToken.end);

	if (selectFullValue) {
		return offsetRangeToSelection(document, propertyNode.valueToken.start, propertyNode.valueToken.end);
	}

	let pos: number = -1;
	if (direction === 'prev') {
		if (selectionStart === propertyNode.valueToken.start) {
			return;
		}
		const selectionStartChar = document.positionAt(selectionStart).character;
		const tokenStartChar = document.positionAt(propertyNode.valueToken.start).character;
		pos = selectionStart > propertyNode.valueToken.end ? propertyValue.length :
			selectionStartChar - tokenStartChar;
	} else if (direction === 'next') {
		if (selectionEnd === propertyNode.valueToken.end &&
			(selectionStart > propertyNode.valueToken.start || !propertyValue.includes(' '))) {
			return;
		}
		const selectionEndChar = document.positionAt(selectionEnd).character;
		const tokenStartChar = document.positionAt(propertyNode.valueToken.start).character;
		pos = selectionEnd === propertyNode.valueToken.end ? -1 :
			selectionEndChar - tokenStartChar - 1;
	}


	const [newSelectionStartOffset, newSelectionEndOffset] = direction === 'prev' ? findPrevWord(propertyValue, pos) : findNextWord(propertyValue, pos);
	if (!newSelectionStartOffset && !newSelectionEndOffset) {
		return;
	}

	const tokenStart = document.positionAt(propertyNode.valueToken.start);
	const newSelectionStart = tokenStart.translate(0, newSelectionStartOffset);
	const newSelectionEnd = tokenStart.translate(0, newSelectionEndOffset);

	return new vscode.Selection(newSelectionStart, newSelectionEnd);
}



