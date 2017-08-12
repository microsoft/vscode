/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on @sergeche's work on the emmet plugin for atom

'use strict';

import { TextEditor, Range, Position, window, TextEdit } from 'vscode';
import * as path from 'path';
import { getImageSize } from './imageSizeHelper';
import { isStyleSheet } from 'vscode-emmet-helper';
import { parseDocument, getNode, iterateCSSToken, getCssPropertyFromRule } from './util';
import { HtmlNode, CssToken, HtmlToken, Attribute, Property } from 'EmmetNode';
import { locateFile } from './locateFile';
import parseStylesheet from '@emmetio/css-parser';
import { DocumentStreamReader } from './bufferStream';

/**
 * Updates size of context image in given editor
 */
export function updateImageSize() {
	let editor = window.activeTextEditor;
	if (!editor) {
		window.showInformationMessage('No editor is active.');
		return;
	}

	let allUpdatesPromise = editor.selections.reverse().map(selection => {
		let position = selection.isReversed ? selection.active : selection.anchor;
		if (!isStyleSheet(editor.document.languageId)) {
			return updateImageSizeHTML(editor, position);
		} else {
			return updateImageSizeCSSFile(editor, position);
		}
	});

	return Promise.all(allUpdatesPromise).then((updates) => {
		return editor.edit(builder => {
			updates.forEach(update => {
				update.forEach((textEdit: TextEdit) => {
					builder.replace(textEdit.range, textEdit.newText);
				});
			});
		});
	});
}

/**
 * Updates image size of context tag of HTML model
 */
function updateImageSizeHTML(editor: TextEditor, position: Position): Promise<TextEdit[]> {
	const src = getImageSrcHTML(getImageHTMLNode(editor, position));

	if (!src) {
		return updateImageSizeStyleTag(editor, position);
	}

	return locateFile(path.dirname(editor.document.fileName), src)
		.then(getImageSize)
		.then((size: any) => {
			// since this action is asynchronous, we have to ensure that editor wasn’t
			// changed and user didn’t moved caret outside <img> node
			const img = getImageHTMLNode(editor, position);
			if (getImageSrcHTML(img) === src) {
				return updateHTMLTag(editor, img, size.width, size.height);
			}
		})
		.catch(err => { console.warn('Error while updating image size:', err); return []; });
}

function updateImageSizeStyleTag(editor: TextEditor, position: Position): Promise<TextEdit[]> {
	let getPropertyInsiderStyleTag = (editor) => {
		const rootNode = parseDocument(editor.document);
		const currentNode = <HtmlNode>getNode(rootNode, position);
		if (currentNode && currentNode.name === 'style'
			&& currentNode.open.end.isBefore(position)
			&& currentNode.close.start.isAfter(position)) {
			let buffer = new DocumentStreamReader(editor.document, currentNode.open.end, new Range(currentNode.open.end, currentNode.close.start));
			let rootNode = parseStylesheet(buffer);
			const node = getNode(rootNode, position);
			return (node && node.type === 'property') ? <Property>node : null;
		}
	};

	return updateImageSizeCSS(editor, position, getPropertyInsiderStyleTag);
}

function updateImageSizeCSSFile(editor: TextEditor, position: Position): Promise<TextEdit[]> {
	return updateImageSizeCSS(editor, position, getImageCSSNode);
}

/**
 * Updates image size of context rule of stylesheet model
 */
function updateImageSizeCSS(editor: TextEditor, position: Position, fetchNode: (editor, position) => Property): Promise<TextEdit[]> {

	const src = getImageSrcCSS(fetchNode(editor, position), position);

	if (!src) {
		return Promise.reject(new Error('No valid image source'));
	}

	return locateFile(path.dirname(editor.document.fileName), src)
		.then(getImageSize)
		.then((size: any) => {
			// since this action is asynchronous, we have to ensure that editor wasn’t
			// changed and user didn’t moved caret outside <img> node
			const prop = fetchNode(editor, position);
			if (getImageSrcCSS(prop, position) === src) {
				return updateCSSNode(editor, prop, size.width, size.height);
			}
		})
		.catch(err => { console.warn('Error while updating image size:', err); return []; });
}

/**
 * Returns <img> node under caret in given editor or `null` if such node cannot
 * be found
 * @param  {TextEditor}  editor
 * @return {HtmlNode}
 */
function getImageHTMLNode(editor: TextEditor, position: Position): HtmlNode {
	const rootNode = parseDocument(editor.document);
	const node = <HtmlNode>getNode(rootNode, position, true);

	return node && node.name.toLowerCase() === 'img' ? node : null;
}

/**
 * Returns css property under caret in given editor or `null` if such node cannot
 * be found
 * @param  {TextEditor}  editor
 * @return {Property}
 */
function getImageCSSNode(editor: TextEditor, position: Position): Property {
	const rootNode = parseDocument(editor.document);
	const node = getNode(rootNode, position, true);
	return node && node.type === 'property' ? <Property>node : null;
}

/**
 * Returns image source from given <img> node
 * @param  {HtmlNode} node
 * @return {string}
 */
function getImageSrcHTML(node: HtmlNode): string {
	const srcAttr = getAttribute(node, 'src');
	if (!srcAttr) {
		return;
	}

	return (<HtmlToken>srcAttr.value).value;
}

