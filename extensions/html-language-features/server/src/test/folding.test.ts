/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver';
import { getFoldingRanges } from '../modes/htmlFolding';
import { getLanguageModes } from '../modes/languageModes';
import { ClientCapabilities } from 'vscode-css-languageservice';

interface ExpectedIndentRange {
	startLine: number;
	endLine: number;
	kind?: string;
}

function assertRanges(lines: string[], expected: ExpectedIndentRange[], message?: string, nRanges?: number): void {
	let document = TextDocument.create('test://foo/bar.json', 'json', 1, lines.join('\n'));
	let workspace = {
		settings: {},
		folders: [{ name: 'foo', uri: 'test://foo' }]
	};
	let languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST);
	let actual = getFoldingRanges(languageModes, document, nRanges, null);

	let actualRanges = [];
	for (let i = 0; i < actual.length; i++) {
		actualRanges[i] = r(actual[i].startLine, actual[i].endLine, actual[i].kind);
	}
	actualRanges = actualRanges.sort((r1, r2) => r1.startLine - r2.startLine);
	assert.deepEqual(actualRanges, expected, message);
}

function r(startLine: number, endLine: number, kind?: string): ExpectedIndentRange {
	return { startLine, endLine, kind };
}

suite('HTML Folding', () => {

	test('Embedded JavaScript', () => {
		let input = [
			/*0*/'<html>',
			/*1*/'<head>',
			/*2*/'<script>',
			/*3*/'function f() {',
			/*4*/'}',
			/*5*/'</script>',
			/*6*/'</head>',
			/*7*/'</html>',
		];
		assertRanges(input, [r(0, 6), r(1, 5), r(2, 4), r(3, 4)]);
	});

	test('Embedded JavaScript - multiple areas', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head>',
			/* 2*/'<script>',
			/* 3*/'  var x = {',
			/* 4*/'    foo: true,',
			/* 5*/'    bar: {}',
			/* 6*/'  };',
			/* 7*/'</script>',
			/* 8*/'<script>',
			/* 9*/'  test(() => { // hello',
			/*10*/'    f();',
			/*11*/'  });',
			/*12*/'</script>',
			/*13*/'</head>',
			/*14*/'</html>',
		];
		assertRanges(input, [r(0, 13), r(1, 12), r(2, 6), r(3, 6), r(8, 11), r(9, 11)]);
	});

	test('Embedded JavaScript - incomplete', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head>',
			/* 2*/'<script>',
			/* 3*/'  var x = {',
			/* 4*/'</script>',
			/* 5*/'<script>',
			/* 6*/'  });',
			/* 7*/'</script>',
			/* 8*/'</head>',
			/* 9*/'</html>',
		];
		assertRanges(input, [r(0, 8), r(1, 7), r(2, 3), r(5, 6)]);
	});

	test('Embedded JavaScript - regions', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head>',
			/* 2*/'<script>',
			/* 3*/'  // #region Lalala',
			/* 4*/'   //  #region',
			/* 5*/'   x = 9;',
			/* 6*/'  //  #endregion',
			/* 7*/'  // #endregion Lalala',
			/* 8*/'</script>',
			/* 9*/'</head>',
			/*10*/'</html>',
		];
		assertRanges(input, [r(0, 9), r(1, 8), r(2, 7), r(3, 7, 'region'), r(4, 6, 'region')]);
	});

	test('Embedded CSS', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head>',
			/* 2*/'<style>',
			/* 3*/'  foo {',
			/* 4*/'   display: block;',
			/* 5*/'   color: black;',
			/* 6*/'  }',
			/* 7*/'</style>',
			/* 8*/'</head>',
			/* 9*/'</html>',
		];
		assertRanges(input, [r(0, 8), r(1, 7), r(2, 6), r(3, 5)]);
	});

	test('Embedded CSS - multiple areas', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head style="color:red">',
			/* 2*/'<style>',
			/* 3*/'  /*',
			/* 4*/'    foo: true,',
			/* 5*/'    bar: {}',
			/* 6*/'  */',
			/* 7*/'</style>',
			/* 8*/'<style>',
			/* 9*/'  @keyframes mymove {',
			/*10*/'    from {top: 0px;}',
			/*11*/'  }',
			/*12*/'</style>',
			/*13*/'</head>',
			/*14*/'</html>',
		];
		assertRanges(input, [r(0, 13), r(1, 12), r(2, 6), r(3, 6, 'comment'), r(8, 11), r(9, 10)]);
	});

	test('Embedded CSS - regions', () => {
		let input = [
			/* 0*/'<html>',
			/* 1*/'<head>',
			/* 2*/'<style>',
			/* 3*/'  /* #region Lalala */',
			/* 4*/'   /*  #region*/',
			/* 5*/'   x = 9;',
			/* 6*/'  /*  #endregion*/',
			/* 7*/'  /* #endregion Lalala*/',
			/* 8*/'</style>',
			/* 9*/'</head>',
			/*10*/'</html>',
		];
		assertRanges(input, [r(0, 9), r(1, 8), r(2, 7), r(3, 7, 'region'), r(4, 6, 'region')]);
	});


	// test('Embedded JavaScript - multi line comment', () => {
	// 	let input = [
	// 		/* 0*/'<html>',
	// 		/* 1*/'<head>',
	// 		/* 2*/'<script>',
	// 		/* 3*/'  /*',
	// 		/* 4*/'   * Hello',
	// 		/* 5*/'   */',
	// 		/* 6*/'</script>',
	// 		/* 7*/'</head>',
	// 		/* 8*/'</html>',
	// 	];
	// 	assertRanges(input, [r(0, 7), r(1, 6), r(2, 5), r(3, 5, 'comment')]);
	// });

	test('Test limit', () => {
		let input = [
			/* 0*/'<div>',
			/* 1*/' <span>',
			/* 2*/'  <b>',
			/* 3*/'  ',
			/* 4*/'  </b>,',
			/* 5*/'  <b>',
			/* 6*/'   <pre>',
			/* 7*/'  ',
			/* 8*/'   </pre>,',
			/* 9*/'   <pre>',
			/*10*/'  ',
			/*11*/'   </pre>,',
			/*12*/'  </b>,',
			/*13*/'  <b>',
			/*14*/'  ',
			/*15*/'  </b>,',
			/*16*/'  <b>',
			/*17*/'  ',
			/*18*/'  </b>',
			/*19*/' </span>',
			/*20*/'</div>',
		];
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(9, 10), r(13, 14), r(16, 17)], 'no limit', undefined);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(9, 10), r(13, 14), r(16, 17)], 'limit 8', 8);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(6, 7), r(13, 14), r(16, 17)], 'limit 7', 7);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(13, 14), r(16, 17)], 'limit 6', 6);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11), r(13, 14)], 'limit 5', 5);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3), r(5, 11)], 'limit 4', 4);
		assertRanges(input, [r(0, 19), r(1, 18), r(2, 3)], 'limit 3', 3);
		assertRanges(input, [r(0, 19), r(1, 18)], 'limit 2', 2);
		assertRanges(input, [r(0, 19)], 'limit 1', 1);
	});

});
