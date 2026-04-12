/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AnnotatedString, AnnotationsUpdate } from '../../../common/model/tokens/annotations.js';
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
function parseVisualAnnotations(visual) {
    const annotations = [];
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
        }
        else {
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
function toVisualString(annotations, baseString) {
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
    constructor(annotatedString, baseString) {
        this.annotatedString = annotatedString;
        this.baseString = baseString;
    }
    setAnnotations(update) {
        this.annotatedString.setAnnotations(update);
    }
    applyEdit(edit) {
        this.annotatedString.applyEdit(edit);
        this.baseString = edit.apply(this.baseString);
    }
    getAnnotationsIntersecting(range) {
        return this.annotatedString.getAnnotationsIntersecting(range);
    }
    getAllAnnotations() {
        return this.annotatedString.getAllAnnotations();
    }
    clone() {
        return new VisualAnnotatedString(this.annotatedString.clone(), this.baseString);
    }
}
/**
 * Creates a VisualAnnotatedString from a visual representation.
 */
function fromVisual(visual) {
    const { annotations, baseString } = parseVisualAnnotations(visual);
    return new VisualAnnotatedString(new AnnotatedString(annotations), baseString);
}
/**
 * Converts a VisualAnnotatedString to a visual representation.
 */
function toVisual(vas) {
    return toVisualString(vas.getAllAnnotations(), vas.baseString);
}
/**
 * Parses visual update annotations, where:
 * - '[id:text]' represents an annotation to set
 * - '<id:text>' represents an annotation to delete (range is tracked but annotation is undefined)
 */
function parseVisualUpdate(visual) {
    const updates = [];
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
        }
        else if (visual[i] === '<') {
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
        }
        else {
            baseString += visual[i];
            i++;
        }
    }
    return { updates, baseString };
}
/**
 * Creates an AnnotationsUpdate from a visual representation.
 */
