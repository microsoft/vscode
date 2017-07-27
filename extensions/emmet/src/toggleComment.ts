/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNodesInBetween, getNode, parseDocument, sameNodes } from './util';
import { Node, Stylesheet } from 'EmmetNode';
import { isStyleSheet } from 'vscode-emmet-helper';

const startCommentStylesheet = '/*';
const endCommentStylesheet = '*/';
const startCommentHTML = '<!--';
const endCommentHTML = '-->';

export function toggleComment(): Thenable<boolean> {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let toggleCommentInternal;
	let startComment;
	let endComment;

	if (isStyleSheet(editor.document.languageId)) {
		toggleCommentInternal = toggleCommentStylesheet;
		startComment = startCommentStylesheet;
		endComment = endCommentStylesheet;
	} else {
		toggleCommentInternal = toggleCommentHTML;
		startComment = startCommentHTML;
		endComment = endCommentHTML;
	}

	let rootNode = parseDocument(editor.document);
	if (!rootNode) {
		return;
	}

	return editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let [rangesToUnComment, rangeToComment] = toggleCommentInternal(editor.document, selection, rootNode);
			rangesToUnComment.forEach((rangeToUnComment: vscode.Range) => {
				editBuilder.delete(new vscode.Range(rangeToUnComment.start, rangeToUnComment.start.translate(0, startComment.length)));
				editBuilder.delete(new vscode.Range(rangeToUnComment.end.translate(0, -endComment.length), rangeToUnComment.end));
			});
			if (rangeToComment) {
				editBuilder.insert(rangeToComment.start, startComment);
				editBuilder.insert(rangeToComment.end, endComment);
			}

		});
	});
}

function toggleCommentHTML(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range[], vscode.Range] {
	const selectionStart = selection.isReversed ? selection.active : selection.anchor;
	const selectionEnd = selection.isReversed ? selection.anchor : selection.active;

	let startNode = getNode(rootNode, selectionStart, true);
	let endNode = getNode(rootNode, selectionEnd, true);

	if (!startNode || !endNode) {
		return [[], null];
	}

	let allNodes: Node[] = getNodesInBetween(startNode, endNode);
	let rangesToUnComment: vscode.Range[] = [];

	allNodes.forEach(node => {
		rangesToUnComment = rangesToUnComment.concat(getRangesToUnCommentHTML(node, document));
	});

	if (startNode.type === 'comment') {
		return [rangesToUnComment, null];
	}

	let rangeToComment = new vscode.Range(allNodes[0].start, allNodes[allNodes.length - 1].end);
	return [rangesToUnComment, rangeToComment];
}

function getRangesToUnCommentHTML(node: Node, document: vscode.TextDocument): vscode.Range[] {
	let rangesToUnComment = [];

	// If current node is commented, then uncomment and return
	if (node.type === 'comment') {
		rangesToUnComment.push(new vscode.Range(node.start, node.end));

		return rangesToUnComment;
	}

	// All children of current node should be uncommented
	node.children.forEach(childNode => {
		rangesToUnComment = rangesToUnComment.concat(getRangesToUnCommentHTML(childNode, document));
	});

	return rangesToUnComment;
}

function toggleCommentStylesheet(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Stylesheet): [vscode.Range[], vscode.Range] {

	const selectionStart = selection.isReversed ? selection.active : selection.anchor;
	const selectionEnd = selection.isReversed ? selection.anchor : selection.active;

	let startNode = getNode(rootNode, selectionStart, true);
	let endNode = getNode(rootNode, selectionEnd, true);
	if (startNode && endNode) {
		if (sameNodes(startNode, endNode) || sameNodes(startNode.parent, endNode.parent)) {
			selection = new vscode.Selection(startNode.start, endNode.end);
		} else {
			if (sameNodes(startNode, endNode.parent)) {
				let newStartNode = startNode.firstChild;
				while (newStartNode.end.isBefore(selectionStart) && newStartNode.nextSibling) {
					newStartNode = newStartNode.nextSibling;
				}
				startNode = newStartNode;
			} else if (sameNodes(startNode.parent, endNode)) {
				let newEndNode = endNode.children[endNode.children.length - 1];
				while (newEndNode.end.isAfter(selectionEnd) && newEndNode.previousSibling) {
					newEndNode = newEndNode.previousSibling;
				}
				endNode = newEndNode;
			}

			// TODO: both are properties of different rule : have 2 comments for the 2 rules
		}
	}



	let rangesToUnComment: vscode.Range[] = [];

	let isFirstNodeCommented = false;

	// Uncomment the comments that intersect with the selection.
	rootNode.comments.forEach(comment => {
		if (!isFirstNodeCommented) {
			isFirstNodeCommented = (selectionStart.isAfterOrEqual(comment.start) && selectionEnd.isBefore(comment.end));
		}

		if (selection.contains(comment.start)
			|| selection.contains(comment.end)
			|| (selectionStart.isAfterOrEqual(comment.start) && selectionEnd.isBefore(comment.end))) {
			rangesToUnComment.push(new vscode.Range(comment.start, comment.end));
		}
	});

	let rangeToComment = isFirstNodeCommented ? null : new vscode.Range(startNode ? startNode.start : selectionStart, endNode ? endNode.end : selectionEnd);
	return [rangesToUnComment, rangeToComment];


}
