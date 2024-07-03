/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ReplacePattern } from 'vs/workbench/services/search/common/replace';

suite('Replace Pattern test', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parse replace string', () => {
		const testParse = (input: string, expected: string, expectedHasParameters: boolean) => {
			let actual = new ReplacePattern(input, { pattern: 'somepattern', isRegExp: true });
			assert.strictEqual(expected, actual.pattern);
			assert.strictEqual(expectedHasParameters, actual.hasParameters);

			actual = new ReplacePattern('hello' + input + 'hi', { pattern: 'sonepattern', isRegExp: true });
			assert.strictEqual('hello' + expected + 'hi', actual.pattern);
			assert.strictEqual(expectedHasParameters, actual.hasParameters);
		};

		// no backslash => no treatment
		testParse('hello', 'hello', false);

		// \t => TAB
		testParse('\\thello', '\thello', false);

		// \n => LF
		testParse('\\nhello', '\nhello', false);

		// \\t => \t
		testParse('\\\\thello', '\\thello', false);

		// \\\t => \TAB
		testParse('\\\\\\thello', '\\\thello', false);

		// \\\\t => \\t
		testParse('\\\\\\\\thello', '\\\\thello', false);

		// \ at the end => no treatment
		testParse('hello\\', 'hello\\', false);

		// \ with unknown char => no treatment
		testParse('hello\\x', 'hello\\x', false);

		// \ with back reference => no treatment
		testParse('hello\\0', 'hello\\0', false);



		// $1 => no treatment
		testParse('hello$1', 'hello$1', true);
		// $2 => no treatment
		testParse('hello$2', 'hello$2', true);
		// $12 => no treatment
		testParse('hello$12', 'hello$12', true);
		// $99 => no treatment
		testParse('hello$99', 'hello$99', true);
		// $99a => no treatment
		testParse('hello$99a', 'hello$99a', true);
		// $100 => no treatment
		testParse('hello$100', 'hello$100', false);
		// $100a => no treatment
		testParse('hello$100a', 'hello$100a', false);
		// $10a0 => no treatment
		testParse('hello$10a0', 'hello$10a0', true);
		// $$ => no treatment
		testParse('hello$$', 'hello$$', false);
		// $$0 => no treatment
		testParse('hello$$0', 'hello$$0', false);

		// $0 => $&
		testParse('hello$0', 'hello$&', true);
		testParse('hello$02', 'hello$&2', true);

		testParse('hello$`', 'hello$`', true);
		testParse('hello$\'', 'hello$\'', true);
	});

	test('create pattern by passing regExp', () => {
		let expected = /abc/;
		let actual = new ReplacePattern('hello', false, expected).regExp;
		assert.deepStrictEqual(actual, expected);

		expected = /abc/;
		actual = new ReplacePattern('hello', false, /abc/g).regExp;
		assert.deepStrictEqual(actual, expected);

		let testObject = new ReplacePattern('hello$0', false, /abc/g);
		assert.strictEqual(testObject.hasParameters, false);

		testObject = new ReplacePattern('hello$0', true, /abc/g);
		assert.strictEqual(testObject.hasParameters, true);
	});

	test('get replace string if given text is a complete match', () => {
		let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
		let actual = testObject.getReplaceString('bla');
		assert.strictEqual(actual, 'hello');

		testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
		actual = testObject.getReplaceString('bla');
		assert.strictEqual(actual, 'hello');

		testObject = new ReplacePattern('hello', { pattern: '(bla)', isRegExp: true });
		actual = testObject.getReplaceString('bla');
		assert.strictEqual(actual, 'hello');

		testObject = new ReplacePattern('hello$0', { pattern: '(bla)', isRegExp: true });
		actual = testObject.getReplaceString('bla');
		assert.strictEqual(actual, 'hellobla');

		testObject = new ReplacePattern('import * as $1 from \'$2\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
		actual = testObject.getReplaceString('let fs = require(\'fs\')');
		assert.strictEqual(actual, 'import * as fs from \'fs\';');

		actual = testObject.getReplaceString('let something = require(\'fs\')');
		assert.strictEqual(actual, 'import * as something from \'fs\';');

		actual = testObject.getReplaceString('let require(\'fs\')');
		assert.strictEqual(actual, null);

		testObject = new ReplacePattern('import * as $1 from \'$1\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
		actual = testObject.getReplaceString('let something = require(\'fs\')');
		assert.strictEqual(actual, 'import * as something from \'something\';');

		testObject = new ReplacePattern('import * as $2 from \'$1\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
		actual = testObject.getReplaceString('let something = require(\'fs\')');
		assert.strictEqual(actual, 'import * as fs from \'something\';');

		testObject = new ReplacePattern('import * as $0 from \'$0\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true });
		actual = testObject.getReplaceString('let something = require(\'fs\');');
		assert.strictEqual(actual, 'import * as let something = require(\'fs\') from \'let something = require(\'fs\')\';');

		testObject = new ReplacePattern('import * as $1 from \'$2\';', { pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: false });
		actual = testObject.getReplaceString('let fs = require(\'fs\');');
		assert.strictEqual(actual, null);

		testObject = new ReplacePattern('cat$1', { pattern: 'for(.*)', isRegExp: true });
		actual = testObject.getReplaceString('for ()');
		assert.strictEqual(actual, 'cat ()');
	});

	test('case operations', () => {
		const testObject = new ReplacePattern('a\\u$1l\\u\\l\\U$2M$3n', { pattern: 'a(l)l(good)m(e)n', isRegExp: true });
		const actual = testObject.getReplaceString('allgoodmen');
		assert.strictEqual(actual, 'aLlGoODMen');
	});

	test('case operations - no false positive', () => {
		let testObject = new ReplacePattern('\\left $1', { pattern: '(pattern)', isRegExp: true });
		let actual = testObject.getReplaceString('pattern');
		assert.strictEqual(actual, '\\left pattern');

		testObject = new ReplacePattern('\\hi \\left $1', { pattern: '(pattern)', isRegExp: true });
		actual = testObject.getReplaceString('pattern');
		assert.strictEqual(actual, '\\hi \\left pattern');

		testObject = new ReplacePattern('\\left \\L$1', { pattern: 'PATT(ERN)', isRegExp: true });
		actual = testObject.getReplaceString('PATTERN');
		assert.strictEqual(actual, '\\left ern');
	});

	test('case operations and newline', () => { // #140734
		const testObject = new ReplacePattern('$1\n\\U$2', { pattern: '(multi)(line)', isRegExp: true });
		const actual = testObject.getReplaceString('multiline');
		assert.strictEqual(actual, 'multi\nLINE');
	});

	test('get replace string for no matches', () => {
		let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
		let actual = testObject.getReplaceString('foo');
		assert.strictEqual(actual, null);

		testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
		actual = testObject.getReplaceString('foo');
		assert.strictEqual(actual, null);
	});

	test('get replace string if match is sub-string of the text', () => {
		let testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: true });
		let actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'hello');

		testObject = new ReplacePattern('hello', { pattern: 'bla', isRegExp: false });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'hello');

		testObject = new ReplacePattern('that', { pattern: 'this(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'that');

		testObject = new ReplacePattern('$1at', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'that');

		testObject = new ReplacePattern('$1e', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'the');

		testObject = new ReplacePattern('$1ere', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'there');

		testObject = new ReplacePattern('$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'th');

		testObject = new ReplacePattern('ma$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'math');

		testObject = new ReplacePattern('ma$1s', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'maths');

		testObject = new ReplacePattern('ma$1s', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'maths');

		testObject = new ReplacePattern('$0', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'this');

		testObject = new ReplacePattern('$0$1', { pattern: '(th)is(?=.*bla)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'thisth');

		testObject = new ReplacePattern('foo', { pattern: 'bla(?=\\stext$)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'foo');

		testObject = new ReplacePattern('f$1', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'fla');

		testObject = new ReplacePattern('f$0', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'fbla');

		testObject = new ReplacePattern('$0ah', { pattern: 'b(la)(?=\\stext$)', isRegExp: true });
		actual = testObject.getReplaceString('this is a bla text');
		assert.strictEqual(actual, 'blaah');

		testObject = new ReplacePattern('newrege$1', true, /Testrege(\w*)/);
		actual = testObject.getReplaceString('Testregex', true);
		assert.strictEqual(actual, 'Newregex');

		testObject = new ReplacePattern('newrege$1', true, /TESTREGE(\w*)/);
		actual = testObject.getReplaceString('TESTREGEX', true);
		assert.strictEqual(actual, 'NEWREGEX');

		testObject = new ReplacePattern('new_rege$1', true, /Test_Rege(\w*)/);
		actual = testObject.getReplaceString('Test_Regex', true);
		assert.strictEqual(actual, 'New_Regex');

		testObject = new ReplacePattern('new-rege$1', true, /Test-Rege(\w*)/);
		actual = testObject.getReplaceString('Test-Regex', true);
		assert.strictEqual(actual, 'New-Regex');
	});
});
