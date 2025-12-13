/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch2 } from '../../../../base/common/arrays.js';
import { StringEdit } from '../../core/edits/stringEdit.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';

export interface IAnnotation<T> {
	range: OffsetRange;
	annotation: T;
}

export interface IAnnotatedString<T> {
	/**
	 * Set annotations for a specific line.
	 * Annotations should be sorted and non-overlapping.
	 */
	setAnnotations(annotations: AnnotationsUpdate<T>): void;
	/**
	 * Return annotations intersecting with the given offset range.
	 */
	getAnnotationsIntersecting(range: OffsetRange): IAnnotation<T>[];
	/**
	 * Get all the annotations. Method is used for testing.
	 */
	getAllAnnotations(): IAnnotation<T>[];
	/**
	 * Apply a string edit to the annotated string.
	 * @returns The annotations that were deleted (became empty) as a result of the edit.
	 */
	applyEdit(edit: StringEdit): IAnnotation<T>[];
	/**
	 * Clone the annotated string.
	 */
	clone(): IAnnotatedString<T>;
}

export class AnnotatedString<T> implements IAnnotatedString<T> {

	/**
	 * Annotations are non intersecting and contiguous in the array.
	 */
	private _annotations: IAnnotation<T>[] = [];

	constructor(annotations: IAnnotation<T>[] = []) {
		this._annotations = annotations;
	}

	/**
	 * Set annotations for a specific range.
	 * Annotations should be sorted and non-overlapping.
	 * If the annotation value is undefined, the annotation is removed.
	 */
	public setAnnotations(annotations: AnnotationsUpdate<T>): void {
		for (const annotation of annotations.annotations) {
			const startIndex = this._getStartIndexOfIntersectingAnnotation(annotation.range.start);
			const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(annotation.range.endExclusive);
			if (annotation.annotation !== undefined) {
				this._annotations.splice(startIndex, endIndexExclusive - startIndex, { range: annotation.range, annotation: annotation.annotation });
			} else {
				this._annotations.splice(startIndex, endIndexExclusive - startIndex);
			}
		}
	}

	/**
	 * Returns all annotations that intersect with the given offset range.
	 */
	public getAnnotationsIntersecting(range: OffsetRange): IAnnotation<T>[] {
		const startIndex = this._getStartIndexOfIntersectingAnnotation(range.start);
		const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(range.endExclusive);
		return this._annotations.slice(startIndex, endIndexExclusive);
	}

	private _getStartIndexOfIntersectingAnnotation(offset: number): number {
		// Find index to the left of the offset
		const startIndexWhereToReplace = binarySearch2(this._annotations.length, (index) => {
			return this._annotations[index].range.start - offset;
		});
		let startIndex: number;
		if (startIndexWhereToReplace >= 0) {
			startIndex = startIndexWhereToReplace;
		} else {
			const candidate = this._annotations[- (startIndexWhereToReplace + 2)]?.range;
			if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
				startIndex = - (startIndexWhereToReplace + 2);
			} else {
				startIndex = - (startIndexWhereToReplace + 1);
			}
		}
		return startIndex;
	}

	private _getEndIndexOfIntersectingAnnotation(offset: number): number {
		// Find index to the right of the offset
		const endIndexWhereToReplace = binarySearch2(this._annotations.length, (index) => {
			return this._annotations[index].range.endExclusive - offset;
		});
		let endIndexExclusive: number;
		if (endIndexWhereToReplace >= 0) {
			endIndexExclusive = endIndexWhereToReplace + 1;
		} else {
			const candidate = this._annotations[-(endIndexWhereToReplace + 1)]?.range;
			if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
				endIndexExclusive = - endIndexWhereToReplace;
			} else {
				endIndexExclusive = - (endIndexWhereToReplace + 1);
			}
		}
		return endIndexExclusive;
	}

	/**
	 * Returns a copy of all annotations.
	 */
	public getAllAnnotations(): IAnnotation<T>[] {
		return this._annotations.slice();
	}

	/**
	 * Applies a string edit to the annotated string, updating annotation ranges accordingly.
	 * @param edit The string edit to apply.
	 * @returns The annotations that were deleted (became empty) as a result of the edit.
	 */
	public applyEdit(edit: StringEdit): IAnnotation<T>[] {
		const annotations = this._annotations.slice();

		// treat edits as deletion of the replace range and then as insertion that extends the first range
		const finalAnnotations: IAnnotation<T>[] = [];
		const deletedAnnotations: IAnnotation<T>[] = [];

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
				} else {
					deletedAnnotations.push(newAnnotation);
				}
			}

			const intersecting: IAnnotation<T>[] = [];
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
				const overlap = r.intersect(e.replaceRange)!.length;
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
			} else {
				deletedAnnotations.push(newAnnotation);
			}
		}
		this._annotations = finalAnnotations;
		return deletedAnnotations;
	}

	/**
	 * Creates a shallow clone of this annotated string.
	 */
	public clone(): IAnnotatedString<T> {
		return new AnnotatedString<T>(this._annotations.slice());
	}
}

export interface IAnnotationUpdate<T> {
	range: OffsetRange;
	annotation: T | undefined;
}

type DefinedValue = object | string | number | boolean;

export type ISerializedAnnotation<TSerializedProperty extends DefinedValue> = {
	range: { start: number; endExclusive: number };
	annotation: TSerializedProperty | undefined;
};

export class AnnotationsUpdate<T> {

	public static create<T>(annotations: IAnnotationUpdate<T>[]): AnnotationsUpdate<T> {
		return new AnnotationsUpdate(annotations);
	}

	private _annotations: IAnnotationUpdate<T>[];

	private constructor(annotations: IAnnotationUpdate<T>[]) {
		this._annotations = annotations;
	}

	get annotations(): IAnnotationUpdate<T>[] {
		return this._annotations;
	}

	public rebase(edit: StringEdit): void {
		const annotatedString = new AnnotatedString<T | undefined>(this._annotations);
		annotatedString.applyEdit(edit);
		this._annotations = annotatedString.getAllAnnotations();
	}

	public serialize<TSerializedProperty extends DefinedValue>(serializingFunc: (annotation: T) => TSerializedProperty): ISerializedAnnotation<TSerializedProperty>[] {
		return this._annotations.map(annotation => {
			const range = { start: annotation.range.start, endExclusive: annotation.range.endExclusive };
			if (!annotation.annotation) {
				return { range, annotation: undefined };
			}
			return { range, annotation: serializingFunc(annotation.annotation) };
		});
	}

	static deserialize<T, TSerializedProperty extends DefinedValue>(serializedAnnotations: ISerializedAnnotation<TSerializedProperty>[], deserializingFunc: (annotation: TSerializedProperty) => T): AnnotationsUpdate<T> {
		const annotations: IAnnotationUpdate<T>[] = serializedAnnotations.map(serializedAnnotation => {
			const range = new OffsetRange(serializedAnnotation.range.start, serializedAnnotation.range.endExclusive);
			if (!serializedAnnotation.annotation) {
				return { range, annotation: undefined };
			}
			return { range, annotation: deserializingFunc(serializedAnnotation.annotation) };
		});
		return new AnnotationsUpdate(annotations);
	}
}
