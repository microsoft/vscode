/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNodesInBetween, getNode, parseDocument } from './util';
import { Node, Stylesheet, Rule } from 'EmmetNode';
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
	let selectionStart = selection.isReversed ? selection.active : selection.anchor;
	let selectionEnd = selection.isReversed ? selection.anchor : selection.active;

	let startNode = getNode(rootNode, selectionStart, true);
	let endNode = getNode(rootNode, selectionEnd, true);

	if (!selection.isEmpty || startNode) {
		selectionStart = selection.isEmpty ? startNode.start : adjustStartNodeCss(startNode, selectionStart, rootNode);
		selectionEnd = selection.isEmpty ? startNode.end : adjustEndNodeCss(endNode, selectionEnd, rootNode);
		selection = new vscode.Selection(selectionStart, selectionEnd);
	}

	// Uncomment the comments that intersect with the selection.
	let rangesToUnComment: vscode.Range[] = [];
	rootNode.comments.forEach(comment => {
		let commentRange = new vscode.Range(comment.start, comment.end);
		if (selection.intersection(commentRange)) {
			rangesToUnComment.push(commentRange);
		}
	});

	return [rangesToUnComment, rangesToUnComment.length > 0 ? null : selection];
}

function adjustStartNodeCss(node: Node, pos: vscode.Position, rootNode: Stylesheet): vscode.Position {
	for (let i = 0; i < rootNode.comments.length; i++) {
		let commentRange = new vscode.Range(rootNode.comments[i].start, rootNode.comments[i].end);
		if (commentRange.contains(pos)) {
			return pos;
		}
	}

	if (!node) {
		return pos;
	}

	if (node.type === 'property') {
		return node.start;
	}

	const rule = <Rule>node;
	if (pos.isBefore(rule.contentStartToken.end) || !rule.firstChild) {
		return rule.start;
	}

	if (pos.isBefore(rule.firstChild.start)) {
		return pos;
	}

	let newStartNode = rule.firstChild;
	while (newStartNode.nextSibling && pos.isAfter(newStartNode.end)) {
		newStartNode = newStartNode.nextSibling;
	}

	return newStartNode.start;
}

function adjustEndNodeCss(node: Node, pos: vscode.Position, rootNode: Stylesheet): vscode.Position {
	for (let i = 0; i < rootNode.comments.length; i++) {
		let commentRange = new vscode.Range(rootNode.comments[i].start, rootNode.comments[i].end);
		if (commentRange.contains(pos)) {
			return pos;
		}
	}

	if (!node) {
		return pos;
	}

	if (node.type === 'property') {
		return node.end;
	}

	const rule = <Rule>node;
	if (pos.isEqual(rule.contentEndToken.end) || !rule.firstChild) {
		return rule.end;
	}

	if (pos.isAfter(rule.children[rule.children.length - 1].end)) {
		return pos;
	}

	let newEndNode = rule.children[rule.children.length - 1];
	while (newEndNode.previousSibling && pos.isBefore(newEndNode.start)) {
		newEndNode = newEndNode.previousSibling;
	}

	return newEndNode.end;
}


