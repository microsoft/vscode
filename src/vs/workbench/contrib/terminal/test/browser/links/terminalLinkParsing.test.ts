/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { getLinkSuffix, removeLinkSuffix } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkParsing';

interface ITestLink {
	link: string;
	suffix: string | undefined;
	hasRow: boolean;
	hasCol: boolean;
}

const testRow = 339;
const testCol = 12;
const testLinks: ITestLink[] = [
	// Simple
	{ link: 'foo', suffix: undefined, hasRow: false, hasCol: false },
	{ link: 'foo:339', suffix: ':339', hasRow: true, hasCol: false },
	{ link: 'foo:339:12', suffix: ':339:12', hasRow: true, hasCol: true },
	{ link: 'foo 339', suffix: ' 339', hasRow: true, hasCol: false },
	{ link: 'foo 339:12', suffix: ' 339:12', hasRow: true, hasCol: true },

	// Double quotes
	{ link: '"foo",339', suffix: '",339', hasRow: true, hasCol: false },
	{ link: '"foo",339:12', suffix: '",339:12', hasRow: true, hasCol: true },
	{ link: '"foo", line 339', suffix: '", line 339', hasRow: true, hasCol: false },
	{ link: '"foo", line 339, col 12', suffix: '", line 339, col 12', hasRow: true, hasCol: true },
	{ link: '"foo", line 339, column 12', suffix: '", line 339, column 12', hasRow: true, hasCol: true },
	{ link: '"foo":line 339', suffix: '":line 339', hasRow: true, hasCol: false },
	{ link: '"foo":line 339, col 12', suffix: '":line 339, col 12', hasRow: true, hasCol: true },
	{ link: '"foo":line 339, column 12', suffix: '":line 339, column 12', hasRow: true, hasCol: true },
	{ link: '"foo": line 339', suffix: '": line 339', hasRow: true, hasCol: false },
	{ link: '"foo": line 339, col 12', suffix: '": line 339, col 12', hasRow: true, hasCol: true },
	{ link: '"foo": line 339, column 12', suffix: '": line 339, column 12', hasRow: true, hasCol: true },
	{ link: '"foo" on line 339', suffix: '" on line 339', hasRow: true, hasCol: false },
	{ link: '"foo" on line 339, col 12', suffix: '" on line 339, col 12', hasRow: true, hasCol: true },
	{ link: '"foo" on line 339, column 12', suffix: '" on line 339, column 12', hasRow: true, hasCol: true },

	// Single quotes
	{ link: '\'foo\',339', suffix: '\',339', hasRow: true, hasCol: false },
	{ link: '\'foo\',339:12', suffix: '\',339:12', hasRow: true, hasCol: true },
	{ link: '\'foo\', line 339', suffix: '\', line 339', hasRow: true, hasCol: false },
	{ link: '\'foo\', line 339, col 12', suffix: '\', line 339, col 12', hasRow: true, hasCol: true },
	{ link: '\'foo\', line 339, column 12', suffix: '\', line 339, column 12', hasRow: true, hasCol: true },
	{ link: '\'foo\':line 339', suffix: '\':line 339', hasRow: true, hasCol: false },
	{ link: '\'foo\':line 339, col 12', suffix: '\':line 339, col 12', hasRow: true, hasCol: true },
	{ link: '\'foo\':line 339, column 12', suffix: '\':line 339, column 12', hasRow: true, hasCol: true },
	{ link: '\'foo\': line 339', suffix: '\': line 339', hasRow: true, hasCol: false },
	{ link: '\'foo\': line 339, col 12', suffix: '\': line 339, col 12', hasRow: true, hasCol: true },
	{ link: '\'foo\': line 339, column 12', suffix: '\': line 339, column 12', hasRow: true, hasCol: true },
	{ link: '\'foo\' on line 339', suffix: '\' on line 339', hasRow: true, hasCol: false },
	{ link: '\'foo\' on line 339, col 12', suffix: '\' on line 339, col 12', hasRow: true, hasCol: true },
	{ link: '\'foo\' on line 339, column 12', suffix: '\' on line 339, column 12', hasRow: true, hasCol: true },

	// Parentheses
	{ link: 'foo(339)', suffix: '(339)', hasRow: true, hasCol: false },
	{ link: 'foo(339,12)', suffix: '(339,12)', hasRow: true, hasCol: true },
	{ link: 'foo(339, 12)', suffix: '(339, 12)', hasRow: true, hasCol: true },
	{ link: 'foo (339)', suffix: ' (339)', hasRow: true, hasCol: false },
	{ link: 'foo (339,12)', suffix: ' (339,12)', hasRow: true, hasCol: true },
	{ link: 'foo (339, 12)', suffix: ' (339, 12)', hasRow: true, hasCol: true },

	// Square brackets
	{ link: 'foo[339]', suffix: '[339]', hasRow: true, hasCol: false },
	{ link: 'foo[339,12]', suffix: '[339,12]', hasRow: true, hasCol: true },
	{ link: 'foo[339, 12]', suffix: '[339, 12]', hasRow: true, hasCol: true },
	{ link: 'foo [339]', suffix: ' [339]', hasRow: true, hasCol: false },
	{ link: 'foo [339,12]', suffix: ' [339,12]', hasRow: true, hasCol: true },
	{ link: 'foo [339, 12]', suffix: ' [339, 12]', hasRow: true, hasCol: true },

	// Non-breaking space
	{ link: 'foo\u00A0339:12', suffix: '\u00A0339:12', hasRow: true, hasCol: true },
	{ link: '"foo" on line 339,\u00A0column 12', suffix: '" on line 339,\u00A0column 12', hasRow: true, hasCol: true },
	{ link: '\'foo\' on line\u00A0339, column 12', suffix: '\' on line\u00A0339, column 12', hasRow: true, hasCol: true },
	{ link: 'foo (339,\u00A012)', suffix: ' (339,\u00A012)', hasRow: true, hasCol: true },
	{ link: 'foo\u00A0[339, 12]', suffix: '\u00A0[339, 12]', hasRow: true, hasCol: true },

];

suite('TerminalLinkParsing', () => {
	suite('removeLinkSuffix', () => {
		for (const testLink of testLinks) {
			test('`' + testLink.link + '`', () => {
				deepStrictEqual(
					removeLinkSuffix(testLink.link),
					testLink.suffix === undefined ? testLink.link : testLink.link.replace(testLink.suffix, '')
				);
			});
		}
	});
	suite('getLinkSuffix', () => {
		for (const testLink of testLinks) {
			test('`' + testLink.link + '`', () => {
				deepStrictEqual(
					getLinkSuffix(testLink.link),
					testLink.suffix === undefined ? null : {
						row: testLink.hasRow ? testRow : undefined,
						col: testLink.hasCol ? testCol : undefined,
						suffix: {
							index: testLink.link.length - testLink.suffix.length,
							text: testLink.suffix
						}
					} as ReturnType<typeof getLinkSuffix>
				);
			});
		}
	});
});
