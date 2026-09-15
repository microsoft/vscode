/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { diffArrays } from 'diff';

import type { LineRange } from '../../../platform/languageContextProvider/common/regionContextProvider';

export interface LineChangeRanges {
	readonly added: readonly LineRange[];
	readonly changed: readonly LineRange[];
	readonly deleted: readonly LineRange[];
}

export function computeLineChangeRanges(original: string, modified: string): LineChangeRanges {
	const result: { added: LineRange[]; changed: LineRange[]; deleted: LineRange[] } = {
		added: [],
		changed: [],
		deleted: [],
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
				pushRange(result.changed, modifiedLine, modifiedLine + changedCount);
				pushRange(result.deleted, originalLine + changedCount, originalLine + count);
				pushRange(result.added, modifiedLine + changedCount, modifiedLine + addedCount);
				originalLine += count;
				modifiedLine += addedCount;
				index++;
			} else {
				pushRange(result.deleted, originalLine, originalLine + count);
				originalLine += count;
			}
		} else if (change.added) {
			pushRange(result.added, modifiedLine, modifiedLine + count);
			modifiedLine += count;
		} else {
			originalLine += count;
			modifiedLine += count;
		}
	}

	return result;
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
