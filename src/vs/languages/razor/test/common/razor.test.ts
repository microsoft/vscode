/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/razor/common/razor.contribution';
import modesUtil = require('vs/editor/test/common/modesUtil');
import Modes = require('vs/editor/common/modes');
import razorTokenTypes = require('vs/languages/razor/common/razorTokenTypes');
import {htmlTokenTypes} from 'vs/languages/html/common/html';

suite('Syntax Highlighting - Razor', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	setup((done) => {
		modesUtil.load('razor').then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			done();
		});
	});

	test('', () => {
		modesUtil.executeTests(tokenizationSupport,[
			// Embedding - embedded html
			[{
			line: '@{ var x; <b>x</b> }',
			tokens: [
				{ startIndex: 0, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 2, type: '' },
				{ startIndex: 3, type: 'keyword.cs' },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'ident.cs' },
				{ startIndex: 8, type: 'punctuation.cs' },
				{ startIndex: 9, type: '' },
				{ startIndex: 10, type: htmlTokenTypes.DELIM_START },
				{ startIndex: 11, type: htmlTokenTypes.getTag('b') },
				{ startIndex: 12, type: htmlTokenTypes.DELIM_START },
				{ startIndex: 13, type: 'ident.cs' },
				{ startIndex: 14, type: htmlTokenTypes.DELIM_END },
				{ startIndex: 16, type: htmlTokenTypes.getTag('b') },
				{ startIndex: 17, type: htmlTokenTypes.DELIM_END },
				{ startIndex: 18, type: '' },
				{ startIndex: 19, type: razorTokenTypes.EMBED_CS }
			]}],

			// Comments - razor comment inside csharp
			[{
			line: '@{ var x; @* comment *@ x= 0; }',
			tokens: [
				{ startIndex: 0, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 2, type: '' },
				{ startIndex: 3, type: 'keyword.cs' },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'ident.cs' },
				{ startIndex: 8, type: 'punctuation.cs' },
				{ startIndex: 9, type: '' },
				{ startIndex: 10, type: 'comment.cs' },
				{ startIndex: 23, type: '' },
				{ startIndex: 24, type: 'ident.cs' },
				{ startIndex: 25, type: 'punctuation.cs' },
				{ startIndex: 26, type: '' },
				{ startIndex: 27, type: 'number.cs' },
				{ startIndex: 28, type: 'punctuation.cs' },
				{ startIndex: 29, type: '' },
				{ startIndex: 30, type: razorTokenTypes.EMBED_CS }
			]}],

			// Blocks - simple
			[{
			line: '@{ var total = 0; }',
			tokens: [
				{ startIndex: 0, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 2, type: '' },
				{ startIndex: 3, type: 'keyword.cs' },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'ident.cs' },
				{ startIndex: 12, type: '' },
				{ startIndex: 13, type: 'punctuation.cs' },
				{ startIndex: 14, type: '' },
				{ startIndex: 15, type: 'number.cs' },
				{ startIndex: 16, type: 'punctuation.cs' },
				{ startIndex: 17, type: '' },
				{ startIndex: 18, type: razorTokenTypes.EMBED_CS }
			]}],

			[{
			line: '@if(true){ var total = 0; }',
			tokens: [
				{ startIndex: 0, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 1, type: 'keyword.cs' },
				{ startIndex: 3, type: 'punctuation.parenthesis.cs' },
				{ startIndex: 4, type: 'keyword.cs' },
				{ startIndex: 8, type: 'punctuation.parenthesis.cs' },
				{ startIndex: 9, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 10, type: '' },
				{ startIndex: 11, type: 'keyword.cs' },
				{ startIndex: 14, type: '' },
				{ startIndex: 15, type: 'ident.cs' },
				{ startIndex: 20, type: '' },
				{ startIndex: 21, type: 'punctuation.cs' },
				{ startIndex: 22, type: '' },
				{ startIndex: 23, type: 'number.cs' },
				{ startIndex: 24, type: 'punctuation.cs' },
				{ startIndex: 25, type: '' },
				{ startIndex: 26, type: razorTokenTypes.EMBED_CS }
			]}],

			// Expressions - csharp expressions in html
			[{
			line: 'test@xyz<br>',
			tokens: [
				{ startIndex:0, type: '' },
				{ startIndex:4, type: razorTokenTypes.EMBED_CS },
				{ startIndex:5, type: 'ident.cs' },
				{ startIndex:8, type: htmlTokenTypes.DELIM_START },
				{ startIndex:9, type: htmlTokenTypes.getTag('br') },
				{ startIndex:11, type: htmlTokenTypes.DELIM_START }
			]}],

			[{
			line: 'test@xyz',
			tokens: [
				{ startIndex:0, type: '' },
				{ startIndex:4, type: razorTokenTypes.EMBED_CS },
				{ startIndex:5, type: 'ident.cs' }
			]}],

			[{
			line: 'test @ xyz',
			tokens: [
				{ startIndex: 0, type: '' },
				{ startIndex: 5, type: razorTokenTypes.EMBED_CS },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'ident.cs' }
			]}],

			[{
			line: 'test @(foo) xyz',
			tokens: [
				{ startIndex:0, type: '' },
				{ startIndex:5, type: razorTokenTypes.EMBED_CS },
				{ startIndex:7, type: 'ident.cs' },
				{ startIndex:10, type: razorTokenTypes.EMBED_CS },
				{ startIndex:11, type: '' }
			]}],

			[{
			line: 'test @(foo(\")\")) xyz',
			tokens: [
				{ startIndex:0, type: '' },
				{ startIndex:5, type: razorTokenTypes.EMBED_CS },
				{ startIndex:7, type: 'ident.cs' },
				{ startIndex:10, type: 'punctuation.parenthesis.cs' },
				{ startIndex:11, type: 'string.cs' },
				{ startIndex:14, type: 'punctuation.parenthesis.cs' },
				{ startIndex:15, type: razorTokenTypes.EMBED_CS },
				{ startIndex:16, type: '' }
			]}],

			// Escaping - escaped at character
			[{
			line: 'test@@xyz',
			tokens: [
				{ startIndex:0, type: '' }
			]}]
		]);
	});
});
