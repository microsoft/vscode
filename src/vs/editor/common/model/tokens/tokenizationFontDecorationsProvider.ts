/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IModelDecoration, ITextModel } from '../../model.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { Range } from '../../core/range.js';
import { DecorationProvider, LineFontChangingDecoration, LineHeightChangingDecoration } from '../decorationProvider.js';
import { Emitter } from '../../../../base/common/event.js';
import { IFontTokenOption, IModelContentChangedEvent } from '../../textModelEvents.js';
import { classNameForFontTokenDecorations } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotationUpdate } from './annotations.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';
import { offsetEditFromContentChanges } from '../textModelStringEdit.js';

export interface IFontTokenAnnotation {
	decorationId: string;
	fontToken: IFontTokenOption;
}

export class TokenizationFontDecorationProvider extends Disposable implements DecorationProvider {

	private static DECORATION_COUNT = 0;

	private readonly _onDidChangeLineHeight = this._register(new Emitter<Set<LineHeightChangingDecoration>>());
	public readonly onDidChangeLineHeight = this._onDidChangeLineHeight.event;

	private readonly _onDidChangeFont = this._register(new Emitter<Set<LineFontChangingDecoration>>());
	public readonly onDidChangeFont = this._onDidChangeFont.event;

	private _fontAnnotatedString: IAnnotatedString<IFontTokenAnnotation> = new AnnotatedString<IFontTokenAnnotation>();
	private _semanticFontAnnotatedString: IAnnotatedString<IFontTokenAnnotation> = new AnnotatedString<IFontTokenAnnotation>();

