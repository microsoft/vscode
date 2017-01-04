/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Selection } from 'vs/editor/common/core/selection';
import { Handler } from 'vs/editor/common/editorCommon';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { DeleteAllLeftAction, JoinLinesAction, TransposeAction, UpperCaseAction, LowerCaseAction, DeleteAllRightAction } from 'vs/editor/contrib/linesOperations/common/linesOperations';

suite('Editor Contrib - Line Operations', () => {
	suite('DeleteAllLeftAction', () => {
		test('should delete to the left of the cursor', function () {
			withMockCodeEditor(
				[
					'one',
					'two',
					'three'
				], {}, (editor, cursor) => {
					let model = editor.getModel();
					let deleteAllLeftAction = new DeleteAllLeftAction();

					editor.setSelection(new Selection(1, 2, 1, 2));
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(1), 'ne', '001');

					editor.setSelections([new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(2), 'wo', '002');
					assert.equal(model.getLineContent(3), 'hree', '003');
				});
		});

		test('should work in multi cursor mode', function () {
			withMockCodeEditor(
				[
					'hello',
					'world',
					'hello world',
					'hello',
					'bonjour',
					'hola',
					'world',
					'hello world',
				], {}, (editor, cursor) => {
					let model = editor.getModel();
					let deleteAllLeftAction = new DeleteAllLeftAction();

					editor.setSelections([new Selection(1, 2, 1, 2), new Selection(1, 4, 1, 4)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(1), 'lo', '001');

					editor.setSelections([new Selection(2, 2, 2, 2), new Selection(2, 4, 2, 5)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(2), 'ord', '002');

					editor.setSelections([new Selection(3, 2, 3, 5), new Selection(3, 7, 3, 7)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(3), 'world', '003');

					editor.setSelections([new Selection(4, 3, 4, 3), new Selection(4, 5, 5, 4)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(4), 'lljour', '004');

					editor.setSelections([new Selection(5, 3, 6, 3), new Selection(6, 5, 7, 5), new Selection(7, 7, 7, 7)]);
					deleteAllLeftAction.run(null, editor);
					assert.equal(model.getLineContent(5), 'horlworld', '005');
				});
		});
	});

	suite('JoinLinesAction', () => {
		test('should join lines and insert space if necessary', function () {
			withMockCodeEditor(
				[
					'hello',
					'world',
					'hello ',
					'world',
					'hello		',
					'	world',
					'hello   ',
					'	world',
					'',
					'',
					'hello world'
				], {}, (editor, cursor) => {
					let model = editor.getModel();
					let joinLinesAction = new JoinLinesAction();

					editor.setSelection(new Selection(1, 2, 1, 2));
					joinLinesAction.run(null, editor);
					assert.equal(model.getLineContent(1), 'hello world', '001');
					assert.deepEqual(editor.getSelection().toString(), new Selection(1, 6, 1, 6).toString(), '002');

					editor.setSelection(new Selection(2, 2, 2, 2));
					joinLinesAction.run(null, editor);
					assert.equal(model.getLineContent(2), 'hello world', '003');
					assert.deepEqual(editor.getSelection().toString(), new Selection(2, 7, 2, 7).toString(), '004');

					editor.setSelection(new Selection(3, 2, 3, 2));
					joinLinesAction.run(null, editor);
					assert.equal(model.getLineContent(3), 'hello world', '005');
					assert.deepEqual(editor.getSelection().toString(), new Selection(3, 7, 3, 7).toString(), '006');

					editor.setSelection(new Selection(4, 2, 5, 3));
					joinLinesAction.run(null, editor);
					assert.equal(model.getLineContent(4), 'hello world', '007');
					assert.deepEqual(editor.getSelection().toString(), new Selection(4, 2, 4, 8).toString(), '008');

					editor.setSelection(new Selection(5, 1, 7, 3));
					joinLinesAction.run(null, editor);
					assert.equal(model.getLineContent(5), 'hello world', '009');
					assert.deepEqual(editor.getSelection().toString(), new Selection(5, 1, 5, 3).toString(), '010');
				});
		});

		test('should work in multi cursor mode', function () {
			withMockCodeEditor(
				[
					'hello',
					'world',
					'hello ',
					'world',
					'hello		',
					'	world',
					'hello   ',
					'	world',
					'',
					'',
					'hello world'
				], {}, (editor, cursor) => {
					let model = editor.getModel();
					let joinLinesAction = new JoinLinesAction();

					editor.setSelections([
						/** primary cursor */
						new Selection(5, 2, 5, 2),
						new Selection(1, 2, 1, 2),
						new Selection(3, 2, 4, 2),
						new Selection(5, 4, 6, 3),
						new Selection(7, 5, 8, 4),
						new Selection(10, 1, 10, 1)
					]);

					joinLinesAction.run(null, editor);
					assert.equal(model.getLinesContent().join('\n'), 'hello world\nhello world\nhello world\nhello world\n\nhello world', '001');
					assert.deepEqual(editor.getSelections().toString(), [
						/** primary cursor */
						new Selection(3, 4, 3, 8),
						new Selection(1, 6, 1, 6),
						new Selection(2, 2, 2, 8),
						new Selection(4, 5, 4, 9),
						new Selection(6, 1, 6, 1)
					].toString(), '002');

					/** primary cursor */
					assert.deepEqual(editor.getSelection().toString(), new Selection(3, 4, 3, 8).toString(), '003');
				});
		});
	});

	test('transpose', function () {
		withMockCodeEditor(
			[
				'hello world',
				'',
				'',
				'   ',
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let transposeAction = new TransposeAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '001');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 2, 1, 2).toString(), '002');

				editor.setSelection(new Selection(1, 6, 1, 6));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hell oworld', '003');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 7, 1, 7).toString(), '004');

				editor.setSelection(new Selection(1, 12, 1, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hell oworl', '005');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '006');

				editor.setSelection(new Selection(3, 1, 3, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(3), '', '007');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 1, 4, 1).toString(), '008');

				editor.setSelection(new Selection(4, 2, 4, 2));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(4), '   ', '009');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 3, 4, 3).toString(), '010');
			}
		);

		// fix #16633
		withMockCodeEditor(
			[
				'',
				'',
				'hello',
				'world',
				'',
				'hello world',
				'',
				'hello world'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let transposeAction = new TransposeAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(2), '', '011');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 1).toString(), '012');

				editor.setSelection(new Selection(3, 6, 3, 6));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(4), 'oworld', '013');
				assert.deepEqual(editor.getSelection().toString(), new Selection(4, 2, 4, 2).toString(), '014');

				editor.setSelection(new Selection(6, 12, 6, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(7), 'd', '015');
				assert.deepEqual(editor.getSelection().toString(), new Selection(7, 2, 7, 2).toString(), '016');

				editor.setSelection(new Selection(8, 12, 8, 12));
				transposeAction.run(null, editor);
				assert.equal(model.getLineContent(8), 'hello world', '019');
				assert.deepEqual(editor.getSelection().toString(), new Selection(8, 12, 8, 12).toString(), '020');
			}
		);
	});

	test('toggle case', function () {
		withMockCodeEditor(
			[
				'hello world',
				'öçşğü'
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let uppercaseAction = new UpperCaseAction();
				let lowercaseAction = new LowerCaseAction();

				editor.setSelection(new Selection(1, 1, 1, 12));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'HELLO WORLD', '001');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 12).toString(), '002');

				editor.setSelection(new Selection(1, 1, 1, 12));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '003');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 12).toString(), '004');

				editor.setSelection(new Selection(1, 3, 1, 3));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'HELLO world', '005');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 3, 1, 3).toString(), '006');

				editor.setSelection(new Selection(1, 4, 1, 4));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), 'hello world', '007');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 4, 1, 4).toString(), '008');

				editor.setSelection(new Selection(2, 1, 2, 6));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'ÖÇŞĞÜ', '009');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 6).toString(), '010');

				editor.setSelection(new Selection(2, 1, 2, 6));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), 'öçşğü', '011');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 1, 2, 6).toString(), '012');
			}
		);

		withMockCodeEditor(
			[
				'',
				'   '
			], {}, (editor, cursor) => {
				let model = editor.getModel();
				let uppercaseAction = new UpperCaseAction();
				let lowercaseAction = new LowerCaseAction();

				editor.setSelection(new Selection(1, 1, 1, 1));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), '', '013');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 1).toString(), '014');

				editor.setSelection(new Selection(1, 1, 1, 1));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(1), '', '015');
				assert.deepEqual(editor.getSelection().toString(), new Selection(1, 1, 1, 1).toString(), '016');

				editor.setSelection(new Selection(2, 2, 2, 2));
				uppercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), '   ', '017');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '018');

				editor.setSelection(new Selection(2, 2, 2, 2));
				lowercaseAction.run(null, editor);
				assert.equal(model.getLineContent(2), '   ', '019');
				assert.deepEqual(editor.getSelection().toString(), new Selection(2, 2, 2, 2).toString(), '020');
			}
		);
	});

	suite('DeleteAllRightAction', () => {
		test('should be noop on empty', () => {
			withMockCodeEditor([''], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);

				editor.setSelection(new Selection(1, 1, 1, 1));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);

				editor.setSelections([new Selection(1, 1, 1, 1), new Selection(1, 1, 1, 1), new Selection(1, 1, 1, 1)]);
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
			});
		});

		test('should delete selected range', () => {
			withMockCodeEditor([
				'hello',
				'world'
			], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				editor.setSelection(new Selection(1, 2, 1, 5));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['ho', 'world']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 2, 1, 2)]);

				editor.setSelection(new Selection(1, 1, 2, 4));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['ld']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);

				editor.setSelection(new Selection(1, 1, 1, 3));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
			});
		});

		test('should delete to the right of the cursor', () => {
			withMockCodeEditor([
				'hello',
				'world'
			], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				editor.setSelection(new Selection(1, 3, 1, 3));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['he', 'world']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 3, 1, 3)]);

				editor.setSelection(new Selection(2, 1, 2, 1));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['he', '']);
				assert.deepEqual(editor.getSelections(), [new Selection(2, 1, 2, 1)]);
			});
		});

		test('should join two lines, if at the end of the line', () => {
			withMockCodeEditor([
				'hello',
				'world'
			], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				editor.setSelection(new Selection(1, 6, 1, 6));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['helloworld']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);

				editor.setSelection(new Selection(1, 6, 1, 6));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['hello']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);

				editor.setSelection(new Selection(1, 6, 1, 6));
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['hello']);
				assert.deepEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
			});
		});

		test('should work with multiple cursors', () => {
			withMockCodeEditor([
				'hello',
				'there',
				'world'
			], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				editor.setSelections([
					new Selection(1, 3, 1, 3),
					new Selection(1, 6, 1, 6),
					new Selection(3, 4, 3, 4),
				]);
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['hethere', 'wor']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(2, 4, 2, 4)
				]);

				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['he', 'wor']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(2, 4, 2, 4)
				]);

				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['hewor']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(1, 6, 1, 6)
				]);

				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['he']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3)
				]);

				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['he']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3)
				]);
			});
		});

		test('should work with undo/redo', () => {
			withMockCodeEditor([
				'hello',
				'there',
				'world'
			], {}, (editor, cursor) => {
				const model = editor.getModel();
				const action = new DeleteAllRightAction();

				editor.setSelections([
					new Selection(1, 3, 1, 3),
					new Selection(1, 6, 1, 6),
					new Selection(3, 4, 3, 4),
				]);
				action.run(null, editor);
				assert.deepEqual(model.getLinesContent(), ['hethere', 'wor']);
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(2, 4, 2, 4)
				]);

				cursor.trigger('tests', Handler.Undo, {});
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(1, 6, 1, 6),
					new Selection(3, 4, 3, 4)
				]);
				cursor.trigger('tests', Handler.Redo, {});
				assert.deepEqual(editor.getSelections(), [
					new Selection(1, 3, 1, 3),
					new Selection(2, 4, 2, 4)
				]);
			});
		});
	});
});