/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { StringEdit } from '../../../../common/core/edits/stringEdit.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { computeEditKind, InsertProperties, DeleteProperties, ReplaceProperties } from '../../browser/model/editKind.js';

suite('computeEditKind', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Insert operations', () => {
		test('single character insert - syntactical', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, ';');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			assert.strictEqual(result.edits[0].charactersInserted, 1);
			assert.strictEqual(result.edits[0].charactersDeleted, 0);
			assert.strictEqual(result.edits[0].linesInserted, 0);
			assert.strictEqual(result.edits[0].linesDeleted, 0);
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.textShape.kind, 'singleLine');
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isSingleCharacter, true);
				assert.strictEqual(props.textShape.singleCharacterKind, 'syntactical');
			}
			model.dispose();
		});

		test('single character insert - identifier', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, 'a');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isSingleCharacter, true);
				assert.strictEqual(props.textShape.singleCharacterKind, 'identifier');
			}
			model.dispose();
		});

		test('single character insert - whitespace', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, ' ');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isSingleCharacter, true);
				assert.strictEqual(props.textShape.singleCharacterKind, 'whitespace');
			}
			model.dispose();
		});

		test('word insert', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, 'foo');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isWord, true);
				assert.strictEqual(props.textShape.isMultipleWords, false);
			}
			model.dispose();
		});

		test('multiple words insert', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, 'foo bar baz');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isMultipleWords, true);
			}
			model.dispose();
		});

		test('multi-line insert', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, 'line1\nline2\nline3');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			assert.strictEqual(result.edits[0].charactersInserted, 17);
			assert.strictEqual(result.edits[0].charactersDeleted, 0);
			assert.strictEqual(result.edits[0].linesInserted, 2);
			assert.strictEqual(result.edits[0].linesDeleted, 0);
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.textShape.kind, 'multiLine');
			if (props.textShape.kind === 'multiLine') {
				assert.strictEqual(props.textShape.lineCount, 3);
			}
			model.dispose();
		});

		test('insert at end of line', () => {
			const model = createTextModel('hello');
			const edit = StringEdit.insert(5, ' world');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.locationShape, 'endOfLine');
			model.dispose();
		});

		test('insert on empty line', () => {
			const model = createTextModel('hello\n\nworld');
			const edit = StringEdit.insert(6, 'text');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.locationShape, 'emptyLine');
			model.dispose();
		});

		test('insert at start of line', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(0, 'prefix');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.locationShape, 'startOfLine');
			model.dispose();
		});

		test('insert in middle of line', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, '_');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.strictEqual(props.locationShape, 'middleOfLine');
			model.dispose();
		});

		test('insert relative to cursor - at cursor', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(5, 'text');
			const cursor = new Position(1, 6); // column is 1-based
			const result = computeEditKind(edit, model, cursor);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.ok(props.relativeToCursor);
			assert.strictEqual(props.relativeToCursor.atCursor, true);
			model.dispose();
		});

		test('insert relative to cursor - before cursor on same line', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(2, 'text');
			const cursor = new Position(1, 8);
			const result = computeEditKind(edit, model, cursor);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.ok(props.relativeToCursor);
			assert.strictEqual(props.relativeToCursor.beforeCursorOnSameLine, true);
			model.dispose();
		});

		test('insert relative to cursor - after cursor on same line', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.insert(8, 'text');
			const cursor = new Position(1, 4);
			const result = computeEditKind(edit, model, cursor);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.ok(props.relativeToCursor);
			assert.strictEqual(props.relativeToCursor.afterCursorOnSameLine, true);
			model.dispose();
		});

		test('insert relative to cursor - lines above', () => {
			const model = createTextModel('line1\nline2\nline3');
			const edit = StringEdit.insert(0, 'text');
			const cursor = new Position(3, 1);
			const result = computeEditKind(edit, model, cursor);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.ok(props.relativeToCursor);
			assert.strictEqual(props.relativeToCursor.linesAbove, 2);
			model.dispose();
		});

		test('insert relative to cursor - lines below', () => {
			const model = createTextModel('line1\nline2\nline3');
			const edit = StringEdit.insert(12, 'text'); // after 'line2\n'
			const cursor = new Position(1, 1);
			const result = computeEditKind(edit, model, cursor);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			assert.ok(props.relativeToCursor);
			assert.strictEqual(props.relativeToCursor.linesBelow, 2);
			model.dispose();
		});

		test('duplicated whitespace insert', () => {
			const model = createTextModel('hello');
			const edit = StringEdit.insert(5, '  ');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'insert');
			const props = result.edits[0].properties as InsertProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.hasDuplicatedWhitespace, true);
			}
			model.dispose();
		});
	});

	suite('Delete operations', () => {
		test('single character delete - identifier', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.delete(new OffsetRange(4, 5)); // delete 'o'
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'delete');
			const props = result.edits[0].properties as DeleteProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isSingleCharacter, true);
				assert.strictEqual(props.textShape.singleCharacterKind, 'identifier');
			}
			model.dispose();
		});

		test('single character delete - syntactical', () => {
			const model = createTextModel('hello;world');
			const edit = StringEdit.delete(new OffsetRange(5, 6)); // delete ';'
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'delete');
			const props = result.edits[0].properties as DeleteProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isSingleCharacter, true);
				assert.strictEqual(props.textShape.singleCharacterKind, 'syntactical');
			}
			model.dispose();
		});

		test('word delete', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.delete(new OffsetRange(0, 5)); // delete 'hello'
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'delete');
			assert.strictEqual(result.edits[0].charactersInserted, 0);
			assert.strictEqual(result.edits[0].charactersDeleted, 5);
			assert.strictEqual(result.edits[0].linesInserted, 0);
			assert.strictEqual(result.edits[0].linesDeleted, 0);
			const props = result.edits[0].properties as DeleteProperties;
			if (props.textShape.kind === 'singleLine') {
				assert.strictEqual(props.textShape.isWord, true);
			}
			model.dispose();
		});

		test('multi-line delete', () => {
			const model = createTextModel('line1\nline2\nline3');
			const edit = StringEdit.delete(new OffsetRange(0, 12)); // delete 'line1\nline2\n'
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'delete');
			assert.strictEqual(result.edits[0].charactersInserted, 0);
			assert.strictEqual(result.edits[0].charactersDeleted, 12);
			assert.strictEqual(result.edits[0].linesInserted, 0);
			assert.strictEqual(result.edits[0].linesDeleted, 2);
			const props = result.edits[0].properties as DeleteProperties;
			assert.strictEqual(props.textShape.kind, 'multiLine');
			model.dispose();
		});

		test('delete entire line content', () => {
			const model = createTextModel('hello');
			const edit = StringEdit.delete(new OffsetRange(0, 5));
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'delete');
			const props = result.edits[0].properties as DeleteProperties;
			assert.strictEqual(props.deletesEntireLineContent, true);
			model.dispose();
		});
	});

	suite('Replace operations', () => {
		test('word to word replacement', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.replace(new OffsetRange(0, 5), 'goodbye');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			assert.strictEqual(result.edits[0].charactersInserted, 7);
			assert.strictEqual(result.edits[0].charactersDeleted, 5);
			assert.strictEqual(result.edits[0].linesInserted, 0);
			assert.strictEqual(result.edits[0].linesDeleted, 0);
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isWordToWordReplacement, true);
			model.dispose();
		});

		test('additive replacement', () => {
			const model = createTextModel('hi world');
			const edit = StringEdit.replace(new OffsetRange(0, 2), 'hello');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			assert.strictEqual(result.edits[0].charactersInserted, 5);
			assert.strictEqual(result.edits[0].charactersDeleted, 2);
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isAdditive, true);
			assert.strictEqual(props.isSubtractive, false);
			model.dispose();
		});

		test('subtractive replacement', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.replace(new OffsetRange(0, 5), 'hi');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			assert.strictEqual(result.edits[0].charactersInserted, 2);
			assert.strictEqual(result.edits[0].charactersDeleted, 5);
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isSubtractive, true);
			assert.strictEqual(props.isAdditive, false);
			model.dispose();
		});

		test('single line to multi-line replacement', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.replace(new OffsetRange(0, 5), 'line1\nline2');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			assert.strictEqual(result.edits[0].linesInserted, 1);
			assert.strictEqual(result.edits[0].linesDeleted, 0);
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isSingleLineToMultiLine, true);
			model.dispose();
		});

		test('multi-line to single line replacement', () => {
			const model = createTextModel('line1\nline2\nline3');
			const edit = StringEdit.replace(new OffsetRange(0, 12), 'hello');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			assert.strictEqual(result.edits[0].linesInserted, 0);
			assert.strictEqual(result.edits[0].linesDeleted, 2);
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isMultiLineToSingleLine, true);
			model.dispose();
		});

		test('single line to single line replacement', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.replace(new OffsetRange(0, 5), 'goodbye');
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 1);
			assert.strictEqual(result.edits[0].operation, 'replace');
			const props = result.edits[0].properties as ReplaceProperties;
			assert.strictEqual(props.isSingleLineToSingleLine, true);
			model.dispose();
		});
	});

	suite('Empty edit', () => {
		test('empty edit returns undefined', () => {
			const model = createTextModel('hello world');
			const edit = StringEdit.empty;
			const result = computeEditKind(edit, model);

			assert.strictEqual(result, undefined);
			model.dispose();
		});
	});

	suite('Multiple replacements', () => {
		test('multiple inserts', () => {
			const model = createTextModel('hello world');
			const edit = new StringEdit([
				StringEdit.insert(0, 'A').replacements[0],
				StringEdit.insert(5, 'B').replacements[0],
			]);
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 2);
			assert.strictEqual(result.edits[0].operation, 'insert');
			assert.strictEqual(result.edits[1].operation, 'insert');
			model.dispose();
		});

		test('mixed operations', () => {
			const model = createTextModel('hello world');
			const edit = new StringEdit([
				StringEdit.insert(0, 'prefix').replacements[0],
				StringEdit.delete(new OffsetRange(5, 6)).replacements[0],
			]);
			const result = computeEditKind(edit, model);

			assert.ok(result);
			assert.strictEqual(result.edits.length, 2);
			assert.strictEqual(result.edits[0].operation, 'insert');
			assert.strictEqual(result.edits[1].operation, 'delete');
			model.dispose();
		});
	});
});
