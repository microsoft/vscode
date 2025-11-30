/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotatedString, IAnnotation, IAnnotationUpdate } from '../../../common/model/tokens/annotations.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../common/core/edits/stringEdit.js';

// ============================================================================
// Visual Annotation Test Infrastructure
// ============================================================================
// This infrastructure allows representing annotations visually using brackets:
// - '[' marks the start of an annotation
// - ']' marks the end of an annotation
// - '-' represents positions without annotations
// - Characters inside brackets represent the annotated content
//
// Example: "---[abc]----[xy]---" represents:
//   - annotation at offset 3-6 (content "abc")
//   - annotation at offset 10-12 (content "xy")
// ============================================================================

/**
 * Parses a visual string representation into annotations.
 * The visual string uses '[' and ']' to mark annotation boundaries.
 * Characters between brackets are the annotated content.
 */
function parseVisualAnnotations(visual: string): { annotations: IAnnotation<string>[]; baseString: string } {
	const annotations: IAnnotation<string>[] = [];
	let baseString = '';
	let currentOffset = 0;
	let annotationStart: number | null = null;

	for (let i = 0; i < visual.length; i++) {
		const char = visual[i];
		if (char === '[') {
			if (annotationStart !== null) {
				throw new Error(`Nested brackets at position ${i} are not allowed`);
			}
			annotationStart = currentOffset;
		} else if (char === ']') {
			if (annotationStart === null) {
				throw new Error(`Closing bracket at position ${i} without matching opening bracket`);
			}
			annotations.push({ range: new OffsetRange(annotationStart, currentOffset), annotation: '' });
			annotationStart = null;
		} else {
			baseString += char;
			currentOffset++;
		}
	}

	if (annotationStart !== null) {
		throw new Error('Unclosed bracket in visual string');
	}

	return { annotations, baseString };
}

/**
 * Converts annotations to a visual string representation.
 * Uses '[' and ']' to mark annotation boundaries.
 * The length is automatically determined from the annotations.
 *
 * @param annotations - The annotations to visualize
 * @param fillChar - Character to use for non-annotated positions (default: '-')
 * @param annotatedChar - Character to use for annotated positions (default: '#')
 */
function toVisualString(
	annotations: IAnnotation<string>[],
	fillChar: string = '-',
	annotatedChar: string = '#'
): string {
	if (annotations.length === 0) {
		return '';
	}

	// Sort annotations by start position
	const sortedAnnotations = [...annotations].sort((a, b) => a.range.start - b.range.start);

	// Build the visual representation
	let result = '';
	let pos = 0;

	for (const ann of sortedAnnotations) {
		// Add fill characters before this annotation
		while (pos < ann.range.start) {
			result += fillChar;
			pos++;
		}

		// Add opening bracket and annotated content
		result += '[';
		for (let i = ann.range.start; i < ann.range.endExclusive; i++) {
			result += annotatedChar;
		}
		result += ']';
		pos = ann.range.endExclusive;
	}

	return result;
}

/**
 * Creates an AnnotatedString from a visual representation.
 */
function fromVisual(visual: string): AnnotatedString<string> {
	const { annotations } = parseVisualAnnotations(visual);
	return new AnnotatedString<string>(annotations);
}

/**
 * Converts an AnnotatedString to a visual representation.
 *
 * @param annotatedString - The annotated string to visualize
 */
function toVisual(annotatedString: IAnnotatedString<string>): string {
	return toVisualString(annotatedString.getAllAnnotations());
}

/**
 * Parses visual update annotations, where:
 * - '[...]' represents an annotation to set
 * - '<...>' represents an annotation to delete (range is tracked but annotation is undefined)
 */
