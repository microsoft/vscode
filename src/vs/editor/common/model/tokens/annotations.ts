/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch2 } from '../../../../base/common/arrays.js';
import { StringEdit, applyEditsToTypedRanges } from '../../core/edits/stringEdit.js';
import { OffsetRange } from '../../core/ranges/offsetRange.js';

export interface IAnnotation<T> {
	range: OffsetRange;
	annotation: T | undefined;
}

export interface IAnnotationUpdate<T> {
	range: OffsetRange;
	annotation: T | undefined;
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
			endIndexExclusive = endIndexWhereToReplace;
		} else {
			// if (endIndexWhereToReplace === -1) {
			// 	endIndexExclusive = 0;
			// } else {
			const candidate = this._annotations[-(endIndexWhereToReplace + 1)]?.range;
			if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
				endIndexExclusive = - endIndexWhereToReplace;
			} else {
				endIndexExclusive = - (endIndexWhereToReplace + 1);
			}
			// }
		}
		return endIndexExclusive;
	}

	public getAllAnnotations(): IAnnotation<T>[] {
		return this._annotations.slice();
	}

	public applyEdit(edit: StringEdit): void {
		this._annotations = applyEditsToTypedRanges(
			this._annotations,
			(a) => a.range,
			(a, range) => ({ range, annotation: a.annotation }),
			edit
		);
		this._annotations = this._annotations.filter(a => !a.range.isEmpty);
	}

	public clone(): IAnnotatedString<T> {
		const newAnnotations = this._annotations.map(a => {
			return { range: a.range, annotation: a.annotation };
		});
		return new AnnotatedString<T>(newAnnotations);
	}
}

export type ISerializedProperty = { [property: string]: string | number } | undefined;

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

	private constructor(annotations: IAnnotationUpdate<T>[]) {
		this._annotatedString = new AnnotatedString<T>(annotations);
	}

	get annotations(): IAnnotationUpdate<T>[] {
		return this._annotatedString.getAllAnnotations();
	}

	public rebase(edit: StringEdit): void {
		this._annotatedString.applyEdit(edit);
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
