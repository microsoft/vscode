/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../util/vs/base/common/charCode';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import * as vscodeTypes from '../../../vscodeTypes';
import { IDiffService } from '../../diff/common/diffService';
import { stringEditFromDiff } from '../../editing/common/edit';
import { OffsetLineColumnConverter } from '../../editing/common/offsetLineColumnConverter';

export interface IEditCollector {
	initialText: string;
	addEdits(edits: vscodeTypes.TextEdit[]): void;
	getText(): string;
	getEdits(): Promise<StringEdit>;
}

export class EditCollector implements IEditCollector {
	private readonly _document: OffsetBasedTextDocument;

	constructor(
		public readonly initialText: string,
		@IDiffService private readonly _diffService: IDiffService,
	) {
		this._document = new OffsetBasedTextDocument(initialText);
	}

	public addEdits(edits: vscodeTypes.TextEdit[]): void {
		this._document.applyTextEdits(edits);
	}

	public getText(): string {
		return this._document.getValue();
	}

	public async getEdits(): Promise<StringEdit> {
		const newText = this.getText();
		const edits = await stringEditFromDiff(this.initialText, newText, this._diffService);
		return edits;
	}
}

export class OffsetBasedTextDocument {
	private _converter: OffsetLineColumnConverter | undefined = undefined;
	private _value: string = '';
	constructor(initialValue: string = '') {
		this._value = initialValue;
	}

	getValue(): string {
		return this._value;
	}

	applyTextEdits(edits: vscodeTypes.TextEdit[]) {
		const offsetEdit = new StringEdit(edits.map(e => {
			const start = this.positionToOffset(e.range.start);
			const end = this.positionToOffset(e.range.end);
			return new StringReplacement(new OffsetRange(start, end), e.newText);
		}));
		this.applyOffsetEdit(offsetEdit);
	}

	applyOffsetEdit(edit: StringEdit): void {
		this._value = edit.apply(this._value);
		this._converter = undefined;
	}

	positionToOffset(position: vscodeTypes.Position): number {
		if (!this._converter) {
			this._converter = new OffsetLineColumnConverter(this._value);
		}
		const line = position.line;
		if (line < 0) {
			return 0;
		} else if (line >= this._converter.lines) {
			return this._value.length;
		}
		const character = position.character;
		const lineOffet = this._converter.lineOffset(line + 1);
		if (character <= 0) {
			return lineOffet;
		}
		let endLineOffest;
		if (line + 1 < this._converter.lines) {
			endLineOffest = this._converter.lineOffset(line + 2);
			if (endLineOffest > lineOffet) {
				const ch = this._value.charCodeAt(endLineOffest - 1);
				if (ch === CharCode.CarriageReturn || ch === CharCode.LineFeed) {
					endLineOffest--;
				}
				if (ch === CharCode.LineFeed && endLineOffest > lineOffet && this._value.charCodeAt(endLineOffest - 1) === CharCode.CarriageReturn) {
					endLineOffest--;
				}
			} else {
				endLineOffest = lineOffet;
			}
		} else {
			endLineOffest = this._value.length;
		}
		if (character > endLineOffest - lineOffet) {
			return endLineOffest;
		}
		return lineOffet + character;
	}
}
