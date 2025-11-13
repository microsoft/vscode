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
import { IModelContentChangedEvent, IModelOptionsChangedEvent } from '../../textModelEvents.js';
import { classNameForFont } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';
import { IModelContentChange } from '../mirrorTextModel.js';
import { binarySearch2 } from '../../../../base/common/arrays.js';

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

interface IFontSegment {
	startIndex: number;
	endIndex: number;
	offset: number;
	delete?: boolean;
	fontFamily?: string;
	fontSize?: string;
	lineHeight?: number;
}

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider {

	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = new Emitter<Set<LineFontChangingDecoration>>();
	public readonly onDidChangeFont = this._onDidChangeFont.event;

	private _fontSegments: IFontSegment[] = [];
	private _queuedContentChangeEvents: IModelContentChange[] = [];

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

				const lineNumber = fontChange.lineNumber;
				const beginningLineOffset = this.textModel.getOffsetAt(new Position(lineNumber, 1));
				const endLineOffset = this.textModel.getOffsetAt(new Position(lineNumber, this.textModel.getLineMaxColumn(lineNumber)));

				const fontSegments: IFontSegment[] = [];

				for (const option of fontChange.options) {
					const startOffset = beginningLineOffset + option.startIndex;
					const endOffset = beginningLineOffset + option.endIndex;
					fontSegments.push({
						startIndex: startOffset,
						endIndex: endOffset,
						offset: 0,
						delete: false,
						fontFamily: option.fontFamily ?? undefined,
						fontSize: option.fontSize ?? undefined,
						lineHeight: option.lineHeight ?? undefined
					});

					if (changedLineNumberHeights.has(lineNumber)) {
						const currentLineHeight = changedLineNumberHeights.get(lineNumber);
						if (!currentLineHeight || (option.lineHeight && option.lineHeight > currentLineHeight)) {
							changedLineNumberHeights.set(lineNumber, option.lineHeight); // we take the maximum line height
						}
					} else {
						changedLineNumberHeights.set(fontChange.lineNumber, option.lineHeight);
					}
					changedLineNumberFonts.add(lineNumber);
				}

				const startIndexWhereToReplace = binarySearch2(this._fontSegments.length, (index) => {
					return this._fontSegments[index].startIndex - beginningLineOffset;
				});
				const endIndexWhereToReplace = binarySearch2(this._fontSegments.length, (index) => {
					return this._fontSegments[index].endIndex - endLineOffset;
				});
				const startIndex = (startIndexWhereToReplace > 0 ? startIndexWhereToReplace : - (startIndexWhereToReplace + 1));
				const endIndex = (endIndexWhereToReplace > 0 ? endIndexWhereToReplace : - (endIndexWhereToReplace + 1));
				this._fontSegments.splice(startIndex, endIndex - startIndex, ...fontSegments);
			}
			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			for (const [lineNumber, lineHeight] of changedLineNumberHeights) {
				affectedLineHeights.add(new LineHeightChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber, lineHeight));
			}
			const affectedLineFonts = new Set<LineFontChangingDecoration>();
			for (const lineNumber of changedLineNumberFonts) {
				affectedLineFonts.add(new LineFontChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber));
			}
			this._onDidChangeLineHeight.fire(affectedLineHeights);
			this._onDidChangeFont.fire(affectedLineFonts);
		});
	}

	public handleDidChangeContent(change: IModelContentChangedEvent) {
		this._queuedContentChangeEvents.push(...change.changes);
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	public getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		this._resolveDecorations();
		console.log('getDecorationsInRange - range : ', range);
		console.log('this._fontSegments : ', this._fontSegments);

		const decorations: IModelDecoration[] = [];

		const startOffsetOfRange = this.textModel.getOffsetAt(range.getStartPosition());
		const endOffsetOfRange = this.textModel.getOffsetAt(range.getEndPosition());
		const _startIndex = binarySearch2(this._fontSegments.length, (index) => {
			return this._fontSegments[index].startIndex - startOffsetOfRange;
		});
		const _endIndex = binarySearch2(this._fontSegments.length, (index) => {
			return this._fontSegments[index].endIndex - endOffsetOfRange;
		});

		const startIndex = (_startIndex > 0 ? _startIndex : - (_startIndex + 1));
		const endIndex = (_endIndex > 0 ? _endIndex : - (_endIndex + 1));

		for (let i = startIndex; i <= endIndex; i++) {
			const fontOption = this._fontSegments[i];
			if (!fontOption) {
				continue;
			}
			const startPosition = this.textModel.getPositionAt(fontOption.startIndex);
			const endPosition = this.textModel.getPositionAt(fontOption.endIndex);
			const className = classNameForFont(fontOption.fontFamily ?? '', fontOption.fontSize ?? '');
			const id = `font-decoration-${i}-${fontOption.startIndex}-${fontOption.endIndex}`;
			decorations.push({
				id: id,
				options: {
					description: 'FontOptionDecoration',
					inlineClassName: className,
					affectsFont: true
				},
				ownerId: 0,
				range: Range.fromPositions(startPosition, endPosition)
			});
		}

		console.log('decorations : ', JSON.stringify(decorations));
		return decorations;
	}

	public getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), 1),
			ownerId,
			filterOutValidation
		);
	}

	private _resolveDecorations(): void {
		// Take the queued edits and apply them to the font infos
		console.log('queuedTextEdits : ', this._queuedContentChangeEvents);
		console.log('queuedTextEdits.length > 0 : ', this._queuedContentChangeEvents.length > 0);

		for (const changeEvent of this._queuedContentChangeEvents) {
			const changeEventRange = Range.lift(changeEvent.range);
			const changeEventStartIndex = this.textModel.getOffsetAt(changeEventRange.getStartPosition());
			const changeEventEndIndex = this.textModel.getOffsetAt(changeEventRange.getEndPosition());
			const newLength = changeEvent.text.length;

			console.log('changeEvent : ', changeEvent);
			console.log('changeEventRange : ', changeEventRange);
			console.log('changeEventStartIndex : ', changeEventStartIndex);
			console.log('changeEventEndIndex : ', changeEventEndIndex);
			console.log('newLength : ', newLength);

			const _firstIndexEditAppliedTo = binarySearch2(this._fontSegments.length, (index) => {
				return this._fontSegments[index].startIndex - changeEventStartIndex;
			});
			const _endIndexEditAppliedTo = binarySearch2(this._fontSegments.length, (index) => {
				return this._fontSegments[index].startIndex - changeEventEndIndex;
			});

			const firstIndexEditAppliedTo = (_firstIndexEditAppliedTo > 0 ? _firstIndexEditAppliedTo : - (_firstIndexEditAppliedTo + 1));
			const endIndexEditAppliedTo = (_endIndexEditAppliedTo > 0 ? _endIndexEditAppliedTo : - (_endIndexEditAppliedTo + 1));

			console.log('firstIndexEditAppliedTo : ', firstIndexEditAppliedTo);
			console.log('endIndexEditAppliedTo : ', endIndexEditAppliedTo);

			const firstDecoration = this._fontSegments[firstIndexEditAppliedTo];
			const lastDecoration = this._fontSegments[endIndexEditAppliedTo];
			if (changeEventStartIndex > firstDecoration.endIndex && changeEventEndIndex > lastDecoration.endIndex) {
				// The edit start and end borders are not enclosed within a decoration
			} else if (changeEventStartIndex <= firstDecoration.endIndex && changeEventEndIndex > lastDecoration.endIndex) {
				// The edit start border is enclosed within a decoration, but not the end
				this._fontSegments[firstIndexEditAppliedTo].endIndex = changeEventStartIndex;

			} else if (changeEventStartIndex > firstDecoration.endIndex && changeEventEndIndex <= lastDecoration.endIndex) {
				// The edit end border is enclosed within a decoration, but not the start
				this._fontSegments[endIndexEditAppliedTo].startIndex = changeEventStartIndex + newLength;
				this._fontSegments[endIndexEditAppliedTo].endIndex = this._fontSegments[endIndexEditAppliedTo].startIndex + this._fontSegments[endIndexEditAppliedTo].endIndex - changeEventEndIndex;
			} else {
				// The edits start and end borders are enclosing within a decoration
				this._fontSegments[firstIndexEditAppliedTo].endIndex = changeEventStartIndex;
				this._fontSegments[endIndexEditAppliedTo].startIndex = changeEventStartIndex + newLength;
				this._fontSegments[endIndexEditAppliedTo].endIndex = this._fontSegments[endIndexEditAppliedTo].startIndex + this._fontSegments[endIndexEditAppliedTo].endIndex - changeEventEndIndex;
			}
			if (firstIndexEditAppliedTo < endIndexEditAppliedTo) {
				this._fontSegments[firstIndexEditAppliedTo + 1].delete = true;
				this._fontSegments[endIndexEditAppliedTo + 1].delete = false;
				this._fontSegments[endIndexEditAppliedTo + 1].offset -= (changeEventEndIndex - changeEventStartIndex + newLength);
			}
		}

		console.log('this._fontSegments before cleanup : ', JSON.stringify(this._fontSegments));

		const newFontSegments: IFontSegment[] = [];
		let offset = 0;
		for (const fontSegment of this._fontSegments) {
			if (fontSegment.delete) {
				continue;
			}
			offset += fontSegment.offset;
			fontSegment.startIndex += offset;
			fontSegment.endIndex += offset;
			newFontSegments.push(fontSegment);
		}
		this._fontSegments = newFontSegments;

		console.log('this._fontSegments after cleanup : ', JSON.stringify(this._fontSegments));
		this._queuedContentChangeEvents = [];
	}
}
