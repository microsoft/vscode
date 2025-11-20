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
	delete?: boolean;
	offset?: number;
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
		for (const replacement of edit.replacements) {

			const changeEventStartIndex = replacement.replaceRange.start;
			const changeEventEndIndex = replacement.replaceRange.endExclusive;
			const newLength = replacement.newText.length;

			const _firstIndexEditAppliedTo = binarySearch2(this._annotations.length, (index) => {
				return this._annotations[index].range.start - changeEventStartIndex;
			});
			const _endIndexEditAppliedTo = binarySearch2(this._annotations.length, (index) => {
				return this._annotations[index].range.start - changeEventEndIndex;
			});

			const firstIndexEditAppliedTo = (_firstIndexEditAppliedTo > 0 ? _firstIndexEditAppliedTo : - (_firstIndexEditAppliedTo + 1));
			const endIndexEditAppliedTo = (_endIndexEditAppliedTo > 0 ? _endIndexEditAppliedTo : - (_endIndexEditAppliedTo + 1));

			const firstAnnotation = this._annotations[firstIndexEditAppliedTo];
			const lastAnnotation = this._annotations[endIndexEditAppliedTo];

			if (changeEventStartIndex > firstAnnotation.range.endExclusive && changeEventEndIndex > lastAnnotation.range.endExclusive) {
				// The edit start and end borders are not enclosed within a decoration
			} else if (changeEventStartIndex <= firstAnnotation.range.endExclusive && changeEventEndIndex > lastAnnotation.range.endExclusive) {
				// The edit start border is enclosed within a decoration, but not the end
				this._annotations[firstIndexEditAppliedTo].range = new OffsetRange(this._annotations[firstIndexEditAppliedTo].range.start, changeEventStartIndex);

			} else if (changeEventStartIndex > firstAnnotation.range.endExclusive && changeEventEndIndex <= lastAnnotation.range.endExclusive) {
				// The edit end border is enclosed within a decoration, but not the start
				const offset = changeEventStartIndex + newLength;
				this._annotations[endIndexEditAppliedTo].range = new OffsetRange(offset, offset + this._annotations[endIndexEditAppliedTo].range.endExclusive - changeEventEndIndex);
			} else {
				// The edits start and end borders are enclosing within a decoration
				const offset = changeEventStartIndex + newLength;
				this._annotations[firstIndexEditAppliedTo].range = new OffsetRange(this._annotations[firstIndexEditAppliedTo].range.start, changeEventStartIndex);
				this._annotations[endIndexEditAppliedTo].range = new OffsetRange(offset, offset + this._annotations[endIndexEditAppliedTo].range.endExclusive - changeEventEndIndex);
			}
			if (firstIndexEditAppliedTo < endIndexEditAppliedTo) {
				this._annotations[firstIndexEditAppliedTo + 1].delete = true;
				this._annotations[endIndexEditAppliedTo + 1].delete = false;
				this._annotations[endIndexEditAppliedTo + 1].offset = (this._annotations[endIndexEditAppliedTo + 1].offset ?? 0) - (changeEventEndIndex - changeEventStartIndex + newLength);
			}
			const newAnnotations: IAnnotation<T>[] = [];
			let offset = 0;
			for (const annotation of this._annotations) {
				if (annotation.delete) {
					continue;
				}
				offset += annotation.offset ?? 0;
				annotation.range = new OffsetRange(annotation.range.start + offset, annotation.range.endExclusive + offset);
				newAnnotations.push(annotation);
			}
			this._annotations = newAnnotations;
		}
	}

	public clone(): IAnnotatedString<T> {
		return new AnnotatedString<T>(this._annotations.slice());
	}
}

export class AnnotationsUpdate<T> {

	/**
	 * The ranges are sorted and non-overlapping.
	 */
	public static create<T>(annotations: IAnnotationUpdate<T>[]): AnnotationsUpdate<T> {
		return new AnnotationsUpdate(annotations);
	}

	private _annotatedString: AnnotatedString<T>;

	private constructor(public annotations: IAnnotationUpdate<T>[]) {
		this._annotatedString = new AnnotatedString<T>(annotations);
	}

	rebase(edit: StringEdit): void {
		this._annotatedString.applyEdit(edit);
	}
}
