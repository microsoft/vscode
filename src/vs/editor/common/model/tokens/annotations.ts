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
		console.log('edit : ', JSON.stringify(edit));
		console.log('this._annotations before edit: ', JSON.stringify(this._annotations));

		const withinAnnotation = (value: number, offset: number): boolean => {
			const annotation = this._annotations[offset];
			const isWithin = value >= annotation.range.start && value <= annotation.range.endExclusive;
			return isWithin;
		};

		for (const replacement of edit.replacements) {

			const replaceRangeStart = replacement.replaceRange.start;
			const replaceRangeEnd = replacement.replaceRange.endExclusive;
			const newLength = replacement.newText.length;

			console.log('replaceRangeStart : ', replaceRangeStart);
			console.log('replaceRangeEnd : ', replaceRangeEnd);
			console.log('newLength : ', newLength);

			const firstIndexEditAppliedTo = this._getStartIndexOfIntersectingAnnotation(replaceRangeStart);
			const endIndexEditAppliedTo = this._getEndIndexOfIntersectingAnnotation(replaceRangeEnd);

			console.log('firstIndexEditAppliedTo : ', firstIndexEditAppliedTo);
			console.log('endIndexEditAppliedTo : ', endIndexEditAppliedTo);

			let deletionStartIndex = -1;
			let deletionEndIndex = -1;

			if (firstIndexEditAppliedTo === endIndexEditAppliedTo) {
				const annotation = this._annotations[firstIndexEditAppliedTo];
				const annotationStart = annotation.range.start;
				const annotationEnd = annotation.range.endExclusive;

				// Assume [] indicates the edit position and () indicates the annotation range
				if (!withinAnnotation(replaceRangeEnd, firstIndexEditAppliedTo) && !withinAnnotation(replaceRangeStart, firstIndexEditAppliedTo)) {
					// []...()
					console.log('if 1');
					const offset = newLength - (replaceRangeEnd - replaceRangeStart);
					annotation.range = new OffsetRange(annotationStart + offset, annotationEnd + offset);
				} else if (!withinAnnotation(replaceRangeStart, firstIndexEditAppliedTo) && withinAnnotation(replaceRangeEnd, firstIndexEditAppliedTo)) {
					// [...(...]...)
					console.log('if 2');
					annotation.range = new OffsetRange(replaceRangeStart, replaceRangeStart + (annotationEnd - replaceRangeEnd) + newLength);
				} else {
					if (replaceRangeStart === annotationStart && replaceRangeEnd === annotationEnd) {
						// ([...])
						console.log('if 3');
						deletionStartIndex = firstIndexEditAppliedTo;
						deletionEndIndex = firstIndexEditAppliedTo;
					} else {
						// (...[]...)
						console.log('if 4');
						annotation.range = new OffsetRange(annotationStart, annotationEnd - (replaceRangeEnd - replaceRangeStart) + newLength);
					}
				}
			} else {
				if (withinAnnotation(replaceRangeStart, firstIndexEditAppliedTo)) {
					// The edit start border is enclosed within a decoration, but not the end
					const annotationStart = this._annotations[firstIndexEditAppliedTo].range.start;
					if (annotationStart === replaceRangeStart) {
						console.log('if 5');
						deletionStartIndex = firstIndexEditAppliedTo;
					} else {
						console.log('if 6');
						this._annotations[firstIndexEditAppliedTo].range = new OffsetRange(annotationStart, replaceRangeStart - 1);
						deletionStartIndex = firstIndexEditAppliedTo + 1;
					}
				} else {
					console.log('if 7');
					deletionStartIndex = firstIndexEditAppliedTo;
				}
				if (withinAnnotation(replaceRangeEnd, endIndexEditAppliedTo)) {
					const annotationEnd = this._annotations[endIndexEditAppliedTo].range.endExclusive;
					if (annotationEnd === replaceRangeEnd) {
						console.log('if 8');
						deletionEndIndex = endIndexEditAppliedTo;
					} else {
						console.log('if 9');
						const offset = replaceRangeStart + newLength;
						const delta = annotationEnd - replaceRangeEnd;
						this._annotations[endIndexEditAppliedTo].range = new OffsetRange(offset, offset + delta);
						deletionEndIndex = endIndexEditAppliedTo - 1;
					}
				} else {
					console.log('if 10');
					deletionEndIndex = endIndexEditAppliedTo;
				}
			}
			if (deletionStartIndex > deletionEndIndex) {
				deletionStartIndex = -1;
				deletionEndIndex = -1;
			}
			console.log('deletionStartIndex : ', deletionStartIndex);
			console.log('deletionEndIndex : ', deletionEndIndex);

			console.log('---------------------------------------');

			const offset = newLength - (replaceRangeEnd - replaceRangeStart);

			console.log('offset : ', offset);

			const newAnnotations: IAnnotation<T>[] = [];
			for (const [index, annotation] of this._annotations.entries()) {
				console.log('index : ', index);
				console.log('annotation : ', JSON.stringify(annotation));
				if (index >= deletionStartIndex && index <= deletionEndIndex) {
					console.log('deleting annotation: ', JSON.stringify(annotation));
					continue;
				}
				if (index > endIndexEditAppliedTo) {
					annotation.range = new OffsetRange(annotation.range.start + offset, annotation.range.endExclusive + offset);
				}
				console.log('updated annotation: ', JSON.stringify(annotation));
				newAnnotations.push(annotation);
			}
			console.log('annotations : ', JSON.stringify(newAnnotations));
			this._annotations = newAnnotations;
		}
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
