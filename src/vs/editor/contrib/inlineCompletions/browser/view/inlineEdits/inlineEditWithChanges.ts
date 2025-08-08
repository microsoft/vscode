/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineReplacement } from '../../../../../common/core/edits/lineEdit.js';
import { LineRange } from '../../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../../common/core/position.js';
import { TextEdit } from '../../../../../common/core/edits/textEdit.js';
import { AbstractText } from '../../../../../common/core/text/abstractText.js';
import { InlineCompletionCommand } from '../../../../../common/languages.js';
import { InlineSuggestionItem } from '../../model/inlineSuggestionItem.js';

export class InlineEditWithChanges {
	public get lineEdit() {
		return LineReplacement.fromSingleTextEdit(this.edit.toReplacement(this.originalText), this.originalText);
	}

	public get originalLineRange() { return this.lineEdit.lineRange; }
	public get modifiedLineRange() { return this.lineEdit.toLineEdit().getNewLineRanges()[0]; }

	public get displayRange() {
		return this.originalText.lineRange.intersect(
			this.originalLineRange.join(
				LineRange.ofLength(this.originalLineRange.startLineNumber, this.lineEdit.newLines.length)
			)
		)!;
	}

	constructor(
		public readonly originalText: AbstractText,
		public readonly edit: TextEdit,
		public readonly cursorPosition: Position,
		public readonly commands: readonly InlineCompletionCommand[],
		public readonly inlineCompletion: InlineSuggestionItem
	) {
	}

	equals(other: InlineEditWithChanges) {
		return this.originalText.getValue() === other.originalText.getValue() &&
			this.edit.equals(other.edit) &&
			this.cursorPosition.equals(other.cursorPosition) &&
			this.commands === other.commands &&
			this.inlineCompletion === other.inlineCompletion;
	}
}
