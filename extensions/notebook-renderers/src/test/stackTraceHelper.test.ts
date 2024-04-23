/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatStackTrace } from '../stackTraceHelper';
import * as assert from 'assert';

// The stack frames for these tests can be retreived by using the raw json for a notebook with an error
suite('StackTraceHelper', () => {

	test('Non Ipython stack trace is left alone', () => {
		const stack = 'DivideError: integer division error\n' +
			'Stacktrace:\n' +
			'[1] divide_by_zero(x:: Int64)\n' +
			'@Main c:\\src\\test\\3\\otherlanguages\\julia.ipynb: 3\n' +
			'[2] top - level scope\n' +
			'@c:\\src\\test\\3\\otherlanguages\\julia.ipynb: 1; ';
		assert.equal(formatStackTrace(stack).formattedStack, stack);
	});

	const formatSequence = /\u001b\[.+?m/g;
	function stripAsciiFormatting(text: string) {
		return text.replace(formatSequence, '');
	}

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

		const { formattedStack, errorLocation } = formatStackTrace(stack);
		const cleanStack = stripAsciiFormatting(formattedStack);
		assert.ok(cleanStack.indexOf('Cell In[3], <a href=\'vscode-notebook-cell:?execution_count=3&line=2\'>line 2</a>') > 0, 'Missing line link in ' + cleanStack);
		assert.ok(cleanStack.indexOf('<a href=\'vscode-notebook-cell:?execution_count=3&line=2\'>2</a>') > 0, 'Missing frame link in ' + cleanStack);
		assert.ok(cleanStack.indexOf('<a href=\'C:\\venvs\\myLib.py:2\'>2</a>') > 0, 'Missing frame link in ' + cleanStack);
		assert.equal(errorLocation, '<a href=\'vscode-notebook-cell:?execution_count=3&line=2\'>line 2</a>');
	});

	test('IPython stack line numbers are linkified for IPython 8.3', () => {
		// stack frames within functions do not list the line number, i.e.
		// 'Input In [1], in myfunc()' vs
		// 'Input In [2], in <cell line: 5>()'
		const stack =
			'\u001b[1;31m---------------------------------------------------------------------------\u001b[0m\n' +
			'\u001b[1;31mException\u001b[0m                                 Traceback (most recent call last)\n' +
			'Input \u001b[1;32mIn [2]\u001b[0m, in \u001b[0;36m<cell line: 5>\u001b[1;34m()\u001b[0m\n' +
			'\u001b[0;32m      3\u001b[0m \u001b[38;5;28mprint\u001b[39m(\u001b[38;5;124m\'\u001b[39m\u001b[38;5;124mipykernel\u001b[39m\u001b[38;5;124m\'\u001b[39m, ipykernel\u001b[38;5;241m.\u001b[39m__version__)\n' +
			'\u001b[0;32m      4\u001b[0m \u001b[38;5;28mprint\u001b[39m(\u001b[38;5;124m\'\u001b[39m\u001b[38;5;124mipython\u001b[39m\u001b[38;5;124m\'\u001b[39m, IPython\u001b[38;5;241m.\u001b[39m__version__)\n' +
			'\u001b[1;32m----> 5\u001b[0m \u001b[43mmyfunc\u001b[49m\u001b[43m(\u001b[49m\u001b[43m)\u001b[49m\n' +
			'\n\n' +
			'Input \u001b[1;32mIn [1]\u001b[0m, in \u001b[0;36mmyfunc\u001b[1;34m()\u001b[0m\n' +
			'\u001b[0;32m      3\u001b[0m \u001b[38;5;28;01mdef\u001b[39;00m \u001b[38;5;21mmyfunc\u001b[39m():\n' +
			'\u001b[1;32m----> 4\u001b[0m     \u001b[43mmyLib\u001b[49m\u001b[38;5;241;43m.\u001b[39;49m\u001b[43mthrowEx\u001b[49m\u001b[43m(\u001b[49m\u001b[43m)\u001b[49m\n' +
			'\n\n' +
			'File \u001b[1;32mC:\\venvs\\myLib.py:2\u001b[0m, in \u001b[0;36mthrowEx\u001b[1;34m()\u001b[0m\n' +
			'\u001b[0;32m      1\u001b[0m \u001b[38;5;28;01mdef\u001b[39;00m \u001b[38;5;21mthrowEx\u001b[39m():\n' +
			'\u001b[1;32m----> 2\u001b[0m     \u001b[38;5;28;01mraise\u001b[39;00m \u001b[38;5;167;01mException\u001b[39;00m\n' +
			'\n' +
			'\u001b[1;31mException\u001b[0m:\n';

		const { formattedStack } = formatStackTrace(stack);
		const formatted = stripAsciiFormatting(formattedStack);
		assert.ok(formatted.indexOf('Input <a href=\'vscode-notebook-cell:?execution_count=2\'>In [2]</a>, in <cell line: 5>') > 0, 'Missing cell link in ' + formatted);
		assert.ok(formatted.indexOf('Input <a href=\'vscode-notebook-cell:?execution_count=1\'>In [1]</a>, in myfunc()') > 0, 'Missing cell link in ' + formatted);
		assert.ok(formatted.indexOf('<a href=\'vscode-notebook-cell:?execution_count=2&line=5\'>5</a>') > 0, 'Missing frame link in ' + formatted);
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

		const formatted = formatStackTrace(stack).formattedStack;
		assert.ok(!/<a href=.*>\d<\/a>/.test(formatted), formatted);
	});

	test('IPython stack without line numbers are not linkified', () => {
		const stack =
			'\u001b[1;36m  Cell \u001b[1;32mIn[6], line 1\u001b[1;36m\u001b[0m\n' +
			'\u001b[1;33m    print(\u001b[0m\n' +
			'\u001b[1;37m          ^\u001b[0m\n' +
			'\u001b[1;31mSyntaxError\u001b[0m\u001b[1;31m:\u001b[0m incomplete input\n' +
			// contrived examples to check for more false positives
			'1  print(\n' +
			'a 1  print(\n' +
			'   1a  print(\n';

		const formattedLines = formatStackTrace(stack).formattedStack.split('\n');
		assert.ok(/<a href='vscode-notebook-cell.*>/.test(formattedLines[0]), 'line should contain a link: ' + formattedLines[0]);
		formattedLines.slice(1).forEach(line => assert.ok(!/<a href=.*>/.test(line), 'line should not contain a link: ' + line));
	});

});
