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
import { IFontToken, IModelContentChangedEvent, IModelOptionsChangedEvent } from '../../textModelEvents.js';
import { classNameForFont } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotation, IAnnotationUpdate } from './annotations.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';
import { StringEdit } from '../../core/edits/stringEdit.js';

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

export interface IFontTokenDecoration {
	fontToken: IFontToken;
	decorationId: string;
}

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider {

	static DECORATION_COUNT = 0;

	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = new Emitter<Set<LineFontChangingDecoration>>();
	public readonly onDidChangeFont = this._onDidChangeFont.event;

	private _fontAnnotations: IAnnotatedString<IFontTokenDecoration> = new AnnotatedString<IFontTokenDecoration>();
	private _queuedEdits: StringEdit = StringEdit.empty;

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			this._resolveAnnotations();
			const lineNumberToAddedAnnotations = new Map<number, IAnnotationUpdate<IFontTokenDecoration>[]>();
			const lineNumberToDeletedRange = new Map<number, OffsetRange>();

			for (const annotation of fontChanges.changes.annotations) {

				const startPosition = this.textModel.getPositionAt(annotation.range.start);
				const endPosition = this.textModel.getPositionAt(annotation.range.endExclusive);

				if (startPosition.lineNumber !== endPosition.lineNumber) {
					// The token should be always on a single line
					continue;
				}
				if (!annotation.annotation) {
					lineNumberToDeletedRange.set(startPosition.lineNumber, annotation.range);
				} else {
					const lineNumber = startPosition.lineNumber;
					const fontTokenDecoration: IFontTokenDecoration = {
						fontToken: annotation.annotation,
						decorationId: `tokenization-font-decoration-${TokenizationFontDecorationProvider.DECORATION_COUNT}`
					};
					const fontTokenAnnotation: IAnnotation<IFontTokenDecoration> = {
						range: annotation.range,
						annotation: fontTokenDecoration
					};
					TokenizationFontDecorationProvider.DECORATION_COUNT++;

					if (lineNumberToAddedAnnotations.has(lineNumber)) {
						lineNumberToAddedAnnotations.get(lineNumber)!.push(fontTokenAnnotation);
					} else {
						lineNumberToAddedAnnotations.set(lineNumber, [fontTokenAnnotation]);
					}
				}
			}


			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			const affectedLineFonts = new Set<LineFontChangingDecoration>();
			for (const [lineNumber, annotationUpdates] of lineNumberToAddedAnnotations.entries()) {
				const lineNumberStartOffset = this.textModel.getOffsetAt(new Position(lineNumber, 1));
				const lineNumberEndOffset = this.textModel.getOffsetAt(new Position(lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
				const lineOffsetRange = new OffsetRange(lineNumberStartOffset, lineNumberEndOffset);
				const currentDecorations = this._fontAnnotations.getAnnotationsIntersecting(lineOffsetRange);
				for (const decoration of currentDecorations) {
					affectedLineHeights.add(new LineHeightChangingDecoration(0, decoration.annotation!.decorationId, lineNumber, null));
					affectedLineFonts.add(new LineFontChangingDecoration(0, decoration.annotation!.decorationId, lineNumber));
				}
				for (const annotationUpdate of annotationUpdates) {
					if (annotationUpdate.annotation!.fontToken.lineHeight) {
						affectedLineHeights.add(new LineHeightChangingDecoration(0, annotationUpdate.annotation!.decorationId, lineNumber, annotationUpdate.annotation!.fontToken.lineHeight));
						affectedLineFonts.add(new LineFontChangingDecoration(0, annotationUpdate.annotation!.decorationId, lineNumber));
					}
				}
				this._fontAnnotations.setAnnotations(lineOffsetRange, AnnotationsUpdate.create(annotationUpdates));
			}
			for (const [lineNumber, _] of lineNumberToDeletedRange.entries()) {
				const lineNumberStartOffset = this.textModel.getOffsetAt(new Position(lineNumber, 1));
				const lineNumberEndOffset = this.textModel.getOffsetAt(new Position(lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
				const lineOffsetRange = new OffsetRange(lineNumberStartOffset, lineNumberEndOffset);
				const currentDecorations = this._fontAnnotations.getAnnotationsIntersecting(lineOffsetRange);
				for (const decoration of currentDecorations) {
					affectedLineHeights.add(new LineHeightChangingDecoration(0, decoration.annotation!.decorationId, lineNumber, null));
					affectedLineFonts.add(new LineFontChangingDecoration(0, decoration.annotation!.decorationId, lineNumber));
				}
				this._fontAnnotations.setAnnotations(lineOffsetRange, AnnotationsUpdate.create([]));
			}
			this._onDidChangeLineHeight.fire(affectedLineHeights);
			this._onDidChangeFont.fire(affectedLineFonts);
		});
	}

	public handleDidChangeContent(change: IModelContentChangedEvent) {
		this._queuedEdits = StringEdit.compose(change.changes.map((c) => {
			const offsetRange = new OffsetRange(c.rangeOffset, c.rangeOffset + c.rangeLength);
			return StringEdit.replace(offsetRange, c.text);
		}));
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	public getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		this._resolveAnnotations();
		const startOffsetOfRange = this.textModel.getOffsetAt(range.getStartPosition());
		const endOffsetOfRange = this.textModel.getOffsetAt(range.getEndPosition());
		const annotations = this._fontAnnotations.getAnnotationsIntersecting(new OffsetRange(startOffsetOfRange, endOffsetOfRange));

		const decorations: IModelDecoration[] = [];
		for (const annotation of annotations) {
			const annotationStartPosition = this.textModel.getPositionAt(annotation.range.start);
			const annotationEndPosition = this.textModel.getPositionAt(annotation.range.endExclusive);
			const range = Range.fromPositions(annotationStartPosition, annotationEndPosition);
			const className = classNameForFont(annotation.annotation!.fontToken.fontFamily ?? '', annotation.annotation!.fontToken.fontSize ?? '');
			const id = annotation.annotation!.decorationId;
			decorations.push({
				id: id,
				options: {
					description: 'FontOptionDecoration',
					inlineClassName: className,
					affectsFont: true
				},
				ownerId: 0,
				range
			});
		}
		return decorations;
	}

	public getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), 1),
			ownerId,
			filterOutValidation
		);
	}

	private _resolveAnnotations(): void {
		if (this._queuedEdits.isEmpty()) {
			return;
		}
		this._fontAnnotations.applyEdit(this._queuedEdits);
		this._queuedEdits = StringEdit.empty;
	}
}
