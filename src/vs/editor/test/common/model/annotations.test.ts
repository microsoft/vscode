/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate, IAnnotation, IAnnotationUpdate } from '../../../common/model/tokens/annotations.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../common/core/edits/stringEdit.js';

// ============================================================================
// Visual Annotation Test Infrastructure
// ============================================================================
// This infrastructure allows representing annotations visually using brackets:
// - '[id:text]' marks an annotation with the given id covering 'text'
// - Plain text represents unannotated content
//
// Example: "Lorem [1:ipsum] dolor [2:sit] amet" represents:
//   - annotation "1" at offset 6-11 (content "ipsum")
//   - annotation "2" at offset 18-21 (content "sit")
//
// For updates:
// - '[id:text]' sets an annotation
// - '<id:text>' deletes an annotation in that range
// ============================================================================

/**
 * Parses a visual string representation into annotations.
 * The visual string uses '[id:text]' to mark annotation boundaries.
 * The id becomes the annotation value, and text is the annotated content.
 */
function parseVisualAnnotations(visual: string): { annotations: IAnnotation<string>[]; baseString: string } {
	const annotations: IAnnotation<string>[] = [];
	let baseString = '';
	let i = 0;

	while (i < visual.length) {
		if (visual[i] === '[') {
			// Find the colon and closing bracket
			const colonIdx = visual.indexOf(':', i + 1);
			const closeIdx = visual.indexOf(']', colonIdx + 1);
			if (colonIdx === -1 || closeIdx === -1) {
				throw new Error(`Invalid annotation format at position ${i}`);
			}
			const id = visual.substring(i + 1, colonIdx);
			const text = visual.substring(colonIdx + 1, closeIdx);
			const startOffset = baseString.length;
			baseString += text;
			annotations.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
			i = closeIdx + 1;
		} else {
			baseString += visual[i];
			i++;
		}
	}

	return { annotations, baseString };
}

/**
 * Converts annotations to a visual string representation.
 * Uses '[id:text]' to mark annotation boundaries.
 *
 * @param annotations - The annotations to visualize
 * @param baseString - The base string content
 */
function toVisualString(
	annotations: IAnnotation<string>[],
	baseString: string
): string {
	if (annotations.length === 0) {
		return baseString;
	}

	// Sort annotations by start position
	const sortedAnnotations = [...annotations].sort((a, b) => a.range.start - b.range.start);

	// Build the visual representation
	let result = '';
	let pos = 0;

	for (const ann of sortedAnnotations) {
		// Add plain text before this annotation
		result += baseString.substring(pos, ann.range.start);
		// Add annotated content with id
		const annotatedText = baseString.substring(ann.range.start, ann.range.endExclusive);
		result += `[${ann.annotation}:${annotatedText}]`;
		pos = ann.range.endExclusive;
	}

	// Add remaining text after last annotation
	result += baseString.substring(pos);

	return result;
}

/**
 * Represents an AnnotatedString with its base string for visual testing.
 */
class VisualAnnotatedString {
	constructor(
		public readonly annotatedString: AnnotatedString<string>,
		public baseString: string
	) { }

	setAnnotations(update: AnnotationsUpdate<string>): void {
		this.annotatedString.setAnnotations(update);
	}

	applyEdit(edit: StringEdit): void {
		this.annotatedString.applyEdit(edit);
		this.baseString = edit.apply(this.baseString);
	}

	getAnnotationsIntersecting(range: OffsetRange): IAnnotation<string>[] {
		return this.annotatedString.getAnnotationsIntersecting(range);
	}

	getAllAnnotations(): IAnnotation<string>[] {
		return this.annotatedString.getAllAnnotations();
	}

	clone(): VisualAnnotatedString {
		return new VisualAnnotatedString(this.annotatedString.clone() as AnnotatedString<string>, this.baseString);
	}
}

/**
 * Creates a VisualAnnotatedString from a visual representation.
 */
function fromVisual(visual: string): VisualAnnotatedString {
	const { annotations, baseString } = parseVisualAnnotations(visual);
	return new VisualAnnotatedString(new AnnotatedString<string>(annotations), baseString);
}

