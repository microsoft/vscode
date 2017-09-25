/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DiffChange } from 'vs/base/common/diff/diffChange';


function createStringSequence(a: string): ISequence {

	return {
		getLength() { return a.length; },
		getElementHash(pos: number) { return a[pos]; }
	};
}

export function stringDiff(original: string, modified: string, pretty: boolean): IDiffChange[] {
	return new LcsDiff(createStringSequence(original), createStringSequence(modified)).ComputeDiff(pretty);
}


export interface ISequence {
	getLength(): number;
	getElementHash(index: number): string;
}

export interface IDiffChange {
	/**
	 * The position of the first element in the original sequence which
	 * this change affects.
	 */
	originalStart: number;

	/**
	 * The number of elements from the original sequence which were
	 * affected.
	 */
	originalLength: number;

	/**
	 * The position of the first element in the modified sequence which
	 * this change affects.
	 */
	modifiedStart: number;

	/**
	 * The number of elements from the modified sequence which were
	 * affected (added).
	 */
	modifiedLength: number;
}

export interface IContinueProcessingPredicate {
	(furthestOriginalIndex: number, originalSequence: ISequence, matchLengthOfLongest: number): boolean;
}

//
// The code below has been ported from a C# implementation in VS
//

export class Debug {

	public static Assert(condition: boolean, message: string): void {
		if (!condition) {
			throw new Error(message);
		}
	}
}

export class MyArray {
	/**
	 * Copies a range of elements from an Array starting at the specified source index and pastes
	 * them to another Array starting at the specified destination index. The length and the indexes
	 * are specified as 64-bit integers.
	 * sourceArray:
	 *		The Array that contains the data to copy.
	 * sourceIndex:
	 *		A 64-bit integer that represents the index in the sourceArray at which copying begins.
	 * destinationArray:
	 *		The Array that receives the data.
	 * destinationIndex:
	 *		A 64-bit integer that represents the index in the destinationArray at which storing begins.
	 * length:
	 *		A 64-bit integer that represents the number of elements to copy.
	 */
	public static Copy(sourceArray: any[], sourceIndex: number, destinationArray: any[], destinationIndex: number, length: number) {
		for (let i = 0; i < length; i++) {
			destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
		}
	}
}

//*****************************************************************************
// LcsDiff.cs
//
// An implementation of the difference algorithm described in
// "An O(ND) Difference Algorithm and its letiations" by Eugene W. Myers
//
// Copyright (C) 2008 Microsoft Corporation @minifier_do_not_preserve
//*****************************************************************************

// Our total memory usage for storing history is (worst-case):
// 2 * [(MaxDifferencesHistory + 1) * (MaxDifferencesHistory + 1) - 1] * sizeof(int)
// 2 * [1448*1448 - 1] * 4 = 16773624 = 16MB
let MaxDifferencesHistory = 1447;
//let MaxDifferencesHistory = 100;




/**
 * A utility class which helps to create the set of DiffChanges from
 * a difference operation. This class accepts original DiffElements and
 * modified DiffElements that are involved in a particular change. The
 * MarktNextChange() method can be called to mark the separation between
 * distinct changes. At the end, the Changes property can be called to retrieve
 * the constructed changes.
 */
class DiffChangeHelper {

	private m_changes: DiffChange[];
	private m_originalStart: number;
	private m_modifiedStart: number;
	private m_originalCount: number;
	private m_modifiedCount: number;

	/**
	 * Constructs a new DiffChangeHelper for the given DiffSequences.
	 */
	constructor() {
		this.m_changes = [];
		this.m_originalStart = Number.MAX_VALUE;
		this.m_modifiedStart = Number.MAX_VALUE;
		this.m_originalCount = 0;
		this.m_modifiedCount = 0;
	}

	/**
	 * Marks the beginning of the next change in the set of differences.
	 */
	public MarkNextChange(): void {
		// Only add to the list if there is something to add
		if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
			// Add the new change to our list
			this.m_changes.push(new DiffChange(this.m_originalStart, this.m_originalCount,
				this.m_modifiedStart, this.m_modifiedCount));
		}

		// Reset for the next change
		this.m_originalCount = 0;
		this.m_modifiedCount = 0;
		this.m_originalStart = Number.MAX_VALUE;
		this.m_modifiedStart = Number.MAX_VALUE;
	}

	/**
	 * Adds the original element at the given position to the elements
	 * affected by the current change. The modified index gives context
	 * to the change position with respect to the original sequence.
	 * @param originalIndex The index of the original element to add.
	 * @param modifiedIndex The index of the modified element that provides corresponding position in the modified sequence.
	 */
	public AddOriginalElement(originalIndex: number, modifiedIndex: number) {
		// The 'true' start index is the smallest of the ones we've seen
		this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
		this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);

		this.m_originalCount++;
	}

	/**
	 * Adds the modified element at the given position to the elements
	 * affected by the current change. The original index gives context
	 * to the change position with respect to the modified sequence.
	 * @param originalIndex The index of the original element that provides corresponding position in the original sequence.
	 * @param modifiedIndex The index of the modified element to add.
	 */
	public AddModifiedElement(originalIndex: number, modifiedIndex: number): void {
		// The 'true' start index is the smallest of the ones we've seen
		this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
		this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);

		this.m_modifiedCount++;
	}

	/**
	 * Retrieves all of the changes marked by the class.
	 */
	public getChanges(): DiffChange[] {
		if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
			// Finish up on whatever is left
			this.MarkNextChange();
		}

		return this.m_changes;
	}

	/**
	 * Retrieves all of the changes marked by the class in the reverse order
	 */
	public getReverseChanges(): DiffChange[] {
		if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
			// Finish up on whatever is left
			this.MarkNextChange();
		}

		this.m_changes.reverse();
		return this.m_changes;
	}

}

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * An implementation of the difference algorithm described in
 * "An O(ND) Difference Algorithm and its letiations" by Eugene W. Myers
 */
