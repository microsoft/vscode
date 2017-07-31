/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { _rewriteBogousVariables } from 'vs/workbench/parts/snippets/electron-browser/TMSnippets';

suite('TMSnippets', function () {

	function assertRewrite(input: string, expected: string): void {
		let snippet = { codeSnippet: input, description: undefined, extensionName: undefined, name: undefined, prefix: undefined };
		_rewriteBogousVariables(snippet);
		assert.equal(snippet.codeSnippet, expected);
	}

	test('bogous variable rewrite', function () {

		assertRewrite('foo', 'foo');
		assertRewrite('hello $1 world$0', 'hello $1 world$0');

		assertRewrite('$foo and $foo', '${1:foo} and ${1:foo}');
		assertRewrite('$1 and $SELECTION and $foo', '$1 and ${SELECTION} and ${2:foo}');


		assertRewrite(
			[
				'for (var ${index} = 0; ${index} < ${array}.length; ${index}++) {',
				'\tvar ${element} = ${array}[${index}];',
				'\t$0',
				'}'
			].join('\n'),
			[
				'for (var ${1:index} = 0; ${1:index} < ${2:array}.length; ${1:index}++) {',
				'\tvar ${3:element} = ${2:array}[${1:index}];',
				'\t$0',
				'\\}'
			].join('\n')
		);
	});

	test('Snippet choices: unable to escape comma and pipe, #31521', function () {
		assertRewrite('console.log(${1|not\\, not, five, 5, 1   23|});', 'console.log(${1|not\\, not, five, 5, 1   23|});');
	});
});
