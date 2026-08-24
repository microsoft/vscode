/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Lazy } from '../../../../base/common/lazy.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RenderLineNumbersType, TextEditorCursorStyle } from '../../../../editor/common/config/editorOptions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IResolvedTextEditorConfiguration, ITextEditorConfigurationUpdate, MainThreadTextEditorsShape } from '../../common/extHost.protocol.js';
import { ExtHostDocumentData } from '../../common/extHostDocumentData.js';
import { ExtHostTextEditor, ExtHostTextEditorOptions } from '../../common/extHostTextEditor.js';
import { Range, TextEditorLineNumbersStyle } from '../../common/extHostTypes.js';

suite('ExtHostTextEditor', () => {

	let editor: ExtHostTextEditor;
	const doc = new ExtHostDocumentData(undefined!, URI.file(''), [
		'aaaa bbbb+cccc abc'
	], '\n', 1, 'text', false, 'utf8');

	setup(() => {
		editor = new ExtHostTextEditor('fake', null!, new NullLogService(), new Lazy(() => doc.document), [], { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: 'tabSize' }, [], 1);
	});

	test('disposed editor', () => {

		assert.ok(editor.value.document);
		editor._acceptViewColumn(3);
		assert.strictEqual(3, editor.value.viewColumn);

		editor.dispose();

		assert.throws(() => editor._acceptViewColumn(2));
		assert.strictEqual(3, editor.value.viewColumn);

		assert.ok(editor.value.document);
		assert.throws(() => editor._acceptOptions(null!));
		assert.throws(() => editor._acceptSelections([]));
	});

	test('API [bug]: registerTextEditorCommand clears redo stack even if no edits are made #55163', async function () {
		let applyCount = 0;
		const editor = new ExtHostTextEditor('edt1',
			new class extends mock<MainThreadTextEditorsShape>() {
				override $tryApplyEdits(): Promise<boolean> {
					applyCount += 1;
					return Promise.resolve(true);
				}
			}, new NullLogService(), new Lazy(() => doc.document), [], { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: 'tabSize' }, [], 1);

		await editor.value.edit(edit => { });
		assert.strictEqual(applyCount, 0);

		await editor.value.edit(edit => { edit.setEndOfLine(1); });
		assert.strictEqual(applyCount, 1);

		await editor.value.edit(edit => { edit.delete(new Range(0, 0, 1, 1)); });
		assert.strictEqual(applyCount, 2);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('ExtHostTextEditorOptions', () => {

	let opts: ExtHostTextEditorOptions;
	let calls: ITextEditorConfigurationUpdate[] = [];

	setup(() => {
		calls = [];
		const mockProxy: MainThreadTextEditorsShape = {
			dispose: undefined!,
			$trySetOptions: (id: string, options: ITextEditorConfigurationUpdate) => {
				assert.strictEqual(id, '1');
				calls.push(options);
				return Promise.resolve(undefined);
			},
			$tryShowTextDocument: undefined!,
			$registerTextEditorDecorationType: undefined!,
			$removeTextEditorDecorationType: undefined!,
			$tryShowEditor: undefined!,
			$tryHideEditor: undefined!,
			$trySetDecorations: undefined!,
			$trySetDecorationsFast: undefined!,
			$tryRevealRange: undefined!,
			$trySetSelections: undefined!,
			$tryApplyEdits: undefined!,
			$tryInsertSnippet: undefined!,
			$getDiffInformation: undefined!
		};
		opts = new ExtHostTextEditorOptions(mockProxy, '1', {
			tabSize: 4,
			indentSize: 4,
			originalIndentSize: 'tabSize',
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		}, new NullLogService());
	});

	teardown(() => {
		opts = null!;
		calls = null!;
	});

	function assertState(opts: ExtHostTextEditorOptions, expected: Omit<IResolvedTextEditorConfiguration, 'originalIndentSize'>): void {
		const actual = {
			tabSize: opts.value.tabSize,
			indentSize: opts.value.indentSize,
			insertSpaces: opts.value.insertSpaces,
			cursorStyle: opts.value.cursorStyle,
			lineNumbers: opts.value.lineNumbers
		};
		assert.deepStrictEqual(actual, expected);
	}

	test('can set tabSize to the same value', () => {
		opts.value.tabSize = 4;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can change tabSize to positive integer', () => {
		opts.value.tabSize = 1;
		assertState(opts, {
			tabSize: 1,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 1 }]);
	});

	test('can change tabSize to positive float', () => {
		opts.value.tabSize = 2.3;
		assertState(opts, {
			tabSize: 2,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
	});

	test('can change tabSize to a string number', () => {
		opts.value.tabSize = '2';
		assertState(opts, {
			tabSize: 2,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
	});

	test('tabSize can request indentation detection', () => {
		opts.value.tabSize = 'auto';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 'auto' }]);
	});

	test('ignores invalid tabSize 1', () => {
		opts.value.tabSize = null!;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid tabSize 2', () => {
		opts.value.tabSize = -5;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid tabSize 3', () => {
		opts.value.tabSize = 'hello';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid tabSize 4', () => {
		opts.value.tabSize = '-17';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can set indentSize to the same value', () => {
		opts.value.indentSize = 4;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
	});

	test('can change indentSize to positive integer', () => {
		opts.value.indentSize = 1;
		assertState(opts, {
			tabSize: 4,
			indentSize: 1,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 1 }]);
	});

	test('can change indentSize to positive float', () => {
		opts.value.indentSize = 2.3;
		assertState(opts, {
			tabSize: 4,
			indentSize: 2,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
	});

	test('can change indentSize to a string number', () => {
		// eslint-disable-next-line local/code-no-any-casts
		opts.value.indentSize = <any>'2';
		assertState(opts, {
			tabSize: 4,
			indentSize: 2,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
	});

	test('indentSize can request to use tabSize', () => {
		opts.value.indentSize = 'tabSize';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 'tabSize' }]);
	});

	test('indentSize cannot request indentation detection', () => {
		// eslint-disable-next-line local/code-no-any-casts
		opts.value.indentSize = <any>'auto';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid indentSize 1', () => {
		opts.value.indentSize = null!;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid indentSize 2', () => {
		opts.value.indentSize = -5;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid indentSize 3', () => {
		// eslint-disable-next-line local/code-no-any-casts
		opts.value.indentSize = <any>'hello';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('ignores invalid indentSize 4', () => {
		// eslint-disable-next-line local/code-no-any-casts
		opts.value.indentSize = <any>'-17';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can set insertSpaces to the same value', () => {
		opts.value.insertSpaces = false;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can set insertSpaces to boolean', () => {
		opts.value.insertSpaces = true;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: true,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
	});

	test('can set insertSpaces to false string', () => {
		opts.value.insertSpaces = 'false';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can set insertSpaces to truey', () => {
		opts.value.insertSpaces = 'hello';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: true,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
	});

	test('insertSpaces can request indentation detection', () => {
		opts.value.insertSpaces = 'auto';
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ insertSpaces: 'auto' }]);
	});

	test('can set cursorStyle to same value', () => {
		opts.value.cursorStyle = TextEditorCursorStyle.Line;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can change cursorStyle', () => {
		opts.value.cursorStyle = TextEditorCursorStyle.Block;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Block,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block }]);
	});

	test('can set lineNumbers to same value', () => {
		opts.value.lineNumbers = TextEditorLineNumbersStyle.On;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, []);
	});

	test('can change lineNumbers', () => {
		opts.value.lineNumbers = TextEditorLineNumbersStyle.Off;
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.Off
		});
		assert.deepStrictEqual(calls, [{ lineNumbers: RenderLineNumbersType.Off }]);
	});

	test('can do bulk updates 0', () => {
		opts.assign({
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: TextEditorLineNumbersStyle.On
		});
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
	});

	test('can do bulk updates 1', () => {
		opts.assign({
			tabSize: 'auto',
			insertSpaces: true
		});
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: true,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 'auto', insertSpaces: true }]);
	});

	test('can do bulk updates 2', () => {
		opts.assign({
			tabSize: 3,
			insertSpaces: 'auto'
		});
		assertState(opts, {
			tabSize: 3,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Line,
			lineNumbers: RenderLineNumbersType.On
		});
		assert.deepStrictEqual(calls, [{ tabSize: 3, insertSpaces: 'auto' }]);
	});

	test('can do bulk updates 3', () => {
		opts.assign({
			cursorStyle: TextEditorCursorStyle.Block,
			lineNumbers: TextEditorLineNumbersStyle.Relative
		});
		assertState(opts, {
			tabSize: 4,
			indentSize: 4,
			insertSpaces: false,
			cursorStyle: TextEditorCursorStyle.Block,
			lineNumbers: RenderLineNumbersType.Relative
		});
		assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block, lineNumbers: RenderLineNumbersType.Relative }]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
