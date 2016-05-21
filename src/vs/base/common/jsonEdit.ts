/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ParseError, parseTree, Segment, findNodeAtLocation } from 'vs/base/common/json';
import { Edit, FormattingOptions, format } from 'vs/base/common/jsonFormatter';

export function removeProperty(text: string, segments: Segment[], formattingOptions: FormattingOptions) : Edit[] {
	return setProperty(text, segments, void 0, formattingOptions);
}

export function setProperty(text: string, segments: Segment[], value: any, formattingOptions: FormattingOptions, getInsertionIndex?: (properties: string[]) => number) : Edit[] {
	let lastSegment = segments.pop();
	if (typeof lastSegment !== 'string') {
		throw new Error('Last segment must be a property name');
	}

	let errors: ParseError[] = [];
	let node = parseTree(text, errors);
	if (segments.length > 0) {
		node = findNodeAtLocation(node, segments);
		if (node === void 0) {
			throw new Error('Cannot find object');
		}
	}
	if (node && node.type === 'object') {
		let existing = findNodeAtLocation(node, [ lastSegment ]);
		if (existing !== void 0) {
			if (value === void 0) { // delete
				let propertyIndex = node.children.indexOf(existing.parent);
				let removeBegin : number;
				let removeEnd = existing.parent.offset + existing.parent.length;
				if (propertyIndex > 0) {
					// remove the comma of the previous node
					let previous = node.children[propertyIndex - 1];
					removeBegin = previous.offset + previous.length;
				} else {
					removeBegin = node.offset + 1;
					if (node.children.length > 1) {
						// remove the comma of the next node
						let next = node.children[1];
						removeEnd = next.offset;
					}
				}
				return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: '' }, formattingOptions);
			} else {
				// set value of existing property
				return [{ offset: existing.offset, length: existing.length, content: JSON.stringify(value) }];
			}
		} else {
			if (value === void 0) { // delete
				throw new Error(`Property ${lastSegment} does not exist.`);
			}
			let newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
			let index = getInsertionIndex ? getInsertionIndex(node.children.map(p => p.children[0].value)) : node.children.length;
			let edit: Edit;
			if (index > 0) {
				let previous = node.children[index - 1];
				edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty};
			} else if (node.children.length === 0) {
				edit = { offset: node.offset + 1, length: 0, content: newProperty};
			} else {
				edit = { offset: node.offset + 1, length: 0, content: newProperty + ','};
			}
			return withFormatting(text, edit, formattingOptions);
		}
	} else {
		throw new Error('Path does not reference an object');
	}
}

function withFormatting(text:string, edit: Edit, formattingOptions: FormattingOptions) : Edit[] {
	// apply the edit
	let newText = text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);

	// format the new text
	let begin = edit.offset;
	let end = edit.offset + edit.content.length;
	let edits = format(newText, { offset: begin, length: end - begin }, formattingOptions);

	// apply the formatting edits and track the begin and end offsets of the changes
	for (let i = edits.length - 1; i >= 0; i--) {
		let edit = edits[i];
		newText = newText.substring(0, edit.offset) + edit.content + newText.substring(edit.offset + edit.length);
		begin = Math.min(begin, edit.offset);
		end = Math.max(end, edit.offset + edit.length);
		end += edit.content.length - edit.length;
	}
	// create a single edit with all changes
	let editLength = text.length - (newText.length - end) - begin;
	return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
