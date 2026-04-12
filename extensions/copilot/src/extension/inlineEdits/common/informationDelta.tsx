/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';

const N_GRAM_UNDO_RATIO_TO_FILTER_OUT = 0.7;

/**
 * Represents information loss/gain (4-grams) via an edit.
 */
export class InformationDelta {

	constructor(
		public readonly inserted: Set<string> = new Set<string>(),
		public readonly deleted: Set<string> = new Set<string>()
	) { }

	combine(other: InformationDelta) {
		return new InformationDelta(setUnion(this.inserted, other.inserted), setUnion(this.deleted, other.deleted));
	}

	isUndoneBy(other: InformationDelta) {
		const otherReallyNewInsertions = setMinus(other.inserted, other.deleted);
		const otherReallyDeleted = setMinus(other.deleted, other.inserted);

		const otherReallyDeletesMyInserts = setIntersectionCount(otherReallyDeleted, this.inserted);
		const otherReallyInsertsMyDeletes = setIntersectionCount(otherReallyNewInsertions, this.deleted);

		if (otherReallyDeleted.size > 6 && otherReallyDeletesMyInserts / otherReallyDeleted.size > N_GRAM_UNDO_RATIO_TO_FILTER_OUT) {
			return true;
		}

		if (otherReallyNewInsertions.size > 6 && otherReallyInsertsMyDeletes / otherReallyNewInsertions.size > N_GRAM_UNDO_RATIO_TO_FILTER_OUT) {
			return true;
		}

		return false;
	}
}

export function getInformationDelta(source: string, edit: StringEdit): InformationDelta {
	const inserted = new Set<string>();
	const deleted = new Set<string>();
	const tryAddDeleted = (deletedRange: OffsetRange | undefined) => {
		if (!deletedRange) {
			return;
		}
		const deletedText = source.substring(deletedRange.start, deletedRange.endExclusive);
		for (let line of deletedText.split(/\r\n|\r|\n/)) {
			line = line.trim();
			for (const piece of to4grams(line)) {
				deleted.add(piece);
			}
		}
	};
	const tryAddInserted = (insertedText: string) => {
		for (let line of insertedText.split(/\r\n|\r|\n/)) {
			line = line.trim();
			for (const piece of to4grams(line)) {
				inserted.add(piece);
			}
		}
	};
	for (const e of edit.replacements) {
		const e1 = e.removeCommonPrefix(source).removeCommonSuffix(source);
		const e2 = e.removeCommonSuffix(source).removeCommonPrefix(source);
		if (e1.isEmpty) {
			continue;
		}
		tryAddDeleted(e1.replaceRange);
		tryAddDeleted(e2.replaceRange);
		tryAddDeleted(e1.replaceRange.intersect(e2.replaceRange));

		// tryAddInserted(e1.newText);
		// tryAddInserted(e2.newText);
		// e1 might have a suffix overlap with the prefix of e1
		tryAddInserted(trimOverlap(e1.newText, e2.newText));
	}
	return new InformationDelta(inserted, deleted);
}

function trimOverlap(stringToEliminateEnd: string, stringToEliminateStart: string): string {
	const length = Math.min(stringToEliminateEnd.length, stringToEliminateStart.length);
	for (let trimLength = 0; trimLength < length; trimLength++) {
		const str1 = stringToEliminateEnd.slice(0, stringToEliminateEnd.length - trimLength);
		const str2 = stringToEliminateStart.slice(trimLength);
		if (str1 === str2) {
			return str1;
		}
	}
	return '';
}

function to4grams(text: string) {
	const result: string[] = [];
	for (let i = 4; i < text.length; i++) {
		const ngram = text.slice(i - 4, i);
		result.push(ngram);
	}
	return result;
}

function setUnion(a: Set<string>, b: Set<string>): Set<string> {
	const result = new Set<string>();
	for (const el of a) {
		result.add(el);
	}
	for (const el of b) {
		result.add(el);
	}
	return result;
}

function setMinus(a: Set<string>, b: Set<string>): Set<string> {
	const result = new Set<string>();
	for (const el of a) {
		if (!b.has(el)) {
			result.add(el);
		}
	}
	return result;
}

function setIntersectionCount(a: Set<string>, b: Set<string>): number {
	let result = 0;
	for (const el of a) {
		if (b.has(el)) {
			result++;
		}
	}
	return result;
}
