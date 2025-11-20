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
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotationUpdate } from './annotations.js';
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

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider {

	private readonly _onDidChangeLineHeight = new Emitter<Set<LineHeightChangingDecoration>>();
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = new Emitter<Set<LineFontChangingDecoration>>();
	public readonly onDidChangeFont = this._onDidChangeFont.event;

	private _fontAnnotations: IAnnotatedString<IFontToken> = new AnnotatedString<IFontToken>();
	private _queuedEdits: StringEdit = StringEdit.empty;

	constructor(
		private readonly textModel: TextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this.tokenizationTextModelPart.onDidChangeFontInfo(fontChanges => {
			// TODO: combine the annotations and the heights into one map later
			const lineNumberToHeight = new Map<number, number | null>();
			const lineNumberToAnnotations = new Map<number, IAnnotationUpdate<IFontToken>[]>();

			for (const annotation of fontChanges.changes.annotations) {

				const startPosition = this.textModel.getPositionAt(annotation.range.start);
				const endPosition = this.textModel.getPositionAt(annotation.range.endExclusive);

				if (startPosition.lineNumber !== endPosition.lineNumber) {
					// The token should be always on a single line
					continue;
				}

				const lineNumber = startPosition.lineNumber;
				if (lineNumberToAnnotations.has(lineNumber)) {
					lineNumberToAnnotations.get(lineNumber)!.push(annotation);
				} else {
					lineNumberToAnnotations.set(lineNumber, [annotation]);
				}

				if (lineNumberToHeight.has(lineNumber)) {
					const currentLineHeight = lineNumberToHeight.get(lineNumber);
					if (!currentLineHeight || (annotation.annotation.lineHeight && annotation.annotation.lineHeight > currentLineHeight)) {
						lineNumberToHeight.set(lineNumber, annotation.annotation.lineHeight!); // we take the maximum line height
					}
				} else {
					lineNumberToHeight.set(lineNumber, annotation.annotation.lineHeight!);
				}
			}

			for (const [lineNumber, annotations] of lineNumberToAnnotations.entries()) {
				const lineStartOffset = this.textModel.getOffsetAt(new Position(lineNumber, 1));
				const lineEndOffset = this.textModel.getOffsetAt(new Position(lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
				this._fontAnnotations.setAnnotations(new OffsetRange(lineStartOffset, lineEndOffset), AnnotationsUpdate.create(annotations));
			}

			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			for (const [lineNumber, lineHeight] of lineNumberToHeight) {
				affectedLineHeights.add(new LineHeightChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber, lineHeight));
			}
			const affectedLineFonts = new Set<LineFontChangingDecoration>();
			for (const lineNumber of lineNumberToAnnotations.keys()) {
				affectedLineFonts.add(new LineFontChangingDecoration(0, `tokenization-line-decoration-${lineNumber}`, lineNumber));
			}
			this._onDidChangeLineHeight.fire(affectedLineHeights);
			this._onDidChangeFont.fire(affectedLineFonts);
		});
	}

	public handleDidChangeContent(change: IModelContentChangedEvent) {
		this._queuedEdits = StringEdit.compose(change.changes.map((c) => {
			const startOffset = this.textModel.getOffsetAt(new Position(c.range.startLineNumber, c.range.startColumn));
			const endOffset = this.textModel.getOffsetAt(new Position(c.range.endLineNumber, c.range.endColumn));
			const offsetRange = new OffsetRange(startOffset, endOffset);
			return StringEdit.replace(offsetRange, c.text);
		}));
	}

	public handleDidChangeOptions(e: IModelOptionsChangedEvent): void { }

	public getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		this._resolveDecorations();
		const startOffsetOfRange = this.textModel.getOffsetAt(range.getStartPosition());
		const endOffsetOfRange = this.textModel.getOffsetAt(range.getEndPosition());
		const annotations = this._fontAnnotations.getAnnotationsIntersecting(new OffsetRange(startOffsetOfRange, endOffsetOfRange));

		const decorations: IModelDecoration[] = [];
		for (const annotation of annotations) {
			const annotationStartPosition = this.textModel.getPositionAt(annotation.range.start);
			const annotationEndPosition = this.textModel.getPositionAt(annotation.range.endExclusive);
			const range = Range.fromPositions(annotationStartPosition, annotationEndPosition);
			const className = classNameForFont(annotation.annotation.fontFamily ?? '', annotation.annotation.fontSize ?? '');
			const id = `font-decoration-${annotation.range.start}-${annotation.range.endExclusive}`;
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

	private _resolveDecorations(): void {
		this._fontAnnotations.applyEdit(this._queuedEdits);
	}
}
