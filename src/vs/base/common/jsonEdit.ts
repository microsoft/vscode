/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findNodeAtLocation, JSONPath, Node, ParseError, parseTree, Segment } from './json.js';
import { Edit, format, FormattingOptions, isEOL } from './jsonFormatter.js';


export function removeProperty(text: string, path: JSONPath, formattingOptions: FormattingOptions): Edit[] {
	return setProperty(text, path, undefined, formattingOptions);
}

export function setProperty(text: string, originalPath: JSONPath, value: unknown, formattingOptions: FormattingOptions, getInsertionIndex?: (properties: string[]) => number): Edit[] {
	const path = originalPath.slice();
	const errors: ParseError[] = [];
	const root = parseTree(text, errors);
	let parent: Node | undefined = undefined;

	let lastSegment: Segment | undefined = undefined;
	while (path.length > 0) {
		lastSegment = path.pop();
		parent = findNodeAtLocation(root, path);
		if (parent === undefined && value !== undefined) {
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
		if (value === undefined) { // delete
			return []; // property does not exist, nothing to do
		}
		return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, formattingOptions);
	} else if (parent.type === 'object' && typeof lastSegment === 'string' && Array.isArray(parent.children)) {
		const existing = findNodeAtLocation(parent, [lastSegment]);
		if (existing !== undefined) {
			if (value === undefined) { // delete
				if (!existing.parent) {
					throw new Error('Malformed AST');
				}
				const propertyIndex = parent.children.indexOf(existing.parent);
				let removeBegin: number;
				let removeEnd = existing.parent.offset + existing.parent.length;

				// Find the start of the line that contains the property being deleted,
				// including the newline that precedes it. This ensures that a comment
				// placed on the line immediately above the property is not accidentally
				// deleted alongside it.
				const propOffset = existing.parent.offset;
				let propLineStart = propOffset;
				while (propLineStart > 0 && text[propLineStart - 1] !== '\n') {
					propLineStart--;
				}
				// Include the preceding newline so the removed line doesn't leave a blank line
				const propLineWithNewline = propLineStart > 0 ? propLineStart - 1 : propLineStart;

				if (propertyIndex > 0) {
					const previous = parent.children[propertyIndex - 1];
					const commaOffset = previous.offset + previous.length;
					if (propLineWithNewline > commaOffset) {
						// There is content (e.g. a comment) between the previous property and
						// the property being deleted. Use two edits to preserve that content:
						// 1. Remove the trailing comma of the previous property.
						// 2. Remove the property's own line (including its trailing comma for
						//    middle properties, so the JSON remains valid).
						let lineRemoveEnd = removeEnd;
						if (lineRemoveEnd < text.length && text[lineRemoveEnd] === ',') {
							lineRemoveEnd++; // include trailing comma of a middle property
						}
						const commaEdit: Edit = { offset: commaOffset, length: 1, content: '' };
						const lineEdit: Edit = { offset: propLineWithNewline, length: lineRemoveEnd - propLineWithNewline, content: '' };
						// Return higher-offset edit first so that applyEdits can apply them
						// right-to-left without offset interference.
						return [
							...withFormatting(text, lineEdit, formattingOptions),
							...withFormatting(text, commaEdit, formattingOptions)
						];
					}
					// No gap — use the original single-range approach
					removeBegin = commaOffset;
				} else {
					removeBegin = propLineWithNewline > parent.offset + 1 ? propLineWithNewline : parent.offset + 1;
					if (parent.children.length > 1) {
						// remove the comma of the next node
						const next = parent.children[1];
						removeEnd = next.offset;
					}
				}
				return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: '' }, formattingOptions);
			} else {
				// set value of existing property
				return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, formattingOptions);
			}
		} else {
			if (value === undefined) { // delete
				return []; // property does not exist, nothing to do
			}
			const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
			const index = getInsertionIndex ? getInsertionIndex(parent.children.map(p => p.children![0].value)) : parent.children.length;
			let edit: Edit;
			if (index > 0) {
				const previous = parent.children[index - 1];
				edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty };
			} else if (parent.children.length === 0) {
				edit = { offset: parent.offset + 1, length: 0, content: newProperty };
			} else {
				edit = { offset: parent.offset + 1, length: 0, content: newProperty + ',' };
			}
			return withFormatting(text, edit, formattingOptions);
		}
	} else if (parent.type === 'array' && typeof lastSegment === 'number' && Array.isArray(parent.children)) {
		if (value !== undefined) {
			// Insert
			const newProperty = `${JSON.stringify(value)}`;
			let edit: Edit;
			if (parent.children.length === 0 || lastSegment === 0) {
				edit = { offset: parent.offset + 1, length: 0, content: parent.children.length === 0 ? newProperty : newProperty + ',' };
			} else {
				const index = lastSegment === -1 || lastSegment > parent.children.length ? parent.children.length : lastSegment;
				const previous = parent.children[index - 1];
				edit = { offset: previous.offset + previous.length, length: 0, content: ',' + newProperty };
			}
			return withFormatting(text, edit, formattingOptions);
		} else {
			//Removal
			const removalIndex = lastSegment;
			const toRemove = parent.children[removalIndex];
			let edit: Edit;
			if (parent.children.length === 1) {
				// only item
				edit = { offset: parent.offset + 1, length: parent.length - 2, content: '' };
			} else if (parent.children.length - 1 === removalIndex) {
				// last item
				const previous = parent.children[removalIndex - 1];
				const offset = previous.offset + previous.length;
				const parentEndOffset = parent.offset + parent.length;
				edit = { offset, length: parentEndOffset - 2 - offset, content: '' };
			} else {
				edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: '' };
			}
			return withFormatting(text, edit, formattingOptions);
		}
	} else {
		throw new Error(`Can not add ${typeof lastSegment !== 'number' ? 'index' : 'property'} to parent of type ${parent.type}`);
	}
}

export function withFormatting(text: string, edit: Edit, formattingOptions: FormattingOptions): Edit[] {
	// apply the edit
	let newText = applyEdit(text, edit);

	// format the new text
	let begin = edit.offset;
	let end = edit.offset + edit.content.length;
	if (edit.length === 0 || edit.content.length === 0) { // insert or remove
		while (begin > 0 && !isEOL(newText, begin - 1)) {
			begin--;
		}
		while (end < newText.length && !isEOL(newText, end)) {
			end++;
		}
	}

	const edits = format(newText, { offset: begin, length: end - begin }, formattingOptions);

	// apply the formatting edits and track the begin and end offsets of the changes
	for (let i = edits.length - 1; i >= 0; i--) {
		const curr = edits[i];
		newText = applyEdit(newText, curr);
		begin = Math.min(begin, curr.offset);
		end = Math.max(end, curr.offset + curr.length);
		end += curr.content.length - curr.length;
	}
	// create a single edit with all changes
	const editLength = text.length - (newText.length - end) - begin;
	return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}

export function applyEdit(text: string, edit: Edit): string {
	return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}

export function applyEdits(text: string, edits: Edit[]): string {
	const sortedEdits = edits.slice(0).sort((a, b) => {
		const diff = a.offset - b.offset;
		if (diff === 0) {
			return a.length - b.length;
		}
		return diff;
	});
	let lastModifiedOffset = text.length;
	for (let i = sortedEdits.length - 1; i >= 0; i--) {
		const e = sortedEdits[i];
		if (e.offset + e.length <= lastModifiedOffset) {
			text = applyEdit(text, e);
		} else {
			throw new Error('Overlapping edit');
		}
		lastModifiedOffset = e.offset;
	}
	return text;
}
