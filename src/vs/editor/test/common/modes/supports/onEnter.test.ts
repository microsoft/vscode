/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CharacterPair, IndentAction } from 'vs/editor/common/languages/languageConfiguration';
import { OnEnterSupport } from 'vs/editor/common/languages/supports/onEnter';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/onEnterRules';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('OnEnter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses brackets', () => {
		const brackets: CharacterPair[] = [
			['(', ')'],
			['begin', 'end']
		];
		const support = new OnEnterSupport({
			brackets: brackets
		});
		const testIndentAction = (beforeText: string, afterText: string, expected: IndentAction) => {
			const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, '', beforeText, afterText);
			if (expected === IndentAction.None) {
				assert.strictEqual(actual, null);
			} else {
				assert.strictEqual(actual!.indentAction, expected);
			}
		};

		testIndentAction('a', '', IndentAction.None);
		testIndentAction('', 'b', IndentAction.None);
		testIndentAction('(', 'b', IndentAction.Indent);
		testIndentAction('a', ')', IndentAction.None);
		testIndentAction('begin', 'ending', IndentAction.Indent);
		testIndentAction('abegin', 'end', IndentAction.None);
		testIndentAction('begin', ')', IndentAction.Indent);
		testIndentAction('begin', 'end', IndentAction.IndentOutdent);
		testIndentAction('begin ', ' end', IndentAction.IndentOutdent);
		testIndentAction(' begin', 'end//as', IndentAction.IndentOutdent);
		testIndentAction('(', ')', IndentAction.IndentOutdent);
		testIndentAction('( ', ')', IndentAction.IndentOutdent);
		testIndentAction('a(', ')b', IndentAction.IndentOutdent);

		testIndentAction('(', '', IndentAction.Indent);
		testIndentAction('(', 'foo', IndentAction.Indent);
		testIndentAction('begin', 'foo', IndentAction.Indent);
		testIndentAction('begin', '', IndentAction.Indent);
	});


	test('Issue #121125: onEnterRules with global modifier', () => {
		const support = new OnEnterSupport({
			onEnterRules: [
				{
					action: {
						appendText: '/// ',
						indentAction: IndentAction.Outdent
					},
					beforeText: /^\s*\/{3}.*$/gm
				}
			]
		});

		const testIndentAction = (previousLineText: string, beforeText: string, afterText: string, expectedIndentAction: IndentAction | null, expectedAppendText: string | null, removeText: number = 0) => {
			const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, previousLineText, beforeText, afterText);
			if (expectedIndentAction === null) {
				assert.strictEqual(actual, null, 'isNull:' + beforeText);
			} else {
				assert.strictEqual(actual !== null, true, 'isNotNull:' + beforeText);
				assert.strictEqual(actual!.indentAction, expectedIndentAction, 'indentAction:' + beforeText);
				if (expectedAppendText !== null) {
					assert.strictEqual(actual!.appendText, expectedAppendText, 'appendText:' + beforeText);
				}
				if (removeText !== 0) {
					assert.strictEqual(actual!.removeText, removeText, 'removeText:' + beforeText);
				}
			}
		};

		testIndentAction('/// line', '/// line', '', IndentAction.Outdent, '/// ');
		testIndentAction('/// line', '/// line', '', IndentAction.Outdent, '/// ');
	});

	test('uses regExpRules', () => {
		const support = new OnEnterSupport({
			onEnterRules: javascriptOnEnterRules
		});
		const testIndentAction = (previousLineText: string, beforeText: string, afterText: string, expectedIndentAction: IndentAction | null, expectedAppendText: string | null, removeText: number = 0) => {
			const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, previousLineText, beforeText, afterText);
			if (expectedIndentAction === null) {
				assert.strictEqual(actual, null, 'isNull:' + beforeText);
			} else {
				assert.strictEqual(actual !== null, true, 'isNotNull:' + beforeText);
				assert.strictEqual(actual!.indentAction, expectedIndentAction, 'indentAction:' + beforeText);
				if (expectedAppendText !== null) {
					assert.strictEqual(actual!.appendText, expectedAppendText, 'appendText:' + beforeText);
				}
				if (removeText !== 0) {
					assert.strictEqual(actual!.removeText, removeText, 'removeText:' + beforeText);
				}
			}
		};

		testIndentAction('', '\t/**', ' */', IndentAction.IndentOutdent, ' * ');
		testIndentAction('', '\t/**', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/** * / * / * /', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/** /*', '', IndentAction.None, ' * ');
		testIndentAction('', '/**', '', IndentAction.None, ' * ');
		testIndentAction('', '\t/**/', '', null, null);
		testIndentAction('', '\t/***/', '', null, null);
		testIndentAction('', '\t/*******/', '', null, null);
		testIndentAction('', '\t/** * * * * */', '', null, null);
		testIndentAction('', '\t/** */', '', null, null);
		testIndentAction('', '\t/** asdfg */', '', null, null);
		testIndentAction('', '\t/* asdfg */', '', null, null);
		testIndentAction('', '\t/* asdfg */', '', null, null);
		testIndentAction('', '\t/** asdfg */', '', null, null);
		testIndentAction('', '*/', '', null, null);
		testIndentAction('', '\t/*', '', null, null);
		testIndentAction('', '\t*', '', null, null);

		testIndentAction('\t/**', '\t *', '', IndentAction.None, '* ');
		testIndentAction('\t * something', '\t *', '', IndentAction.None, '* ');
		testIndentAction('\t *', '\t *', '', IndentAction.None, '* ');

		testIndentAction('', '\t */', '', IndentAction.None, null, 1);
		testIndentAction('', '\t * */', '', IndentAction.None, null, 1);
		testIndentAction('', '\t * * / * / * / */', '', null, null);

		testIndentAction('\t/**', '\t * ', '', IndentAction.None, '* ');
		testIndentAction('\t * something', '\t * ', '', IndentAction.None, '* ');
		testIndentAction('\t *', '\t * ', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * ', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * ', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * /*', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * /*', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * /*', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');

		testIndentAction('/**', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
		testIndentAction(' * something', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
		testIndentAction(' *', ' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');

		testIndentAction('', ' */', '', IndentAction.None, null, 1);
		testIndentAction(' */', ' * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('', '\t */', '', IndentAction.None, null, 1);
		testIndentAction('', '\t\t */', '', IndentAction.None, null, 1);
		testIndentAction('', '   */', '', IndentAction.None, null, 1);
		testIndentAction('', '     */', '', IndentAction.None, null, 1);
		testIndentAction('', '\t     */', '', IndentAction.None, null, 1);
		testIndentAction('', ' *--------------------------------------------------------------------------------------------*/', '', IndentAction.None, null, 1);

		// issue #43469
		testIndentAction('class A {', '    * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('', '    * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('    ', '    * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('class A {', '  * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('', '  * test() {', '', IndentAction.Indent, null, 0);
		testIndentAction('  ', '  * test() {', '', IndentAction.Indent, null, 0);
	});

	test('issue #141816', () => {
		const support = new OnEnterSupport({
			onEnterRules: javascriptOnEnterRules
		});
		const testIndentAction = (beforeText: string, afterText: string, expected: IndentAction) => {
			const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, '', beforeText, afterText);
			if (expected === IndentAction.None) {
				assert.strictEqual(actual, null);
			} else {
				assert.strictEqual(actual!.indentAction, expected);
			}
		};

		testIndentAction('const r = /{/;', '', IndentAction.None);
		testIndentAction('const r = /{[0-9]/;', '', IndentAction.None);
		testIndentAction('const r = /[a-zA-Z]{/;', '', IndentAction.None);
	});
});
