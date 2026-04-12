/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { binarySearch2 } from '../../../../base/common/arrays.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';
export class AnnotatedString {
    constructor(annotations = []) {
        /**
         * Annotations are non intersecting and contiguous in the array.
         */
        this._annotations = [];
        this._annotations = annotations;
    }
    /**
     * Set annotations for a specific range.
     * Annotations should be sorted and non-overlapping.
     * If the annotation value is undefined, the annotation is removed.
     */
    setAnnotations(annotations) {
        for (const annotation of annotations.annotations) {
            const startIndex = this._getStartIndexOfIntersectingAnnotation(annotation.range.start);
            const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(annotation.range.endExclusive);
            if (annotation.annotation !== undefined) {
                this._annotations.splice(startIndex, endIndexExclusive - startIndex, { range: annotation.range, annotation: annotation.annotation });
            }
            else {
                this._annotations.splice(startIndex, endIndexExclusive - startIndex);
            }
        }
    }
    /**
     * Returns all annotations that intersect with the given offset range.
     */
    getAnnotationsIntersecting(range) {
        const startIndex = this._getStartIndexOfIntersectingAnnotation(range.start);
        const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(range.endExclusive);
        return this._annotations.slice(startIndex, endIndexExclusive);
    }
    _getStartIndexOfIntersectingAnnotation(offset) {
        // Find index to the left of the offset
        const startIndexWhereToReplace = binarySearch2(this._annotations.length, (index) => {
            return this._annotations[index].range.start - offset;
        });
        let startIndex;
        if (startIndexWhereToReplace >= 0) {
            startIndex = startIndexWhereToReplace;
            // Also include the next annotation if it ends exactly at offset (touching boundary)
            const nextCandidate = this._annotations[startIndex]?.range;
            if (nextCandidate && nextCandidate.endExclusive === offset) {
                startIndex--;
            }
        }
        else {
            const candidate = this._annotations[-(startIndexWhereToReplace + 2)]?.range;
            if (candidate && offset >= candidate.start && offset < candidate.endExclusive) {
                startIndex = -(startIndexWhereToReplace + 2);
            }
            else {
                startIndex = -(startIndexWhereToReplace + 1);
            }
        }
        return startIndex;
    }
    _getEndIndexOfIntersectingAnnotation(offset) {
        // Find index to the right of the offset
        const endIndexWhereToReplace = binarySearch2(this._annotations.length, (index) => {
            return this._annotations[index].range.endExclusive - offset;
        });
        let endIndexExclusive;
        if (endIndexWhereToReplace >= 0) {
            endIndexExclusive = endIndexWhereToReplace + 1;
            // Also include the next annotation if it starts exactly at offset (touching boundary)
            const nextCandidate = this._annotations[endIndexExclusive]?.range;
            if (nextCandidate && nextCandidate.start === offset) {
                endIndexExclusive++;
            }
        }
        else {
            const candidate = this._annotations[-(endIndexWhereToReplace + 1)]?.range;
            if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
                endIndexExclusive = -endIndexWhereToReplace;
            }
            else {
                endIndexExclusive = -(endIndexWhereToReplace + 1);
            }
        }
        return endIndexExclusive;
    }
    /**
     * Returns a copy of all annotations.
     */
    getAllAnnotations() {
        return this._annotations.slice();
    }
    /**
     * Applies a string edit to the annotated string, updating annotation ranges accordingly.
     * @param edit The string edit to apply.
     * @returns The annotations that were deleted (became empty) as a result of the edit.
     */
    applyEdit(edit) {
        const annotations = this._annotations.slice();
        // treat edits as deletion of the replace range and then as insertion that extends the first range
        const finalAnnotations = [];
        const deletedAnnotations = [];
        let offset = 0;
        for (const e of edit.replacements) {
            while (true) {
                // ranges before the current edit
                const annotation = annotations[0];
                if (!annotation) {
                    break;
                }
                const range = annotation.range;
                if (range.endExclusive >= e.replaceRange.start) {
                    break;
                }
                annotations.shift();
                const newAnnotation = { range: range.delta(offset), annotation: annotation.annotation };
                if (!newAnnotation.range.isEmpty) {
                    finalAnnotations.push(newAnnotation);
                }
                else {
                    deletedAnnotations.push(newAnnotation);
                }
            }
            const intersecting = [];
            while (true) {
                const annotation = annotations[0];
                if (!annotation) {
                    break;
                }
                const range = annotation.range;
                if (!range.intersectsOrTouches(e.replaceRange)) {
                    break;
                }
                annotations.shift();
                intersecting.push(annotation);
            }
            for (let i = intersecting.length - 1; i >= 0; i--) {
                const annotation = intersecting[i];
                let r = annotation.range;
                // Inserted text will extend the first intersecting annotation, if the edit truly overlaps it
                const shouldExtend = i === 0 && (e.replaceRange.endExclusive > r.start) && (e.replaceRange.start < r.endExclusive);
                // Annotation shrinks by the overlap then grows with the new text length
                const overlap = r.intersect(e.replaceRange).length;
                r = r.deltaEnd(-overlap + (shouldExtend ? e.newText.length : 0));
                // If the annotation starts after the edit start, shift left to the edit start position
                const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
                if (rangeAheadOfReplaceRange > 0) {
                    r = r.delta(-rangeAheadOfReplaceRange);
                }
                // If annotation shouldn't be extended AND it is after or on edit start, move it after the newly inserted text
                if (!shouldExtend && rangeAheadOfReplaceRange >= 0) {
                    r = r.delta(e.newText.length);
                }
                // We already took our offset into account.
                // Because we add r back to the queue (which then adds offset again),
                // we have to remove it here so as to not double count it.
                r = r.delta(-(e.newText.length - e.replaceRange.length));
                annotations.unshift({ annotation: annotation.annotation, range: r });
            }
            offset += e.newText.length - e.replaceRange.length;
        }
        while (true) {
            const annotation = annotations[0];
            if (!annotation) {
                break;
            }
            annotations.shift();
            const newAnnotation = { annotation: annotation.annotation, range: annotation.range.delta(offset) };
            if (!newAnnotation.range.isEmpty) {
                finalAnnotations.push(newAnnotation);
            }
            else {
                deletedAnnotations.push(newAnnotation);
            }
        }
        this._annotations = finalAnnotations;
        return deletedAnnotations;
    }
    /**
     * Creates a shallow clone of this annotated string.
     */
    clone() {
        return new AnnotatedString(this._annotations.slice());
    }
}
export class AnnotationsUpdate {
    static create(annotations) {
        return new AnnotationsUpdate(annotations);
    }
    constructor(annotations) {
        this._annotations = annotations;
    }
    get annotations() {
        return this._annotations;
    }
    rebase(edit) {
        const annotatedString = new AnnotatedString(this._annotations);
        annotatedString.applyEdit(edit);
        this._annotations = annotatedString.getAllAnnotations();
    }
    serialize(serializingFunc) {
        return this._annotations.map(annotation => {
            const range = { start: annotation.range.start, endExclusive: annotation.range.endExclusive };
            if (!annotation.annotation) {
                return { range, annotation: undefined };
            }
            return { range, annotation: serializingFunc(annotation.annotation) };
        });
    }
    static deserialize(serializedAnnotations, deserializingFunc) {
        const annotations = serializedAnnotations.map(serializedAnnotation => {
            const range = new OffsetRange(serializedAnnotation.range.start, serializedAnnotation.range.endExclusive);
            if (!serializedAnnotation.annotation) {
                return { range, annotation: undefined };
            }
            return { range, annotation: deserializingFunc(serializedAnnotation.annotation) };
        });
        return new AnnotationsUpdate(annotations);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy9hbm5vdGF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFbEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBZ0MvRCxNQUFNLE9BQU8sZUFBZTtJQU8zQixZQUFZLGNBQWdDLEVBQUU7UUFMOUM7O1dBRUc7UUFDSyxpQkFBWSxHQUFxQixFQUFFLENBQUM7UUFHM0MsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUM7SUFDakMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxjQUFjLENBQUMsV0FBaUM7UUFDdEQsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLHNDQUFzQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkYsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsb0NBQW9DLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNuRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxpQkFBaUIsR0FBRyxVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDdEksQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLFVBQVUs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