export class LcsDiff {

	private OriginalSequence: ISequence;
	private ModifiedSequence: ISequence;
	private ContinueProcessingPredicate: IContinueProcessingPredicate;

	private m_originalIds: number[];
	private m_modifiedIds: number[];
	private m_forwardHistory: number[][];
	private m_reverseHistory: number[][];

	/**
	 * Constructs the DiffFinder
	 */
	constructor(originalSequence: ISequence, newSequence: ISequence, continueProcessingPredicate: IContinueProcessingPredicate = null) {
		this.OriginalSequence = originalSequence;
		this.ModifiedSequence = newSequence;
		this.ContinueProcessingPredicate = continueProcessingPredicate;
		this.m_originalIds = [];
		this.m_modifiedIds = [];

		this.m_forwardHistory = [];
		this.m_reverseHistory = [];

		this.ComputeUniqueIdentifiers();
	}

	private ComputeUniqueIdentifiers(): void {
		let originalSequenceLength = this.OriginalSequence.getLength();
		let modifiedSequenceLength = this.ModifiedSequence.getLength();
		this.m_originalIds = new Array<number>(originalSequenceLength);
		this.m_modifiedIds = new Array<number>(modifiedSequenceLength);

		// Create a new hash table for unique elements from the original
		// sequence.
		let hashTable: { [key: string]: number; } = {};
		let currentUniqueId = 1;
		let i: number;

		// Fill up the hash table for unique elements
		for (i = 0; i < originalSequenceLength; i++) {
			let originalElementHash = this.OriginalSequence.getElementHash(i);
			if (!hasOwnProperty.call(hashTable, originalElementHash)) {
				// No entry in the hashtable so this is a new unique element.
				// Assign the element a new unique identifier and add it to the
				// hash table
				this.m_originalIds[i] = currentUniqueId++;
				hashTable[originalElementHash] = this.m_originalIds[i];
			} else {
				this.m_originalIds[i] = hashTable[originalElementHash];
			}
		}

		// Now match up modified elements
		for (i = 0; i < modifiedSequenceLength; i++) {
			let modifiedElementHash = this.ModifiedSequence.getElementHash(i);
			if (!hasOwnProperty.call(hashTable, modifiedElementHash)) {
				this.m_modifiedIds[i] = currentUniqueId++;
				hashTable[modifiedElementHash] = this.m_modifiedIds[i];
			} else {
				this.m_modifiedIds[i] = hashTable[modifiedElementHash];
			}
		}
	}

	private ElementsAreEqual(originalIndex: number, newIndex: number): boolean {
		return this.m_originalIds[originalIndex] === this.m_modifiedIds[newIndex];
	}

	private OriginalElementsAreEqual(index1: number, index2: number): boolean {
		return this.m_originalIds[index1] === this.m_originalIds[index2];
	}

	private ModifiedElementsAreEqual(index1: number, index2: number): boolean {
		return this.m_modifiedIds[index1] === this.m_modifiedIds[index2];
	}

	public ComputeDiff(pretty: boolean): IDiffChange[] {
		return this._ComputeDiff(0, this.OriginalSequence.getLength() - 1, 0, this.ModifiedSequence.getLength() - 1, pretty);
	}

	/**
	 * Computes the differences between the original and modified input
	 * sequences on the bounded range.
	 * @returns An array of the differences between the two input sequences.
	 */
	private _ComputeDiff(originalStart: number, originalEnd: number, modifiedStart: number, modifiedEnd: number, pretty: boolean): DiffChange[] {
		let quitEarlyArr = [false];
		let changes = this.ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr);

		if (pretty) {
			// We have to clean up the computed diff to be more intuitive
			// but it turns out this cannot be done correctly until the entire set
			// of diffs have been computed
			return this.ShiftChanges(changes);
		}