	constructor(
		private readonly textModel: ITextModel,
		private readonly tokenizationTextModelPart: TokenizationTextModelPart
	) {
		super();
		this._register(this.tokenizationTextModelPart.onDidChangeFontTokens(fontChanges => {

			const linesChanged = new Set<number>();
			const fontTokenAnnotations: IAnnotationUpdate<IFontTokenAnnotation>[] = [];

			const affectedLineHeights = new Set<LineHeightChangingDecoration>();
			const affectedLineFonts = new Set<LineFontChangingDecoration>();

			for (const annotation of fontChanges.changes.annotations) {

				const startPosition = this.textModel.getPositionAt(annotation.range.start);
				const lineNumber = startPosition.lineNumber;

				let fontTokenAnnotation: IAnnotationUpdate<IFontTokenAnnotation>;
				if (annotation.annotation === undefined) {
					fontTokenAnnotation = {
						range: annotation.range,
						annotation: undefined
					};
				} else {
					const decorationId = `tokenization-font-decoration-${TokenizationFontDecorationProvider.DECORATION_COUNT}`;
					const fontTokenDecoration: IFontTokenAnnotation = {
						fontToken: annotation.annotation,
						decorationId
					};
					fontTokenAnnotation = {
						range: annotation.range,
						annotation: fontTokenDecoration
					};
					TokenizationFontDecorationProvider.DECORATION_COUNT++;

					if (annotation.annotation.lineHeightMultiplier) {
						affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, lineNumber, annotation.annotation.lineHeightMultiplier));
					}
					affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, lineNumber));

				}
				fontTokenAnnotations.push(fontTokenAnnotation);

				if (!linesChanged.has(lineNumber)) {
					// Signal the removal of the font tokenization decorations on the line number
					const lineNumberStartOffset = this.textModel.getOffsetAt(new Position(lineNumber, 1));
					const lineNumberEndOffset = this.textModel.getOffsetAt(new Position(lineNumber, this.textModel.getLineMaxColumn(lineNumber)));
					const lineOffsetRange = new OffsetRange(lineNumberStartOffset, lineNumberEndOffset);
					const lineAnnotations = this._fontAnnotatedString.getAnnotationsIntersecting(lineOffsetRange);
					for (const annotation of lineAnnotations) {
						const decorationId = annotation.annotation.decorationId;
						affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, lineNumber, null));
						affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, lineNumber));
					}
					linesChanged.add(lineNumber);
				}
			}
			this._fontAnnotatedString.setAnnotations(AnnotationsUpdate.create(fontTokenAnnotations));
			this._onDidChangeLineHeight.fire(affectedLineHeights);
			this._onDidChangeFont.fire(affectedLineFonts);
		}));

		this._register(this.tokenizationTextModelPart.onDidChangeSemanticFontTokens(fontChanges => {
			this._applyFontChanges(this._semanticFontAnnotatedString, fontChanges.changes);
		}));
	}

	private _applyFontChanges(target: IAnnotatedString<IFontTokenAnnotation>, changes: AnnotationsUpdate<IFontTokenOption | undefined>): void {
		const affectedLineHeights = new Set<LineHeightChangingDecoration>();
		const affectedLineFonts = new Set<LineFontChangingDecoration>();

		for (const annotation of changes.annotations) {
			const startPosition = this.textModel.getPositionAt(annotation.range.start);
			const lineNumber = startPosition.lineNumber;
			for (const existing of target.getAnnotationsIntersecting(annotation.range)) {
				const existingLineNumber = this.textModel.getPositionAt(existing.range.start).lineNumber;
				const decorationId = existing.annotation.decorationId;
				affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, existingLineNumber, null));
				affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, existingLineNumber));
			}
			if (annotation.annotation !== undefined) {
				const decorationId = `tokenization-font-decoration-${TokenizationFontDecorationProvider.DECORATION_COUNT++}`;
				target.setAnnotations(AnnotationsUpdate.create([{
					range: annotation.range,
					annotation: { fontToken: annotation.annotation, decorationId }
				}]));
				if (annotation.annotation.lineHeightMultiplier) {
					affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, lineNumber, annotation.annotation.lineHeightMultiplier));
				}
				affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, lineNumber));
			} else {
				target.setAnnotations(AnnotationsUpdate.create<IFontTokenAnnotation>([{ range: annotation.range, annotation: undefined }]));
			}
		}
		this._onDidChangeLineHeight.fire(affectedLineHeights);
		this._onDidChangeFont.fire(affectedLineFonts);
	}

	public handleDidChangeContent(change: IModelContentChangedEvent) {
		const edits = offsetEditFromContentChanges(change.changes);
		const deletedAnnotations = this._fontAnnotatedString.applyEdit(edits);
		const deletedSemanticAnnotations = this._semanticFontAnnotatedString.applyEdit(edits);
		if (deletedAnnotations.length === 0 && deletedSemanticAnnotations.length === 0) {
			return;
		}
		/* We should fire line and font change events if decorations have been added or removed
		 * No decorations are added on edit, but they can be removed */
		const affectedLineHeights = new Set<LineHeightChangingDecoration>();
		const affectedLineFonts = new Set<LineFontChangingDecoration>();
		for (const deletedAnnotation of [...deletedAnnotations, ...deletedSemanticAnnotations]) {
			const startPosition = this.textModel.getPositionAt(deletedAnnotation.range.start);
			const lineNumber = startPosition.lineNumber;
			const decorationId = deletedAnnotation.annotation.decorationId;
			affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, lineNumber, null));
			affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, lineNumber));
		}
		this._onDidChangeLineHeight.fire(affectedLineHeights);
		this._onDidChangeFont.fire(affectedLineFonts);
	}

	public getDecorationsInRange(range: Range, ownerId?: number, filterOutValidation?: boolean, filterFontDecorations?: boolean, onlyMinimapDecorations?: boolean): IModelDecoration[] {
		const startOffsetOfRange = this.textModel.getOffsetAt(range.getStartPosition());
		const endOffsetOfRange = this.textModel.getOffsetAt(range.getEndPosition());
		const queryRange = new OffsetRange(startOffsetOfRange, endOffsetOfRange);
		const syntaxAnnotations = this._fontAnnotatedString.getAnnotationsIntersecting(queryRange);
		const semanticAnnotations = this._semanticFontAnnotatedString.getAnnotationsIntersecting(queryRange);

		const decorations: IModelDecoration[] = [];
		for (const annotation of syntaxAnnotations) {
			const uncoveredRanges: OffsetRange[] = [annotation.range];
			for (const semantic of semanticAnnotations) {
				for (let i = uncoveredRanges.length - 1; i >= 0; i--) {
					const range = uncoveredRanges[i];
					if (!range.intersects(semantic.range)) {
						continue;
					}
					uncoveredRanges.splice(i, 1);
					if (range.start < semantic.range.start) {
						uncoveredRanges.push(new OffsetRange(range.start, semantic.range.start));
					}
					if (semantic.range.endExclusive < range.endExclusive) {
						uncoveredRanges.push(new OffsetRange(semantic.range.endExclusive, range.endExclusive));
					}
				}
			}
			for (const syntaxRange of uncoveredRanges) {
				this._pushDecoration(decorations, annotation.annotation, syntaxRange, filterFontDecorations);
			}
		}
		for (const annotation of semanticAnnotations) {
			this._pushDecoration(decorations, annotation.annotation, annotation.range, filterFontDecorations);
		}
		return decorations;
	}

	private _pushDecoration(decorations: IModelDecoration[], anno: IFontTokenAnnotation, annotationRange: OffsetRange, filterFontDecorations?: boolean): void {
		const affectsFont = !!(anno.fontToken.fontFamily || anno.fontToken.fontSizeMultiplier);
		if (annotationRange.isEmpty || (affectsFont && filterFontDecorations)) {
			return;
		}
		const annotationStartPosition = this.textModel.getPositionAt(annotationRange.start);
		const annotationEndPosition = this.textModel.getPositionAt(annotationRange.endExclusive);
		const range = Range.fromPositions(annotationStartPosition, annotationEndPosition);
		const className = classNameForFontTokenDecorations(anno.fontToken.fontFamily ?? '', anno.fontToken.fontSizeMultiplier ?? 0);
		const id = anno.decorationId;
		decorations.push({
			id: id,
			options: {
				description: 'FontOptionDecoration',
				inlineClassName: className,
				lineHeight: anno.fontToken.lineHeightMultiplier,
				affectsFont
			},
			ownerId: 0,
			range
		});
	}

	public getAllDecorations(ownerId?: number, filterOutValidation?: boolean): IModelDecoration[] {
		return this.getDecorationsInRange(
			new Range(1, 1, this.textModel.getLineCount(), this.textModel.getLineMaxColumn(this.textModel.getLineCount())),
			ownerId,
			filterOutValidation
		);
	}
}
