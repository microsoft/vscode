/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { expect, suite, test } from 'vitest';
import { validateDocstringFormat } from '../slashDoc.py.stest';

suite('hasCorrectlyFormattedDocstring Tests', function () {

	test('Correctly formatted docstring', function () {
		const fileContents = `
def my_function(param1, param2):
	"""
	This is a docstring for my_function.
	"""
	pass
`;
		const targetLineString = 'def my_function(param1, param2):';
		validateDocstringFormat(fileContents, targetLineString);
	});

	test('error: not indented', function () {
		const fileContents = `
def my_function(param1, param2):
"""
This is a wrongly indented docstring for my_function.
"""
	pass
`;
		const targetLineString = 'def my_function(param1, param2):';
		expect(() => validateDocstringFormat(fileContents, targetLineString)).toThrowErrorMatchingInlineSnapshot(`[Error: Incorrect docstring indentation. Expected: '	', but got: '']`);
	});

	test('error: no docstring', function () {
		const fileContents = `
def my_function(param1, param2):
	pass
`;
		const targetLineString = 'def my_function(param1, param2):';
		expect(() => validateDocstringFormat(fileContents, targetLineString)).toThrowErrorMatchingInlineSnapshot(`[Error: No docstring found after the target line.]`);
	});

	test('Docstring with correct indentation using tabs', function () {
		const fileContents = `
	def my_function(param1, param2):
        """
        This is a docstring for my_function with tabs.
        """
`;
		const targetLineString = 'def my_function(param1, param2):';
		expect(() => validateDocstringFormat(fileContents, targetLineString)).toThrowErrorMatchingInlineSnapshot(`[Error: Incorrect docstring indentation. Expected: '	········', but got: '········']`);
	});

});