/**
 * Converts a VisualAnnotatedString to a visual representation.
 */
function toVisual(vas: VisualAnnotatedString): string {
	return toVisualString(vas.getAllAnnotations(), vas.baseString);
}

/**
 * Parses visual update annotations, where:
 * - '[id:text]' represents an annotation to set
 * - '<id:text>' represents an annotation to delete (range is tracked but annotation is undefined)
 */
function parseVisualUpdate(visual: string): { updates: IAnnotationUpdate<string>[]; baseString: string } {
	const updates: IAnnotationUpdate<string>[] = [];
	let baseString = '';
	let i = 0;

	while (i < visual.length) {
		if (visual[i] === '[') {
			// Set annotation: [id:text]
			const colonIdx = visual.indexOf(':', i + 1);
			const closeIdx = visual.indexOf(']', colonIdx + 1);
			if (colonIdx === -1 || closeIdx === -1) {
				throw new Error(`Invalid annotation format at position ${i}`);
			}
			const id = visual.substring(i + 1, colonIdx);
			const text = visual.substring(colonIdx + 1, closeIdx);
			const startOffset = baseString.length;
			baseString += text;
			updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
			i = closeIdx + 1;
		} else if (visual[i] === '<') {
			// Delete annotation: <id:text>
			const colonIdx = visual.indexOf(':', i + 1);
			const closeIdx = visual.indexOf('>', colonIdx + 1);
			if (colonIdx === -1 || closeIdx === -1) {
				throw new Error(`Invalid delete format at position ${i}`);
			}
			const text = visual.substring(colonIdx + 1, closeIdx);
			const startOffset = baseString.length;
			baseString += text;
			updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: undefined });
			i = closeIdx + 1;
		} else {
			baseString += visual[i];
			i++;
		}
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
 * Asserts that a VisualAnnotatedString matches the expected visual representation.
 * Only compares annotations, not the base string (since setAnnotations doesn't change the base string).
 */
function assertVisual(vas: VisualAnnotatedString, expectedVisual: string): void {
	const actual = toVisual(vas);
	const { annotations: expectedAnnotations } = parseVisualAnnotations(expectedVisual);
	const actualAnnotations = vas.getAllAnnotations();

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
		const actualAnn = actualAnnotations[i];
		if (actualAnn.range.start !== expected.range.start || actualAnn.range.endExclusive !== expected.range.endExclusive) {
			assert.fail(
				`Annotation ${i} range mismatch.\n` +
				`  Expected: (${expected.range.start}, ${expected.range.endExclusive})\n` +
				`  Actual:   (${actualAnn.range.start}, ${actualAnn.range.endExclusive})\n` +
				`  Expected visual: ${expectedVisual}\n` +
				`  Actual visual:   ${actual}`
			);
		}
		if (actualAnn.annotation !== expected.annotation) {
			assert.fail(
				`Annotation ${i} value mismatch.\n` +
				`  Expected: "${expected.annotation}"\n` +
				`  Actual:   "${actualAnn.annotation}"`
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
	const vas = fromVisual(beforeAnnotations);
	const before = toVisual(vas);

	vas.applyEdit(edit);

	const after = toVisual(vas);
	return { before, after };
}

// ============================================================================
// Visual Annotations Test Suite
// ============================================================================
// These tests use a visual representation for better readability:
// - '[id:text]' marks annotated regions with id and content
// - Plain text represents unannotated content
// - '<id:text>' marks regions to delete (in updates)
//
// Example: "Lorem [1:ipsum] dolor [2:sit] amet" represents two annotations:
//          "1" at (6,11) covering "ipsum", "2" at (18,21) covering "sit"
// ============================================================================

suite('Annotations Suite', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setAnnotations 1', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		vas.setAnnotations(updateFromVisual('[4:Lorem i]'));
		assertVisual(vas, '[4:Lorem i]psum [2:dolor] sit [3:amet]');
		vas.setAnnotations(updateFromVisual('Lorem ip[5:s]'));
		assertVisual(vas, '[4:Lorem i]p[5:s]um [2:dolor] sit [3:amet]');
	});

	test('setAnnotations 2', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		vas.setAnnotations(updateFromVisual(
			'L<_:orem ipsum d>',
			'[4:Lorem ]'
		));
		assertVisual(vas, '[4:Lorem ]ipsum dolor sit [3:amet]');
		vas.setAnnotations(updateFromVisual(
			'Lorem <_:ipsum dolor sit amet>',
			'[5:Lor]'
		));
		assertVisual(vas, '[5:Lor]em ipsum dolor sit amet');
		vas.setAnnotations(updateFromVisual('L[6:or]'));
		assertVisual(vas, 'L[6:or]em ipsum dolor sit amet');
	});

	test('setAnnotations 3', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		vas.setAnnotations(updateFromVisual('Lore[4:m ipsum dolor ]'));
		assertVisual(vas, 'Lore[4:m ipsum dolor ]sit [3:amet]');
		vas.setAnnotations(updateFromVisual('Lorem ipsum dolor sit [5:a]'));
		assertVisual(vas, 'Lore[4:m ipsum dolor ]sit [5:a]met');
	});

	test('getAnnotationsIntersecting 1', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		const result1 = vas.getAnnotationsIntersecting(new OffsetRange(0, 13));
		assert.strictEqual(result1.length, 2);
		assert.deepStrictEqual(result1.map(a => a.annotation), ['1', '2']);
		const result2 = vas.getAnnotationsIntersecting(new OffsetRange(0, 22));
		assert.strictEqual(result2.length, 3);
		assert.deepStrictEqual(result2.map(a => a.annotation), ['1', '2', '3']);
	});

	test('getAnnotationsIntersecting 2', () => {
		const vas = fromVisual('[1:Lorem] [2:i]p[3:s]');

		const result1 = vas.getAnnotationsIntersecting(new OffsetRange(5, 7));
		assert.strictEqual(result1.length, 2);
		assert.deepStrictEqual(result1.map(a => a.annotation), ['1', '2']);
		const result2 = vas.getAnnotationsIntersecting(new OffsetRange(5, 9));
		assert.strictEqual(result2.length, 3);
		assert.deepStrictEqual(result2.map(a => a.annotation), ['1', '2', '3']);
	});

	test('getAnnotationsIntersecting 3', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor]');
		const result1 = vas.getAnnotationsIntersecting(new OffsetRange(4, 13));
		assert.strictEqual(result1.length, 2);
		assert.deepStrictEqual(result1.map(a => a.annotation), ['1', '2']);
		vas.setAnnotations(updateFromVisual('[3:Lore]m[4: ipsu]'));
		assertVisual(vas, '[3:Lore]m[4: ipsu]m [2:dolor]');
		const result2 = vas.getAnnotationsIntersecting(new OffsetRange(7, 13));
		assert.strictEqual(result2.length, 2);
		assert.deepStrictEqual(result2.map(a => a.annotation), ['4', '2']);
	});

	test('getAnnotationsIntersecting 4', () => {
		const vas = fromVisual('[1:Lorem ipsum] sit');
		vas.setAnnotations(updateFromVisual('Lorem ipsum [2:sit]'));
		const result = vas.getAnnotationsIntersecting(new OffsetRange(2, 8));
		assert.strictEqual(result.length, 1);
		assert.deepStrictEqual(result.map(a => a.annotation), ['1']);
	});

	test('getAnnotationsIntersecting 5', () => {
		const vas = fromVisual('[1:Lorem ipsum] [2:dol] [3:or]');
		const result = vas.getAnnotationsIntersecting(new OffsetRange(1, 16));
		assert.strictEqual(result.length, 3);
		assert.deepStrictEqual(result.map(a => a.annotation), ['1', '2', '3']);
	});

	test('applyEdit 1 - deletion within annotation', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editDelete(0, 3)
		);
		assert.strictEqual(result.after, '[1:em] ipsum [2:dolor] sit [3:amet]');
	});

	test('applyEdit 2 - deletion and insertion within annotation', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editReplace(1, 3, 'XXXXX')
		);
		assert.strictEqual(result.after, '[1:LXXXXXem] ipsum [2:dolor] sit [3:amet]');
	});

	test('applyEdit 3 - deletion across several annotations', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editReplace(4, 22, 'XXXXX')
		);
		assert.strictEqual(result.after, '[1:LoreXXXXX][3:amet]');
	});

	test('applyEdit 4 - deletion between annotations', () => {
		const result = visualizeEdit(
			'[1:Lorem ip]sum and [2:dolor] sit [3:amet]',
			editDelete(10, 12)
		);
		assert.strictEqual(result.after, '[1:Lorem ip]suand [2:dolor] sit [3:amet]');
	});

	test('applyEdit 5 - deletion that covers annotation', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editDelete(0, 5)
		);
		assert.strictEqual(result.after, ' ipsum [2:dolor] sit [3:amet]');
	});

	test('applyEdit 6 - several edits', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		const edit = StringEdit.compose([
			StringEdit.replace(new OffsetRange(0, 6), ''),
			StringEdit.replace(new OffsetRange(6, 12), ''),
			StringEdit.replace(new OffsetRange(12, 17), '')
		]);
		vas.applyEdit(edit);
		assertVisual(vas, 'ipsum sit [3:am]');
	});

	test('applyEdit 7 - several edits', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet]');
		const edit1 = StringEdit.replace(new OffsetRange(0, 3), 'XXXX');
		const edit2 = StringEdit.replace(new OffsetRange(0, 2), '');
		vas.applyEdit(edit1.compose(edit2));
		assertVisual(vas, '[1:XXem] ipsum [2:dolor] sit [3:amet]');
	});

	test('applyEdit 9 - insertion at end of annotation', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editInsert(17, 'XXX')
		);
		assert.strictEqual(result.after, '[1:Lorem] ipsum [2:dolor]XXX sit [3:amet]');
	});

	test('applyEdit 10 - insertion in middle of annotation', () => {
		const result = visualizeEdit(
			'[1:Lorem] ipsum [2:dolor] sit [3:amet]',
			editInsert(14, 'XXX')
		);
		assert.strictEqual(result.after, '[1:Lorem] ipsum [2:doXXXlor] sit [3:amet]');
	});

	test('applyEdit 11 - replacement consuming annotation', () => {
		const result = visualizeEdit(
			'[1:L]o[2:rem] [3:i]',
			editReplace(1, 6, 'X')
		);
		assert.strictEqual(result.after, '[1:L]X[3:i]');
	});

	test('applyEdit 12 - multiple disjoint edits', () => {
		const vas = fromVisual('[1:Lorem] ipsum [2:dolor] sit [3:amet!] [4:done]');

		const edit = StringEdit.compose([
			StringEdit.insert(0, 'X'),
			StringEdit.delete(new OffsetRange(12, 13)),
			StringEdit.replace(new OffsetRange(21, 22), 'YY'),
			StringEdit.replace(new OffsetRange(28, 32), 'Z')
		]);
		vas.applyEdit(edit);
		assertVisual(vas, 'X[1:Lorem] ipsum[2:dolor] sitYY[3:amet!]Z[4:e]');
	});

	test('applyEdit 13 - edit on the left border', () => {
		const result = visualizeEdit(
			'lorem ipsum dolor[1: ]',
			editInsert(17, 'X')
		);
		assert.strictEqual(result.after, 'lorem ipsum dolorX[1: ]');
	});

	test('rebase', () => {
		const a = new VisualAnnotatedString(
			new AnnotatedString<string>([{ range: new OffsetRange(2, 5), annotation: '1' }]),
			'sitamet'
		);
		const b = a.clone();
		const update: AnnotationsUpdate<string> = AnnotationsUpdate.create([{ range: new OffsetRange(4, 5), annotation: '2' }]);

		b.setAnnotations(update);
		const edit: StringEdit = StringEdit.replace(new OffsetRange(1, 6), 'XXX');

		a.applyEdit(edit);
		b.applyEdit(edit);

		update.rebase(edit);

		a.setAnnotations(update);
		assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
	});
});
