/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getNodesInBetween, getFlatNode, getHtmlFlatNode, sameNodes, isStyleSheet, validate, offsetRangeToVsRange, offsetRangeToSelection } from './util';
import { Node, Stylesheet, Rule } from 'EmmetFlatNode';
import parseStylesheet from '@emmetio/css-parser';
import { getRootNode } from './parseDocument';

let startCommentStylesheet: string;
let endCommentStylesheet: string;
let startCommentHTML: string;
let endCommentHTML: string;

export function toggleComment(): Thenable<boolean> | undefined {
	if (!validate() || !vscode.window.activeTextEditor) {
		return;
	}
	setupCommentSpacing();

	const editor = vscode.window.activeTextEditor;
	const rootNode = getRootNode(editor.document, true);
	if (!rootNode) {
		return;
	}

	return editor.edit(editBuilder => {
		let allEdits: vscode.TextEdit[][] = [];
		editor.selections.reverse().forEach(selection => {
			const edits = isStyleSheet(editor.document.languageId) ? toggleCommentStylesheet(editor.document, selection, <Stylesheet>rootNode) : toggleCommentHTML(editor.document, selection, rootNode!);
			if (edits.length > 0) {
				allEdits.push(edits);
			}
		});

		// Apply edits in order so we can skip nested ones.
		allEdits.sort((arr1, arr2) => {
			let result = arr1[0].range.start.line - arr2[0].range.start.line;
			return result === 0 ? arr1[0].range.start.character - arr2[0].range.start.character : result;
		});
		let lastEditPosition = new vscode.Position(0, 0);
		for (const edits of allEdits) {
			if (edits[0].range.end.isAfterOrEqual(lastEditPosition)) {
				edits.forEach(x => {
					editBuilder.replace(x.range, x.newText);
					lastEditPosition = x.range.end;
				});
			}
		}
	});
}

