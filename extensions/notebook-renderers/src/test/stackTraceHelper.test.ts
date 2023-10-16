/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatStackTrace } from '../stackTraceHelper';
import * as assert from 'assert';

suite('StackTraceHelper', () => {

	test('Non Ipython stack trace is left alone', () => {
		const stack = 'DivideError: integer division error\n' +
			'Stacktrace:\n' +
			'[1] divide_by_zero(x:: Int64)\n' +
			'@Main c:\\src\\test\\3\\otherlanguages\\julia.ipynb: 3\n' +
			'[2] top - level scope\n' +
			'@c:\\src\\test\\3\\otherlanguages\\julia.ipynb: 1; ';
		assert.equal(formatStackTrace(stack), stack);
	});

	test('IPython stack line numbers are linkified', () => {
		const stack =
			'---------------------------------------------------------------------------\n' +
			'Exception                                 Traceback(most recent call last)\n' +
			'Cell In[3], line 2\n' +
			'      1 import myLib\n' +
			'----> 2 myLib.throwEx()\n' +
			'\n' +
			'File C:\\venvs\\myLib.py:2, in throwEx()\n' +
			'      1 def throwEx():\n' +
			'----> 2     raise Exception\n';

		const formatted = formatStackTrace(stack);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3\'>Cell In[3]</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3:2\'>2</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'C:\\venvs\\myLib.py:2\'>2</a>') > 0, formatted);
	});

	test('IPython stack trace lines without associated location are not linkified', () => {
		const stack =
			'---------------------------------------------------------------------------\n' +
			'Exception                                 Traceback(most recent call last)\n' +
			'File C:\\venvs\\myLib.py:2, in throwEx()\n' +
			'\n' +
			'unkown reference' +
			'      1 import myLib\n' + // trace lines without an associated file
			'----> 2 myLib.throwEx()\n';

		const formatted = formatStackTrace(stack);
		assert.ok(formatted.indexOf('<a') === -1, formatted);
	});

});
