/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'mocha';
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver';
import { getFoldingRegions } from '../folding';

interface ExpectedIndentRange {
	startLine: number;
	endLine: number;
	type?: string;
}

function assertRanges(lines: string[], expected: ExpectedIndentRange[]): void {
	let document = TextDocument.create('test://foo/bar.json', 'json', 1, lines.join('\n'));
	let actual = getFoldingRegions(document).ranges;


	let actualRanges = [];
	for (let i = 0; i < actual.length; i++) {
		actualRanges[i] = r(actual[i].startLine, actual[i].endLine, actual[i].type);
	}
	actualRanges = actualRanges.sort((r1, r2) => r1.startLine - r2.startLine);
	assert.deepEqual(actualRanges, expected);
}

function r(startLine: number, endLine: number, type?: string): ExpectedIndentRange {
	return { startLine, endLine, type };
}

suite('Object Folding', () => {
	test('Fold one level', () => {
		let range = [
			/*0*/'{',
			/*1*/'"foo":"bar"',
			/*2*/'}'
		];
		assertRanges(range, [r(0, 1, 'object')]);
	});

	test('Fold two level', () => {
		let range = [
			/*0*/'[',
			/*1*/'{',
			/*2*/'"foo":"bar"',
			/*3*/'}',
			/*4*/']'
		];
		assertRanges(range, [r(0, 3, 'array'), r(1, 2, 'object')]);
	});

	test('Fold Arrays', () => {
		let range = [
			/*0*/'[',
			/*1*/'[',
			/*2*/'],[',
			/*3*/'1',
			/*4*/']',
			/*5*/']'
		];
		assertRanges(range, [r(0, 4, 'array'), r(2, 3, 'array')]);
	});

	test('Filter start on same line', () => {
		let range = [
			/*0*/'[[',
			/*1*/'[',
			/*2*/'],[',
			/*3*/'1',
			/*4*/']',
			/*5*/']]'
		];
		assertRanges(range, [r(0, 4, 'array'), r(2, 3, 'array')]);
	});

	test('Fold commment', () => {
		let range = [
			/*0*/'/*',
			/*1*/' multi line',
			/*2*/'*/',
		];
		assertRanges(range, [r(0, 2, 'comment')]);
	});

	test('Incomplete commment', () => {
		let range = [
			/*0*/'/*',
			/*1*/'{',
			/*2*/'"foo":"bar"',
			/*3*/'}',
		];
		assertRanges(range, [r(1, 2, 'object')]);
	});

	test('Fold regions', () => {
		let range = [
			/*0*/'// #region',
			/*1*/'{',
			/*2*/'}',
			/*3*/'// #endregion',
		];
		assertRanges(range, [r(0, 3, 'region')]);
	});

});
