/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../core/range.js';
import { LineFontChangingDecoration, LineHeightChangingDecoration } from '../decorationProvider.js';
import { Emitter } from '../../../../base/common/event.js';
import { classNameForFontTokenDecorations } from '../../languages/supports/tokenization.js';
import { Position } from '../../core/position.js';
import { AnnotatedString, AnnotationsUpdate } from './annotations.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';
import { offsetEditFromContentChanges } from '../textModelStringEdit.js';
export class TokenizationFontDecorationProvider extends Disposable {
    static { this.DECORATION_COUNT = 0; }
    constructor(textModel, tokenizationTextModelPart) {
        super();
        this.textModel = textModel;
        this.tokenizationTextModelPart = tokenizationTextModelPart;
        this._onDidChangeLineHeight = this._register(new Emitter());
        this.onDidChangeLineHeight = this._onDidChangeLineHeight.event;
        this._onDidChangeFont = this._register(new Emitter());
        this.onDidChangeFont = this._onDidChangeFont.event;
        this._fontAnnotatedString = new AnnotatedString();
        this._register(this.tokenizationTextModelPart.onDidChangeFontTokens(fontChanges => {
            const linesChanged = new Set();
            const fontTokenAnnotations = [];
            const affectedLineHeights = new Set();
            const affectedLineFonts = new Set();
            for (const annotation of fontChanges.changes.annotations) {
                const startPosition = this.textModel.getPositionAt(annotation.range.start);
                const lineNumber = startPosition.lineNumber;
                let fontTokenAnnotation;
                if (annotation.annotation === undefined) {
                    fontTokenAnnotation = {
                        range: annotation.range,
                        annotation: undefined
                    };
                }
                else {
                    const decorationId = `tokenization-font-decoration-${TokenizationFontDecorationProvider.DECORATION_COUNT}`;
                    const fontTokenDecoration = {
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
    }
    handleDidChangeContent(change) {
        const edits = offsetEditFromContentChanges(change.changes);
        const deletedAnnotations = this._fontAnnotatedString.applyEdit(edits);
        if (deletedAnnotations.length === 0) {
            return;
        }
        /* We should fire line and font change events if decorations have been added or removed
         * No decorations are added on edit, but they can be removed */
        const affectedLineHeights = new Set();
        const affectedLineFonts = new Set();
        for (const deletedAnnotation of deletedAnnotations) {
            const startPosition = this.textModel.getPositionAt(deletedAnnotation.range.start);
            const lineNumber = startPosition.lineNumber;
            const decorationId = deletedAnnotation.annotation.decorationId;
            affectedLineHeights.add(new LineHeightChangingDecoration(0, decorationId, lineNumber, null));
            affectedLineFonts.add(new LineFontChangingDecoration(0, decorationId, lineNumber));
        }
        this._onDidChangeLineHeight.fire(affectedLineHeights);
        this._onDidChangeFont.fire(affectedLineFonts);
    }
    getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations) {
        const startOffsetOfRange = this.textModel.getOffsetAt(range.getStartPosition());
        const endOffsetOfRange = this.textModel.getOffsetAt(range.getEndPosition());
        const annotations = this._fontAnnotatedString.getAnnotationsIntersecting(new OffsetRange(startOffsetOfRange, endOffsetOfRange));
        const decorations = [];
        for (const annotation of annotations) {
            const anno = annotation.annotation;
            const affectsFont = !!(anno.fontToken.fontFamily || anno.fontToken.fontSizeMultiplier);
            if (!(affectsFont && filterFontDecorations)) {
                const annotationStartPosition = this.textModel.getPositionAt(annotation.range.start);
                const annotationEndPosition = this.textModel.getPositionAt(annotation.range.endExclusive);
                const range = Range.fromPositions(annotationStartPosition, annotationEndPosition);
                const anno = annotation.annotation;
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
        }
        return decorations;
    }
    getAllDecorations(ownerId, filterOutValidation) {
        return this.getDecorationsInRange(new Range(1, 1, this.textModel.getLineCount(), this.textModel.getLineMaxColumn(this.textModel.getLineCount())), ownerId, filterOutValidation);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemF0aW9uRm9udERlY29yYXRpb25zUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90b2tlbml6YXRpb25Gb250RGVjb3JhdGlvbnNQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzVDLE9BQU8sRUFBc0IsMEJBQTBCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN4SCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQXVDLE1BQU0sa0JBQWtCLENBQUM7QUFDM0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBT3pFLE1BQU0sT0FBTyxrQ0FBbUMsU0FBUSxVQUFVO2FBRWxELHFCQUFnQixHQUFHLENBQUMsQUFBSixDQUFLO0lBVXBDLFlBQ2tCLFNBQXFCLEVBQ3JCLHlCQUFvRDtRQUVyRSxLQUFLLEVBQUUsQ0FBQztRQUhTLGNBQVMsR0FBVCxTQUFTLENBQVk7UUFDckIsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUEyQjtRQVZyRCwyQkFBc0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQyxDQUFDLENBQUM7UUFDM0Ys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