function parseVisualUpdate(visual: string): { updates: IAnnotationUpdate<string>[]; baseString: string } {
	const updates: IAnnotationUpdate<string>[] = [];
	let baseString = '';
	let currentOffset = 0;
	let annotationStart: number | null = null;
	let deleteStart: number | null = null;

	for (let i = 0; i < visual.length; i++) {
		const char = visual[i];
		if (char === '[') {
			if (annotationStart !== null || deleteStart !== null) {
				throw new Error(`Nested markers at position ${i} are not allowed`);
			}
			annotationStart = currentOffset;
		} else if (char === ']') {
			if (annotationStart === null) {
				throw new Error(`Closing bracket at position ${i} without matching opening bracket`);
			}
			updates.push({ range: new OffsetRange(annotationStart, currentOffset), annotation: '' });
			annotationStart = null;
		} else if (char === '<') {
			if (annotationStart !== null || deleteStart !== null) {
				throw new Error(`Nested markers at position ${i} are not allowed`);
			}
			deleteStart = currentOffset;
		} else if (char === '>') {
			if (deleteStart === null) {
				throw new Error(`Closing angle bracket at position ${i} without matching opening`);
			}
			updates.push({ range: new OffsetRange(deleteStart, currentOffset), annotation: undefined });
			deleteStart = null;
		} else {
			baseString += char;
			currentOffset++;
		}
	}

	if (annotationStart !== null) {
		throw new Error('Unclosed bracket in visual string');
	}
	if (deleteStart !== null) {
		throw new Error('Unclosed angle bracket in visual string');
	}

	return { updates, baseString };
}

/**
 * Creates an AnnotationsUpdate from a visual representation.
 */
function updateFromVisual(...visuals: string[]): AnnotationsUpdate<string> {
	const updates: IAnnotationUpdate<string>[] = [];

	for (const visual of visuals) {
		const { updates: parsedUpdates } = parseVisualUpdate(visual);
		updates.push(...parsedUpdates);
	}

	return AnnotationsUpdate.create(updates);
}

/**
 * Helper to create a StringEdit from visual notation.
 * Uses a pattern matching approach where:
 * - 'd' marks positions to delete
 * - 'i:text:' inserts 'text' at the marked position
 *
 * Simpler approach: just use offset-based helpers
 */
function editDelete(start: number, end: number): StringEdit {
	return StringEdit.replace(new OffsetRange(start, end), '');
}

function editInsert(pos: number, text: string): StringEdit {
	return StringEdit.insert(pos, text);
}

function editReplace(start: number, end: number, text: string): StringEdit {
	return StringEdit.replace(new OffsetRange(start, end), text);
}

/**
 * Asserts that an AnnotatedString matches the expected visual representation.
 */
function assertVisual(annotatedString: IAnnotatedString<string>, expectedVisual: string): void {
	const actual = toVisual(annotatedString);
	const { annotations: expectedAnnotations } = parseVisualAnnotations(expectedVisual);
	const actualAnnotations = annotatedString.getAllAnnotations();

	// Compare annotations for better error messages
	if (actualAnnotations.length !== expectedAnnotations.length) {
		assert.fail(
			`Annotation count mismatch.\n` +
			`  Expected: ${expectedVisual}\n` +
			`  Actual:   ${actual}\n` +
			`  Expected ${expectedAnnotations.length} annotations, got ${actualAnnotations.length}`
		);
	}

	for (let i = 0; i < actualAnnotations.length; i++) {
		const expected = expectedAnnotations[i];
		const actual = actualAnnotations[i];
		if (actual.range.start !== expected.range.start || actual.range.endExclusive !== expected.range.endExclusive) {
			assert.fail(
				`Annotation ${i} mismatch.\n` +
				`  Expected: (${expected.range.start}, ${expected.range.endExclusive})\n` +
				`  Actual:   (${actual.range.start}, ${actual.range.endExclusive})`
			);
		}
	}
}

/**
 * Helper to visualize the effect of an edit on annotations.
 * Returns both before and after states as visual strings.
 */
function visualizeEdit(
	beforeAnnotations: string,
	edit: StringEdit
): { before: string; after: string } {
	const as = fromVisual(beforeAnnotations);
	const before = toVisual(as);

	as.applyEdit(edit);

	const after = toVisual(as);
	return { before, after };
}

// ============================================================================
// Visual Annotations Test Suite
// ============================================================================
// These tests use a visual representation for better readability:
// - '[...]' marks annotated regions
// - '-' represents unannotated positions
// - '<...>' marks regions to delete (in updates)
//
// Example: "[#####]-----[#####]-----[#####]" represents three annotations
//          at positions (0,5), (10,15), and (20,25)
// ============================================================================

