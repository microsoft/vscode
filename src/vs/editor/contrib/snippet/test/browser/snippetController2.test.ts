/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { Selection } from '../../../../common/core/selection.js';
import { Range } from '../../../../common/core/range.js';
import { Handler } from '../../../../common/editorCommon.js';
import { TextModel } from '../../../../common/model/textModel.js';
import { SnippetController2 } from '../../browser/snippetController2.js';
import { createTestCodeEditor, ITestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EndOfLineSequence } from '../../../../common/model.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('SnippetController2', function () {

	/** @deprecated */
	function assertSelections(editor: ICodeEditor, ...s: Selection[]) {
		for (const selection of editor.getSelections()!) {
			const actual = s.shift()!;
			assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
		}
		assert.strictEqual(s.length, 0);
	}

	function assertContextKeys(service: MockContextKeyService, inSnippet: boolean, hasPrev: boolean, hasNext: boolean): void {
		const state = getContextState(service);
		assert.strictEqual(state.inSnippet, inSnippet, `inSnippetMode`);
		assert.strictEqual(state.hasPrev, hasPrev, `HasPrevTabstop`);
		assert.strictEqual(state.hasNext, hasNext, `HasNextTabstop`);
	}

	function getContextState(service: MockContextKeyService = contextKeys) {
		return {
			inSnippet: SnippetController2.InSnippetMode.getValue(service),
			hasPrev: SnippetController2.HasPrevTabstop.getValue(service),
			hasNext: SnippetController2.HasNextTabstop.getValue(service),
		};
	}

	let ctrl: SnippetController2;
	let editor: ITestCodeEditor;
	let model: TextModel;
	let contextKeys: MockContextKeyService;
	let instaService: IInstantiationService;

	setup(function () {
		contextKeys = new MockContextKeyService();
		model = createTextModel('if\n    $state\nfi');
		const serviceCollection = new ServiceCollection(
			[ILabelService, new class extends mock<ILabelService>() { }],
			[IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
				override getWorkspace() {
					return { id: 'foo', folders: [] };
				}
			}],
			[ILogService, new NullLogService()],
			[IContextKeyService, contextKeys],
		);
		instaService = new InstantiationService(serviceCollection);
		editor = createTestCodeEditor(model, { serviceCollection });
		editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
		assert.strictEqual(model.getEOL(), '\n');
	});

	teardown(function () {
		model.dispose();
		ctrl.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('creation', () => {
		ctrl = instaService.createInstance(SnippetController2, editor);
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, insert -> abort', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('foo${1:bar}foo$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		ctrl.cancel();
		assertContextKeys(contextKeys, false, false, false);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
	});

	test('insert, insert -> tab, tab, done', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('${1:one}${2:two}$0');
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertContextKeys(contextKeys, true, true, true);

		ctrl.next();
		assertContextKeys(contextKeys, false, false, false);

		editor.trigger('test', 'type', { text: '\t' });
		assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), false);
		assert.strictEqual(SnippetController2.HasNextTabstop.getValue(contextKeys), false);
		assert.strictEqual(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);
	});

	test('insert, insert -> cursor moves out (left/right)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('foo${1:bar}foo$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// bad selection change
		editor.setSelections([new Selection(1, 12, 1, 12), new Selection(2, 16, 2, 16)]);
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, insert -> cursor moves out (up/down)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('foo${1:bar}foo$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// bad selection change
		editor.setSelections([new Selection(2, 4, 2, 7), new Selection(3, 8, 3, 11)]);
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, insert -> cursors collapse', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('foo${1:bar}foo$0');
		assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), true);
		assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));

		// bad selection change
		editor.setSelections([new Selection(1, 4, 1, 7)]);
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, insert plain text -> no snippet mode', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('foobar');
		assertContextKeys(contextKeys, false, false, false);
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
	});

	test('insert, delete snippet text', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('${1:foobar}$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));

		editor.trigger('test', 'cut', {});
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));

		editor.trigger('test', 'type', { text: 'abc' });
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertContextKeys(contextKeys, false, false, false);

		editor.trigger('test', 'tab', {});
		assertContextKeys(contextKeys, false, false, false);

		// editor.trigger('test', 'type', { text: 'abc' });
		// assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, nested trivial snippet', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		ctrl.insert('${1:foo}bar$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));

		ctrl.insert('FOO$0');
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, nested snippet', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		ctrl.insert('${1:foobar}$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));

		ctrl.insert('far$1boo$0');
		assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		assertContextKeys(contextKeys, true, true, true);

		ctrl.next();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('insert, nested plain text', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		ctrl.insert('${1:foobar}$0');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));

		ctrl.insert('farboo');
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('Nested snippets without final placeholder jumps to next outer placeholder, #27898', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		ctrl.insert('for(const ${1:element} of ${2:array}) {$0}');
		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 11, 1, 18), new Selection(2, 15, 2, 22));

		ctrl.next();
		assertContextKeys(contextKeys, true, true, true);
		assertSelections(editor, new Selection(1, 22, 1, 27), new Selection(2, 26, 2, 31));

		ctrl.insert('document');
		assertContextKeys(contextKeys, true, true, true);
		assertSelections(editor, new Selection(1, 30, 1, 30), new Selection(2, 34, 2, 34));

		ctrl.next();
		assertContextKeys(contextKeys, false, false, false);
	});

	test('Inconsistent tab stop behaviour with recursive snippets and tab / shift tab, #27543', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		ctrl.insert('1_calize(${1:nl}, \'${2:value}\')$0');

		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 10, 1, 12), new Selection(2, 14, 2, 16));

		ctrl.insert('2_calize(${1:nl}, \'${2:value}\')$0');

		assertSelections(editor, new Selection(1, 19, 1, 21), new Selection(2, 23, 2, 25));

		ctrl.next(); // inner `value`
		assertSelections(editor, new Selection(1, 24, 1, 29), new Selection(2, 28, 2, 33));

		ctrl.next(); // inner `$0`
		assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));

		ctrl.next(); // outer `value`
		assertSelections(editor, new Selection(1, 34, 1, 39), new Selection(2, 38, 2, 43));

		ctrl.prev(); // inner `$0`
		assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));
	});

	test('Snippet tabstop selecting content of previously entered variable only works when separated by space, #23728', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('import ${2:${1:module}} from \'${1:module}\'$0');

		assertContextKeys(contextKeys, true, false, true);
		assertSelections(editor, new Selection(1, 8, 1, 14), new Selection(1, 21, 1, 27));

		ctrl.insert('foo');
		assertSelections(editor, new Selection(1, 11, 1, 11), new Selection(1, 21, 1, 21));

		ctrl.next(); // ${2:...}
		assertSelections(editor, new Selection(1, 8, 1, 11));
	});

	test('HTML Snippets Combine, #32211', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		model.setValue('');
		model.updateOptions({ insertSpaces: false, tabSize: 4, trimAutoWhitespace: false });
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=\${2:device-width}, initial-scale=\${3:1.0}">
				<meta http-equiv="X-UA-Compatible" content="\${5:ie=edge}">
				<title>\${7:Document}</title>
			</head>
			<body>
				\${8}
			</body>
			</html>
		`);
		ctrl.next();
		ctrl.next();
		ctrl.next();
		ctrl.next();
		assertSelections(editor, new Selection(11, 5, 11, 5));

		ctrl.insert('<input type="${2:text}">');
		assertSelections(editor, new Selection(11, 18, 11, 22));
	});

	test('Problems with nested snippet insertion #39594', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);

		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('$1 = ConvertTo-Json $1');
		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(1, 19, 1, 19));

		editor.setSelection(new Selection(1, 19, 1, 19));

		// snippet mode should stop because $1 has two occurrences
		// and we only have one selection left
		assertContextKeys(contextKeys, false, false, false);
	});

	test('Problems with nested snippet insertion #39594 (part2)', function () {
		// ensure selection-change-to-cancel logic isn't too aggressive
		ctrl = instaService.createInstance(SnippetController2, editor);

		model.setValue('a-\naaa-');
		editor.setSelections([new Selection(2, 5, 2, 5), new Selection(1, 3, 1, 3)]);

		ctrl.insert('log($1);$0');
		assertSelections(editor, new Selection(2, 9, 2, 9), new Selection(1, 7, 1, 7));
		assertContextKeys(contextKeys, true, false, true);
	});

	test('“Nested” snippets terminating abruptly in VSCode 1.19.2. #42012', function () {

		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));
		ctrl.insert('var ${2:${1:name}} = ${1:name} + 1;${0}');

		assertSelections(editor, new Selection(1, 5, 1, 9), new Selection(1, 12, 1, 16));
		assertContextKeys(contextKeys, true, false, true);

		ctrl.next();
		assertContextKeys(contextKeys, true, true, true);
	});

	test('Placeholders order #58267', function () {

		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));
		ctrl.insert('\\pth{$1}$0');

		assertSelections(editor, new Selection(1, 6, 1, 6));
		assertContextKeys(contextKeys, true, false, true);

		ctrl.insert('\\itv{${1:left}}{${2:right}}{${3:left_value}}{${4:right_value}}$0');
		assertSelections(editor, new Selection(1, 11, 1, 15));

		ctrl.next();
		assertSelections(editor, new Selection(1, 17, 1, 22));

		ctrl.next();
		assertSelections(editor, new Selection(1, 24, 1, 34));

		ctrl.next();
		assertSelections(editor, new Selection(1, 36, 1, 47));

		ctrl.next();
		assertSelections(editor, new Selection(1, 48, 1, 48));

		ctrl.next();
		assertSelections(editor, new Selection(1, 49, 1, 49));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('Must tab through deleted tab stops in snippets #31619', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));
		ctrl.insert('foo${1:a${2:bar}baz}end$0');
		assertSelections(editor, new Selection(1, 4, 1, 11));

		editor.trigger('test', Handler.Cut, null);
		assertSelections(editor, new Selection(1, 4, 1, 4));

		ctrl.next();
		assertSelections(editor, new Selection(1, 7, 1, 7));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('Cancelling snippet mode should discard added cursors #68512 (soft cancel)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('.REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDREGION$0');
		assertSelections(editor, new Selection(2, 17, 2, 21));

		ctrl.next();
		assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
		assertContextKeys(contextKeys, true, true, true);

		editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
		assertContextKeys(contextKeys, true, true, true);

		editor.setSelections([new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36)]);
		assertContextKeys(contextKeys, false, false, false);
		assertSelections(editor, new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36));
	});

	test('Cancelling snippet mode should discard added cursors #68512 (hard cancel)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('.REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n\t${4:}\nEND\n.ENDREGION$0');
		assertSelections(editor, new Selection(2, 17, 2, 21));

		ctrl.next();
		assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
		assertContextKeys(contextKeys, true, true, true);

		editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
		assertContextKeys(contextKeys, true, true, true);

		ctrl.cancel(true);
		assertContextKeys(contextKeys, false, false, false);
		assertSelections(editor, new Selection(1, 22, 1, 22));
	});

	test('User defined snippet tab stops ignored #72862', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('export default $1');
		assertContextKeys(contextKeys, true, false, true);
	});

	test('Optional tabstop in snippets #72358', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.setSelection(new Selection(1, 1, 1, 1));

		ctrl.insert('${1:prop: {$2\\},}\nmore$0');
		assertContextKeys(contextKeys, true, false, true);

		assertSelections(editor, new Selection(1, 1, 1, 10));
		editor.trigger('test', Handler.Cut, {});

		assertSelections(editor, new Selection(1, 1, 1, 1));

		ctrl.next();
		assertSelections(editor, new Selection(2, 5, 2, 5));
		assertContextKeys(contextKeys, false, false, false);
	});

	test('issue #90135: confusing trim whitespace edits', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.runCommand(CoreEditingCommands.Tab, null);

		ctrl.insert('\nfoo');
		assertSelections(editor, new Selection(2, 8, 2, 8));
	});

	test('issue #145727: insertSnippet can put snippet selections in wrong positions (1 of 2)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.runCommand(CoreEditingCommands.Tab, null);

		ctrl.insert('\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n', { adjustWhitespace: false });
		assertSelections(editor, new Selection(2, 19, 2, 26), new Selection(2, 41, 2, 48));
	});

	test('issue #145727: insertSnippet can put snippet selections in wrong positions (2 of 2)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		editor.runCommand(CoreEditingCommands.Tab, null);

		ctrl.insert('\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n');
		// This will insert \n    aProperty....
		assertSelections(editor, new Selection(2, 23, 2, 30), new Selection(2, 45, 2, 52));
	});

	test('leading TAB by snippets won\'t replace by spaces #101870', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		model.updateOptions({ insertSpaces: true, tabSize: 4 });
		ctrl.insert('\tHello World\n\tNew Line');
		assert.strictEqual(model.getValue(), '    Hello World\n    New Line');
	});

	test('leading TAB by snippets won\'t replace by spaces #101870 (part 2)', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		model.updateOptions({ insertSpaces: true, tabSize: 4 });
		ctrl.insert('\tHello World\n\tNew Line\n${1:\tmore}');
		assert.strictEqual(model.getValue(), '    Hello World\n    New Line\n    more');
	});

	test.skip('Snippet transformation does not work after inserting variable using intellisense, #112362', function () {

		{
			// HAPPY - no nested snippet
			ctrl = instaService.createInstance(SnippetController2, editor);
			model.setValue('');
			model.updateOptions({ insertSpaces: true, tabSize: 4 });
			ctrl.insert('$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: \'$2\',/gm}');

			assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
			editor.trigger('test', 'type', { text: 'foo: number;' });
			ctrl.next();
			assert.strictEqual(model.getValue(), `foo: number;\n\nfoo: 'number',`);
		}

		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		model.updateOptions({ insertSpaces: true, tabSize: 4 });
		ctrl.insert('$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: \'$2\',/gm}');

		assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
		editor.trigger('test', 'type', { text: 'foo: ' });
		ctrl.insert('number;');
		ctrl.next();
		assert.strictEqual(model.getValue(), `foo: number;\n\nfoo: 'number',`);
		// editor.trigger('test', 'type', { text: ';' });
	});

	suite('createEditsAndSnippetsFromEdits', function () {

		test('apply, tab, done', function () {

			ctrl = instaService.createInstance(SnippetController2, editor);

			model.setValue('foo("bar")');

			ctrl.apply([
				{ range: new Range(1, 5, 1, 10), template: '$1' },
				{ range: new Range(1, 1, 1, 1), template: 'const ${1:new_const} = "bar";\n' }
			]);

			assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
			assertContextKeys(contextKeys, true, false, true);
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);

			ctrl.next();
			assertContextKeys(contextKeys, false, false, false);
			assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 14, 2, 14)]);
		});

		test('apply, tab, done with special final tabstop', function () {

			model.setValue('foo("bar")');

			ctrl = instaService.createInstance(SnippetController2, editor);
			ctrl.apply([
				{ range: new Range(1, 5, 1, 10), template: '$1' },
				{ range: new Range(1, 1, 1, 1), template: 'const ${1:new_const}$0 = "bar";\n' }
			]);

			assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
			assertContextKeys(contextKeys, true, false, true);
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);

			ctrl.next();
			assertContextKeys(contextKeys, false, false, false);
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 16, 1, 16)]);
		});

		test('apply, tab, tab, done', function () {

			model.setValue('foo\nbar');

			ctrl = instaService.createInstance(SnippetController2, editor);
			ctrl.apply([
				{ range: new Range(1, 4, 1, 4), template: '${3}' },
				{ range: new Range(2, 4, 2, 4), template: '$3' },
				{ range: new Range(1, 1, 1, 1), template: '### ${2:Header}\n' }
			]);

			assert.strictEqual(model.getValue(), '### Header\nfoo\nbar');
			assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 11)]);

			ctrl.next();
			assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: true, hasNext: true });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 4, 2, 4), new Selection(3, 4, 3, 4)]);

			ctrl.next();
			assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(3, 4, 3, 4)]);
		});

		test('nested into apply works', function () {

			ctrl = instaService.createInstance(SnippetController2, editor);
			model.setValue('onetwo');

			editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);

			ctrl.apply([{
				range: new Range(1, 7, 1, 7),
				template: '$0${1:three}'
			}]);

			assert.strictEqual(model.getValue(), 'onetwothree');
			assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 12)]);

			ctrl.insert('foo$1bar$1');
			assert.strictEqual(model.getValue(), 'onetwofoobar');
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 10, 1, 10), new Selection(1, 13, 1, 13)]);
			assert.deepStrictEqual(getContextState(), ({ inSnippet: true, hasPrev: false, hasNext: true }));

			ctrl.next();
			assert.deepStrictEqual(getContextState(), ({ inSnippet: true, hasPrev: true, hasNext: true }));
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 13, 1, 13)]);

			ctrl.next();
			assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 7)]);

		});

		test('nested into insert abort "outer" snippet', function () {

			ctrl = instaService.createInstance(SnippetController2, editor);
			model.setValue('one\ntwo');

			editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);

			ctrl.insert('foo${1:bar}bazz${1:bang}');
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
			assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });

			ctrl.apply([{
				range: new Range(1, 4, 1, 7),
				template: '$0A'
			}]);

			assert.strictEqual(model.getValue(), 'fooAbazzbarone\nfoobarbazzbartwo');
			assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 4)]);
		});

		test('nested into "insert" abort "outer" snippet (2)', function () {

			ctrl = instaService.createInstance(SnippetController2, editor);
			model.setValue('one\ntwo');

			editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);

			ctrl.insert('foo${1:bar}bazz${1:bang}');
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
			assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });

			const edits = [{
				range: new Range(1, 4, 1, 7),
				template: 'A'
			}, {
				range: new Range(1, 11, 1, 14),
				template: 'B'
			}, {
				range: new Range(2, 4, 2, 7),
				template: 'C'
			}, {
				range: new Range(2, 11, 2, 14),
				template: 'D'
			}];
			ctrl.apply(edits);

			assert.strictEqual(model.getValue(), 'fooAbazzBone\nfooCbazzDtwo');
			assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
			assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5), new Selection(1, 10, 1, 10), new Selection(2, 5, 2, 5), new Selection(2, 10, 2, 10)]);
		});
	});

	test('Bug: cursor position $0 with user snippets #163808', function () {

		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');

		ctrl.insert('<Element1 Attr1="foo" $1>\n  <Element2 Attr1="$2"/>\n$0"\n</Element1>');
		assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 23, 1, 23)]);

		ctrl.insert('Qualifier="$0"');
		assert.strictEqual(model.getValue(), '<Element1 Attr1="foo" Qualifier="">\n  <Element2 Attr1=""/>\n"\n</Element1>');
		assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 34, 1, 34)]);

	});

	test('EOL-Sequence (CRLF) shifts tab stop in isFileTemplate snippets #167386', function () {
		ctrl = instaService.createInstance(SnippetController2, editor);
		model.setValue('');
		model.setEOL(EndOfLineSequence.CRLF);

		ctrl.apply([{
			range: model.getFullModelRange(),
			template: 'line 54321${1:FOO}\nline 54321${1:FOO}\n(no tab stop)\nline 54321${1:FOO}\nline 54321'
		}]);

		assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 11, 1, 14), new Selection(2, 11, 2, 14), new Selection(4, 11, 4, 14)]);

	});

	test('"Surround With" code action snippets use incorrect indentation levels and styles #169319', function () {
		model.setValue('function foo(f, x, condition) {\n    f();\n    return x;\n}');
		const sel = new Range(2, 5, 3, 14);
		editor.setSelection(sel);
		ctrl = instaService.createInstance(SnippetController2, editor);
		ctrl.apply([{
			range: sel,
			template: 'if (${1:condition}) {\n\t$TM_SELECTED_TEXT$0\n}'
		}]);

		assert.strictEqual(model.getValue(), `function foo(f, x, condition) {\n    if (condition) {\n        f();\n        return x;\n    }\n}`);
	});
});
