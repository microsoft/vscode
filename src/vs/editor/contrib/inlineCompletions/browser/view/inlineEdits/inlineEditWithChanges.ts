/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SingleLineEdit } from '../../../../../common/core/lineEdit.js';
import { Position } from '../../../../../common/core/position.js';
import { AbstractText, TextEdit } from '../../../../../common/core/textEdit.js';
import { Command } from '../../../../../common/languages.js';
import { InlineSuggestionItem } from '../../model/inlineSuggestionItem.js';

export class InlineEditWithChanges {
	public get lineEdit() {
		return SingleLineEdit.fromSingleTextEdit(this.edit.toSingle(this.originalText), this.originalText);
	}

	public get originalLineRange() { return this.lineEdit.lineRange; }
	public get modifiedLineRange() { return this.lineEdit.toLineEdit().getNewLineRanges()[0]; }

	constructor(
		public readonly originalText: AbstractText,
		public readonly edit: TextEdit,
		public readonly cursorPosition: Position,
		public readonly commands: readonly Command[],
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
