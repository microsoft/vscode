/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch2 } from '../../../../base/common/arrays.js';
import { StringEdit } from '../../core/edits/stringEdit.js';
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
	getAnnotationsIntersecting(range: OffsetRange, print?: boolean): IAnnotation<T>[];
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

	public getAnnotationsIntersecting(range: OffsetRange, print: boolean = false): IAnnotation<T>[] {
		if (print) {
			console.log('getAnnotationsIntersecting range: ', JSON.stringify(range));
		}
		const startIndex = this._getStartIndexOfIntersectingAnnotation(range.start);
		const endIndexExclusive = this._getEndIndexOfIntersectingAnnotation(range.endExclusive, print);
		if (print) {
			console.log('startIndex: ', startIndex, ' endIndexExclusive: ', endIndexExclusive);
		}
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

	private _getEndIndexOfIntersectingAnnotation(offset: number, print: boolean = false): number {
		if (print) { console.log('_getEndIndexOfIntersectingAnnotation offset: ', offset); }
		const endIndexWhereToReplace = binarySearch2(this._annotations.length, (index) => {
			return this._annotations[index].range.endExclusive - offset;
		});
		if (print) { console.log('endIndexWhereToReplace: ', endIndexWhereToReplace); }
		let endIndexExclusive: number;
		if (endIndexWhereToReplace >= 0) {
			if (print) { console.log('if'); }
			endIndexExclusive = endIndexWhereToReplace + 1;
		} else {
			const candidate = this._annotations[-(endIndexWhereToReplace + 1)]?.range;
			if (print) { console.log('else candidate: ', candidate); }
			if (candidate && offset >= candidate.start && offset <= candidate.endExclusive) {
				if (print) { console.log('if'); }
				endIndexExclusive = - endIndexWhereToReplace;
			} else {
				if (print) { console.log('else'); }
				endIndexExclusive = - (endIndexWhereToReplace + 1);
			}
		}
		return endIndexExclusive;
	}

	public getAllAnnotations(): IAnnotation<T>[] {
		return this._annotations.slice();
	}

	public applyEdit(edit: StringEdit): void {
		const annotationsCopy = this._annotations.slice();

		// treat edits as deletion of the replace range and then as insertion that extends the first range
		const result: IAnnotation<T>[] = [];

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
		this._annotations = result.filter(a => !a.range.isEmpty);
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
