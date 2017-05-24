/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, getDeepestNode } from './util';
import Node from '@emmetio/node';

export function nextItemHTML(selection: vscode.Selection, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let offset = editor.document.offsetAt(selection.active);
	let currentNode = getNode(rootNode, offset);

	// Cursor is in the open tag, look for attributes
	if (offset < currentNode.open.end) {
		let attrSelection = getNextAttribute(selection, editor.document, currentNode);
		if (attrSelection) {
			return attrSelection;
		}
	}

	// Get the first child of current node which is right after the cursor
	let nextNode = currentNode.firstChild;
	while (nextNode && nextNode.start < offset) {
		nextNode = nextNode.nextSibling;
	}

	// Get next sibling of current node or the parent
	while (!nextNode && currentNode) {
		nextNode = currentNode.nextSibling;
		currentNode = currentNode.parent;
	}

	return getSelectionFromNode(nextNode, editor.document);
}

export function prevItemHTML(selection: vscode.Selection, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let offset = editor.document.offsetAt(selection.active);
	let currentNode = getNode(rootNode, offset);
	let prevNode: Node;

	// Cursor is in the open tag after the tag name
	if (offset > currentNode.open.start + currentNode.name.length + 1 && offset <= currentNode.open.end) {
		prevNode = currentNode;
	}

	// Cursor is inside the tag
	if (!prevNode && offset > currentNode.open.end) {
		if (!currentNode.firstChild) {
			// No children, so current node should be selected
			prevNode = currentNode;
		} else {
			// Select the child that appears just before the cursor
			prevNode = currentNode.firstChild;
			while (prevNode.nextSibling && prevNode.nextSibling.end < offset) {
				prevNode = prevNode.nextSibling;
			}
			if (prevNode) {
				prevNode = getDeepestNode(prevNode);
			}
		}
	}

	if (!prevNode && currentNode.previousSibling) {
		prevNode = getDeepestNode(currentNode.previousSibling);
	}

	if (!prevNode && currentNode.parent) {
		prevNode = currentNode.parent;
	}

	let attrSelection = getPrevAttribute(selection, editor.document, prevNode);
	return attrSelection ? attrSelection : getSelectionFromNode(prevNode, editor.document);
}

function getSelectionFromNode(node: Node, document: vscode.TextDocument): vscode.Selection {
	if (node && node.open) {
		let selectionStart = document.positionAt(node.open.start + 1);
		let selectionEnd = node.type === 'comment' ? document.positionAt(node.open.end - 1) : selectionStart.translate(0, node.name.length);

		return new vscode.Selection(selectionStart, selectionEnd);
	}
}

function getNextAttribute(selection: vscode.Selection, document: vscode.TextDocument, node: Node): vscode.Selection {

	if (!node.attributes || node.attributes.length === 0 || node.type === 'comment') {
		return;
	}

	let selectionStart = document.offsetAt(selection.anchor);
	let selectionEnd = document.offsetAt(selection.active);

	for (let i = 0; i < node.attributes.length; i++) {
		let attr = node.attributes[i];

		if (selectionEnd < attr.start) {
			// select full attr
			return new vscode.Selection(document.positionAt(attr.start), document.positionAt(attr.end));
		}

		if ((attr.value.start !== attr.value.end) && ((selectionStart === attr.start && selectionEnd === attr.end) || selectionEnd < attr.end - 1)) {
			// select attr value
			return new vscode.Selection(document.positionAt(attr.value.start), document.positionAt(attr.value.end));
		}
	}
}

function getPrevAttribute(selection: vscode.Selection, document: vscode.TextDocument, node: Node): vscode.Selection {

	if (!node.attributes || node.attributes.length === 0 || node.type === 'comment') {
		return;
	}

	let selectionStart = document.offsetAt(selection.anchor);

	for (let i = node.attributes.length - 1; i >= 0; i--) {
		let attr = node.attributes[i];

		if (selectionStart > attr.value.start) {
			// select attr value
			return new vscode.Selection(document.positionAt(attr.value.start), document.positionAt(attr.value.end));
		}

		if (selectionStart > attr.start) {
			// select full attr
			return new vscode.Selection(document.positionAt(attr.start), document.positionAt(attr.end));
		}
	}
}