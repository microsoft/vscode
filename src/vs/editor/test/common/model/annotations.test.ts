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
		const as = fromVisual('[#####]-----[#####]-----[#####]');
		as.setAnnotations(updateFromVisual('[#######]'));
		assertVisual(as, '[#######]---[#####]-----[#####]');
		as.setAnnotations(updateFromVisual('--------[#]'));
		assertVisual(as, '[#######]-[#]-[#####]-----[#####]');
	});

	test('setAnnotations 2', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]');
		as.setAnnotations(updateFromVisual(
			'-<###########>',  // delete (1,12)
			'[######]'         // set (0,6)
		));
		assertVisual(as, '[######]--------------[#####]');
		as.setAnnotations(updateFromVisual(
			'-----<######################>',  // delete (5,27)
			'[###]'                            // set (0,3)
		));
		assertVisual(as, '[###]');
		as.setAnnotations(updateFromVisual('-[###]'));
		assertVisual(as, '-[###]');
	});

	test('setAnnotations 3', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]');
		as.setAnnotations(updateFromVisual('----[################]'));
		assertVisual(as, '----[################]');
		as.setAnnotations(updateFromVisual('----------------------[#]'));
		assertVisual(as, '----[################]--[#]');
	});

	test('getAnnotationsIntersecting 1', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]');

		const result1 = as.getAnnotationsIntersecting(new OffsetRange(0, 12));
		assert.strictEqual(result1.length, 2);
		assert.strictEqual(toVisualString(result1), '[#####]-----[#####]');

		const result2 = as.getAnnotationsIntersecting(new OffsetRange(0, 22));
		assert.strictEqual(result2.length, 3);
		assert.strictEqual(toVisualString(result2), '[#####]-----[#####]-----[#####]');
	});

	test('getAnnotationsIntersecting 2', () => {
		const as = fromVisual('[#####]-[#]-[#]');

		const result1 = as.getAnnotationsIntersecting(new OffsetRange(5, 6));
		assert.strictEqual(result1.length, 2);
		assert.strictEqual(toVisualString(result1), '[#####]-[#]');

		const result2 = as.getAnnotationsIntersecting(new OffsetRange(5, 8));
		assert.strictEqual(result2.length, 3);
		assert.strictEqual(toVisualString(result2), '[#####]-[#]-[#]');
	});

	test('getAnnotationsIntersecting 3', () => {
		const as = fromVisual('[#####]-----[#####]');

		const result1 = as.getAnnotationsIntersecting(new OffsetRange(5, 10));
		assert.strictEqual(result1.length, 2);

		as.setAnnotations(updateFromVisual('[####]-[####]'));
		assertVisual(as, '[####]-[####]-[#####]');

		const result2 = as.getAnnotationsIntersecting(new OffsetRange(7, 10));
		assert.strictEqual(result2.length, 2);
		assert.strictEqual(toVisualString(result2), '-----[####]-[#####]');
	});

	test('getAnnotationsIntersecting 4', () => {
		const as = fromVisual('[##########]');
		as.setAnnotations(updateFromVisual('------------[###]'));
		const result = as.getAnnotationsIntersecting(new OffsetRange(2, 8));
		assert.strictEqual(result.length, 1);
		assert.strictEqual(toVisualString(result), '[##########]');
	});

	test('getAnnotationsIntersecting 5', () => {
		const as = fromVisual('[#########]-[###]-[##]');
		const result = as.getAnnotationsIntersecting(new OffsetRange(1, 16));
		assert.strictEqual(result.length, 3);
		assert.strictEqual(toVisualString(result), '[#########]-[###]-[##]');
	});

	test('applyEdit 1 - deletion within annotation', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editDelete(0, 3)
		);
		assert.strictEqual(result.after, '[##]-----[#####]-----[#####]');
	});

	test('applyEdit 2 - deletion and insertion within annotation', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editReplace(1, 3, '#####')
		);
		assert.strictEqual(result.after, '[########]-----[#####]-----[#####]');
	});

	test('applyEdit 3 - deletion across several annotations', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editReplace(4, 22, 'aaaaa')
		);
		assert.strictEqual(result.after, '[#########][###]');
	});

	test('applyEdit 4 - deletion between annotations', () => {
		const result = visualizeEdit(
			'[########]-----[#####]-----[#####]',
			editDelete(10, 12)
		);
		assert.strictEqual(result.after, '[########]---[#####]-----[#####]');
	});

	test('applyEdit 5 - deletion that covers annotation', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editDelete(0, 5)
		);
		assert.strictEqual(result.after, '-----[#####]-----[#####]');
	});

	test('applyEdit 6 - several edits', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]');
		const edit1 = StringEdit.replace(new OffsetRange(0, 5), '');
		const edit2 = StringEdit.replace(new OffsetRange(5, 10), '');
		const edit3 = StringEdit.replace(new OffsetRange(10, 15), '');
		as.applyEdit(edit1.compose(edit2).compose(edit3));
		assert.strictEqual(toVisual(as), '');
	});

	test('applyEdit 7 - several edits', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]');
		const edit1 = StringEdit.replace(new OffsetRange(0, 3), 'aaaa');
		const edit2 = StringEdit.replace(new OffsetRange(0, 2), '');
		as.applyEdit(edit1.compose(edit2));
		assertVisual(as, '[####]-----[#####]-----[#####]');
	});

	test('applyEdit 9 - insertion at end of annotation', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editInsert(15, 'abc')
		);
		assert.strictEqual(result.after, '[#####]-----[#####]--------[#####]');
	});

	test('applyEdit 10 - insertion in middle of annotation', () => {
		const result = visualizeEdit(
			'[#####]-----[#####]-----[#####]',
			editInsert(12, 'abc')
		);
		assert.strictEqual(result.after, '[#####]-----[########]-----[#####]');
	});

	test('applyEdit 11 - replacement consuming annotation', () => {
		const result = visualizeEdit(
			'[#]-[###]-[#]',
			editReplace(1, 6, 'a')
		);
		assert.strictEqual(result.after, '[#]-[#]');
	});

	test('applyEdit 12 - multiple disjoint edits', () => {
		const as = fromVisual('[#####]-----[#####]-----[#####]-----[#####]');

		const edit = StringEdit.compose([
			StringEdit.insert(0, 'a'),                              // Insert 'a' at 0
			StringEdit.delete(new OffsetRange(11, 12)),             // Delete pos 11
			StringEdit.replace(new OffsetRange(21, 22), 'bb'),      // Replace pos 21 with 'bb'
			StringEdit.replace(new OffsetRange(30, 35), 'c')        // Replace 30-35 with 'c'
		]);
		as.applyEdit(edit);
		assertVisual(as, '-[#####]-----[####]-----[######]----[##]');
	});

	test('applyEdit 13 - edit on the left border', () => {
		const result = visualizeEdit(
			'---------------[#]',
			editInsert(15, 'a')
		);
		assert.strictEqual(result.after, '----------------[#]');
	});

	test('applyEdit 14 - edit on the right border', () => {
		const result = visualizeEdit(
			'---------------[#]',
			editInsert(16, 'a')
		);
		assert.strictEqual(result.after, '---------------[#]');
	});

	test('rebase', () => {
		const a: IAnnotatedString<string> = new AnnotatedString<string>([{ range: new OffsetRange(2, 5), annotation: '' }]);
		const b = a.clone();
		const update: AnnotationsUpdate<string> = AnnotationsUpdate.create([{ range: new OffsetRange(4, 5), annotation: '' }]);

		b.setAnnotations(update);
		const edit: StringEdit = StringEdit.replace(new OffsetRange(1, 6), 'abc');

		a.applyEdit(edit);
		b.applyEdit(edit);

		update.rebase(edit);

		a.setAnnotations(update);
		assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
	});
});
