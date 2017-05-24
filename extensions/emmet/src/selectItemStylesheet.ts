/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, getDeepestNode } from './util';
import Node from '@emmetio/node';

export function nextItemStylesheet(selection: vscode.Selection, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let startOffset = editor.document.offsetAt(selection.anchor);
	let endOffset = editor.document.offsetAt(selection.active);
	let currentNode = getNode(rootNode, endOffset, true);

	// Full property is selected, so select property value next
	if (currentNode.type === 'property' && startOffset === currentNode.start && endOffset === currentNode.end) {
		return getSelectionFromNode(currentNode, editor.document, true);
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
	let currentNode = getNode(rootNode, startOffset);
	if (!currentNode) {
		currentNode = rootNode;
	}

	if (currentNode.type === 'property' || !currentNode.firstChild || (currentNode.type === 'rule' && startOffset <= currentNode.firstChild.start)) {
		return getSelectionFromNode(currentNode, editor.document);;
	}

	// Select the child that appears just before the cursor
	let prevNode = currentNode.firstChild;
	while (prevNode.nextSibling && prevNode.nextSibling.end <= startOffset) {
		prevNode = prevNode.nextSibling;
	}
	prevNode = getDeepestNode(prevNode);

	return getSelectionFromNode(prevNode, editor.document, true);

}


function getSelectionFromNode(node: Node, document: vscode.TextDocument, selectPropertyValue: boolean = false): vscode.Selection {
	if (!node) {
		return;
	}

	let nodeToSelect = node.type === 'rule' ? node.selectorToken : node;

	let selectionStart = (node.type === 'property' && selectPropertyValue) ? node.valueToken.start : nodeToSelect.start;
	let selectionEnd = (node.type === 'property' && selectPropertyValue) ? node.valueToken.end : nodeToSelect.end;

	return new vscode.Selection(document.positionAt(selectionStart), document.positionAt(selectionEnd));

}



