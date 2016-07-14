/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ReplacePattern } from 'vs/platform/search/common/replace';

suite('Replace Pattern test', () => {

	test('parse replace string', () => {
		let testParse = (input:string, expected:string, expectedHasParameters:boolean) => {
			let actual = new ReplacePattern(input, {pattern: 'somepattern', isRegExp: true});
			assert.equal(expected, actual.pattern);
			assert.equal(expectedHasParameters, actual.hasParameters);

			actual= new ReplacePattern('hello' + input + 'hi', {pattern: 'sonepattern', isRegExp: true});
			assert.equal('hello' + expected + 'hi', actual.pattern);
			assert.equal(expectedHasParameters, actual.hasParameters);
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
	});

	test('get replace string for a matched string', () => {
		let testObject= new ReplacePattern('hello', {pattern: 'bla', isRegExp: true});
		let actual= testObject.getReplaceString('bla');
		assert.equal('hello', actual);

		testObject= new ReplacePattern('hello', {pattern: 'bla', isRegExp: false});
		actual= testObject.getReplaceString('bla');
		assert.equal('hello', actual);

		testObject= new ReplacePattern('hello', {pattern: '(bla)', isRegExp: true});
		actual= testObject.getReplaceString('bla');
		assert.equal('hello', actual);

		testObject= new ReplacePattern('hello$0', {pattern: '(bla)', isRegExp: true});
		actual= testObject.getReplaceString('bla');
		assert.equal('hellobla', actual);

		testObject= new ReplacePattern('import * as $1 from \'$2\';', {pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w\.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true});
		actual= testObject.getReplaceString('let fs = require(\'fs\')');
		assert.equal('import * as fs from \'fs\';', actual);

		actual= testObject.getReplaceString('let something = require(\'fs\')');
		assert.equal('import * as something from \'fs\';', actual);

		actual= testObject.getReplaceString('let require(\'fs\')');
		assert.equal('let require(\'fs\')', actual);

		testObject= new ReplacePattern('import * as $1 from \'$1\';', {pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w\.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true});
		actual= testObject.getReplaceString('let something = require(\'fs\')');
		assert.equal('import * as something from \'something\';', actual);

		testObject= new ReplacePattern('import * as $2 from \'$1\';', {pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w\.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true});
		actual= testObject.getReplaceString('let something = require(\'fs\')');
		assert.equal('import * as fs from \'something\';', actual);

		testObject= new ReplacePattern('import * as $0 from \'$0\';', {pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w\.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: true});
		actual= testObject.getReplaceString('let something = require(\'fs\');');
		assert.equal('import * as let something = require(\'fs\') from \'let something = require(\'fs\')\';;', actual);

		testObject= new ReplacePattern('import * as $1 from \'$2\';', {pattern: 'let\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*[\'\"]([\\w\.\\-/]+)\\s*[\'\"]\\s*\\)\\s*', isRegExp: false});
		actual= testObject.getReplaceString('let fs = require(\'fs\');');
		assert.equal('import * as $1 from \'$2\';', actual);

		testObject= new ReplacePattern('cat$1', {pattern: 'for(.*)', isRegExp: true});
		actual= testObject.getReplaceString('for ()');
		assert.equal('cat ()', actual);

		// Not maching cases
		testObject= new ReplacePattern('hello', {pattern: 'bla', isRegExp: true});
		actual= testObject.getReplaceString('foo');
		assert.equal('hello', actual);

		testObject= new ReplacePattern('hello', {pattern: 'bla', isRegExp: false});
		actual= testObject.getReplaceString('foo');
		assert.equal('hello', actual);
	});
});