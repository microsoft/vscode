/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../base/common/errors.js';
import { OffsetRange } from './offsetRange.js';

/**
 * Describes an edit to a (0-based) string.
 * Use `TextEdit` to describe edits for a 1-based line/column text.
*/
export class OffsetEdit {
	public static readonly empty = new OffsetEdit([]);

	public static fromJson(data: IOffsetEdit): OffsetEdit {
		return new OffsetEdit(data.map(SingleOffsetEdit.fromJson));
	}

	public static replace(
		range: OffsetRange,
		newText: string,
	): OffsetEdit {
		return new OffsetEdit([new SingleOffsetEdit(range, newText)]);
	}

	public static insert(
		offset: number,
		insertText: string,
	): OffsetEdit {
		return OffsetEdit.replace(OffsetRange.emptyAt(offset), insertText);
	}

	constructor(
		public readonly edits: readonly SingleOffsetEdit[],
	) {
		let lastEndEx = -1;
		for (const edit of edits) {
			if (!(edit.replaceRange.start >= lastEndEx)) {
				throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${edit} after ${lastEndEx}`);
			}
			lastEndEx = edit.replaceRange.endExclusive;
		}
	}

	normalize(): OffsetEdit {
		const edits: SingleOffsetEdit[] = [];
		let lastEdit: SingleOffsetEdit | undefined;
		for (const edit of this.edits) {
			if (edit.newText.length === 0 && edit.replaceRange.length === 0) {
				continue;
			}
			if (lastEdit && lastEdit.replaceRange.endExclusive === edit.replaceRange.start) {
				lastEdit = new SingleOffsetEdit(
					lastEdit.replaceRange.join(edit.replaceRange),
					lastEdit.newText + edit.newText,
				);
			} else {
				if (lastEdit) {
					edits.push(lastEdit);
				}
				lastEdit = edit;
			}
		}
		if (lastEdit) {
			edits.push(lastEdit);
		}
		return new OffsetEdit(edits);
	}

	toString() {
		const edits = this.edits.map(e => e.toString()).join(', ');
		return `[${edits}]`;
	}

	apply(str: string): string {
		const resultText: string[] = [];
		let pos = 0;
		for (const edit of this.edits) {
			resultText.push(str.substring(pos, edit.replaceRange.start));
			resultText.push(edit.newText);
			pos = edit.replaceRange.endExclusive;
		}
		resultText.push(str.substring(pos));
		return resultText.join('');
	}

	compose(other: OffsetEdit): OffsetEdit {
		return joinEdits(this, other);
	}

	/**
	 * Creates an edit that reverts this edit.
	 */
	inverse(originalStr: string): OffsetEdit {
		const edits: SingleOffsetEdit[] = [];
		let offset = 0;
		for (const e of this.edits) {
			edits.push(new SingleOffsetEdit(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),
				originalStr.substring(e.replaceRange.start, e.replaceRange.endExclusive),
			));
			offset += e.newText.length - e.replaceRange.length;
		}
		return new OffsetEdit(edits);
	}

	getNewTextRanges(): OffsetRange[] {
		const ranges: OffsetRange[] = [];
		let offset = 0;
		for (const e of this.edits) {
			ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),);
			offset += e.newText.length - e.replaceRange.length;
		}
		return ranges;
	}

	get isEmpty(): boolean {
		return this.edits.length === 0;
	}

	/**
	 * Consider `t1 := text o base` and `t2 := text o this`.
	 * We are interested in `tm := tryMerge(t1, t2, base: text)`.
	 * For that, we compute `tm' := t1 o base o this.rebase(base)`
	 * such that `tm' === tm`.
	 */
	tryRebase(base: OffsetEdit): OffsetEdit {
		const newEdits: SingleOffsetEdit[] = [];

		let baseIdx = 0;
		let ourIdx = 0;
		let offset = 0;

		while (ourIdx < this.edits.length || baseIdx < base.edits.length) {
			// take the edit that starts first
			const baseEdit = base.edits[baseIdx];
			const ourEdit = this.edits[ourIdx];

			if (!ourEdit) {
				// We processed all our edits
				break;
			} else if (!baseEdit) {
				// no more edits from base
				newEdits.push(new SingleOffsetEdit(
					ourEdit.replaceRange.delta(offset),
					ourEdit.newText,
				));
				ourIdx++;
			} else if (ourEdit.replaceRange.intersects(baseEdit.replaceRange)) {
				ourIdx++; // Don't take our edit, as it is conflicting -> skip
			} else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start) {
				// Our edit starts first
				newEdits.push(new SingleOffsetEdit(
					ourEdit.replaceRange.delta(offset),
					ourEdit.newText,
				));
				ourIdx++;
			} else {
				baseIdx++;
				offset += baseEdit.newText.length - baseEdit.replaceRange.length;
			}
		}

		return new OffsetEdit(newEdits);
	}

	applyToOffset(originalOffset: number): number {
		let accumulatedDelta = 0;
		for (const edit of this.edits) {
			if (edit.replaceRange.start <= originalOffset) {
				if (originalOffset < edit.replaceRange.endExclusive) {
					// the offset is in the replaced range
					return edit.replaceRange.start + accumulatedDelta;
				}
				accumulatedDelta += edit.newText.length - edit.replaceRange.length;
			} else {
				break;
			}
		}
		return originalOffset + accumulatedDelta;
	}

	applyToOffsetRange(originalRange: OffsetRange): OffsetRange {
		return new OffsetRange(
			this.applyToOffset(originalRange.start),
			this.applyToOffset(originalRange.endExclusive)
		);
	}

	applyInverseToOffset(postEditsOffset: number): number {
		let accumulatedDelta = 0;
		for (const edit of this.edits) {
			const editLength = edit.newText.length;
			if (edit.replaceRange.start <= postEditsOffset - accumulatedDelta) {
				if (postEditsOffset - accumulatedDelta < edit.replaceRange.start + editLength) {
					// the offset is in the replaced range
					return edit.replaceRange.start;
				}
				accumulatedDelta += editLength - edit.replaceRange.length;
			} else {
				break;
			}
		}
		return postEditsOffset - accumulatedDelta;
	}
}

export type IOffsetEdit = ISingleOffsetEdit[];

export interface ISingleOffsetEdit {
	txt: string;
	pos: number;
	len: number;
}

export class SingleOffsetEdit {
	public static fromJson(data: ISingleOffsetEdit): SingleOffsetEdit {
		return new SingleOffsetEdit(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
	}

	public static insert(offset: number, text: string): SingleOffsetEdit {
		return new SingleOffsetEdit(OffsetRange.emptyAt(offset), text);
	}

	constructor(
		public readonly replaceRange: OffsetRange,
		public readonly newText: string,
	) { }

	toString(): string {
		return `${this.replaceRange} -> "${this.newText}"`;
	}

	get isEmpty() {
		return this.newText.length === 0 && this.replaceRange.length === 0;
	}
}

/**
 * Invariant:
 * ```
 * edits2.apply(edits1.apply(str)) = join(edits1, edits2).apply(str)
 * ```
 */
function joinEdits(edits1: OffsetEdit, edits2: OffsetEdit): OffsetEdit {
	edits1 = edits1.normalize();
	edits2 = edits2.normalize();

	if (edits1.isEmpty) { return edits2; }
	if (edits2.isEmpty) { return edits1; }

	const edit1Queue = [...edits1.edits];
	const result: SingleOffsetEdit[] = [];

	let edit1ToEdit2 = 0;

	for (const edit2 of edits2.edits) {
		// Copy over edit1 unmodified until it touches edit2.
		while (true) {
			const edit1 = edit1Queue[0]!;
			if (!edit1 || edit1.replaceRange.start + edit1ToEdit2 + edit1.newText.length >= edit2.replaceRange.start) {
				break;
			}
			edit1Queue.shift();

			result.push(edit1);
			edit1ToEdit2 += edit1.newText.length - edit1.replaceRange.length;
		}

		const firstEdit1ToEdit2 = edit1ToEdit2;
		let firstIntersecting: SingleOffsetEdit | undefined; // or touching
		let lastIntersecting: SingleOffsetEdit | undefined; // or touching

		while (true) {
			const edit1 = edit1Queue[0];
			if (!edit1 || edit1.replaceRange.start + edit1ToEdit2 > edit2.replaceRange.endExclusive) {
				break;
			}
			// else we intersect, because the new end of edit1 is after or equal to our start

			if (!firstIntersecting) {
				firstIntersecting = edit1;
			}
			lastIntersecting = edit1;
			edit1Queue.shift();

			edit1ToEdit2 += edit1.newText.length - edit1.replaceRange.length;
		}

		if (!firstIntersecting) {
			result.push(new SingleOffsetEdit(edit2.replaceRange.delta(-edit1ToEdit2), edit2.newText));
		} else {
			let prefix = '';
			const prefixLength = edit2.replaceRange.start - (firstIntersecting.replaceRange.start + firstEdit1ToEdit2);
			if (prefixLength > 0) {
				prefix = firstIntersecting.newText.slice(0, prefixLength);
			}
			const suffixLength = (lastIntersecting!.replaceRange.endExclusive + edit1ToEdit2) - edit2.replaceRange.endExclusive;
			if (suffixLength > 0) {
				const e = new SingleOffsetEdit(OffsetRange.ofStartAndLength(lastIntersecting!.replaceRange.endExclusive, 0), lastIntersecting!.newText.slice(-suffixLength));
				edit1Queue.unshift(e);
				edit1ToEdit2 -= e.newText.length - e.replaceRange.length;
			}
			const newText = prefix + edit2.newText;

			const newReplaceRange = new OffsetRange(
				Math.min(firstIntersecting.replaceRange.start, edit2.replaceRange.start - firstEdit1ToEdit2),
				edit2.replaceRange.endExclusive - edit1ToEdit2
			);
			result.push(new SingleOffsetEdit(newReplaceRange, newText));
		}
	}

	while (true) {
		const item = edit1Queue.shift();
		if (!item) { break; }
		result.push(item);
	}

	return new OffsetEdit(result).normalize();
}
