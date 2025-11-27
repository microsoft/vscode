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

export interface IAnnotationUpdate<T> {
	range: OffsetRange;
	annotation: T | undefined;
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

	public getAnnotationsIntersecting(range: OffsetRange): IAnnotation<T>[] {
		const startIndex = this._getStartIndexOfIntersectingAnnotation(range.start);
		const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(range.endExclusive);
		return this._annotations.slice(startIndex, endIndexExclusive);
	}

	private _getStartIndexOfIntersectingAnnotation(offset: number): number {
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

	public getAllAnnotations(): IAnnotation<T>[] {
		return this._annotations.slice();
	}

	public applyEdit(edit: StringEdit): IAnnotation<T>[] {
		const annotationsCopy = this._annotations.slice();

		// treat edits as deletion of the replace range and then as insertion that extends the first range
		const result: IAnnotation<T>[] = [];
		const deleted: IAnnotation<T>[] = [];

		let offset = 0;

		for (const e of edit.replacements) {
			while (true) {
				// ranges before the current edit
				const r = annotationsCopy[0];
				if (!r) {
					break;
				}
				const range = r.range;
				if (range.endExclusive >= e.replaceRange.start) {
					break;
				}
				annotationsCopy.shift();
				result.push({ range: r.range.delta(offset), annotation: r.annotation });
			}

			const intersecting: IAnnotation<T>[] = [];
			while (true) {
				const typedRange = annotationsCopy[0];
				if (!typedRange) {
					break;
				}
				const range = typedRange.range;
				if (!range.intersectsOrTouches(e.replaceRange)) {
					break;
				}
				annotationsCopy.shift();
				intersecting.push(typedRange);
			}

			for (let i = intersecting.length - 1; i >= 0; i--) {
				const typedRange = intersecting[i];
				let r = typedRange.range;

				const shouldExtend = i === 0 && (e.replaceRange.endExclusive > r.start) && (e.replaceRange.start < r.endExclusive);
				const overlap = r.intersect(e.replaceRange)!.length;
				r = r.deltaEnd(-overlap + (shouldExtend ? e.newText.length : 0));

				const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
				if (rangeAheadOfReplaceRange > 0) {
					r = r.delta(-rangeAheadOfReplaceRange);
				}

				if (!shouldExtend && rangeAheadOfReplaceRange >= 0) {
					r = r.delta(e.newText.length);
				}

				// We already took our offset into account.
				// Because we add r back to the queue (which then adds offset again),
				// we have to remove it here.
				r = r.delta(-(e.newText.length - e.replaceRange.length));

				annotationsCopy.unshift({ annotation: typedRange.annotation, range: r });
			}

			offset += e.newText.length - e.replaceRange.length;
		}

		while (true) {
			const typedRange = annotationsCopy[0];
			if (!typedRange) {
				break;
			}
			annotationsCopy.shift();
			result.push({ annotation: typedRange.annotation, range: typedRange.range.delta(offset) });
		}

		const filteredResult = result.filter(a => {
			if (a.range.isEmpty) {
				deleted.push(a);
				return false;
			}
			return true;
		});
		this._annotations = filteredResult;
		return deleted;
	}

	public clone(): IAnnotatedString<T> {
		return new AnnotatedString<T>(this._annotations.slice());
	}
}

export type ISerializedProperty = { [property: string]: string | number } | undefined;

export type ISerializedAnnotation = {
	range: [number, number];
	annotation: ISerializedProperty;
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

	static serialize<T>(update: AnnotationsUpdate<T>, serializingFunc: (annotation: T | undefined) => ISerializedProperty): ISerializedAnnotation[] {
		return update.annotations.map(annotation => {
			return {
				range: [annotation.range.start, annotation.range.endExclusive],
				annotation: serializingFunc(annotation.annotation)
			};
		});
	}

	static deserialize<T>(serializedAnnotations: ISerializedAnnotation[], deserializingFunc: (annotation: ISerializedProperty) => T): AnnotationsUpdate<T> {
		const annotations: IAnnotationUpdate<T>[] = serializedAnnotations.map(serializedAnnotation => {
			return {
				range: new OffsetRange(serializedAnnotation.range[0], serializedAnnotation.range[1]),
				annotation: deserializingFunc(serializedAnnotation.annotation)
			};
		});
		return new AnnotationsUpdate(annotations);
	}
}
