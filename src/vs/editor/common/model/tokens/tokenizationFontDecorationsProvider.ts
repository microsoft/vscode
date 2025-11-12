/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IModelDecoration, IModelDecorationOptions, IModelDeltaDecoration } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { DecorationProvider } from '../decorationProvider.js';
import { TextModel } from '../textModel.js';
import { Emitter } from '../../../../base/common/event.js';
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

	// REMOVE THE BELOW
	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = new Emitter<Set<LineFontChangingDecoration>>();
	public readonly onDidChangeFont = this._onDidChangeFont.event;
	//

	//private readonly fontDecorations = new Map<number, string[]>();
	private readonly tokenizationFontDecorationsIds = new Set<string>();

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {

			textModel.changeDecorations((accessor) => {
				for (const fontChange of fontChanges) {
					const lineNumber = fontChange.lineNumber;
					const newDecorations: IModelDeltaDecoration[] = fontChange.options.map(fontOption => {
						const lastOffset = lineNumber > 1 ? this.textModel.getOffsetAt(new Position(lineNumber - 1, this.textModel.getLineMaxColumn(lineNumber - 1))) + 1 : 0;
						const startOffset = lastOffset + fontOption.startIndex;
						const endOffset = lastOffset + fontOption.endIndex;
						const startPosition = this.textModel.getPositionAt(startOffset);
						const endPosition = this.textModel.getPositionAt(endOffset);
						const range = Range.fromPositions(startPosition, endPosition);
						const options: IModelDecorationOptions = {
							description: 'FontOptionDecoration',
							inlineClassName: classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? ''),
							fontFamily: fontOption.fontFamily,
							fontSize: fontOption.fontSize,
							lineHeight: fontOption.lineHeight,
							affectsFont: true,
						};
						const decoration: IModelDeltaDecoration = { range, options };
						return decoration;
					});

					const decorationsOnLine = textModel.getDecorationsInRange(new Range(lineNumber, 1, lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
					const oldDecorationIds: string[] = [];
					for (const decorationOnLine of decorationsOnLine) {
						if (this.tokenizationFontDecorationsIds.has(decorationOnLine.id)) {
							oldDecorationIds.push(decorationOnLine.id);
							this.tokenizationFontDecorationsIds.delete(decorationOnLine.id);
						}
					}
					const newDecorationIds = accessor.deltaDecorations(oldDecorationIds, newDecorations);
					for (const newDecorationId of newDecorationIds) {
						this.tokenizationFontDecorationsIds.add(newDecorationId);
					}
					console.log('fontChange for line ', lineNumber, ': ', fontChange);
					console.log('newDecorations for line ', lineNumber, ': ', newDecorations);
					console.log('oldDecorationIds for line ', lineNumber, ': ', oldDecorationIds);
					//this.fontDecorations.set(lineNumber, newDecorationIds);
				}
			});

			// console.log('fontChanges : ', fontChanges);
			// const changedLineNumberHeights = new Map<number, number | null>();
			// const changedLineNumberFonts = new Set<number>();
			// for (const fontChange of fontChanges) {
			// 	if (!fontChange.options) {
			// 		changedLineNumberHeights.set(fontChange.lineNumber, null);
			// 		changedLineNumberFonts.add(fontChange.lineNumber);
			// 		continue;
			// 	}
			// 	this.fontInfo.set(fontChange.lineNumber, fontChange.options);
			// 	for (const option of fontChange.options) {
			// 		const lineNumber = fontChange.lineNumber;
			// 		if (changedLineNumberHeights.has(lineNumber)) {
			// 			// if the line number has already been considered, then we have to take the maximum with what exists
			// 			const currentLineHeight = changedLineNumberHeights.get(lineNumber);
			// 			if (!currentLineHeight || (option.lineHeight && option.lineHeight > currentLineHeight)) {
			// 				changedLineNumberHeights.set(lineNumber, option.lineHeight); // we take the maximum line height
			// 			}
			// 		} else {
			// 			// if the line number has not been considered yet, then it overwrites the previous data
			// 			changedLineNumberHeights.set(fontChange.lineNumber, option.lineHeight);
			// 		}
			// 		changedLineNumberFonts.add(lineNumber);
			// 	}
			// }
			// const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			// for (const [lineNumber, lineHeight] of changedLineNumberHeights) {
			// 	affectedLineHeights.add(new LineHeightChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber, lineHeight));
			// }
			// const affectedLineFonts = new Set<LineFontChangingDecoration>();
			// for (const lineNumber of changedLineNumberFonts) {
			// 	affectedLineFonts.add(new LineFontChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber));
			// }
			// console.log('affectedLineHeights : ', affectedLineHeights);
			// this._onDidChangeLineHeight.fire(affectedLineHeights);
			// this._onDidChangeFont.fire(affectedLineFonts);
		});
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		const decorations: IModelDecoration[] = [];
		// for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
		// 	if (this.fontInfo.has(i)) {
		// 		const fontOptions = this.fontInfo.get(i)!;
		// 		if (fontOptions) {
		// 			for (const fontOption of fontOptions) {
		// 				const lastOffset = i > 0 ? this.textModel.getOffsetAt(new Position(i - 1, this.textModel.getLineMaxColumn(i - 1))) : 0;
		// 				const startOffset = lastOffset + fontOption.startIndex + 1;
		// 				const endOffset = lastOffset + fontOption.endIndex + 1;
		// 				const startPosition = this.textModel.getPositionAt(startOffset);
		// 				const endPosition = this.textModel.getPositionAt(endOffset);
		// 				const className = classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? '');
		// 				decorations.push({
		// 					id: className,
		// 					options: {
		// 						description: 'FontOptionDecoration',
		// 						inlineClassName: className,
		// 						affectsFont: true
		// 					},
		// 					ownerId: 0,
		// 					range: Range.fromPositions(startPosition, endPosition)
		// 				});
		// 			}
		// 		}
		// 	}
		// }
		console.log('getDecorationsInRange - range : ', range);
		console.log('decorations : ', decorations);
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
