/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IModelDecoration } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { DecorationProvider } from '../decorationProvider.js';
import { TextModel } from '../textModel.js';
import { Emitter } from '../../../../base/common/event.js';
import { IFontOption } from '../../languages.js';
import { IModelOptionsChangedEvent } from '../../textModelEvents.js';
import { classNameForFont } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';

export class LineHeightChangingDecoration {

	public static toKey(obj: LineHeightChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number,
		public readonly lineHeight: number | null
	) { }
}

export class LineFontChangingDecoration {

	public static toKey(obj: LineFontChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number
	) { }
}

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider<Set<LineHeightChangingDecoration>> {

	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = new Emitter<Set<LineFontChangingDecoration>>();
	public readonly onDidChangeFont = this._onDidChangeFont.event;

	private readonly fontInfo = new Map<number, IFontOption[]>();

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			console.log('fontChanges : ', fontChanges);
			const changedLineNumberHeights = new Map<number, number | null>();
			const changedLineNumberFonts = new Set<number>();
			for (const fontChange of fontChanges) {
				if (!fontChange.options) {
					changedLineNumberHeights.set(fontChange.lineNumber, null);
					changedLineNumberFonts.add(fontChange.lineNumber);
					continue;
				}
				this.fontInfo.set(fontChange.lineNumber, fontChange.options);
				for (const option of fontChange.options) {
					const lineNumber = fontChange.lineNumber;
					if (changedLineNumberHeights.has(lineNumber)) {
						// if the line number has already been considered, then we have to take the maximum with what exists
						const currentLineHeight = changedLineNumberHeights.get(lineNumber);
						if (!currentLineHeight || (option.lineHeight && option.lineHeight > currentLineHeight)) {
							changedLineNumberHeights.set(lineNumber, option.lineHeight); // we take the maximum line height
						}
					} else {
						// if the line number has not been considered yet, then it overwrites the previous data
						changedLineNumberHeights.set(fontChange.lineNumber, option.lineHeight);
					}
					changedLineNumberFonts.add(lineNumber);
				}
			}
			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			for (const [lineNumber, lineHeight] of changedLineNumberHeights) {
				affectedLineHeights.add(new LineHeightChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber, lineHeight));
			}
			const affectedLineFonts = new Set<LineFontChangingDecoration>();
			for (const lineNumber of changedLineNumberFonts) {
				affectedLineFonts.add(new LineFontChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber));
			}
			console.log('affectedLineHeights : ', affectedLineHeights);
			this._onDidChangeLineHeight.fire(affectedLineHeights);
			this._onDidChangeFont.fire(affectedLineFonts);
		});
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		const decorations: IModelDecoration[] = [];
		for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
			if (this.fontInfo.has(i)) {
				const fontOptions = this.fontInfo.get(i)!;
				if (fontOptions) {
					for (const fontOption of fontOptions) {
						const lastOffset = i > 0 ? this.textModel.getOffsetAt(new Position(i - 1, this.textModel.getLineMaxColumn(i - 1))) : 0;
						const startOffset = lastOffset + fontOption.startIndex + 1;
						const endOffset = lastOffset + fontOption.endIndex + 1;
						const startPosition = this.textModel.getPositionAt(startOffset);
						const endPosition = this.textModel.getPositionAt(endOffset);
						const className = classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? '');
						decorations.push({
							id: className,
							options: {
								description: 'FontOptionDecoration',
								inlineClassName: className,
								affectsFont: true
							},
							ownerId: 0,
							range: Range.fromPositions(startPosition, endPosition)
						});
					}
				}
			}
		}
		return decorations;
	}

	getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), 1),
			ownerId,
			filterOutValidation
		);
	}
}