/**
 * Returns image source from given `url()` token
 * @param  {Property} node
 * @param {Position}
 * @return {string}
 */
function getImageSrcCSS(node: Property, position: Position): string {
	if (!node) {
		return;
	}
	const urlToken = findUrlToken(node, position);
	if (!urlToken) {
		return;
	}

	// A stylesheet token may contain either quoted ('string') or unquoted URL
	let urlValue = urlToken.item(0);
	if (urlValue && urlValue.type === 'string') {
		urlValue = urlValue.item(0);
	}

	return urlValue && urlValue.valueOf();
}

/**
 * Updates size of given HTML node
 * @param  {TextEditor} editor
 * @param  {HtmlNode}   node
 * @param  {number}     width
 * @param  {number}     height
 */
function updateHTMLTag(editor: TextEditor, node: HtmlNode, width: number, height: number): TextEdit[] {
	const srcAttr = getAttribute(node, 'src');
	const widthAttr = getAttribute(node, 'width');
	const heightAttr = getAttribute(node, 'height');
	const quote = getAttributeQuote(editor, srcAttr);
	const endOfAttributes = node.attributes[node.attributes.length - 1].end;

	let edits: TextEdit[] = [];
	let textToAdd = '';

	if (!widthAttr) {
		textToAdd += ` width=${quote}${width}${quote}`;
	} else {
		edits.push(new TextEdit(new Range(widthAttr.value.start, widthAttr.value.end), String(width)));
	}
	if (!heightAttr) {
		textToAdd += ` height=${quote}${height}${quote}`;
	} else {
		edits.push(new TextEdit(new Range(heightAttr.value.start, heightAttr.value.end), String(height)));
	}
	if (textToAdd) {
		edits.push(new TextEdit(new Range(endOfAttributes, endOfAttributes), textToAdd));
	}

	return edits;
}

/**
 * Updates size of given CSS rule
 * @param  {TextEditor} editor
 * @param  {Property}   srcProp
 * @param  {number}     width
 * @param  {number}     height
 */
function updateCSSNode(editor: TextEditor, srcProp: Property, width: number, height: number): TextEdit[] {
	const rule = srcProp.parent;
	const widthProp = getCssPropertyFromRule(rule, 'width');
	const heightProp = getCssPropertyFromRule(rule, 'height');

	// Detect formatting
	const separator = srcProp.separator || ': ';
	const before = getPropertyDelimitor(editor, srcProp);

	let edits: TextEdit[] = [];
	if (!srcProp.terminatorToken) {
		edits.push(new TextEdit(new Range(srcProp.end, srcProp.end), ';'));
	}

	let textToAdd = '';
	if (!widthProp) {
		textToAdd += `${before}width${separator}${width}px;`;
	} else {
		edits.push(new TextEdit(new Range(widthProp.valueToken.start, widthProp.valueToken.end), `${width}px`));
	}
	if (!heightProp) {
		textToAdd += `${before}height${separator}${height}px;`;
	} else {
		edits.push(new TextEdit(new Range(heightProp.valueToken.start, heightProp.valueToken.end), `${height}px`));
	}
	if (textToAdd) {
		edits.push(new TextEdit(new Range(srcProp.end, srcProp.end), textToAdd));
	}

	return edits;
}

/**
 * Returns attribute object with `attrName` name from given HTML node
 * @param  {Node} node
 * @param  {String} attrName
 * @return {Object}
 */
function getAttribute(node, attrName): Attribute {
	attrName = attrName.toLowerCase();
	return node && node.open.attributes.find(attr => attr.name.value.toLowerCase() === attrName);
}

/**
 * Returns quote character, used for value of given attribute. May return empty
 * string if attribute wasn’t quoted
 * @param  {TextEditor} editor
 * @param  {Object} attr
 * @return {String}
 */
function getAttributeQuote(editor, attr) {
	const range = new Range(attr.value ? attr.value.end : attr.end, attr.end);
	return range.isEmpty ? '' : editor.document.getText(range);
}

/**
 * Finds 'url' token for given `pos` point in given CSS property `node`
 * @param  {Node}  node
 * @param  {Position} pos
 * @return {Token}
 */
function findUrlToken(node, pos: Position) {
	for (let i = 0, il = node.parsedValue.length, url; i < il; i++) {
		iterateCSSToken(node.parsedValue[i], (token: CssToken) => {
			if (token.type === 'url' && token.start.isBeforeOrEqual(pos) && token.end.isAfterOrEqual(pos)) {
				url = token;
				return false;
			}
		});

		if (url) {
			return url;
		}
	}
}

/**
 * Returns a string that is used to delimit properties in current node’s rule
 * @param  {TextEditor} editor
 * @param  {Property}       node
 * @return {String}
 */
function getPropertyDelimitor(editor: TextEditor, node: Property) {
	let anchor;
	if (anchor = (node.previousSibling || node.parent.contentStartToken)) {
		return editor.document.getText(new Range(anchor.end, node.start));
	} else if (anchor = (node.nextSibling || node.parent.contentEndToken)) {
		return editor.document.getText(new Range(node.end, anchor.start));
	}

	return '';
}

