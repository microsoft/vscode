/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ParseError, Node, parseTree, findNodeAtLocation, JSONPath, Segment } from 'vs/base/common/json';
import { Edit, FormattingOptions, format, applyEdit } from 'vs/base/common/jsonFormatter';

export function removeProperty(text: string, path: JSONPath, formattingOptions: FormattingOptions): Edit[] {
	return setProperty(text, path, void 0, formattingOptions);
}

export function setProperty(text: string, path: JSONPath, value: any, formattingOptions: FormattingOptions, getInsertionIndex?: (properties: string[]) => number): Edit[] {
	let errors: ParseError[] = [];
	let root = parseTree(text, errors);
	let parent: Node = void 0;

	let lastSegment: Segment = void 0;
	while (path.length > 0) {
		lastSegment = path.pop();
		parent = findNodeAtLocation(root, path);
		if (parent === void 0 && value !== void 0) {
			if (typeof lastSegment === 'string') {
				value = { [lastSegment]: value };
			} else {
				value = [value];
			}
		} else {
			break;
		}
	}

	if (!parent) {
		// empty document
		if (value === void 0) { // delete
			throw new Error('Can not delete in empty document');
		}
		return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, formattingOptions);
	} else if (parent.type === 'object' && typeof lastSegment === 'string') {
		let existing = findNodeAtLocation(parent, [lastSegment]);
		if (existing !== void 0) {
			if (value === void 0) { // delete
				let propertyIndex = parent.children.indexOf(existing.parent);
				let removeBegin: number;
				let removeEnd = existing.parent.offset + existing.parent.length;
				if (propertyIndex > 0) {
					// remove the comma of the previous node
					let previous = parent.children[propertyIndex - 1];
					removeBegin = previous.offset + previous.length;
				} else {
					removeBegin = parent.offset + 1;
					if (parent.children.length > 1) {
						// remove the comma of the next node
						let next = parent.children[1];
						removeEnd = next.offset;
					}
				}
				return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: '' }, formattingOptions);
			} else {
				// set value of existing property
				return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, formattingOptions);
			}
		} else {
			if (value === void 0) { // delete
				throw new Error(`Property ${lastSegment} does not exist.`);
			}
			let newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
			let index = getInsertionIndex ? getInsertionIndex(parent.children.map(p => p.children[0].value)) : parent.children.length;
			let edit: Edit;
			if (index > 0) {
				let previous = parent.children[index - 1];
				edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty };
			} else if (parent.children.length === 0) {
				edit = { offset: parent.offset + 1, length: 0, content: newProperty };
			} else {
				edit = { offset: parent.offset + 1, length: 0, content: newProperty + ',' };
			}
			return withFormatting(text, edit, formattingOptions);
		}
	} else if (parent.type === 'array' && typeof lastSegment === 'number') {
		throw new Error('Array modification not supported yet');
	} else {
		throw new Error(`Can not add ${typeof lastSegment !== 'number' ? 'index' : 'property'} to parent of type ${parent.type}`);
	}
}

function withFormatting(text: string, edit: Edit, formattingOptions: FormattingOptions): Edit[] {
	// apply the edit
	let newText = applyEdit(text, edit);

	// format the new text
	let begin = edit.offset;
	let end = edit.offset + edit.content.length;
	let edits = format(newText, { offset: begin, length: end - begin }, formattingOptions);

	// apply the formatting edits and track the begin and end offsets of the changes
	for (let i = edits.length - 1; i >= 0; i--) {
		let edit = edits[i];
		newText = applyEdit(newText, edit);
		begin = Math.min(begin, edit.offset);
		end = Math.max(end, edit.offset + edit.length);
		end += edit.content.length - edit.length;
	}
	// create a single edit with all changes
	let editLength = text.length - (newText.length - end) - begin;
	return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}