		return changes;
	}

	/**
	 * Private helper method which computes the differences on the bounded range
	 * recursively.
	 * @returns An array of the differences between the two input sequences.
	 */
	private ComputeDiffRecursive(originalStart: number, originalEnd: number, modifiedStart: number, modifiedEnd: number, quitEarlyArr: boolean[]): DiffChange[] {
		quitEarlyArr[0] = false;

		// Find the start of the differences
		while (originalStart <= originalEnd && modifiedStart <= modifiedEnd && this.ElementsAreEqual(originalStart, modifiedStart)) {
			originalStart++;
			modifiedStart++;
		}

		// Find the end of the differences
		while (originalEnd >= originalStart && modifiedEnd >= modifiedStart && this.ElementsAreEqual(originalEnd, modifiedEnd)) {
			originalEnd--;
			modifiedEnd--;
		}

		// In the special case where we either have all insertions or all deletions or the sequences are identical
		if (originalStart > originalEnd || modifiedStart > modifiedEnd) {
			let changes: DiffChange[];

			if (modifiedStart <= modifiedEnd) {
				Debug.Assert(originalStart === originalEnd + 1, 'originalStart should only be one more than originalEnd');

				// All insertions
				changes = [
					new DiffChange(originalStart, 0, modifiedStart, modifiedEnd - modifiedStart + 1)
				];
			} else if (originalStart <= originalEnd) {
				Debug.Assert(modifiedStart === modifiedEnd + 1, 'modifiedStart should only be one more than modifiedEnd');

				// All deletions
				changes = [
					new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, 0)
				];
			} else {
				Debug.Assert(originalStart === originalEnd + 1, 'originalStart should only be one more than originalEnd');
				Debug.Assert(modifiedStart === modifiedEnd + 1, 'modifiedStart should only be one more than modifiedEnd');

				// Identical sequences - No differences
				changes = [];
			}

			return changes;
		}

		// This problem can be solved using the Divide-And-Conquer technique.
		let midOriginalArr = [0], midModifiedArr = [0];
		let result = this.ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr);

		let midOriginal = midOriginalArr[0];
		let midModified = midModifiedArr[0];

		if (result !== null) {
			// Result is not-null when there was enough memory to compute the changes while
			// searching for the recursion point
			return result;
		} else if (!quitEarlyArr[0]) {
			// We can break the problem down recursively by finding the changes in the
			// First Half:   (originalStart, modifiedStart) to (midOriginal, midModified)
			// Second Half:  (midOriginal + 1, minModified + 1) to (originalEnd, modifiedEnd)
			// NOTE: ComputeDiff() is inclusive, therefore the second range starts on the next point

			let leftChanges = this.ComputeDiffRecursive(originalStart, midOriginal, modifiedStart, midModified, quitEarlyArr);
			let rightChanges: DiffChange[] = [];

			if (!quitEarlyArr[0]) {
				rightChanges = this.ComputeDiffRecursive(midOriginal + 1, originalEnd, midModified + 1, modifiedEnd, quitEarlyArr);
			} else {
				// We did't have time to finish the first half, so we don't have time to compute this half.
				// Consider the entire rest of the sequence different.
				rightChanges = [
					new DiffChange(midOriginal + 1, originalEnd - (midOriginal + 1) + 1, midModified + 1, modifiedEnd - (midModified + 1) + 1)
				];
			}

			return this.ConcatenateChanges(leftChanges, rightChanges);
		}

		// If we hit here, we quit early, and so can't return anything meaningful
		return [
			new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, modifiedEnd - modifiedStart + 1)
		];
	}

	private WALKTRACE(diagonalForwardBase: number, diagonalForwardStart: number, diagonalForwardEnd: number, diagonalForwardOffset: number,
		diagonalReverseBase: number, diagonalReverseStart: number, diagonalReverseEnd: number, diagonalReverseOffset: number,
		forwardPoints: number[], reversePoints: number[],
		originalIndex: number, originalEnd: number, midOriginalArr: number[],
		modifiedIndex: number, modifiedEnd: number, midModifiedArr: number[],
		deltaIsEven: boolean, quitEarlyArr: boolean[]): DiffChange[] {
		let forwardChanges: DiffChange[] = null, reverseChanges: DiffChange[] = null;

		// First, walk backward through the forward diagonals history
		let changeHelper = new DiffChangeHelper();
		let diagonalMin = diagonalForwardStart;
		let diagonalMax = diagonalForwardEnd;
		let diagonalRelative = (midOriginalArr[0] - midModifiedArr[0]) - diagonalForwardOffset;
		let lastOriginalIndex = Number.MIN_VALUE;
		let historyIndex = this.m_forwardHistory.length - 1;
		let diagonal: number;

		do {
			// Get the diagonal index from the relative diagonal number
			diagonal = diagonalRelative + diagonalForwardBase;

			// Figure out where we came from
			if (diagonal === diagonalMin || (diagonal < diagonalMax && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1])) {
				// Vertical line (the element is an insert)
				originalIndex = forwardPoints[diagonal + 1];
				modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
				if (originalIndex < lastOriginalIndex) {
					changeHelper.MarkNextChange();
				}
				lastOriginalIndex = originalIndex;
				changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex);
				diagonalRelative = (diagonal + 1) - diagonalForwardBase; //Setup for the next iteration
			} else {
				// Horizontal line (the element is a deletion)
				originalIndex = forwardPoints[diagonal - 1] + 1;
				modifiedIndex = originalIndex - diagonalRelative - diagonalForwardOffset;
				if (originalIndex < lastOriginalIndex) {
					changeHelper.MarkNextChange();
				}
				lastOriginalIndex = originalIndex - 1;
				changeHelper.AddOriginalElement(originalIndex, modifiedIndex + 1);
				diagonalRelative = (diagonal - 1) - diagonalForwardBase; //Setup for the next iteration
			}

			if (historyIndex >= 0) {
				forwardPoints = this.m_forwardHistory[historyIndex];
				diagonalForwardBase = forwardPoints[0]; //We stored this in the first spot
				diagonalMin = 1;
				diagonalMax = forwardPoints.length - 1;
			}
		} while (--historyIndex >= -1);

		// Ironically, we get the forward changes as the reverse of the
		// order we added them since we technically added them backwards
		forwardChanges = changeHelper.getReverseChanges();

		if (quitEarlyArr[0]) {
			// TODO: Calculate a partial from the reverse diagonals.
			//       For now, just assume everything after the midOriginal/midModified point is a diff

			let originalStartPoint = midOriginalArr[0] + 1;
			let modifiedStartPoint = midModifiedArr[0] + 1;

			if (forwardChanges !== null && forwardChanges.length > 0) {
				let lastForwardChange = forwardChanges[forwardChanges.length - 1];
				originalStartPoint = Math.max(originalStartPoint, lastForwardChange.getOriginalEnd());
				modifiedStartPoint = Math.max(modifiedStartPoint, lastForwardChange.getModifiedEnd());
			}

			reverseChanges = [
				new DiffChange(originalStartPoint, originalEnd - originalStartPoint + 1,
					modifiedStartPoint, modifiedEnd - modifiedStartPoint + 1)
			];
		} else {
			// Now walk backward through the reverse diagonals history
			changeHelper = new DiffChangeHelper();
			diagonalMin = diagonalReverseStart;
			diagonalMax = diagonalReverseEnd;
			diagonalRelative = (midOriginalArr[0] - midModifiedArr[0]) - diagonalReverseOffset;
			lastOriginalIndex = Number.MAX_VALUE;
			historyIndex = (deltaIsEven) ? this.m_reverseHistory.length - 1 : this.m_reverseHistory.length - 2;

			do {
				// Get the diagonal index from the relative diagonal number
				diagonal = diagonalRelative + diagonalReverseBase;

				// Figure out where we came from
				if (diagonal === diagonalMin || (diagonal < diagonalMax && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1])) {
					// Horizontal line (the element is a deletion))
					originalIndex = reversePoints[diagonal + 1] - 1;
					modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
					if (originalIndex > lastOriginalIndex) {
						changeHelper.MarkNextChange();
					}
					lastOriginalIndex = originalIndex + 1;
					changeHelper.AddOriginalElement(originalIndex + 1, modifiedIndex + 1);
					diagonalRelative = (diagonal + 1) - diagonalReverseBase; //Setup for the next iteration
				} else {
					// Vertical line (the element is an insertion)
					originalIndex = reversePoints[diagonal - 1];
					modifiedIndex = originalIndex - diagonalRelative - diagonalReverseOffset;
					if (originalIndex > lastOriginalIndex) {
						changeHelper.MarkNextChange();
					}
					lastOriginalIndex = originalIndex;
					changeHelper.AddModifiedElement(originalIndex + 1, modifiedIndex + 1);
					diagonalRelative = (diagonal - 1) - diagonalReverseBase; //Setup for the next iteration
				}

				if (historyIndex >= 0) {
					reversePoints = this.m_reverseHistory[historyIndex];
					diagonalReverseBase = reversePoints[0]; //We stored this in the first spot
					diagonalMin = 1;
					diagonalMax = reversePoints.length - 1;
				}
			} while (--historyIndex >= -1);

			// There are cases where the reverse history will find diffs that
			// are correct, but not intuitive, so we need shift them.
			reverseChanges = changeHelper.getChanges();
		}

		return this.ConcatenateChanges(forwardChanges, reverseChanges);
	}

	/**
	 * Given the range to compute the diff on, this method finds the point:
	 * (midOriginal, midModified)
	 * that exists in the middle of the LCS of the two sequences and
	 * is the point at which the LCS problem may be broken down recursively.
	 * This method will try to keep the LCS trace in memory. If the LCS recursion
	 * point is calculated and the full trace is available in memory, then this method
	 * will return the change list.
	 * @param originalStart The start bound of the original sequence range
	 * @param originalEnd The end bound of the original sequence range
	 * @param modifiedStart The start bound of the modified sequence range
	 * @param modifiedEnd The end bound of the modified sequence range
	 * @param midOriginal The middle point of the original sequence range
	 * @param midModified The middle point of the modified sequence range
	 * @returns The diff changes, if available, otherwise null
	 */
	private ComputeRecursionPoint(originalStart: number, originalEnd: number, modifiedStart: number, modifiedEnd: number, midOriginalArr: number[], midModifiedArr: number[], quitEarlyArr: boolean[]) {
		let originalIndex: number, modifiedIndex: number;
		let diagonalForwardStart = 0, diagonalForwardEnd = 0;
		let diagonalReverseStart = 0, diagonalReverseEnd = 0;
		let numDifferences: number;

		// To traverse the edit graph and produce the proper LCS, our actual
		// start position is just outside the given boundary
		originalStart--;
		modifiedStart--;

		// We set these up to make the compiler happy, but they will
		// be replaced before we return with the actual recursion point
		midOriginalArr[0] = 0;
		midModifiedArr[0] = 0;

		// Clear out the history
		this.m_forwardHistory = [];
		this.m_reverseHistory = [];

		// Each cell in the two arrays corresponds to a diagonal in the edit graph.
		// The integer value in the cell represents the originalIndex of the furthest
		// reaching point found so far that ends in that diagonal.
		// The modifiedIndex can be computed mathematically from the originalIndex and the diagonal number.
		let maxDifferences = (originalEnd - originalStart) + (modifiedEnd - modifiedStart);
		let numDiagonals = maxDifferences + 1;
		let forwardPoints: number[] = new Array<number>(numDiagonals);
		let reversePoints: number[] = new Array<number>(numDiagonals);
		// diagonalForwardBase: Index into forwardPoints of the diagonal which passes through (originalStart, modifiedStart)
		// diagonalReverseBase: Index into reversePoints of the diagonal which passes through (originalEnd, modifiedEnd)
		let diagonalForwardBase = (modifiedEnd - modifiedStart);
		let diagonalReverseBase = (originalEnd - originalStart);
		// diagonalForwardOffset: Geometric offset which allows modifiedIndex to be computed from originalIndex and the
		//    diagonal number (relative to diagonalForwardBase)
		// diagonalReverseOffset: Geometric offset which allows modifiedIndex to be computed from originalIndex and the
		//    diagonal number (relative to diagonalReverseBase)
		let diagonalForwardOffset = (originalStart - modifiedStart);
		let diagonalReverseOffset = (originalEnd - modifiedEnd);

		// delta: The difference between the end diagonal and the start diagonal. This is used to relate diagonal numbers
		//   relative to the start diagonal with diagonal numbers relative to the end diagonal.
		// The Even/Oddn-ness of this delta is important for determining when we should check for overlap
		let delta = diagonalReverseBase - diagonalForwardBase;
		let deltaIsEven = (delta % 2 === 0);

		// Here we set up the start and end points as the furthest points found so far
		// in both the forward and reverse directions, respectively
		forwardPoints[diagonalForwardBase] = originalStart;
		reversePoints[diagonalReverseBase] = originalEnd;

		// Remember if we quit early, and thus need to do a best-effort result instead of a real result.
		quitEarlyArr[0] = false;



		// A couple of points:
		// --With this method, we iterate on the number of differences between the two sequences.
		//   The more differences there actually are, the longer this will take.
		// --Also, as the number of differences increases, we have to search on diagonals further
		//   away from the reference diagonal (which is diagonalForwardBase for forward, diagonalReverseBase for reverse).
		// --We extend on even diagonals (relative to the reference diagonal) only when numDifferences
		//   is even and odd diagonals only when numDifferences is odd.
		let diagonal: number, tempOriginalIndex: number;
		for (numDifferences = 1; numDifferences <= (maxDifferences / 2) + 1; numDifferences++) {
			let furthestOriginalIndex = 0;
			let furthestModifiedIndex = 0;

			// Run the algorithm in the forward direction
			diagonalForwardStart = this.ClipDiagonalBound(diagonalForwardBase - numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
			diagonalForwardEnd = this.ClipDiagonalBound(diagonalForwardBase + numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
			for (diagonal = diagonalForwardStart; diagonal <= diagonalForwardEnd; diagonal += 2) {
				// STEP 1: We extend the furthest reaching point in the present diagonal
				// by looking at the diagonals above and below and picking the one whose point
				// is further away from the start point (originalStart, modifiedStart)
				if (diagonal === diagonalForwardStart || (diagonal < diagonalForwardEnd && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1])) {
					originalIndex = forwardPoints[diagonal + 1];
				} else {
					originalIndex = forwardPoints[diagonal - 1] + 1;
				}
				modifiedIndex = originalIndex - (diagonal - diagonalForwardBase) - diagonalForwardOffset;

				// Save the current originalIndex so we can test for false overlap in step 3
				tempOriginalIndex = originalIndex;

				// STEP 2: We can continue to extend the furthest reaching point in the present diagonal
				// so long as the elements are equal.
				while (originalIndex < originalEnd && modifiedIndex < modifiedEnd && this.ElementsAreEqual(originalIndex + 1, modifiedIndex + 1)) {
					originalIndex++;
					modifiedIndex++;
				}
				forwardPoints[diagonal] = originalIndex;

				if (originalIndex + modifiedIndex > furthestOriginalIndex + furthestModifiedIndex) {
					furthestOriginalIndex = originalIndex;
					furthestModifiedIndex = modifiedIndex;
				}

				// STEP 3: If delta is odd (overlap first happens on forward when delta is odd)
				// and diagonal is in the range of reverse diagonals computed for numDifferences-1
				// (the previous iteration; we haven't computed reverse diagonals for numDifferences yet)
				// then check for overlap.
				if (!deltaIsEven && Math.abs(diagonal - diagonalReverseBase) <= (numDifferences - 1)) {
					if (originalIndex >= reversePoints[diagonal]) {
						midOriginalArr[0] = originalIndex;
						midModifiedArr[0] = modifiedIndex;

						if (tempOriginalIndex <= reversePoints[diagonal] && MaxDifferencesHistory > 0 && numDifferences <= (MaxDifferencesHistory + 1)) {
							// BINGO! We overlapped, and we have the full trace in memory!
							return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset,
								diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset,
								forwardPoints, reversePoints,
								originalIndex, originalEnd, midOriginalArr,
								modifiedIndex, modifiedEnd, midModifiedArr,
								deltaIsEven, quitEarlyArr
							);
						} else {
							// Either false overlap, or we didn't have enough memory for the full trace
							// Just return the recursion point
							return null;
						}
					}
				}
			}

			// Check to see if we should be quitting early, before moving on to the next iteration.
			let matchLengthOfLongest = ((furthestOriginalIndex - originalStart) + (furthestModifiedIndex - modifiedStart) - numDifferences) / 2;

			if (this.ContinueProcessingPredicate !== null && !this.ContinueProcessingPredicate(furthestOriginalIndex, this.OriginalSequence, matchLengthOfLongest)) {
				// We can't finish, so skip ahead to generating a result from what we have.
				quitEarlyArr[0] = true;

				// Use the furthest distance we got in the forward direction.
				midOriginalArr[0] = furthestOriginalIndex;
				midModifiedArr[0] = furthestModifiedIndex;

				if (matchLengthOfLongest > 0 && MaxDifferencesHistory > 0 && numDifferences <= (MaxDifferencesHistory + 1)) {
					// Enough of the history is in memory to walk it backwards
					return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset,
						diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset,
						forwardPoints, reversePoints,
						originalIndex, originalEnd, midOriginalArr,
						modifiedIndex, modifiedEnd, midModifiedArr,
						deltaIsEven, quitEarlyArr
					);
				} else {
					// We didn't actually remember enough of the history.

					//Since we are quiting the diff early, we need to shift back the originalStart and modified start
					//back into the boundary limits since we decremented their value above beyond the boundary limit.
					originalStart++;
					modifiedStart++;

					return [
						new DiffChange(originalStart, originalEnd - originalStart + 1,
							modifiedStart, modifiedEnd - modifiedStart + 1)
					];
				}
			}

			// Run the algorithm in the reverse direction
			diagonalReverseStart = this.ClipDiagonalBound(diagonalReverseBase - numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
			diagonalReverseEnd = this.ClipDiagonalBound(diagonalReverseBase + numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
			for (diagonal = diagonalReverseStart; diagonal <= diagonalReverseEnd; diagonal += 2) {
				// STEP 1: We extend the furthest reaching point in the present diagonal
				// by looking at the diagonals above and below and picking the one whose point
				// is further away from the start point (originalEnd, modifiedEnd)
				if (diagonal === diagonalReverseStart || (diagonal < diagonalReverseEnd && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1])) {
					originalIndex = reversePoints[diagonal + 1] - 1;
				} else {
					originalIndex = reversePoints[diagonal - 1];
				}
				modifiedIndex = originalIndex - (diagonal - diagonalReverseBase) - diagonalReverseOffset;

				// Save the current originalIndex so we can test for false overlap
				tempOriginalIndex = originalIndex;

				// STEP 2: We can continue to extend the furthest reaching point in the present diagonal
				// as long as the elements are equal.
				while (originalIndex > originalStart && modifiedIndex > modifiedStart && this.ElementsAreEqual(originalIndex, modifiedIndex)) {
					originalIndex--;
					modifiedIndex--;
				}
				reversePoints[diagonal] = originalIndex;

				// STEP 4: If delta is even (overlap first happens on reverse when delta is even)
				// and diagonal is in the range of forward diagonals computed for numDifferences
				// then check for overlap.
				if (deltaIsEven && Math.abs(diagonal - diagonalForwardBase) <= numDifferences) {
					if (originalIndex <= forwardPoints[diagonal]) {
						midOriginalArr[0] = originalIndex;
						midModifiedArr[0] = modifiedIndex;

						if (tempOriginalIndex >= forwardPoints[diagonal] && MaxDifferencesHistory > 0 && numDifferences <= (MaxDifferencesHistory + 1)) {
							// BINGO! We overlapped, and we have the full trace in memory!
							return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset,
								diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset,
								forwardPoints, reversePoints,
								originalIndex, originalEnd, midOriginalArr,
								modifiedIndex, modifiedEnd, midModifiedArr,
								deltaIsEven, quitEarlyArr
							);
						} else {
							// Either false overlap, or we didn't have enough memory for the full trace
							// Just return the recursion point
							return null;
						}
					}
				}
			}

			// Save current vectors to history before the next iteration
			if (numDifferences <= MaxDifferencesHistory) {
				// We are allocating space for one extra int, which we fill with
				// the index of the diagonal base index
				let temp: number[] = new Array<number>(diagonalForwardEnd - diagonalForwardStart + 2);
				temp[0] = diagonalForwardBase - diagonalForwardStart + 1;
				MyArray.Copy(forwardPoints, diagonalForwardStart, temp, 1, diagonalForwardEnd - diagonalForwardStart + 1);
				this.m_forwardHistory.push(temp);

				temp = new Array<number>(diagonalReverseEnd - diagonalReverseStart + 2);
				temp[0] = diagonalReverseBase - diagonalReverseStart + 1;
				MyArray.Copy(reversePoints, diagonalReverseStart, temp, 1, diagonalReverseEnd - diagonalReverseStart + 1);
				this.m_reverseHistory.push(temp);
			}

		}



		// If we got here, then we have the full trace in history. We just have to convert it to a change list
		// NOTE: This part is a bit messy
		return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset,
			diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset,
			forwardPoints, reversePoints,
			originalIndex, originalEnd, midOriginalArr,
			modifiedIndex, modifiedEnd, midModifiedArr,
			deltaIsEven, quitEarlyArr
		);
	}

	/**
	 * Shifts the given changes to provide a more intuitive diff.
	 * While the first element in a diff matches the first element after the diff,
	 * we shift the diff down.
	 *
	 * @param changes The list of changes to shift
	 * @returns The shifted changes
	 */
	private ShiftChanges(changes: DiffChange[]): DiffChange[] {
		let mergedDiffs: boolean;
		do {
			mergedDiffs = false;

			// Shift all the changes down first
			for (let i = 0; i < changes.length; i++) {
				const change = changes[i];
				const originalStop = (i < changes.length - 1) ? changes[i + 1].originalStart : this.OriginalSequence.getLength();
				const modifiedStop = (i < changes.length - 1) ? changes[i + 1].modifiedStart : this.ModifiedSequence.getLength();
				const checkOriginal = change.originalLength > 0;
				const checkModified = change.modifiedLength > 0;

				while (change.originalStart + change.originalLength < originalStop &&
					change.modifiedStart + change.modifiedLength < modifiedStop &&
					(!checkOriginal || this.OriginalElementsAreEqual(change.originalStart, change.originalStart + change.originalLength)) &&
					(!checkModified || this.ModifiedElementsAreEqual(change.modifiedStart, change.modifiedStart + change.modifiedLength))) {
					change.originalStart++;
					change.modifiedStart++;
				}
			}

			// Build up the new list (we have to build a new list because we
			// might have changes we can merge together now)
			let result = new Array<DiffChange>();
			let mergedChangeArr: DiffChange[] = [null];
			for (let i = 0; i < changes.length; i++) {
				if (i < changes.length - 1 && this.ChangesOverlap(changes[i], changes[i + 1], mergedChangeArr)) {
					mergedDiffs = true;
					result.push(mergedChangeArr[0]);
					i++;
				}
				else {
					result.push(changes[i]);
				}
			}

			changes = result;
		} while (mergedDiffs);

		// Shift changes back up until we hit empty or whitespace-only lines
		for (let i = changes.length - 1; i >= 0; i--) {
			const change = changes[i];

			let originalStop = 0;
			let modifiedStop = 0;
			if (i > 0) {
				const prevChange = changes[i - 1];
				if (prevChange.originalLength > 0) {
					originalStop = prevChange.originalStart + prevChange.originalLength;
				}
				if (prevChange.modifiedLength > 0) {
					modifiedStop = prevChange.modifiedStart + prevChange.modifiedLength;
				}
			}

			const checkOriginal = change.originalLength > 0;
			const checkModified = change.modifiedLength > 0;

			let bestDelta = 0;
			let bestScore = this._boundaryScore(change.originalStart, change.originalLength, change.modifiedStart, change.modifiedLength);

			for (let delta = 1; ; delta++) {
				let originalStart = change.originalStart - delta;
				let modifiedStart = change.modifiedStart - delta;

				if (originalStart < originalStop || modifiedStart < modifiedStop) {
					break;
				}

				if (checkOriginal && !this.OriginalElementsAreEqual(originalStart, originalStart + change.originalLength)) {
					break;
				}

				if (checkModified && !this.ModifiedElementsAreEqual(modifiedStart, modifiedStart + change.modifiedLength)) {
					break;
				}

				let score = this._boundaryScore(originalStart, change.originalLength, modifiedStart, change.modifiedLength);

				if (score > bestScore) {
					bestScore = score;
					bestDelta = delta;
				}
			}

			change.originalStart -= bestDelta;
			change.modifiedStart -= bestDelta;
		}

		return changes;
	}

	private _OriginalIsBoundary(index: number): boolean {
		if (index <= 0 || index >= this.OriginalSequence.getLength() - 1) {
			return true;
		}
		return /^\s*$/.test(this.OriginalSequence.getElementHash(index));
	}

	private _OriginalRegionIsBoundary(originalStart: number, originalLength: number): boolean {
		if (this._OriginalIsBoundary(originalStart) || this._OriginalIsBoundary(originalStart - 1)) {
			return true;
		}
		if (originalLength > 0) {
			let originalEnd = originalStart + originalLength;
			if (this._OriginalIsBoundary(originalEnd - 1) || this._OriginalIsBoundary(originalEnd)) {
				return true;
			}
		}
		return false;
	}

	private _ModifiedIsBoundary(index: number): boolean {
		if (index <= 0 || index >= this.ModifiedSequence.getLength() - 1) {
			return true;
		}
		return /^\s*$/.test(this.ModifiedSequence.getElementHash(index));
	}

	private _ModifiedRegionIsBoundary(modifiedStart: number, modifiedLength: number): boolean {
		if (this._ModifiedIsBoundary(modifiedStart) || this._ModifiedIsBoundary(modifiedStart - 1)) {
			return true;
		}
		if (modifiedLength > 0) {
			let modifiedEnd = modifiedStart + modifiedLength;
			if (this._ModifiedIsBoundary(modifiedEnd - 1) || this._ModifiedIsBoundary(modifiedEnd)) {
				return true;
			}
		}
		return false;
	}

	private _boundaryScore(originalStart: number, originalLength: number, modifiedStart: number, modifiedLength: number): number {
		let originalScore = (this._OriginalRegionIsBoundary(originalStart, originalLength) ? 1 : 0);
		let modifiedScore = (this._ModifiedRegionIsBoundary(modifiedStart, modifiedLength) ? 1 : 0);
		return (originalScore + modifiedScore);
	}

	/**
	 * Concatenates the two input DiffChange lists and returns the resulting
	 * list.
	 * @param The left changes
	 * @param The right changes
	 * @returns The concatenated list
	 */
	private ConcatenateChanges(left: DiffChange[], right: DiffChange[]): DiffChange[] {
		let mergedChangeArr: DiffChange[] = [];
		let result: DiffChange[] = null;

		if (left.length === 0 || right.length === 0) {
			return (right.length > 0) ? right : left;
		} else if (this.ChangesOverlap(left[left.length - 1], right[0], mergedChangeArr)) {
			// Since we break the problem down recursively, it is possible that we
			// might recurse in the middle of a change thereby splitting it into
			// two changes. Here in the combining stage, we detect and fuse those
			// changes back together
			result = new Array<DiffChange>(left.length + right.length - 1);
			MyArray.Copy(left, 0, result, 0, left.length - 1);
			result[left.length - 1] = mergedChangeArr[0];
			MyArray.Copy(right, 1, result, left.length, right.length - 1);

			return result;
		} else {
			result = new Array<DiffChange>(left.length + right.length);
			MyArray.Copy(left, 0, result, 0, left.length);
			MyArray.Copy(right, 0, result, left.length, right.length);

			return result;
		}
	}

	/**
	 * Returns true if the two changes overlap and can be merged into a single
	 * change
	 * @param left The left change
	 * @param right The right change
	 * @param mergedChange The merged change if the two overlap, null otherwise
	 * @returns True if the two changes overlap
	 */
	private ChangesOverlap(left: DiffChange, right: DiffChange, mergedChangeArr: DiffChange[]): boolean {
		Debug.Assert(left.originalStart <= right.originalStart, 'Left change is not less than or equal to right change');
		Debug.Assert(left.modifiedStart <= right.modifiedStart, 'Left change is not less than or equal to right change');

		if (left.originalStart + left.originalLength >= right.originalStart || left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
			let originalStart = left.originalStart;
			let originalLength = left.originalLength;
			let modifiedStart = left.modifiedStart;
			let modifiedLength = left.modifiedLength;

			if (left.originalStart + left.originalLength >= right.originalStart) {
				originalLength = right.originalStart + right.originalLength - left.originalStart;
			}
			if (left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
				modifiedLength = right.modifiedStart + right.modifiedLength - left.modifiedStart;
			}

			mergedChangeArr[0] = new DiffChange(originalStart, originalLength, modifiedStart, modifiedLength);
			return true;
		} else {
			mergedChangeArr[0] = null;
			return false;
		}
	}

	/**
	 * Helper method used to clip a diagonal index to the range of valid
	 * diagonals. This also decides whether or not the diagonal index,
	 * if it exceeds the boundary, should be clipped to the boundary or clipped
	 * one inside the boundary depending on the Even/Odd status of the boundary
	 * and numDifferences.
	 * @param diagonal The index of the diagonal to clip.
	 * @param numDifferences The current number of differences being iterated upon.
	 * @param diagonalBaseIndex The base reference diagonal.
	 * @param numDiagonals The total number of diagonals.
	 * @returns The clipped diagonal index.
	 */
	private ClipDiagonalBound(diagonal: number, numDifferences: number, diagonalBaseIndex: number, numDiagonals: number): number {
		if (diagonal >= 0 && diagonal < numDiagonals) {
			// Nothing to clip, its in range
			return diagonal;
		}

		// diagonalsBelow: The number of diagonals below the reference diagonal
		// diagonalsAbove: The number of diagonals above the reference diagonal
		let diagonalsBelow = diagonalBaseIndex;
		let diagonalsAbove = numDiagonals - diagonalBaseIndex - 1;
		let diffEven = (numDifferences % 2 === 0);

		if (diagonal < 0) {
			let lowerBoundEven = (diagonalsBelow % 2 === 0);
			return (diffEven === lowerBoundEven) ? 0 : 1;
		} else {
			let upperBoundEven = (diagonalsAbove % 2 === 0);
			return (diffEven === upperBoundEven) ? numDiagonals - 1 : numDiagonals - 2;
		}
	}
}