function updateFromVisual(...visuals) {
    const updates = [];
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
function editDelete(start, end) {
    return StringEdit.replace(new OffsetRange(start, end), '');
}
function editInsert(pos, text) {
    return StringEdit.insert(pos, text);
}
function editReplace(start, end, text) {
    return StringEdit.replace(new OffsetRange(start, end), text);
}
/**
 * Asserts that a VisualAnnotatedString matches the expected visual representation.
 * Only compares annotations, not the base string (since setAnnotations doesn't change the base string).
 */
function assertVisual(vas, expectedVisual) {
    const actual = toVisual(vas);
    const { annotations: expectedAnnotations } = parseVisualAnnotations(expectedVisual);
    const actualAnnotations = vas.getAllAnnotations();
    // Compare annotations for better error messages
    if (actualAnnotations.length !== expectedAnnotations.length) {
        assert.fail(`Annotation count mismatch.\n` +
            `  Expected: ${expectedVisual}\n` +
            `  Actual:   ${actual}\n` +
            `  Expected ${expectedAnnotations.length} annotations, got ${actualAnnotations.length}`);
    }
    for (let i = 0; i < actualAnnotations.length; i++) {
        const expected = expectedAnnotations[i];
        const actualAnn = actualAnnotations[i];
        if (actualAnn.range.start !== expected.range.start || actualAnn.range.endExclusive !== expected.range.endExclusive) {
            assert.fail(`Annotation ${i} range mismatch.\n` +
                `  Expected: (${expected.range.start}, ${expected.range.endExclusive})\n` +
                `  Actual:   (${actualAnn.range.start}, ${actualAnn.range.endExclusive})\n` +
                `  Expected visual: ${expectedVisual}\n` +
                `  Actual visual:   ${actual}`);
        }
        if (actualAnn.annotation !== expected.annotation) {
            assert.fail(`Annotation ${i} value mismatch.\n` +
                `  Expected: "${expected.annotation}"\n` +
                `  Actual:   "${actualAnn.annotation}"`);
        }
    }
}
/**
 * Helper to visualize the effect of an edit on annotations.
 * Returns both before and after states as visual strings.
 */
function visualizeEdit(beforeAnnotations, edit) {
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
        vas.setAnnotations(updateFromVisual('L<_:orem ipsum d>', '[4:Lorem ]'));
        assertVisual(vas, '[4:Lorem ]ipsum dolor sit [3:amet]');
        vas.setAnnotations(updateFromVisual('Lorem <_:ipsum dolor sit amet>', '[5:Lor]'));
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
    test('setAnnotations 4', () => {
        // 54 chars before 'i': "Lorem ipsum dolor sit amet, consectetur adipiscing el"
        const vas = fromVisual('Lorem ipsum dolor sit amet, consectetur adipiscing el[:it]');
        vas.setAnnotations(updateFromVisual('Lorem ipsum dolor sit amet, consectetur adipiscing el<_:i>t'));
        assertVisual(vas, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit');
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
        assert.strictEqual(result1.length, 1);
        assert.deepStrictEqual(result1.map(a => a.annotation), ['2']);
        const result2 = vas.getAnnotationsIntersecting(new OffsetRange(5, 9));
        assert.strictEqual(result2.length, 2);
        assert.deepStrictEqual(result2.map(a => a.annotation), ['2', '3']);
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
    test('getAnnotationsIntersecting 6', () => {
        const vas = fromVisual('[1:Lorem ][2:ip][3:sum]');
        const result = vas.getAnnotationsIntersecting(new OffsetRange(6, 6));
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual(result.map(a => a.annotation), ['2']);
    });
    test('applyEdit 1 - deletion within annotation', () => {
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editDelete(0, 3));
        assert.strictEqual(result.after, '[1:em] ipsum [2:dolor] sit [3:amet]');
    });
    test('applyEdit 2 - deletion and insertion within annotation', () => {
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editReplace(1, 3, 'XXXXX'));
        assert.strictEqual(result.after, '[1:LXXXXXem] ipsum [2:dolor] sit [3:amet]');
    });
    test('applyEdit 3 - deletion across several annotations', () => {
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editReplace(4, 22, 'XXXXX'));
        assert.strictEqual(result.after, '[1:LoreXXXXX][3:amet]');
    });
    test('applyEdit 4 - deletion between annotations', () => {
        const result = visualizeEdit('[1:Lorem ip]sum and [2:dolor] sit [3:amet]', editDelete(10, 12));
        assert.strictEqual(result.after, '[1:Lorem ip]suand [2:dolor] sit [3:amet]');
    });
    test('applyEdit 5 - deletion that covers annotation', () => {
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editDelete(0, 5));
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
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editInsert(17, 'XXX'));
        assert.strictEqual(result.after, '[1:Lorem] ipsum [2:dolor]XXX sit [3:amet]');
    });
    test('applyEdit 10 - insertion in middle of annotation', () => {
        const result = visualizeEdit('[1:Lorem] ipsum [2:dolor] sit [3:amet]', editInsert(14, 'XXX'));
        assert.strictEqual(result.after, '[1:Lorem] ipsum [2:doXXXlor] sit [3:amet]');
    });
    test('applyEdit 11 - replacement consuming annotation', () => {
        const result = visualizeEdit('[1:L]o[2:rem] [3:i]', editReplace(1, 6, 'X'));
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
        const result = visualizeEdit('lorem ipsum dolor[1: ]', editInsert(17, 'X'));
        assert.strictEqual(result.after, 'lorem ipsum dolorX[1: ]');
    });
    test('rebase', () => {
        const a = new VisualAnnotatedString(new AnnotatedString([{ range: new OffsetRange(2, 5), annotation: '1' }]), 'sitamet');
        const b = a.clone();
        const update = AnnotationsUpdate.create([{ range: new OffsetRange(4, 5), annotation: '2' }]);
        b.setAnnotations(update);
        const edit = StringEdit.replace(new OffsetRange(1, 6), 'XXX');
        a.applyEdit(edit);
        b.applyEdit(edit);
        update.rebase(edit);
        a.setAnnotations(update);
        assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9hbm5vdGF0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFrQyxNQUFNLDZDQUE2QyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFdEUsK0VBQStFO0FBQy9FLHdDQUF3QztBQUN4QywrRUFBK0U7QUFDL0UsK0VBQStFO0FBQy9FLHNFQUFzRTtBQUN0RSw4Q0FBOEM7QUFDOUMsRUFBRTtBQUNGLDREQUE0RDtBQUM1RCxzREFBc0Q7QUFDdEQscURBQXFEO0FBQ3JELEVBQUU7QUFDRixlQUFlO0FBQ2YsbUNBQW1DO0FBQ25DLG9EQUFvRDtBQUNwRCwrRUFBK0U7QUFFL0U7Ozs7R0FJRztBQUNILFNBQVMsc0JBQXNCLENBQUMsTUFBYztJQUM3QyxNQUFNLFdBQVcsR0FBMEIsRUFBRSxDQUFDO0lBQzlDLElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztJQUNwQixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFVixPQUFPLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDMUIsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDdkIscUNBQXFDO1lBQ3JDLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMs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