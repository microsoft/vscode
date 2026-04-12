/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DiffChange } from './diffChange.js';
import { stringHash } from '../hash.js';
export class StringDiffSequence {
    constructor(source) {
        this.source = source;
    }
    getElements() {
        const source = this.source;
        const characters = new Int32Array(source.length);
        for (let i = 0, len = source.length; i < len; i++) {
            characters[i] = source.charCodeAt(i);
        }
        return characters;
    }
}
export function stringDiff(original, modified, pretty) {
    return new LcsDiff(new StringDiffSequence(original), new StringDiffSequence(modified)).ComputeDiff(pretty).changes;
}
//
// The code below has been ported from a C# implementation in VS
//
class Debug {
    static Assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
}
class MyArray {
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
    static Copy(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
        for (let i = 0; i < length; i++) {
            destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
        }
    }
    static Copy2(sourceArray, sourceIndex, destinationArray, destinationIndex, length) {
        for (let i = 0; i < length; i++) {
            destinationArray[destinationIndex + i] = sourceArray[sourceIndex + i];
        }
    }
}
//*****************************************************************************
// LcsDiff.cs
//
// An implementation of the difference algorithm described in
// "An O(ND) Difference Algorithm and its variations" by Eugene W. Myers
//
// Copyright (C) 2008 Microsoft Corporation @minifier_do_not_preserve
//*****************************************************************************
// Our total memory usage for storing history is (worst-case):
// 2 * [(MaxDifferencesHistory + 1) * (MaxDifferencesHistory + 1) - 1] * sizeof(int)
// 2 * [1448*1448 - 1] * 4 = 16773624 = 16MB
var LocalConstants;
(function (LocalConstants) {
    LocalConstants[LocalConstants["MaxDifferencesHistory"] = 1447] = "MaxDifferencesHistory";
})(LocalConstants || (LocalConstants = {}));
/**
 * A utility class which helps to create the set of DiffChanges from
 * a difference operation. This class accepts original DiffElements and
 * modified DiffElements that are involved in a particular change. The
 * MarkNextChange() method can be called to mark the separation between
 * distinct changes. At the end, the Changes property can be called to retrieve
 * the constructed changes.
 */
class DiffChangeHelper {
    /**
     * Constructs a new DiffChangeHelper for the given DiffSequences.
     */
    constructor() {
        this.m_changes = [];
        this.m_originalStart = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
        this.m_modifiedStart = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
        this.m_originalCount = 0;
        this.m_modifiedCount = 0;
    }
    /**
     * Marks the beginning of the next change in the set of differences.
     */
    MarkNextChange() {
        // Only add to the list if there is something to add
        if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
            // Add the new change to our list
            this.m_changes.push(new DiffChange(this.m_originalStart, this.m_originalCount, this.m_modifiedStart, this.m_modifiedCount));
        }
        // Reset for the next change
        this.m_originalCount = 0;
        this.m_modifiedCount = 0;
        this.m_originalStart = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
        this.m_modifiedStart = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
    }
    /**
     * Adds the original element at the given position to the elements
     * affected by the current change. The modified index gives context
     * to the change position with respect to the original sequence.
     * @param originalIndex The index of the original element to add.
     * @param modifiedIndex The index of the modified element that provides corresponding position in the modified sequence.
     */
    AddOriginalElement(originalIndex, modifiedIndex) {
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
    AddModifiedElement(originalIndex, modifiedIndex) {
        // The 'true' start index is the smallest of the ones we've seen
        this.m_originalStart = Math.min(this.m_originalStart, originalIndex);
        this.m_modifiedStart = Math.min(this.m_modifiedStart, modifiedIndex);
        this.m_modifiedCount++;
    }
    /**
     * Retrieves all of the changes marked by the class.
     */
    getChanges() {
        if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
            // Finish up on whatever is left
            this.MarkNextChange();
        }
        return this.m_changes;
    }
    /**
     * Retrieves all of the changes marked by the class in the reverse order
     */
    getReverseChanges() {
        if (this.m_originalCount > 0 || this.m_modifiedCount > 0) {
            // Finish up on whatever is left
            this.MarkNextChange();
        }
        this.m_changes.reverse();
        return this.m_changes;
    }
}
/**
 * An implementation of the difference algorithm described in
 * "An O(ND) Difference Algorithm and its variations" by Eugene W. Myers
 */
