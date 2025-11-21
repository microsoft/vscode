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
	annotation: T;
}

export interface IAnnotatedString<T> {
	/**
	 * Annotations are set for a specific line
	 * @param annotations
	 */
	setAnnotations(range: OffsetRange, annotations: AnnotationsUpdate<T>): void;
	/**
	 * The returned annotations are sorted by range and non-overlapping.
	 * The result does not contain annotations with empty range and annotations with undefined value.
	 */
	getAnnotationsIntersecting(range: OffsetRange): IAnnotation<T>[];
	getAllAnnotations(): IAnnotation<T>[];
	applyEdit(edit: StringEdit): void;
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

	public setAnnotations(range: OffsetRange, annotations: AnnotationsUpdate<T>): void {
		const startIndex = this._getStartIndexOfIntersectingAnnotation(range.start);
		const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(range.endExclusive);
		this._annotations.splice(startIndex, endIndexExclusive - startIndex, ...annotations.annotations);
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
			if (startIndexWhereToReplace === -1) {
				startIndex = 0;
			} else {
				const candidate = this._annotations[- (startIndexWhereToReplace + 2)].range;
				if (offset >= candidate.start && offset <= candidate.endExclusive) {
					startIndex = - (startIndexWhereToReplace + 2);
				} else {
					startIndex = - (startIndexWhereToReplace + 1);
				}
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
			endIndexExclusive = endIndexWhereToReplace;
		} else {
			if (endIndexWhereToReplace === -1) {
				endIndexExclusive = 0;
			} else {
				const candidate = this._annotations[-(endIndexWhereToReplace + 1)]?.range;
				if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
					endIndexExclusive = - endIndexWhereToReplace;
				} else {
					endIndexExclusive = - (endIndexWhereToReplace + 1);
				}
			}
		}
		return endIndexExclusive;
	}

	public getAllAnnotations(): IAnnotation<T>[] {
		return this._annotations.slice();
	}

	public applyEdit(edit: StringEdit): void {
		const result: IAnnotation<T>[] = [];
		const sortedAnnotations = this._annotations.slice();
		let offset = 0;

		// iterating over all the edits
		for (const e of edit.replacements) {
			while (true) {
				// Take the first annotation in the array
				const a = sortedAnnotations[0];
				// If there is no annotation, or if  a.range.endExclusive < e.replaceRange.start
				// the second condition implies that the annotation is completely before the edit
				if (!a || a.range.endExclusive >= e.replaceRange.start) {
					break;
				}
				sortedAnnotations.shift();
				// What is this offset?
				result.push({ range: a.range.delta(offset), annotation: a.annotation });
			}

			// contains all the intersecting annotations
			const intersecting: IAnnotation<T>[] = [];
			while (true) {
				const a = sortedAnnotations[0];
				// If the annotation is not defined
				// Or it does not intersect or touch the replace range, we break
				if (!a || !a.range.intersectsOrTouches(e.replaceRange)) {
					break;
				}
				sortedAnnotations.shift();
				intersecting.push(a);
			}

			// Going down from the last intersecting annotation to the first one
			for (let i = intersecting.length - 1; i >= 0; i--) {
				const a = intersecting[i];
				let r = a.range;

				// It's the length of the overlap
				const overlap = r.intersect(e.replaceRange)!.length;
				r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));

				const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
				if (rangeAheadOfReplaceRange > 0) {
					r = r.delta(-rangeAheadOfReplaceRange);
				}

				if (i !== 0) {
					r = r.delta(e.newText.length);
				}

				// We already took our offset into account.
				// Because we add r back to the queue (which then adds offset again),
				// we have to remove it here.
				r = r.delta(-(e.newText.length - e.replaceRange.length));

				sortedAnnotations.unshift({ range: r, annotation: a.annotation });
			}

			// Taking the offset and adding to it the different in the lengths of the edit
			offset += e.newText.length - e.replaceRange.length;
		}

		while (true) {
			const a = sortedAnnotations[0];
			if (!a) {
				break;
			}
			sortedAnnotations.shift();
			result.push({ range: a.range.delta(offset), annotation: a.annotation });
		}

		// Filtering for non-empty ranges
		this._annotations = result.filter(a => !a.range.isEmpty);
	}

	public clone(): IAnnotatedString<T> {
		return new AnnotatedString<T>(this._annotations.slice());
	}
}

export type ISerializedProperty = { [property: string]: string | number };

export type ISerializedAnnotation = {
	range: [number, number];
	annotation: ISerializedProperty;
};

export class AnnotationsUpdate<T> {

	/**
	 * The ranges are sorted and non-overlapping.
	 */
	public static create<T>(annotations: IAnnotationUpdate<T>[]): AnnotationsUpdate<T> {
		return new AnnotationsUpdate(annotations);
	}

	private readonly _annotatedString: AnnotatedString<T>;
	private readonly _annotations: IAnnotationUpdate<T>[];

	private constructor(annotations: IAnnotationUpdate<T>[]) {
		this._annotatedString = new AnnotatedString<T>(annotations);
		this._annotations = annotations;
	}

	get annotations(): IAnnotationUpdate<T>[] {
		return this._annotations;
	}

	public rebase(edit: StringEdit): void {
		this._annotatedString.applyEdit(edit);
	}

	static serialize<T>(update: AnnotationsUpdate<T>, serializingFunc: (annotation: T) => ISerializedProperty): ISerializedAnnotation[] {
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
