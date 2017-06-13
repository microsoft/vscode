/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, getDeepestNode, findNextWord, findPrevWord } from './util';
import Node from '@emmetio/node';

export function nextItemHTML(selectionStart: number, selectionEnd: number, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, selectionEnd);
	let nextNode: Node;

	if (currentNode.type !== 'comment') {
		// If cursor is in the tag name, select tag
		if (selectionEnd < currentNode.open.start + currentNode.name.length) {
			return getSelectionFromNode(currentNode, editor.document);
		}

		// If cursor is in the open tag, look for attributes
		if (selectionEnd < currentNode.open.end) {
			let attrSelection = getNextAttribute(selectionStart, selectionEnd, editor.document, currentNode);
			if (attrSelection) {
				return attrSelection;
			}
		}

		// Get the first child of current node which is right after the cursor and is not a comment
		nextNode = currentNode.firstChild;
		while (nextNode && (nextNode.start < selectionEnd || nextNode.type === 'comment')) {
			nextNode = nextNode.nextSibling;
		}
	}


	// Get next sibling of current node which is not a comment. If none is found try the same on the parent
	while (!nextNode && currentNode) {
		if (currentNode.nextSibling) {
			if (currentNode.nextSibling.type !== 'comment') {
				nextNode = currentNode.nextSibling;
			} else {
				currentNode = currentNode.nextSibling;
			}
		} else {
			currentNode = currentNode.parent;
		}
	}

	return getSelectionFromNode(nextNode, editor.document);
}

export function prevItemHTML(selectionStart: number, selectionEnd: number, editor: vscode.TextEditor, rootNode: Node): vscode.Selection {
	let currentNode = getNode(rootNode, selectionStart);
	let prevNode: Node;

	if (currentNode.type !== 'comment' && selectionStart > currentNode.open.start + 1) {

		if (selectionStart < currentNode.open.end || !currentNode.firstChild) {
			prevNode = currentNode;
		} else {
			// Select the child that appears just before the cursor and is not a comment
			prevNode = currentNode.firstChild;
			let oldOption: Node;
			while (prevNode.nextSibling && prevNode.nextSibling.end < selectionStart) {
				if (prevNode && prevNode.type !== 'comment') {
					oldOption = prevNode;
				}
				prevNode = prevNode.nextSibling;
			}

			prevNode = getDeepestNode((prevNode && prevNode.type !== 'comment') ? prevNode : oldOption);
		}
	}

	// Select previous sibling which is not a comment. If none found, then select parent
	while (!prevNode && currentNode) {
		if (currentNode.previousSibling) {
			if (currentNode.previousSibling.type !== 'comment') {
				prevNode = getDeepestNode(currentNode.previousSibling);
			} else {
				currentNode = currentNode.previousSibling;
			}
		} else {
			prevNode = currentNode.parent;
		}

	}

	let attrSelection = getPrevAttribute(selectionStart, selectionEnd, editor.document, prevNode);
	return attrSelection ? attrSelection : getSelectionFromNode(prevNode, editor.document);
}

function getSelectionFromNode(node: Node, document: vscode.TextDocument): vscode.Selection {
	if (node && node.open) {
		let selectionStart = document.positionAt(node.open.start + 1);
		let selectionEnd = selectionStart.translate(0, node.name.length);

		return new vscode.Selection(selectionStart, selectionEnd);
	}
}

function getNextAttribute(selectionStart: number, selectionEnd: number, document: vscode.TextDocument, node: Node): vscode.Selection {

	if (!node.attributes || node.attributes.length === 0 || node.type === 'comment') {
		return;
	}

	for (let i = 0; i < node.attributes.length; i++) {
		let attr = node.attributes[i];

		if (selectionEnd < attr.start) {
			// select full attr
			return new vscode.Selection(document.positionAt(attr.start), document.positionAt(attr.end));
		}

		if (attr.value.start === attr.value.end) {
			// No attr value to select
			continue;
		}

		if ((selectionStart === attr.start && selectionEnd === attr.end) || selectionEnd < attr.value.start) {
			// cursor is in attr name,  so select full attr value
			return new vscode.Selection(document.positionAt(attr.value.start), document.positionAt(attr.value.end));
		}

		// Fetch the next word in the attr value

		if (attr.value.toString().indexOf(' ') === -1) {
			// attr value does not have space, so no next word to find
			continue;
		}

		let pos = undefined;
		if (selectionStart === attr.value.start && selectionEnd === attr.value.end) {
			pos = -1;
		}
		if (pos === undefined && selectionEnd < attr.end) {
			pos = selectionEnd - attr.value.start - 1;
		}

		if (pos !== undefined) {
			let [newSelectionStart, newSelectionEnd] = findNextWord(attr.value.toString(), pos);
			if (newSelectionStart >= 0 && newSelectionEnd >= 0) {
				newSelectionStart += attr.value.start;
				newSelectionEnd += attr.value.start;
				return new vscode.Selection(document.positionAt(newSelectionStart), document.positionAt(newSelectionEnd));
			}
		}

	}
}

function getPrevAttribute(selectionStart: number, selectionEnd: number, document: vscode.TextDocument, node: Node): vscode.Selection {

	if (!node.attributes || node.attributes.length === 0 || node.type === 'comment') {
		return;
	}

	for (let i = node.attributes.length - 1; i >= 0; i--) {
		let attr = node.attributes[i];

		if (selectionStart <= attr.start) {
			continue;
		}

		if (attr.value.start === attr.value.end || selectionStart < attr.value.start) {
			// select full attr
			return new vscode.Selection(document.positionAt(attr.start), document.positionAt(attr.end));
		}

		if (selectionStart === attr.value.start) {
			if (selectionEnd >= attr.value.end) {
				// select full attr
				return new vscode.Selection(document.positionAt(attr.start), document.positionAt(attr.end));
			}
			// select attr value
			return new vscode.Selection(document.positionAt(attr.value.start), document.positionAt(attr.value.end));
		}

		// Fetch the prev word in the attr value

		let pos = selectionStart > attr.value.end ? attr.value.toString().length : selectionStart - attr.value.start;
		let [newSelectionStart, newSelectionEnd] = findPrevWord(attr.value.toString(), pos);
		if (newSelectionStart >= 0 && newSelectionEnd >= 0) {
			newSelectionStart += attr.value.start;
			newSelectionEnd += attr.value.start;
			return new vscode.Selection(document.positionAt(newSelectionStart), document.positionAt(newSelectionEnd));
		}


	}
}