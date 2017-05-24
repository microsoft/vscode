/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNode, isStyleSheet } from './util';
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
	let offset = document.offsetAt(selection.start);
	let nodeToUpdate = getNode(rootNode, offset);

	let rangesToUnComment = getRangesToUnCommentHTML(nodeToUpdate, document);
	if (nodeToUpdate.type === 'comment') {
		return [rangesToUnComment, null, null];
	}

	let positionForCommentStart = document.positionAt(nodeToUpdate.start);
	let positionForCommentEnd = document.positionAt(nodeToUpdate.end);
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

	let selectionStart = document.offsetAt(selection.anchor);
	let selectionEnd = document.offsetAt(selection.active);

	// If current node is commented, then uncomment and return
	let rangesToUnComment = getRangesToUnCommentStylesheet(rootNode, selectionStart, selectionEnd, document, true);
	if (rangesToUnComment.length > 0) {
		return [rangesToUnComment, null, null];
	}

	// Uncomment children of current node and then comment the node
	let nodeToComment = getNode(rootNode, selectionStart);
	rangesToUnComment = getRangesToUnCommentStylesheet(rootNode, nodeToComment.start, nodeToComment.end, document, false);
	let positionForCommentStart = document.positionAt(nodeToComment.start);
	let positionForCommentEnd = document.positionAt(nodeToComment.end);

	return [rangesToUnComment, positionForCommentStart, positionForCommentEnd];
}

function getRangesToUnCommentStylesheet(rootNode: Node, selectionStart: number, selectionEnd: number, document: vscode.TextDocument, selectionInsideComment: boolean): vscode.Range[] {
	if (!rootNode.comments || rootNode.comments.length === 0) {
		return [];
	}

	let rangesToUnComment = [];
	rootNode.comments.forEach(comment => {
		let foundComment = false;
		if (selectionInsideComment) {
			foundComment = comment.start <= selectionStart && comment.end >= selectionEnd;
		} else {
			foundComment = selectionStart <= comment.start && selectionEnd >= comment.end;
		}

		if (foundComment) {
			rangesToUnComment.push(new vscode.Range(document.positionAt(comment.start), document.positionAt(comment.start + startCommentStylesheet.length)));
			rangesToUnComment.push(new vscode.Range(document.positionAt(comment.end), document.positionAt(comment.end - endCommentStylesheet.length)));
		}
	});

	return rangesToUnComment;
}