/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { chunkUpIdentByConvention, enforceNamingConvention, guessNamingConvention, NamingConvention } from '../../common/namingConvention';

suite('guessNamingConvention', () => {
	const testCases = [
		{ input: 'camelCaseExample', expected: NamingConvention.CamelCase },
		{ input: 'PascalCaseExample', expected: NamingConvention.PascalCase },
		{ input: 'snake_case_example', expected: NamingConvention.SnakeCase },
		{ input: 'SCREAMING_SNAKE_CASE_EXAMPLE', expected: NamingConvention.ScreamingSnakeCase },
		{ input: 'Capital_snake_case', expected: NamingConvention.CapitalSnakeCase },
		{ input: 'kebab-case-example', expected: NamingConvention.KebabCase },
		{ input: 'Uppercase', expected: NamingConvention.Capitalized },
		{ input: 'lowercase', expected: NamingConvention.LowerCase },
		{ input: 'Unknown_Example', expected: NamingConvention.Unknown },
	];

	testCases.forEach(({ input, expected }) => {
		test(`should return ${expected} for input "${input}"`, () => {
			expect(guessNamingConvention(input)).toBe(expected);
		});
	});

	// Additional tests for edge cases
	const edgeCases = [
		{ input: 'foo', expected: NamingConvention.LowerCase },
		{ input: 'FOO', expected: NamingConvention.Uppercase },
		{ input: 'Foo', expected: NamingConvention.Capitalized },
		{ input: 'foo_bar', expected: NamingConvention.SnakeCase },
		{ input: 'foo-bar', expected: NamingConvention.KebabCase },
		{ input: 'FOO_BAR', expected: NamingConvention.ScreamingSnakeCase },
		{ input: 'Foo_Bar', expected: NamingConvention.Unknown },
		{ input: '', expected: NamingConvention.Unknown },
		{ input: '123', expected: NamingConvention.Unknown },
		{ input: 'foo123', expected: NamingConvention.LowerCase },
		{ input: 'foo_123', expected: NamingConvention.SnakeCase },
		{ input: 'foo-bar-123', expected: NamingConvention.KebabCase },
	];

	edgeCases.forEach(({ input, expected }) => {
		test(`should return ${expected} for edge case input "${input}"`, () => {
			expect(guessNamingConvention(input)).toBe(expected);
		});
	});
});

suite('chunkByNamingConvention', () => {
	const testCases = [
		{ input: 'camelCaseExample', convention: NamingConvention.CamelCase, expected: ['camel', 'Case', 'Example'] },
		{ input: 'PascalCaseExample', convention: NamingConvention.PascalCase, expected: ['Pascal', 'Case', 'Example'] },
		{ input: 'snake_case_example', convention: NamingConvention.SnakeCase, expected: ['snake', 'case', 'example'] },
		{ input: 'SCREAMING_SNAKE_CASE_EXAMPLE', convention: NamingConvention.ScreamingSnakeCase, expected: ['screaming', 'snake', 'case', 'example'] },
		{ input: 'Capital_snake_case', convention: NamingConvention.CapitalSnakeCase, expected: ['capital', 'snake', 'case'] },
		{ input: 'kebab-case-example', convention: NamingConvention.KebabCase, expected: ['kebab', 'case', 'example'] },
		{ input: 'Uppercase', convention: NamingConvention.Uppercase, expected: ['Uppercase'] },
		{ input: 'lowercase', convention: NamingConvention.LowerCase, expected: ['lowercase'] },
		{ input: 'Unknown_Example', convention: NamingConvention.Unknown, expected: ['Unknown_Example'] },
	];

	testCases.forEach(({ input, convention, expected }) => {
		test(`should return ${expected} for input "${input}" with convention "${convention}"`, () => {
			expect(chunkUpIdentByConvention(input, convention)).toEqual(expected);
		});
	});
});

suite('enforceNamingConvention', () => {
	const testCases = [
		{ givenIdent: 'snake_case_example', targetConvention: NamingConvention.CamelCase, expected: 'snakeCaseExample' },
		{ givenIdent: 'camelCaseExample', targetConvention: NamingConvention.SnakeCase, expected: 'camel_case_example' },
		{ givenIdent: 'PascalCaseExample', targetConvention: NamingConvention.SnakeCase, expected: 'pascal_case_example' },
		{ givenIdent: 'camelCaseExample', targetConvention: NamingConvention.PascalCase, expected: 'CamelCaseExample' },
		{ givenIdent: 'snake_case_example', targetConvention: NamingConvention.ScreamingSnakeCase, expected: 'SNAKE_CASE_EXAMPLE' },
		{ givenIdent: 'SCREAMING_SNAKE_CASE_EXAMPLE', targetConvention: NamingConvention.CapitalSnakeCase, expected: 'Screaming_snake_case_example' },
		{ givenIdent: 'Capital_snake_case', targetConvention: NamingConvention.KebabCase, expected: 'capital-snake-case' },
		{ givenIdent: 'kebab-case-example', targetConvention: NamingConvention.Uppercase, expected: 'KEBAB-CASE-EXAMPLE' },
		{ givenIdent: 'Uppercase', targetConvention: NamingConvention.LowerCase, expected: 'uppercase' },
		{ givenIdent: 'lowercase', targetConvention: NamingConvention.Unknown, expected: 'lowercase' },
		{ givenIdent: 'Unknown_Example', targetConvention: NamingConvention.CamelCase, expected: 'unknown_example' /* TODO@ulugbekna: improve unknown convention handling */ },
	];

	testCases.forEach(({ givenIdent, targetConvention, expected }) => {
		test(`should enforce ${targetConvention} convention for "${givenIdent}"`, () => {
			expect(enforceNamingConvention(givenIdent, targetConvention)).toBe(expected);
		});
	});
});