export class LcsDiff {
    /**
     * Constructs the DiffFinder
     */
    constructor(originalSequence, modifiedSequence, continueProcessingPredicate = null) {
        this.ContinueProcessingPredicate = continueProcessingPredicate;
        this._originalSequence = originalSequence;
        this._modifiedSequence = modifiedSequence;
        const [originalStringElements, originalElementsOrHash, originalHasStrings] = LcsDiff._getElements(originalSequence);
        const [modifiedStringElements, modifiedElementsOrHash, modifiedHasStrings] = LcsDiff._getElements(modifiedSequence);
        this._hasStrings = (originalHasStrings && modifiedHasStrings);
        this._originalStringElements = originalStringElements;
        this._originalElementsOrHash = originalElementsOrHash;
        this._modifiedStringElements = modifiedStringElements;
        this._modifiedElementsOrHash = modifiedElementsOrHash;
        this.m_forwardHistory = [];
        this.m_reverseHistory = [];
    }
    static _isStringArray(arr) {
        return (arr.length > 0 && typeof arr[0] === 'string');
    }
    static _getElements(sequence) {
        const elements = sequence.getElements();
        if (LcsDiff._isStringArray(elements)) {
            const hashes = new Int32Array(elements.length);
            for (let i = 0, len = elements.length; i < len; i++) {
                hashes[i] = stringHash(elements[i], 0);
            }
            return [elements, hashes, true];
        }
        if (elements instanceof Int32Array) {
            return [[], elements, false];
        }
        return [[], new Int32Array(elements), false];
    }
    ElementsAreEqual(originalIndex, newIndex) {
        if (this._originalElementsOrHash[originalIndex] !== this._modifiedElementsOrHash[newIndex]) {
            return false;
        }
        return (this._hasStrings ? this._originalStringElements[originalIndex] === this._modifiedStringElements[newIndex] : true);
    }
    ElementsAreStrictEqual(originalIndex, newIndex) {
        if (!this.ElementsAreEqual(originalIndex, newIndex)) {
            return false;
        }
        const originalElement = LcsDiff._getStrictElement(this._originalSequence, originalIndex);
        const modifiedElement = LcsDiff._getStrictElement(this._modifiedSequence, newIndex);
        return (originalElement === modifiedElement);
    }
    static _getStrictElement(sequence, index) {
        if (typeof sequence.getStrictElement === 'function') {
            return sequence.getStrictElement(index);
        }
        return null;
    }
    OriginalElementsAreEqual(index1, index2) {
        if (this._originalElementsOrHash[index1] !== this._originalElementsOrHash[index2]) {
            return false;
        }
        return (this._hasStrings ? this._originalStringElements[index1] === this._originalStringElements[index2] : true);
    }
    ModifiedElementsAreEqual(index1, index2) {
        if (this._modifiedElementsOrHash[index1] !== this._modifiedElementsOrHash[index2]) {
            return false;
        }
        return (this._hasStrings ? this._modifiedStringElements[index1] === this._modifiedStringElements[index2] : true);
    }
    ComputeDiff(pretty) {
        return this._ComputeDiff(0, this._originalElementsOrHash.length - 1, 0, this._modifiedElementsOrHash.length - 1, pretty);
    }
    /**
     * Computes the differences between the original and modified input
     * sequences on the bounded range.
     * @returns An array of the differences between the two input sequences.
     */
    _ComputeDiff(originalStart, originalEnd, modifiedStart, modifiedEnd, pretty) {
        const quitEarlyArr = [false];
        let changes = this.ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr);
        if (pretty) {
            // We have to clean up the computed diff to be more intuitive
            // but it turns out this cannot be done correctly until the entire set
            // of diffs have been computed
            changes = this.PrettifyChanges(changes);
        }
        return {
            quitEarly: quitEarlyArr[0],
            changes: changes
        };
    }
    /**
     * Private helper method which computes the differences on the bounded range
     * recursively.
     * @returns An array of the differences between the two input sequences.
     */
    ComputeDiffRecursive(originalStart, originalEnd, modifiedStart, modifiedEnd, quitEarlyArr) {
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
            let changes;
            if (modifiedStart <= modifiedEnd) {
                Debug.Assert(originalStart === originalEnd + 1, 'originalStart should only be one more than originalEnd');
                // All insertions
                changes = [
                    new DiffChange(originalStart, 0, modifiedStart, modifiedEnd - modifiedStart + 1)
                ];
            }
            else if (originalStart <= originalEnd) {
                Debug.Assert(modifiedStart === modifiedEnd + 1, 'modifiedStart should only be one more than modifiedEnd');
                // All deletions
                changes = [
                    new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, 0)
                ];
            }
            else {
                Debug.Assert(originalStart === originalEnd + 1, 'originalStart should only be one more than originalEnd');
                Debug.Assert(modifiedStart === modifiedEnd + 1, 'modifiedStart should only be one more than modifiedEnd');
                // Identical sequences - No differences
                changes = [];
            }
            return changes;
        }
        // This problem can be solved using the Divide-And-Conquer technique.
        const midOriginalArr = [0];
        const midModifiedArr = [0];
        const result = this.ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr);
        const midOriginal = midOriginalArr[0];
        const midModified = midModifiedArr[0];
        if (result !== null) {
            // Result is not-null when there was enough memory to compute the changes while
            // searching for the recursion point
            return result;
        }
        else if (!quitEarlyArr[0]) {
            // We can break the problem down recursively by finding the changes in the
            // First Half:   (originalStart, modifiedStart) to (midOriginal, midModified)
            // Second Half:  (midOriginal + 1, minModified + 1) to (originalEnd, modifiedEnd)
            // NOTE: ComputeDiff() is inclusive, therefore the second range starts on the next point
            const leftChanges = this.ComputeDiffRecursive(originalStart, midOriginal, modifiedStart, midModified, quitEarlyArr);
            let rightChanges = [];
            if (!quitEarlyArr[0]) {
                rightChanges = this.ComputeDiffRecursive(midOriginal + 1, originalEnd, midModified + 1, modifiedEnd, quitEarlyArr);
            }
            else {
                // We didn't have time to finish the first half, so we don't have time to compute this half.
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
    WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr) {
        let forwardChanges = null;
        let reverseChanges = null;
        // First, walk backward through the forward diagonals history
        let changeHelper = new DiffChangeHelper();
        let diagonalMin = diagonalForwardStart;
        let diagonalMax = diagonalForwardEnd;
        let diagonalRelative = (midOriginalArr[0] - midModifiedArr[0]) - diagonalForwardOffset;
        let lastOriginalIndex = -1073741824 /* Constants.MIN_SAFE_SMALL_INTEGER */;
        let historyIndex = this.m_forwardHistory.length - 1;
        do {
            // Get the diagonal index from the relative diagonal number
            const diagonal = diagonalRelative + diagonalForwardBase;
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
            }
            else {
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
                const lastForwardChange = forwardChanges[forwardChanges.length - 1];
                originalStartPoint = Math.max(originalStartPoint, lastForwardChange.getOriginalEnd());
                modifiedStartPoint = Math.max(modifiedStartPoint, lastForwardChange.getModifiedEnd());
            }
            reverseChanges = [
                new DiffChange(originalStartPoint, originalEnd - originalStartPoint + 1, modifiedStartPoint, modifiedEnd - modifiedStartPoint + 1)
            ];
        }
        else {
            // Now walk backward through the reverse diagonals history
            changeHelper = new DiffChangeHelper();
            diagonalMin = diagonalReverseStart;
            diagonalMax = diagonalReverseEnd;
            diagonalRelative = (midOriginalArr[0] - midModifiedArr[0]) - diagonalReverseOffset;
            lastOriginalIndex = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */;
            historyIndex = (deltaIsEven) ? this.m_reverseHistory.length - 1 : this.m_reverseHistory.length - 2;
            do {
                // Get the diagonal index from the relative diagonal number
                const diagonal = diagonalRelative + diagonalReverseBase;
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
                }
                else {
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
    ComputeRecursionPoint(originalStart, originalEnd, modifiedStart, modifiedEnd, midOriginalArr, midModifiedArr, quitEarlyArr) {
        let originalIndex = 0, modifiedIndex = 0;
        let diagonalForwardStart = 0, diagonalForwardEnd = 0;
        let diagonalReverseStart = 0, diagonalReverseEnd = 0;
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
        const maxDifferences = (originalEnd - originalStart) + (modifiedEnd - modifiedStart);
        const numDiagonals = maxDifferences + 1;
        const forwardPoints = new Int32Array(numDiagonals);
        const reversePoints = new Int32Array(numDiagonals);
        // diagonalForwardBase: Index into forwardPoints of the diagonal which passes through (originalStart, modifiedStart)
        // diagonalReverseBase: Index into reversePoints of the diagonal which passes through (originalEnd, modifiedEnd)
        const diagonalForwardBase = (modifiedEnd - modifiedStart);
        const diagonalReverseBase = (originalEnd - originalStart);
        // diagonalForwardOffset: Geometric offset which allows modifiedIndex to be computed from originalIndex and the
        //    diagonal number (relative to diagonalForwardBase)
        // diagonalReverseOffset: Geometric offset which allows modifiedIndex to be computed from originalIndex and the
        //    diagonal number (relative to diagonalReverseBase)
        const diagonalForwardOffset = (originalStart - modifiedStart);
        const diagonalReverseOffset = (originalEnd - modifiedEnd);
        // delta: The difference between the end diagonal and the start diagonal. This is used to relate diagonal numbers
        //   relative to the start diagonal with diagonal numbers relative to the end diagonal.
        // The Even/Oddn-ness of this delta is important for determining when we should check for overlap
        const delta = diagonalReverseBase - diagonalForwardBase;
        const deltaIsEven = (delta % 2 === 0);
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
        for (let numDifferences = 1; numDifferences <= (maxDifferences / 2) + 1; numDifferences++) {
            let furthestOriginalIndex = 0;
            let furthestModifiedIndex = 0;
            // Run the algorithm in the forward direction
            diagonalForwardStart = this.ClipDiagonalBound(diagonalForwardBase - numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
            diagonalForwardEnd = this.ClipDiagonalBound(diagonalForwardBase + numDifferences, numDifferences, diagonalForwardBase, numDiagonals);
            for (let diagonal = diagonalForwardStart; diagonal <= diagonalForwardEnd; diagonal += 2) {
                // STEP 1: We extend the furthest reaching point in the present diagonal
                // by looking at the diagonals above and below and picking the one whose point
                // is further away from the start point (originalStart, modifiedStart)
                if (diagonal === diagonalForwardStart || (diagonal < diagonalForwardEnd && forwardPoints[diagonal - 1] < forwardPoints[diagonal + 1])) {
                    originalIndex = forwardPoints[diagonal + 1];
                }
                else {
                    originalIndex = forwardPoints[diagonal - 1] + 1;
                }
                modifiedIndex = originalIndex - (diagonal - diagonalForwardBase) - diagonalForwardOffset;
                // Save the current originalIndex so we can test for false overlap in step 3
                const tempOriginalIndex = originalIndex;
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
                        if (tempOriginalIndex <= reversePoints[diagonal] && 1447 /* LocalConstants.MaxDifferencesHistory */ > 0 && numDifferences <= (1447 /* LocalConstants.MaxDifferencesHistory */ + 1)) {
                            // BINGO! We overlapped, and we have the full trace in memory!
                            return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr);
                        }
                        else {
                            // Either false overlap, or we didn't have enough memory for the full trace
                            // Just return the recursion point
                            return null;
                        }
                    }
                }
            }
            // Check to see if we should be quitting early, before moving on to the next iteration.
            const matchLengthOfLongest = ((furthestOriginalIndex - originalStart) + (furthestModifiedIndex - modifiedStart) - numDifferences) / 2;
            if (this.ContinueProcessingPredicate !== null && !this.ContinueProcessingPredicate(furthestOriginalIndex, matchLengthOfLongest)) {
                // We can't finish, so skip ahead to generating a result from what we have.
                quitEarlyArr[0] = true;
                // Use the furthest distance we got in the forward direction.
                midOriginalArr[0] = furthestOriginalIndex;
                midModifiedArr[0] = furthestModifiedIndex;
                if (matchLengthOfLongest > 0 && 1447 /* LocalConstants.MaxDifferencesHistory */ > 0 && numDifferences <= (1447 /* LocalConstants.MaxDifferencesHistory */ + 1)) {
                    // Enough of the history is in memory to walk it backwards
                    return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr);
                }
                else {
                    // We didn't actually remember enough of the history.
                    //Since we are quitting the diff early, we need to shift back the originalStart and modified start
                    //back into the boundary limits since we decremented their value above beyond the boundary limit.
                    originalStart++;
                    modifiedStart++;
                    return [
                        new DiffChange(originalStart, originalEnd - originalStart + 1, modifiedStart, modifiedEnd - modifiedStart + 1)
                    ];
                }
            }
            // Run the algorithm in the reverse direction
            diagonalReverseStart = this.ClipDiagonalBound(diagonalReverseBase - numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
            diagonalReverseEnd = this.ClipDiagonalBound(diagonalReverseBase + numDifferences, numDifferences, diagonalReverseBase, numDiagonals);
            for (let diagonal = diagonalReverseStart; diagonal <= diagonalReverseEnd; diagonal += 2) {
                // STEP 1: We extend the furthest reaching point in the present diagonal
                // by looking at the diagonals above and below and picking the one whose point
                // is further away from the start point (originalEnd, modifiedEnd)
                if (diagonal === diagonalReverseStart || (diagonal < diagonalReverseEnd && reversePoints[diagonal - 1] >= reversePoints[diagonal + 1])) {
                    originalIndex = reversePoints[diagonal + 1] - 1;
                }
                else {
                    originalIndex = reversePoints[diagonal - 1];
                }
                modifiedIndex = originalIndex - (diagonal - diagonalReverseBase) - diagonalReverseOffset;
                // Save the current originalIndex so we can test for false overlap
                const tempOriginalIndex = originalIndex;
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
                        if (tempOriginalIndex >= forwardPoints[diagonal] && 1447 /* LocalConstants.MaxDifferencesHistory */ > 0 && numDifferences <= (1447 /* LocalConstants.MaxDifferencesHistory */ + 1)) {
                            // BINGO! We overlapped, and we have the full trace in memory!
                            return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr);
                        }
                        else {
                            // Either false overlap, or we didn't have enough memory for the full trace
                            // Just return the recursion point
                            return null;
                        }
                    }
                }
            }
            // Save current vectors to history before the next iteration
            if (numDifferences <= 1447 /* LocalConstants.MaxDifferencesHistory */) {
                // We are allocating space for one extra int, which we fill with
                // the index of the diagonal base index
                let temp = new Int32Array(diagonalForwardEnd - diagonalForwardStart + 2);
                temp[0] = diagonalForwardBase - diagonalForwardStart + 1;
                MyArray.Copy2(forwardPoints, diagonalForwardStart, temp, 1, diagonalForwardEnd - diagonalForwardStart + 1);
                this.m_forwardHistory.push(temp);
                temp = new Int32Array(diagonalReverseEnd - diagonalReverseStart + 2);
                temp[0] = diagonalReverseBase - diagonalReverseStart + 1;
                MyArray.Copy2(reversePoints, diagonalReverseStart, temp, 1, diagonalReverseEnd - diagonalReverseStart + 1);
                this.m_reverseHistory.push(temp);
            }
        }
        // If we got here, then we have the full trace in history. We just have to convert it to a change list
        // NOTE: This part is a bit messy
        return this.WALKTRACE(diagonalForwardBase, diagonalForwardStart, diagonalForwardEnd, diagonalForwardOffset, diagonalReverseBase, diagonalReverseStart, diagonalReverseEnd, diagonalReverseOffset, forwardPoints, reversePoints, originalIndex, originalEnd, midOriginalArr, modifiedIndex, modifiedEnd, midModifiedArr, deltaIsEven, quitEarlyArr);
    }
    /**
     * Shifts the given changes to provide a more intuitive diff.
     * While the first element in a diff matches the first element after the diff,
     * we shift the diff down.
     *
     * @param changes The list of changes to shift
     * @returns The shifted changes
     */
    PrettifyChanges(changes) {
        // Shift all the changes down first
        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const originalStop = (i < changes.length - 1) ? changes[i + 1].originalStart : this._originalElementsOrHash.length;
            const modifiedStop = (i < changes.length - 1) ? changes[i + 1].modifiedStart : this._modifiedElementsOrHash.length;
            const checkOriginal = change.originalLength > 0;
            const checkModified = change.modifiedLength > 0;
            while (change.originalStart + change.originalLength < originalStop
                && change.modifiedStart + change.modifiedLength < modifiedStop
                && (!checkOriginal || this.OriginalElementsAreEqual(change.originalStart, change.originalStart + change.originalLength))
                && (!checkModified || this.ModifiedElementsAreEqual(change.modifiedStart, change.modifiedStart + change.modifiedLength))) {
                const startStrictEqual = this.ElementsAreStrictEqual(change.originalStart, change.modifiedStart);
                const endStrictEqual = this.ElementsAreStrictEqual(change.originalStart + change.originalLength, change.modifiedStart + change.modifiedLength);
                if (endStrictEqual && !startStrictEqual) {
                    // moving the change down would create an equal change, but the elements are not strict equal
                    break;
                }
                change.originalStart++;
                change.modifiedStart++;
            }
            const mergedChangeArr = [null];
            if (i < changes.length - 1 && this.ChangesOverlap(changes[i], changes[i + 1], mergedChangeArr)) {
                changes[i] = mergedChangeArr[0];
                changes.splice(i + 1, 1);
                i--;
                continue;
            }
        }
        // Shift changes back up until we hit empty or whitespace-only lines
        for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            let originalStop = 0;
            let modifiedStop = 0;
            if (i > 0) {
                const prevChange = changes[i - 1];
                originalStop = prevChange.originalStart + prevChange.originalLength;
                modifiedStop = prevChange.modifiedStart + prevChange.modifiedLength;
            }
            const checkOriginal = change.originalLength > 0;
            const checkModified = change.modifiedLength > 0;
            let bestDelta = 0;
            let bestScore = this._boundaryScore(change.originalStart, change.originalLength, change.modifiedStart, change.modifiedLength);
            for (let delta = 1;; delta++) {
                const originalStart = change.originalStart - delta;
                const modifiedStart = change.modifiedStart - delta;
                if (originalStart < originalStop || modifiedStart < modifiedStop) {
                    break;
                }
                if (checkOriginal && !this.OriginalElementsAreEqual(originalStart, originalStart + change.originalLength)) {
                    break;
                }
                if (checkModified && !this.ModifiedElementsAreEqual(modifiedStart, modifiedStart + change.modifiedLength)) {
                    break;
                }
                const touchingPreviousChange = (originalStart === originalStop && modifiedStart === modifiedStop);
                const score = ((touchingPreviousChange ? 5 : 0)
                    + this._boundaryScore(originalStart, change.originalLength, modifiedStart, change.modifiedLength));
                if (score > bestScore) {
                    bestScore = score;
                    bestDelta = delta;
                }
            }
            change.originalStart -= bestDelta;
            change.modifiedStart -= bestDelta;
            const mergedChangeArr = [null];
            if (i > 0 && this.ChangesOverlap(changes[i - 1], changes[i], mergedChangeArr)) {
                changes[i - 1] = mergedChangeArr[0];
                changes.splice(i, 1);
                i++;
                continue;
            }
        }
        // There could be multiple longest common substrings.
        // Give preference to the ones containing longer lines
        if (this._hasStrings) {
            for (let i = 1, len = changes.length; i < len; i++) {
                const aChange = changes[i - 1];
                const bChange = changes[i];
                const matchedLength = bChange.originalStart - aChange.originalStart - aChange.originalLength;
                const aOriginalStart = aChange.originalStart;
                const bOriginalEnd = bChange.originalStart + bChange.originalLength;
                const abOriginalLength = bOriginalEnd - aOriginalStart;
                const aModifiedStart = aChange.modifiedStart;
                const bModifiedEnd = bChange.modifiedStart + bChange.modifiedLength;
                const abModifiedLength = bModifiedEnd - aModifiedStart;
                // Avoid wasting a lot of time with these searches
                if (matchedLength < 5 && abOriginalLength < 20 && abModifiedLength < 20) {
                    const t = this._findBetterContiguousSequence(aOriginalStart, abOriginalLength, aModifiedStart, abModifiedLength, matchedLength);
                    if (t) {
                        const [originalMatchStart, modifiedMatchStart] = t;
                        if (originalMatchStart !== aChange.originalStart + aChange.originalLength || modifiedMatchStart !== aChange.modifiedStart + aChange.modifiedLength) {
                            // switch to another sequence that has a better score
                            aChange.originalLength = originalMatchStart - aChange.originalStart;
                            aChange.modifiedLength = modifiedMatchStart - aChange.modifiedStart;
                            bChange.originalStart = originalMatchStart + matchedLength;
                            bChange.modifiedStart = modifiedMatchStart + matchedLength;
                            bChange.originalLength = bOriginalEnd - bChange.originalStart;
                            bChange.modifiedLength = bModifiedEnd - bChange.modifiedStart;
                        }
                    }
                }
            }
        }
        return changes;
    }
    _findBetterContiguousSequence(originalStart, originalLength, modifiedStart, modifiedLength, desiredLength) {
        if (originalLength < desiredLength || modifiedLength < desiredLength) {
            return null;
        }
        const originalMax = originalStart + originalLength - desiredLength + 1;
        const modifiedMax = modifiedStart + modifiedLength - desiredLength + 1;
        let bestScore = 0;
        let bestOriginalStart = 0;
        let bestModifiedStart = 0;
        for (let i = originalStart; i < originalMax; i++) {
            for (let j = modifiedStart; j < modifiedMax; j++) {
                const score = this._contiguousSequenceScore(i, j, desiredLength);
                if (score > 0 && score > bestScore) {
                    bestScore = score;
                    bestOriginalStart = i;
                    bestModifiedStart = j;
                }
            }
        }
        if (bestScore > 0) {
            return [bestOriginalStart, bestModifiedStart];
        }
        return null;
    }
    _contiguousSequenceScore(originalStart, modifiedStart, length) {
        let score = 0;
        for (let l = 0; l < length; l++) {
            if (!this.ElementsAreEqual(originalStart + l, modifiedStart + l)) {
                return 0;
            }
            score += this._originalStringElements[originalStart + l].length;
        }
        return score;
    }
    _OriginalIsBoundary(index) {
        if (index <= 0 || index >= this._originalElementsOrHash.length - 1) {
            return true;
        }
        return (this._hasStrings && /^\s*$/.test(this._originalStringElements[index]));
    }
    _OriginalRegionIsBoundary(originalStart, originalLength) {
        if (this._OriginalIsBoundary(originalStart) || this._OriginalIsBoundary(originalStart - 1)) {
            return true;
        }
        if (originalLength > 0) {
            const originalEnd = originalStart + originalLength;
            if (this._OriginalIsBoundary(originalEnd - 1) || this._OriginalIsBoundary(originalEnd)) {
                return true;
            }
        }
        return false;
    }
    _ModifiedIsBoundary(index) {
        if (index <= 0 || index >= this._modifiedElementsOrHash.length - 1) {
            return true;
        }
        return (this._hasStrings && /^\s*$/.test(this._modifiedStringElements[index]));
    }
    _ModifiedRegionIsBoundary(modifiedStart, modifiedLength) {
        if (this._ModifiedIsBoundary(modifiedStart) || this._ModifiedIsBoundary(modifiedStart - 1)) {
            return true;
        }
        if (modifiedLength > 0) {
            const modifiedEnd = modifiedStart + modifiedLength;
            if (this._ModifiedIsBoundary(modifiedEnd - 1) || this._ModifiedIsBoundary(modifiedEnd)) {
                return true;
            }
        }
        return false;
    }
    _boundaryScore(originalStart, originalLength, modifiedStart, modifiedLength) {
        const originalScore = (this._OriginalRegionIsBoundary(originalStart, originalLength) ? 1 : 0);
        const modifiedScore = (this._ModifiedRegionIsBoundary(modifiedStart, modifiedLength) ? 1 : 0);
        return (originalScore + modifiedScore);
    }
    /**
     * Concatenates the two input DiffChange lists and returns the resulting
     * list.
     * @param The left changes
     * @param The right changes
     * @returns The concatenated list
     */
    ConcatenateChanges(left, right) {
        const mergedChangeArr = [];
        if (left.length === 0 || right.length === 0) {
            return (right.length > 0) ? right : left;
        }
        else if (this.ChangesOverlap(left[left.length - 1], right[0], mergedChangeArr)) {
            // Since we break the problem down recursively, it is possible that we
            // might recurse in the middle of a change thereby splitting it into
            // two changes. Here in the combining stage, we detect and fuse those
            // changes back together
            const result = new Array(left.length + right.length - 1);
            MyArray.Copy(left, 0, result, 0, left.length - 1);
            result[left.length - 1] = mergedChangeArr[0];
            MyArray.Copy(right, 1, result, left.length, right.length - 1);
            return result;
        }
        else {
            const result = new Array(left.length + right.length);
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
    ChangesOverlap(left, right, mergedChangeArr) {
        Debug.Assert(left.originalStart <= right.originalStart, 'Left change is not less than or equal to right change');
        Debug.Assert(left.modifiedStart <= right.modifiedStart, 'Left change is not less than or equal to right change');
        if (left.originalStart + left.originalLength >= right.originalStart || left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
            const originalStart = left.originalStart;
            let originalLength = left.originalLength;
            const modifiedStart = left.modifiedStart;
            let modifiedLength = left.modifiedLength;
            if (left.originalStart + left.originalLength >= right.originalStart) {
                originalLength = right.originalStart + right.originalLength - left.originalStart;
            }
            if (left.modifiedStart + left.modifiedLength >= right.modifiedStart) {
                modifiedLength = right.modifiedStart + right.modifiedLength - left.modifiedStart;
            }
            mergedChangeArr[0] = new DiffChange(originalStart, originalLength, modifiedStart, modifiedLength);
            return true;
        }
        else {
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
    ClipDiagonalBound(diagonal, numDifferences, diagonalBaseIndex, numDiagonals) {
        if (diagonal >= 0 && diagonal < numDiagonals) {
            // Nothing to clip, its in range
            return diagonal;
        }
        // diagonalsBelow: The number of diagonals below the reference diagonal
        // diagonalsAbove: The number of diagonals above the reference diagonal
        const diagonalsBelow = diagonalBaseIndex;
        const diagonalsAbove = numDiagonals - diagonalBaseIndex - 1;
        const diffEven = (numDifferences % 2 === 0);
        if (diagonal < 0) {
            const lowerBoundEven = (diagonalsBelow % 2 === 0);
            return (diffEven === lowerBoundEven) ? 0 : 1;
        }
        else {
            const upperBoundEven = (diagonalsAbove % 2 === 0);
            return (diffEven === upperBoundEven) ? numDiagonals - 1 : numDiagonals - 2;
        }
    }
}
/**
 * Precomputed equality array for character codes.
 */
const precomputedEqualityArray = new Uint32Array(0x10000);
/**
 * Computes the Levenshtein distance for strings of length <= 32.
 * @param firstString - The first string.
 * @param secondString - The second string.
 * @returns The Levenshtein distance.
 */
const computeLevenshteinDistanceForShortStrings = (firstString, secondString) => {
    const firstStringLength = firstString.length;
    const secondStringLength = secondString.length;
    const lastBitMask = 1 << (firstStringLength - 1);
    let positiveVector = -1;
    let negativeVector = 0;
    let distance = firstStringLength;
    let index = firstStringLength;
    // Initialize precomputedEqualityArray for firstString
    while (index--) {
        precomputedEqualityArray[firstString.charCodeAt(index)] |= 1 << index;
    }
    // Process each character of secondString
    for (index = 0; index < secondStringLength; index++) {
        let equalityMask = precomputedEqualityArray[secondString.charCodeAt(index)];
        const combinedVector = equalityMask | negativeVector;
        equalityMask |= ((equalityMask & positiveVector) + positiveVector) ^ positiveVector;
        negativeVector |= ~(equalityMask | positiveVector);
        positiveVector &= equalityMask;
        if (negativeVector & lastBitMask) {
            distance++;
        }
        if (positiveVector & lastBitMask) {
            distance--;
        }
        negativeVector = (negativeVector << 1) | 1;
        positiveVector = (positiveVector << 1) | ~(combinedVector | negativeVector);
        negativeVector &= combinedVector;
    }
    // Reset precomputedEqualityArray
    index = firstStringLength;
    while (index--) {
        precomputedEqualityArray[firstString.charCodeAt(index)] = 0;
    }
    return distance;
};
/**
 * Computes the Levenshtein distance for strings of length > 32.
 * @param firstString - The first string.
 * @param secondString - The second string.
 * @returns The Levenshtein distance.
 */
function computeLevenshteinDistanceForLongStrings(firstString, secondString) {
    const firstStringLength = firstString.length;
    const secondStringLength = secondString.length;
    const horizontalBitArray = [];
    const verticalBitArray = [];
    const horizontalSize = Math.ceil(firstStringLength / 32);
    const verticalSize = Math.ceil(secondStringLength / 32);
    // Initialize horizontal and vertical bit arrays
    for (let i = 0; i < horizontalSize; i++) {
        horizontalBitArray[i] = -1;
        verticalBitArray[i] = 0;
    }
    let verticalIndex = 0;
    for (; verticalIndex < verticalSize - 1; verticalIndex++) {
        let negativeVector = 0;
        let positiveVector = -1;
        const start = verticalIndex * 32;
        const verticalLength = Math.min(32, secondStringLength) + start;
        // Initialize precomputedEqualityArray for secondString
        for (let k = start; k < verticalLength; k++) {
            precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
        }
        // Process each character of firstString
        for (let i = 0; i < firstStringLength; i++) {
            const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
            const previousBit = (horizontalBitArray[(i / 32) | 0] >>> i) & 1;
            const matchBit = (verticalBitArray[(i / 32) | 0] >>> i) & 1;
            const combinedVector = equalityMask | negativeVector;
            const combinedHorizontalVector = ((((equalityMask | matchBit) & positiveVector) + positiveVector) ^ positiveVector) | equalityMask | matchBit;
            let positiveHorizontalVector = negativeVector | ~(combinedHorizontalVector | positiveVector);
            let negativeHorizontalVector = positiveVector & combinedHorizontalVector;
            if ((positiveHorizontalVector >>> 31) ^ previousBit) {
                horizontalBitArray[(i / 32) | 0] ^= 1 << i;
            }
            if ((negativeHorizontalVector >>> 31) ^ matchBit) {
                verticalBitArray[(i / 32) | 0] ^= 1 << i;
            }
            positiveHorizontalVector = (positiveHorizontalVector << 1) | previousBit;
            negativeHorizontalVector = (negativeHorizontalVector << 1) | matchBit;
            positiveVector = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
            negativeVector = positiveHorizontalVector & combinedVector;
        }
        // Reset precomputedEqualityArray
        for (let k = start; k < verticalLength; k++) {
            precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
        }
    }
    let negativeVector = 0;
    let positiveVector = -1;
    const start = verticalIndex * 32;
    const verticalLength = Math.min(32, secondStringLength - start) + start;
    // Initialize precomputedEqualityArray for secondString
    for (let k = start; k < verticalLength; k++) {
        precomputedEqualityArray[secondString.charCodeAt(k)] |= 1 << k;
    }
    let distance = secondStringLength;
    // Process each character of firstString
    for (let i = 0; i < firstStringLength; i++) {
        const equalityMask = precomputedEqualityArray[firstString.charCodeAt(i)];
        const previousBit = (horizontalBitArray[(i / 32) | 0] >>> i) & 1;
        const matchBit = (verticalBitArray[(i / 32) | 0] >>> i) & 1;
        const combinedVector = equalityMask | negativeVector;
        const combinedHorizontalVector = ((((equalityMask | matchBit) & positiveVector) + positiveVector) ^ positiveVector) | equalityMask | matchBit;
        let positiveHorizontalVector = negativeVector | ~(combinedHorizontalVector | positiveVector);
        let negativeHorizontalVector = positiveVector & combinedHorizontalVector;
        distance += (positiveHorizontalVector >>> (secondStringLength - 1)) & 1;
        distance -= (negativeHorizontalVector >>> (secondStringLength - 1)) & 1;
        if ((positiveHorizontalVector >>> 31) ^ previousBit) {
            horizontalBitArray[(i / 32) | 0] ^= 1 << i;
        }
        if ((negativeHorizontalVector >>> 31) ^ matchBit) {
            verticalBitArray[(i / 32) | 0] ^= 1 << i;
        }
        positiveHorizontalVector = (positiveHorizontalVector << 1) | previousBit;
        negativeHorizontalVector = (negativeHorizontalVector << 1) | matchBit;
        positiveVector = negativeHorizontalVector | ~(combinedVector | positiveHorizontalVector);
        negativeVector = positiveHorizontalVector & combinedVector;
    }
    // Reset precomputedEqualityArray
    for (let k = start; k < verticalLength; k++) {
        precomputedEqualityArray[secondString.charCodeAt(k)] = 0;
    }
    return distance;
}
/**
 * Computes the Levenshtein distance between two strings.
 * @param firstString - The first string.
 * @param secondString - The second string.
 * @returns The Levenshtein distance.
 */
export function computeLevenshteinDistance(firstString, secondString) {
    if (firstString.length < secondString.length) {
        const temp = secondString;
        secondString = firstString;
        firstString = temp;
    }
    if (secondString.length === 0) {
        return firstString.length;
    }
    if (firstString.length <= 32) {
        return computeLevenshteinDistanceForShortStrings(firstString, secondString);
    }
    return computeLevenshteinDistanceForLongStrings(firstString, secondString);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDN0MsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUd4QyxNQUFNLE9BQU8sa0JBQWtCO0lBRTlCLFlBQW9CLE1BQWM7UUFBZCxXQUFNLEdBQU4sTUFBTSxDQUFRO0lBQUksQ0FBQztJQUV2QyxXQUFXO1FBQ1YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUMzQixNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ25ELFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFDRCxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsVUFBVSxDQUFDLFFBQWdCLEVBQUUsUUFBZ0IsRUFBRSxNQUFlO0lBQzdFLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQztBQUNwSCxDQUFDO0FBMENELEVBQUU7QUFDRixnRUFBZ0U7QUFDaEUsRUFBRTtBQUVGLE1BQU0sS0FBSztJQUVI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