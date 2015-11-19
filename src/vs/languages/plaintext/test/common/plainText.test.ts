/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/plaintext/common/plaintext.contribution';
import EditorCommon = require('vs/editor/common/editorCommon');
import plainText = require('vs/languages/plaintext/common/plaintext');
import modesUtil = require('vs/editor/test/common/modesUtil');
import Modes = require('vs/editor/common/modes');

suite('Syntax Highlighting - Plain Text', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	setup((done) => {
		modesUtil.load('plaintext').then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			done();
		});
	});

	test('', () => {
		modesUtil.executeTests(tokenizationSupport, [
			// One line text file
			[{
			line: 'a simple text file',
			tokens: [
				{ startIndex: 0, type: ''}
			]}],

			// Multiple line text file
			[{
			line: 'text file line #1',
			tokens: [
				{ startIndex: 0, type: ''}
			]}, {
			line: 'text file line #2',
			tokens: [
				{ startIndex: 0, type: ''}
			]}, {
			line: 'text file line #3',
			tokens: [
				{ startIndex: 0, type: ''}
			]}, {
			line: 'text file line #4',
			tokens: [
				{ startIndex: 0, type: ''}
			]}]
		]);
	});
});
