/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, Range, TextDocument } from 'vscode';
import { InlineSuggestionText, toInlineSuggestion as toInlineSuggestionEdit } from '../common/inlineSuggestionEdit';
import { toExternalRange, toInternalPosition, toInternalRange } from './utils/translations';

export interface InlineSuggestionEdit {
	readonly range: Range;
	readonly newText: string;
}

/**
 * Determines whether an edit can be displayed as an inline suggestion (ghost text).
 * If so, returns the (possibly adjusted) range and text that touches the cursor position,
 * which is required for VS Code to render ghost text.
 */
export function toInlineSuggestion(cursorPos: Position, doc: TextDocument, range: Range, newText: string, advanced: boolean = true): InlineSuggestionEdit | undefined {
	const text: InlineSuggestionText = {
		getValueOfRange: textRange => doc.getText(toExternalRange(textRange)),
		getLineLength: lineNumber => doc.lineAt(lineNumber - 1).text.length,
	};
	const edit = toInlineSuggestionEdit(toInternalPosition(cursorPos), text, toInternalRange(range), newText, advanced);
	return edit && { range: toExternalRange(edit.range), newText: edit.text };
}
