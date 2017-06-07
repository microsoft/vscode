/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, isStyleSheet, getNodesInBetween } from './util';
import parse from '@emmetio/html-matcher';
import parseStylesheet from '@emmetio/css-parser';
import Node from '@emmetio/node';


const startCommentStylesheet = '/*';
const endCommentStylesheet = '*/';
const startCommentHTML = '<!--';
const endCommentHTML = '-->';

export function toggleComment() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}

	let toggleCommentInternal;
	let startComment;
	let endComment;
	let parseContent;

	if (isStyleSheet(editor.document.languageId)) {
		parseContent = parseStylesheet;
		toggleCommentInternal = toggleCommentStylesheet;
		startComment = startCommentStylesheet;
		endComment = endCommentStylesheet;
	} else {
		parseContent = parse;
		toggleCommentInternal = toggleCommentHTML;
		startComment = startCommentHTML;
		endComment = endCommentHTML;
	}

	let rootNode = parseContent(editor.document.getText());

	editor.edit(editBuilder => {
		editor.selections.reverse().forEach(selection => {
			let [rangesToUnComment, positionForCommentStart, positionForCommentEnd] = toggleCommentInternal(editor.document, selection, rootNode);
			rangesToUnComment.forEach(rangeToDelete => {
				editBuilder.delete(rangeToDelete);
			});
			if (positionForCommentStart) {
				editBuilder.insert(positionForCommentStart, startComment);
			}
			if (positionForCommentEnd) {
				editBuilder.insert(positionForCommentEnd, endComment);
			}
		});
	});
}

function toggleCommentHTML(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range[], vscode.Position, vscode.Position] {
	const selectionStart = document.offsetAt(selection.isReversed ? selection.active : selection.anchor);
	const selectionEnd = document.offsetAt(selection.isReversed ? selection.anchor : selection.active);

	let startNode = getNode(rootNode, selectionStart, true);
	let endNode = getNode(rootNode, selectionEnd, true);

	if (!startNode || !endNode) {
		return [[], null, null];
	}

	let allNodes: Node[] = getNodesInBetween(startNode, endNode);
	let rangesToUnComment: vscode.Range[] = [];

	allNodes.forEach(node => {
		rangesToUnComment = rangesToUnComment.concat(getRangesToUnCommentHTML(node, document));
	});

	if (startNode.type === 'comment') {
		return [rangesToUnComment, null, null];
	}

	let positionForCommentStart = document.positionAt(allNodes[0].start);
	let positionForCommentEnd = document.positionAt(allNodes[allNodes.length - 1].end);
	return [rangesToUnComment, positionForCommentStart, positionForCommentEnd];
}

function getRangesToUnCommentHTML(node: Node, document: vscode.TextDocument): vscode.Range[] {
	let rangesToUnComment = [];

	// If current node is commented, then uncomment and return
	if (node.type === 'comment') {
		rangesToUnComment.push(new vscode.Range(document.positionAt(node.start), document.positionAt(node.start + startCommentHTML.length)));
		rangesToUnComment.push(new vscode.Range(document.positionAt(node.end), document.positionAt(node.end - endCommentHTML.length)));

		return rangesToUnComment;
	}

	// All children of current node should be uncommented
	node.children.forEach(childNode => {
		rangesToUnComment = rangesToUnComment.concat(getRangesToUnCommentHTML(childNode, document));
	});

	return rangesToUnComment;
}

function toggleCommentStylesheet(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): [vscode.Range[], vscode.Position, vscode.Position] {

	const selectionStart = document.offsetAt(selection.isReversed ? selection.active : selection.anchor);
	const selectionEnd = document.offsetAt(selection.isReversed ? selection.anchor : selection.active);

	let startNode = getNode(rootNode, selectionStart, true);
	let endNode = getNode(rootNode, selectionEnd, true);
	let rangesToUnComment: vscode.Range[] = [];

	let isFirstNodeCommented = false;

	// Uncomment the comments that intersect with the selection.
	rootNode.comments.forEach(comment => {
		let commentStart = document.positionAt(comment.start);
		let commentEnd = document.positionAt(comment.end);

		if (!isFirstNodeCommented) {
			isFirstNodeCommented = (comment.start <= selectionStart && comment.end >= selectionEnd);
		}

		if (selection.contains(commentStart) || selection.contains(commentEnd) || (comment.start <= selectionStart && comment.end >= selectionEnd)) {
			rangesToUnComment.push(new vscode.Range(document.positionAt(comment.start), document.positionAt(comment.start + startCommentStylesheet.length)));
			rangesToUnComment.push(new vscode.Range(document.positionAt(comment.end), document.positionAt(comment.end - endCommentStylesheet.length)));
		}
	});

	let positionForCommentStart = isFirstNodeCommented ? null : document.positionAt(startNode.start);
	let positionForCommentEnd = isFirstNodeCommented ? null : document.positionAt(endNode.end);

	return [rangesToUnComment, positionForCommentStart, positionForCommentEnd];


}
