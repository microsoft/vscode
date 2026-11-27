/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { isLikelyNaturalLanguage } from '../../vscode-node/inlineCodeSymbolLinkifier';

suite('isLikelyNaturalLanguage', () => {

	test('should detect natural language test names', () => {
		expect(isLikelyNaturalLanguage('should correctly identify default rules vs user-defined rules')).toBe(true);
		expect(isLikelyNaturalLanguage('should handle mixed string and regex patterns')).toBe(true);
		expect(isLikelyNaturalLanguage('should handle command line rules with isDefaultRule')).toBe(true);
		expect(isLikelyNaturalLanguage('should return undefined for noMatch cases')).toBe(true);
		expect(isLikelyNaturalLanguage('should handle PowerShell case-insensitive matching with defaults')).toBe(true);
	});

	test('should not flag code identifiers', () => {
		expect(isLikelyNaturalLanguage('isDefaultRule')).toBe(false);
		expect(isLikelyNaturalLanguage('TextModel')).toBe(false);
		expect(isLikelyNaturalLanguage('getIsDefaultRule')).toBe(false);
		expect(isLikelyNaturalLanguage('strictEqual')).toBe(false);
	});

	test('should not flag short phrases (3 words or fewer)', () => {
		expect(isLikelyNaturalLanguage('new Map')).toBe(false);
		expect(isLikelyNaturalLanguage('export class Foo')).toBe(false);
		expect(isLikelyNaturalLanguage('foo bar baz')).toBe(false);
	});

	test('should not flag multi-word code containing punctuation', () => {
		expect(isLikelyNaturalLanguage('new Map<string, number>()')).toBe(false);
		expect(isLikelyNaturalLanguage('import { a } from bar')).toBe(false);
		expect(isLikelyNaturalLanguage('const a = new Map()')).toBe(false);
		expect(isLikelyNaturalLanguage('a === b ? c : d')).toBe(false);
		expect(isLikelyNaturalLanguage('Array<string | number>')).toBe(false);
		expect(isLikelyNaturalLanguage('foo.bar.baz method call')).toBe(false);
		expect(isLikelyNaturalLanguage('a & b | c ^ d')).toBe(false);
		expect(isLikelyNaturalLanguage('result = a + b / c')).toBe(false);
	});

	test('should handle edge cases', () => {
		expect(isLikelyNaturalLanguage('')).toBe(false);
		expect(isLikelyNaturalLanguage('   ')).toBe(false);
		expect(isLikelyNaturalLanguage('  a  ')).toBe(false);
	});
});
