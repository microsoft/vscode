/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {FindModelBoundToEditorModel, parseReplaceString} from 'vs/editor/contrib/find/common/findModel';

suite('FindModel', () => {

	test('parseFindWidgetString', () => {
		let testParse = (input:string, expected:string) => {
			let actual = parseReplaceString(input);
			assert.equal(actual, expected);

			let actual2 = parseReplaceString('hello' + input + 'hi');
			assert.equal(actual2, 'hello' + expected + 'hi');
		};

		// no backslash => no treatment
		testParse('hello', 'hello');

		// \t => TAB
		testParse('\\thello', '\thello');

		// \n => LF
		testParse('\\nhello', '\nhello');

		// \\t => \t
		testParse('\\\\thello', '\\thello');

		// \\\t => \TAB
		testParse('\\\\\\thello', '\\\thello');

		// \\\\t => \\t
		testParse('\\\\\\\\thello', '\\\\thello');

		// \ at the end => no treatment
		testParse('hello\\', 'hello\\');

		// \ with unknown char => no treatment
		testParse('hello\\x', 'hello\\x');

		// \ with back reference => no treatment
		testParse('hello\\0', 'hello\\0');
	});
});
