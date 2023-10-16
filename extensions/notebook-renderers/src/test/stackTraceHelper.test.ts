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
			'\u001b[1;31m---------------------------------------------------------------------------\u001b[0m\n' +
			'\u001b[1;31mException\u001b[0m                                 Traceback (most recent call last)\n' +
			'Cell \u001b[1;32mIn[3], line 2\u001b[0m\n' +
			'\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mimport\u001b[39;00m \u001b[38;5;21;01mmyLib\u001b[39;00m\n' +
			'\u001b[1;32m----> 2\u001b[0m \u001b[43mmyLib\u001b[49m\u001b[38;5;241;43m.\u001b[39;49m\u001b[43mthrowEx\u001b[49m\u001b[43m(\u001b[49m\u001b[43m)\u001b[49m\n' +
			'\n' +
			'File \u001b[1;32mC:\\venvs\\myLib.py:2\u001b[0m, in \u001b[0;36mthrowEx\u001b[1;34m()\u001b[0m\n' +
			'\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mdef\u001b[39;00m \u001b[38;5;21mthrowEx\u001b[39m():\n' +
			'\u001b[1;32m----> 2\u001b[0m     \u001b[38;5;28;01mraise\u001b[39;00m \u001b[38;5;167;01mException\u001b[39;00m\n\n' +
			'\u001b[1;31mException\u001b[0m\n:';

		const formatted = formatStackTrace(stack);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3\'>Cell In[3]</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3:2\'>2</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'C:\\venvs\\myLib.py:2\'>2</a>') > 0, formatted);
	});

	test('IPython stack line numbers are linkified for IPython 8.3', () => {
		const stack =
			'\u001b[1;31m---------------------------------------------------------------------------\u001b[0m\n' +
			'\u001b[1;31mException\u001b[0m                                 Traceback (most recent call last)\n' +
			'Input \u001b[1;32mIn [2]\u001b[0m, in \u001b[0;36m<cell line: 5>\u001b[1;34m()\u001b[0m\n' +
			'\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mimport\u001b[39;00m \u001b[38;5;21;01mmyLib\u001b[39;00m\n' +
			'\u001b[1;32m----> 2\u001b[0m \u001b[43mmyLib\u001b[49m\u001b[38;5;241;43m.\u001b[39;49m\u001b[43mthrowEx\u001b[49m\u001b[43m(\u001b[49m\u001b[43m)\u001b[49m\n';

		const formatted = formatStackTrace(stack);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3\'>Input [2]</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution=3:2\'>2</a>') > 0, formatted);
		assert.ok(formatted.indexOf('<a href=\'C:\\venvs\\myLib.py:2\'>2</a>') > 0, formatted);
	});

	test('IPython stack trace lines without associated location are not linkified', () => {
		const stack =
			'\u001b[1;31m---------------------------------------------------------------------------\u001b[0m\n' +
			'\u001b[1;31mException\u001b[0m                                 Traceback (most recent call last)\n' +
			'Cell \u001b[1;32mIn[3], line 2\u001b[0m\n' +
			'\n' +
			'unknown source\n' +
			'\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mdef\u001b[39;00m \u001b[38;5;21mthrowEx\u001b[39m():\n' +
			'\u001b[1;32m----> 2\u001b[0m     \u001b[38;5;28;01mraise\u001b[39;00m \u001b[38;5;167;01mException\u001b[39;00m\n\n' +
			'\u001b[1;31mException\u001b[0m\n:';

		const formatted = formatStackTrace(stack);
		assert.ok(!/<a href=.*>\d<\/a>/.test(formatted), formatted);
	});

});