function toggleCommentHTML(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.TextEdit[] {
	const selectionStart = selection.isReversed ? selection.active : selection.anchor;
	const selectionEnd = selection.isReversed ? selection.anchor : selection.active;
	const selectionStartOffset = document.offsetAt(selectionStart);
	const selectionEndOffset = document.offsetAt(selectionEnd);
	const documentText = document.getText();

	const startNode = getHtmlFlatNode(documentText, rootNode, selectionStartOffset, true);
	const endNode = getHtmlFlatNode(documentText, rootNode, selectionEndOffset, true);

	if (!startNode || !endNode) {
		return [];
	}

	if (sameNodes(startNode, endNode) && startNode.name === 'style'
		&& startNode.open && startNode.close
		&& startNode.open.end < selectionStartOffset
		&& startNode.close.start > selectionEndOffset) {
		const buffer = ' '.repeat(startNode.open.end) +
			documentText.substring(startNode.open.end, startNode.close.start);
		const cssRootNode = parseStylesheet(buffer);
		return toggleCommentStylesheet(document, selection, cssRootNode);
	}

	let allNodes: Node[] = getNodesInBetween(startNode, endNode);
	let edits: vscode.TextEdit[] = [];

	allNodes.forEach(node => {
		edits = edits.concat(getRangesToUnCommentHTML(node, document));
	});

	if (startNode.type === 'comment') {
		return edits;
	}


	edits.push(new vscode.TextEdit(offsetRangeToVsRange(document, allNodes[0].start, allNodes[0].start), startCommentHTML));
	edits.push(new vscode.TextEdit(offsetRangeToVsRange(document, allNodes[allNodes.length - 1].end, allNodes[allNodes.length - 1].end), endCommentHTML));

	return edits;
}

function getRangesToUnCommentHTML(node: Node, document: vscode.TextDocument): vscode.TextEdit[] {
	let unCommentTextEdits: vscode.TextEdit[] = [];

	// If current node is commented, then uncomment and return
	if (node.type === 'comment') {
		unCommentTextEdits.push(new vscode.TextEdit(offsetRangeToVsRange(document, node.start, node.start + startCommentHTML.length), ''));
		unCommentTextEdits.push(new vscode.TextEdit(offsetRangeToVsRange(document, node.end - endCommentHTML.length, node.end), ''));
		return unCommentTextEdits;
	}

	// All children of current node should be uncommented
	node.children.forEach(childNode => {
		unCommentTextEdits = unCommentTextEdits.concat(getRangesToUnCommentHTML(childNode, document));
	});

	return unCommentTextEdits;
}

function toggleCommentStylesheet(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Stylesheet): vscode.TextEdit[] {
	const selectionStart = selection.isReversed ? selection.active : selection.anchor;
	const selectionEnd = selection.isReversed ? selection.anchor : selection.active;
	let selectionStartOffset = document.offsetAt(selectionStart);
	let selectionEndOffset = document.offsetAt(selectionEnd);

	const startNode = getFlatNode(rootNode, selectionStartOffset, true);
	const endNode = getFlatNode(rootNode, selectionEndOffset, true);

	if (!selection.isEmpty) {
		selectionStartOffset = adjustStartNodeCss(startNode, selectionStartOffset, rootNode);
		selectionEndOffset = adjustEndNodeCss(endNode, selectionEndOffset, rootNode);
		selection = offsetRangeToSelection(document, selectionStartOffset, selectionEndOffset);
	} else if (startNode) {
		selectionStartOffset = startNode.start;
		selectionEndOffset = startNode.end;
		selection = offsetRangeToSelection(document, selectionStartOffset, selectionEndOffset);
	}

	// Uncomment the comments that intersect with the selection.
	let rangesToUnComment: vscode.Range[] = [];
	let edits: vscode.TextEdit[] = [];
	rootNode.comments.forEach(comment => {
		const commentRange = offsetRangeToVsRange(document, comment.start, comment.end);
		if (selection.intersection(commentRange)) {
			rangesToUnComment.push(commentRange);
			edits.push(new vscode.TextEdit(offsetRangeToVsRange(document, comment.start, comment.start + startCommentStylesheet.length), ''));
			edits.push(new vscode.TextEdit(offsetRangeToVsRange(document, comment.end - endCommentStylesheet.length, comment.end), ''));
		}
	});

	if (edits.length > 0) {
		return edits;
	}

	return [
		new vscode.TextEdit(new vscode.Range(selection.start, selection.start), startCommentStylesheet),
		new vscode.TextEdit(new vscode.Range(selection.end, selection.end), endCommentStylesheet)
	];
}

function setupCommentSpacing() {
	const config: boolean | undefined = vscode.workspace.getConfiguration('editor.comments').get('insertSpace');
	if (config) {
		startCommentStylesheet = '/* ';
		endCommentStylesheet = ' */';
		startCommentHTML = '<!-- ';
		endCommentHTML = ' -->';
	} else {
		startCommentStylesheet = '/*';
		endCommentStylesheet = '*/';
		startCommentHTML = '<!--';
		endCommentHTML = '-->';
	}
}

function adjustStartNodeCss(node: Node | undefined, offset: number, rootNode: Stylesheet): number {
	for (const comment of rootNode.comments) {
		if (comment.start <= offset && offset <= comment.end) {
			return offset;
		}
	}

	if (!node) {
		return offset;
	}

	if (node.type === 'property') {
		return node.start;
	}

	const rule = <Rule>node;
	if (offset < rule.contentStartToken.end || !rule.firstChild) {
		return rule.start;
	}

	if (offset < rule.firstChild.start) {
		return offset;
	}

	let newStartNode = rule.firstChild;
	while (newStartNode.nextSibling && offset > newStartNode.end) {
		newStartNode = newStartNode.nextSibling;
	}

	return newStartNode.start;
}

function adjustEndNodeCss(node: Node | undefined, offset: number, rootNode: Stylesheet): number {
	for (const comment of rootNode.comments) {
		if (comment.start <= offset && offset <= comment.end) {
			return offset;
		}
	}

	if (!node) {
		return offset;
	}

	if (node.type === 'property') {
		return node.end;
	}

	const rule = <Rule>node;
	if (offset === rule.contentEndToken.end || !rule.firstChild) {
		return rule.end;
	}

	if (offset > rule.children[rule.children.length - 1].end) {
		return offset;
	}

	let newEndNode = rule.children[rule.children.length - 1];
	while (newEndNode.previousSibling && offset < newEndNode.start) {
		newEndNode = newEndNode.previousSibling;
	}

	return newEndNode.end;
}