suite('Annotations Suite', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setAnnotations 1', () => {
		// Initial:  [#####]-----[#####]-----[#####]
		//           0     5     10   15     20   25
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Update: extend first annotation to position 7
		as.setAnnotations(updateFromVisual('[#######]'));
		// Expected: [#######]---[#####]-----[#####]
		assertVisual(as, '[#######]---[#####]-----[#####]');

		// Update: add annotation at positions 8-9
		as.setAnnotations(updateFromVisual('--------[#]'));
		// Expected: [#######]-[#]-[#####]-----[#####]
		assertVisual(as, '[#######]-[#]-[#####]-----[#####]');
	});

	test('setAnnotations 2', () => {
		// Initial:  [#####]-----[#####]-----[#####]
		//           0    5     10   15     20   25
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Delete range (1,12) and set (0,6)
		as.setAnnotations(updateFromVisual(
			'-<###########>',  // delete (1,12)
			'[######]'         // set (0,6)
		));
		// Expected: [######]--------------[#####]
		assertVisual(as, '[######]--------------[#####]');

		// Delete range (5,27) and set (0,3)
		as.setAnnotations(updateFromVisual(
			'-----<######################>',  // delete (5,27)
			'[###]'                            // set (0,3)
		));
		// Expected: [###]
		assertVisual(as, '[###]');

		// Set annotation at (1,4)
		as.setAnnotations(updateFromVisual('-[###]'));
		// Expected: -[###]
		assertVisual(as, '-[###]');
	});

	test('setAnnotations 3', () => {
		// Initial:  [#####]-----[#####]-----[#####]
		//           0    5     10   15     20   25
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Set annotation (4,20) - replaces all overlapping
		as.setAnnotations(updateFromVisual('----[################]'));
		// Expected: ----[################]
		assertVisual(as, '----[################]');

		// Add annotation at (22,23)
		as.setAnnotations(updateFromVisual('----------------------[#]'));
		// Expected: ----[################]--[#]
		assertVisual(as, '----[################]--[#]');
	});

	test('getAnnotationsIntersecting 1', () => {
		// String:  [#####]-----[#####]-----[#####]
		//          0    5     10   15     20   25
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Query range (0,12) should get first two annotations
		const result1 = as.getAnnotationsIntersecting(new OffsetRange(0, 12));
		assert.strictEqual(result1.length, 2);
		assert.strictEqual(toVisualString(result1), '[#####]-----[#####]');

		// Query range (0,22) should get all three
		const result2 = as.getAnnotationsIntersecting(new OffsetRange(0, 22));
		assert.strictEqual(result2.length, 3);
		assert.strictEqual(toVisualString(result2), '[#####]-----[#####]-----[#####]');
	});

	test('getAnnotationsIntersecting 2', () => {
		// String:  [#####]-[#]-[#]
		//          0    5 6 7 8 9
		const as = fromVisual('[#####]-[#]-[#]');

		// Query range (5,6) should get first and second
		const result1 = as.getAnnotationsIntersecting(new OffsetRange(5, 6));
		assert.strictEqual(result1.length, 2);
		assert.strictEqual(toVisualString(result1), '[#####]-[#]');

		// Query range (5,8) should get all three
		const result2 = as.getAnnotationsIntersecting(new OffsetRange(5, 8));
		assert.strictEqual(result2.length, 3);
		assert.strictEqual(toVisualString(result2), '[#####]-[#]-[#]');
	});

	test('getAnnotationsIntersecting 3', () => {
		// String:  [#####]-----[#####]
		//          0    5     10   15
		const as = fromVisual('[#####]-----[#####]');

		// Query range (5,10) should touch both annotations
		const result1 = as.getAnnotationsIntersecting(new OffsetRange(5, 10));
		assert.strictEqual(result1.length, 2);

		// Set annotations at (0,4) and (5,9)
		as.setAnnotations(updateFromVisual('[####]-[####]'));
		// Expected: [####]-[####]-[#####]
		assertVisual(as, '[####]-[####]-[#####]');

		// Query range (7,10) should get last two
		const result2 = as.getAnnotationsIntersecting(new OffsetRange(7, 10));
		assert.strictEqual(result2.length, 2);
		assert.strictEqual(toVisualString(result2), '-----[####]-[#####]');
	});

	test('getAnnotationsIntersecting 4', () => {
		// String:  [##########]
		//          0         10
		const as = fromVisual('[##########]');

		// Add annotation at (12,15)
		as.setAnnotations(updateFromVisual('------------[###]'));
		// Now: [##########]--[###]

		// Query range (2,8) should get first annotation only
		const result = as.getAnnotationsIntersecting(new OffsetRange(2, 8));
		assert.strictEqual(result.length, 1);
		assert.strictEqual(toVisualString(result), '[##########]');
	});

	// FIX and this will fix the rendering in the editor
	test('getAnnotationsIntersecting 5', () => {
		// String:  [#########]-[###]-[##]
		//          0        9 10  13 14 16
		const as = fromVisual('[#########]-[###]-[##]');

		// Query range (1,16) should get all three
		const result = as.getAnnotationsIntersecting(new OffsetRange(1, 16));
		assert.strictEqual(result.length, 3);
		assert.strictEqual(toVisualString(result), '[#########]-[###]-[##]');
	});

	test('applyEdit 1 - deletion within annotation', () => {
		// Before: [#####]-----[#####]-----[#####]
		//         0    5     10   15     20   25
		// Delete positions 0-3 (first 3 chars of first annotation)
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editDelete(0, 3)
		);
		// After:  [##]-----[#####]-----[#####]
		//         0 2     7    12     17   22
		assert.strictEqual(result.after, '[##]-----[#####]-----[#####]');
	});

	test('applyEdit 2 - deletion and insertion within annotation', () => {
		// Before: [#####]-----[#####]-----[#####]
		// Replace positions 1-3 with "aaaaa" (5 chars replacing 2)
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editReplace(1, 3, 'aaaaa')
		);
		// First annotation expands from 5 to 8 chars
		// After:  [########]-----[#####]-----[#####]
		assert.strictEqual(result.after, '[########]-----[#####]-----[#####]');
	});

	test('applyEdit 3 - deletion across several annotations', () => {
		// Before: [#####]-----[#####]-----[#####]
		//         0    5     10   15     20   25
		// Replace positions 4-22 with "aaaaa"
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editReplace(4, 22, 'aaaaa')
		);
		// After:  [#########][###]
		assert.strictEqual(result.after, '[#########][###]');
	});

	test('applyEdit 4 - deletion between annotations', () => {
		// Before: [########]-----[#####]-----[#####]
		//         0       8     13   18     23   28
		// Delete positions 10-12 (between first and second annotation)
		const result = visualizeEdit(
			'[########]-----[#####]-----[#####]',
			editDelete(10, 12)
		);
		// After:  [########]---[#####]-----[#####]
		assert.strictEqual(result.after, '[########]---[#####]-----[#####]');
	});

	test('applyEdit 5 - deletion that covers annotation', () => {
		// Before: [#####]-----[#####]-----[#####]
		// Delete positions 0-5 (entire first annotation)
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editDelete(0, 5)
		);
		// First annotation removed, others shift left
		// After:  -----[#####]-----[#####]
		assert.strictEqual(result.after, '-----[#####]-----[#####]');
	});

	test('applyEdit 6 - several edits', () => {
		// Before: [#####]-----[#####]-----[#####]
		//         0    5     10   15     20   25
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Delete all three regions: (0,5), (5,10), (10,15) composed
		const edit1 = StringEdit.replace(new OffsetRange(0, 5), '');
		const edit2 = StringEdit.replace(new OffsetRange(5, 10), '');
		const edit3 = StringEdit.replace(new OffsetRange(10, 15), '');
		as.applyEdit(edit1.compose(edit2).compose(edit3));

		// All annotations removed
		assert.strictEqual(toVisual(as), '');
	});

	test('applyEdit 7 - several edits', () => {
		// Before: [#####]-----[#####]-----[#####]
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		// Replace (0,3) with 'aaaa', then delete (0,2)
		const edit1 = StringEdit.replace(new OffsetRange(0, 3), 'aaaa');
		const edit2 = StringEdit.replace(new OffsetRange(0, 2), '');
		as.applyEdit(edit1.compose(edit2));

		// After:  [####]-----[#####]-----[#####]
		assertVisual(as, '[####]-----[#####]-----[#####]');
	});

	test('applyEdit 9 - insertion at end of annotation', () => {
		// Before: [#####]-----[#####]-----[#####]
		// Insert "abc" at position 15 (end of second annotation)
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editInsert(15, 'abc')
		);
		// Insertion at end pushes third annotation, doesn't extend second
		// After:  [#####]-----[#####]--------[#####]
		assert.strictEqual(result.after, '[#####]-----[#####]--------[#####]');
	});

	test('applyEdit 10 - insertion in middle of annotation', () => {
		// Before: [#####]-----[#####]-----[#####]
		// Insert "abc" at position 12 (middle of second annotation)
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editInsert(12, 'abc')
		);
		// Insertion inside annotation extends it
		// After:  [#####]-----[########]-----[#####]
		assert.strictEqual(result.after, '[#####]-----[########]-----[#####]');
	});

	test('applyEdit 11 - replacement consuming annotation', () => {
		// Before: [#]-[###]-[#]
		//         0 1 2   5 6 7
		// Replace positions 1-6 with "a" (consumes middle annotation)
		const result = visualizeEdit(
			'[#]-[###]-[#]',
			editReplace(1, 6, 'a')
		);
		// Middle annotation is consumed
		// After:  [#]-[#]
		assert.strictEqual(result.after, '[#]-[#]');
	});

	test('applyEdit 12 - multiple disjoint edits', () => {
		// Before: [#####]-----[#####]-----[#####]-----[#####]
		//         0    5     10   15     20   25     30   35
		const as = fromVisual('[#####]-----[#####]-----[#####]-----[#####]');

		const edit = StringEdit.compose([
			StringEdit.insert(0, 'a'),                              // Insert 'a' at 0
			StringEdit.delete(new OffsetRange(11, 12)),             // Delete pos 11
			StringEdit.replace(new OffsetRange(21, 22), 'bb'),      // Replace pos 21 with 'bb'
			StringEdit.replace(new OffsetRange(30, 35), 'c')        // Replace 30-35 with 'c'
		]);
		as.applyEdit(edit);

		// After:  -[#####]-----[####]-----[######]----[##]
		//         1     6     11  15     20    26    30 32
		assertVisual(as, '-[#####]-----[####]-----[######]----[##]');
	});

	test('applyEdit 13 - edit on the left border', () => {
		// Before: ---------------[#]
		//                        15 16
		// Insert "a" at position 15 (start of annotation)
		const result = visualizeEdit(
			'---------------[#]',
			editInsert(15, 'a')
		);
		// Insertion at start pushes annotation right
		// After:  ----------------[#]
		assert.strictEqual(result.after, '----------------[#]');
	});

	test('applyEdit 14 - edit on the right border', () => {
		// Before: ---------------[#]
		//                        15 16
		// Insert "a" at position 16 (right after annotation)
		const result = visualizeEdit(
			'---------------[#]',
			editInsert(16, 'a')
		);
		// Insertion after annotation end doesn't extend it
		// After:  ---------------[#]
		assert.strictEqual(result.after, '---------------[#]');
	});

	test('rebase', () => {
		const a: IAnnotatedString<string> = getRandomAnnotatedString();
		const b = a.clone();
		const update: AnnotationsUpdate<string> = getRandomAnnotationsUpdate();

		b.setAnnotations(update);
		const edit: StringEdit = getRandomEdit();

		a.applyEdit(edit);
		b.applyEdit(edit);

		update.rebase(edit);

		a.setAnnotations(update);
		assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
	});
});

function getRandomAnnotatedString(): IAnnotatedString<string> {
	return new AnnotatedString<string>([getAnnotation()]);
}

function getRandomAnnotationsUpdate(): AnnotationsUpdate<string> {
	return AnnotationsUpdate.create([getAnnotation()]);
}

function getRandomEdit(): StringEdit {
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return StringEdit.replace(new OffsetRange(start, start + delta), (Math.random() + 1).toString(36).substring(7));
}

function getAnnotation(): IAnnotation<string> {
	const start = Math.floor(Math.random() * 100);
	const delta = Math.floor(Math.random() * (100 - start));
	return { range: new OffsetRange(start, start + delta), annotation: '' };
}
