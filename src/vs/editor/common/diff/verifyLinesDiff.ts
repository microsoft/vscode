/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayText } from '../core/text/abstractText.js';
import { LinesDiff } from './linesDiffComputer.js';
import { DetailedLineRangeMapping } from './rangeMapping.js';

/**
 * Whether a diff is correct: applying its inner changes to the original reproduces the modified text.
 * `unverified` if the diff has changes without inner changes, which cannot be checked.
 */
export type LinesDiffValidity = 'valid' | 'invalid' | 'unverified';

/**
 * Checks that applying the inner changes of `diff` to the original reproduces the modified text.
 * When trim whitespace is ignored, lines only need to agree after trimming.
 */
export function verifyLinesDiff(diff: LinesDiff, originalLines: string[], modifiedLines: string[], ignoreTrimWhitespace: boolean): LinesDiffValidity {
	if (diff.changes.some(c => !c.innerChanges)) {
		return 'unverified';
	}
	try {
		const edit = DetailedLineRangeMapping.toTextEdit(diff.changes, new ArrayText(modifiedLines));
		const actual = edit.normalize().apply(new ArrayText(originalLines));
		if (!ignoreTrimWhitespace) {
			return actual === modifiedLines.join('\n') ? 'valid' : 'invalid';
		}
		const actualLines = actual.split('\n');
		return actualLines.length === modifiedLines.length && actualLines.every((line, i) => line.trim() === modifiedLines[i].trim()) ? 'valid' : 'invalid';
	} catch {
		return 'invalid';
	}
}
