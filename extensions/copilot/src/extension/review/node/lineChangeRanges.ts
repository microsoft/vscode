/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { diffArrays } from 'diff';

import type { LineRange } from '../../../platform/languageContextProvider/common/regionContextProvider';

export interface LineChangeRanges {
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
	readonly originalChanged: readonly LineRange[];
	readonly deleted: readonly LineRange[];
	readonly operations: readonly LineChangeOperation[];
}

export interface LineChangeOperation {
	readonly id: string;
	readonly changeType: 'added' | 'changed' | 'deleted';
	readonly original: LineRange;
	readonly modified: LineRange;
}

export function computeLineChangeRanges(original: string, modified: string): LineChangeRanges {
	const result: { added: LineRange[]; changed: LineRange[]; originalChanged: LineRange[]; deleted: LineRange[]; operations: LineChangeOperation[] } = {
		added: [],
		changed: [],
		originalChanged: [],
		deleted: [],
		operations: [],
	};
	const changes = diffArrays(splitLines(original), splitLines(modified));
	let originalLine = 0;
	let modifiedLine = 0;

	for (let index = 0; index < changes.length; index++) {
		const change = changes[index];
		const count = change.value.length;
		if (change.removed) {
			const added = changes[index + 1];
			if (added?.added) {
				const addedCount = added.value.length;
				const changedCount = Math.min(count, addedCount);
				addOperation(result, 'changed', { start: originalLine, end: originalLine + changedCount }, { start: modifiedLine, end: modifiedLine + changedCount });
				addOperation(result, 'deleted', { start: originalLine + changedCount, end: originalLine + count }, { start: modifiedLine + changedCount, end: modifiedLine + changedCount });
				addOperation(result, 'added', { start: originalLine + changedCount, end: originalLine + changedCount }, { start: modifiedLine + changedCount, end: modifiedLine + addedCount });
				originalLine += count;
				modifiedLine += addedCount;
				index++;
			} else {
				addOperation(result, 'deleted', { start: originalLine, end: originalLine + count }, { start: modifiedLine, end: modifiedLine });
				originalLine += count;
			}
		} else if (change.added) {
			addOperation(result, 'added', { start: originalLine, end: originalLine }, { start: modifiedLine, end: modifiedLine + count });
			modifiedLine += count;
		} else {
			originalLine += count;
			modifiedLine += count;
		}
	}

	return result;
}

function addOperation(
	result: { added: LineRange[]; changed: LineRange[]; originalChanged: LineRange[]; deleted: LineRange[]; operations: LineChangeOperation[] },
	changeType: LineChangeOperation['changeType'],
	original: LineRange,
	modified: LineRange,
): void {
	const range = changeType === 'deleted' ? original : modified;
	if (range.start === range.end) {
		return;
	}
	result.operations.push({
		id: `${changeType}:${original.start}:${original.end}:${modified.start}:${modified.end}`,
		changeType,
		original,
		modified,
	});
	switch (changeType) {
		case 'added':
			pushRange(result.added, modified.start, modified.end);
			break;
		case 'changed':
			pushRange(result.originalChanged, original.start, original.end);
			pushRange(result.changed, modified.start, modified.end);
			break;
		case 'deleted':
			pushRange(result.deleted, original.start, original.end);
			break;
	}
}

function splitLines(content: string): string[] {
	if (content.length === 0) {
		return [];
	}
	const lines = content.split(/\r\n|\r|\n/);
	if (lines[lines.length - 1] === '') {
		lines.pop();
	}
	return lines;
}

function pushRange(ranges: LineRange[], start: number, end: number): void {
	if (start === end) {
		return;
	}
	const previous = ranges[ranges.length - 1];
	if (previous?.end === start) {
		previous.end = end;
	} else {
		ranges.push({ start, end });
	}
}
