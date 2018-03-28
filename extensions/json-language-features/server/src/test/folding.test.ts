/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'mocha';
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver';
import { getFoldingRegions } from '../jsonFolding';

interface ExpectedIndentRange {
	startLine: number;
	endLine: number;
	type?: string;
}

function assertRanges(lines: string[], expected: ExpectedIndentRange[], nRanges?: number): void {
	let document = TextDocument.create('test://foo/bar.json', 'json', 1, lines.join('\n'));
	let actual = getFoldingRegions(document, nRanges, null)!.ranges;

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

suite('JSON Folding', () => {
	test('Fold one level', () => {
		let input = [
			/*0*/'{',
			/*1*/'"foo":"bar"',
			/*2*/'}'
		];
		assertRanges(input, [r(0, 1, 'object')]);
	});

	test('Fold two level', () => {
		let input = [
			/*0*/'[',
			/*1*/'{',
			/*2*/'"foo":"bar"',
			/*3*/'}',
			/*4*/']'
		];
		assertRanges(input, [r(0, 3, 'array'), r(1, 2, 'object')]);
	});

	test('Fold Arrays', () => {
		let input = [
			/*0*/'[',
			/*1*/'[',
			/*2*/'],[',
			/*3*/'1',
			/*4*/']',
			/*5*/']'
		];
		assertRanges(input, [r(0, 4, 'array'), r(2, 3, 'array')]);
	});

	test('Filter start on same line', () => {
		let input = [
			/*0*/'[[',
			/*1*/'[',
			/*2*/'],[',
			/*3*/'1',
			/*4*/']',
			/*5*/']]'
		];
		assertRanges(input, [r(0, 4, 'array'), r(2, 3, 'array')]);
	});

	test('Fold commment', () => {
		let input = [
			/*0*/'/*',
			/*1*/' multi line',
			/*2*/'*/',
		];
		assertRanges(input, [r(0, 2, 'comment')]);
	});

	test('Incomplete commment', () => {
		let input = [
			/*0*/'/*',
			/*1*/'{',
			/*2*/'"foo":"bar"',
			/*3*/'}',
		];
		assertRanges(input, [r(1, 2, 'object')]);
	});

	test('Fold regions', () => {
		let input = [
			/*0*/'// #region',
			/*1*/'{',
			/*2*/'}',
			/*3*/'// #endregion',
		];
		assertRanges(input, [r(0, 3, 'region')]);
	});

	test('Test limit', () => {
		let input = [
			/* 0*/'[',
			/* 1*/' [',
			/* 2*/'  [',
			/* 3*/'  ',
			/* 4*/'  ],',
			/* 5*/'  [',
			/* 6*/'   [',
			/* 7*/'  ',
			/* 8*/'   ],',
			/* 9*/'   [',
			/*10*/'  ',
			/*11*/'   ],',
			/*12*/'  ],',
			/*13*/'  [',
			/*14*/'  ',
			/*15*/'  ],',
			/*16*/'  [',
			/*17*/'  ',
			/*18*/'  ]',
			/*19*/' ]',
			/*20*/']',
		];
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array'), r(2, 3, 'array'), r(5, 11, 'array'), r(6, 7, 'array'), r(9, 10, 'array'), r(13, 14, 'array'), r(16, 17, 'array')], void 0);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array'), r(2, 3, 'array'), r(5, 11, 'array'), r(6, 7, 'array'), r(9, 10, 'array'), r(13, 14, 'array'), r(16, 17, 'array')], 8);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array'), r(2, 3, 'array'), r(5, 11, 'array'), r(13, 14, 'array'), r(16, 17, 'array')], 7);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array'), r(2, 3, 'array'), r(5, 11, 'array'), r(13, 14, 'array'), r(16, 17, 'array')], 6);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array')], 5);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array')], 4);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array')], 3);
		assertRanges(input, [r(0, 19, 'array'), r(1, 18, 'array')], 2);
		assertRanges(input, [r(0, 19, 'array')], 1);
	});

});
