/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';

/**
 * Range a DAP completion item replaces in the REPL input, or undefined if the editor cannot apply it (it must be a
 * single range on the cursor line starting at or before the cursor). The range always extends at least to the cursor,
 * since the suggest widget replaces the typed prefix.
 */
export function getReplCompletionRange(model: ITextModel, position: Position, item: Pick<DebugProtocol.CompletionItem, 'start' | 'length'>): Range | undefined {
	if (typeof item.start === 'number') {
		const start = model.getPositionAt(item.start);
		const end = model.getPositionAt(item.start + (item.length ?? 0));
		if (start.lineNumber !== position.lineNumber || end.lineNumber !== position.lineNumber || start.column > position.column) {
			return undefined;
		}

		return new Range(position.lineNumber, start.column, position.lineNumber, Math.max(end.column, position.column));
	}

	return new Range(position.lineNumber, Math.max(1, position.column - (item.length ?? 0)), position.lineNumber, position.column);
}

/** Edit that completes the REPL input with a history entry, or undefined if the entry doesn't continue the lines before the cursor's line. */
export function getReplHistoryCompletion(model: ITextModel, position: Position, entry: string): { insertText: string; range: Range } | undefined {
	let prefix = '';
	for (let lineNumber = 1; lineNumber < position.lineNumber; lineNumber++) {
		prefix += model.getLineContent(lineNumber) + '\n';
	}

	const normalizedEntry = entry.replace(/\r\n/g, '\n');
	if (!normalizedEntry.startsWith(prefix)) {
		return undefined;
	}

	return {
		insertText: normalizedEntry.substring(prefix.length),
		range: new Range(position.lineNumber, 1, position.lineNumber, position.column)
	};
}
