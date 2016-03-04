/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/markdown/common/markdown.contribution';
import 'vs/languages/javascript/common/javascript.contribution';
import 'vs/languages/html/common/html.contribution';
import 'vs/languages/css/common/css.contribution';
import modesUtil = require('vs/editor/test/common/modesUtil');
import Modes = require('vs/editor/common/modes');
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import {cssTokenTypes} from 'vs/languages/css/common/css';

suite('Markdown - tokenization', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	setup((done) => {
		modesUtil.load('markdown', ['html', 'javascript', 'css']).then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			done();
		});
	});

	test('', () => {
		modesUtil.executeTests(tokenizationSupport, [
			// HTML and embedded content - bug 16912
			[{
			line: '<b>foo</b>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:3, type: '' },
				{ startIndex:6, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:10, type: 'emphasis.md' }
			]}],

			[{
			line: '</b>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md') },
				{ startIndex:4, type: 'emphasis.md' }
			]}],

			[{
			line: '<script>alert("foo")</script>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('script.md') },
				{ startIndex:8, type: 'identifier.js' },
				{ startIndex:13, type: 'delimiter.parenthesis.js' },
				{ startIndex:14, type: 'string.js' },
				{ startIndex:19, type: 'delimiter.parenthesis.js' },
				{ startIndex:20, type: htmlTokenTypes.getTag('script.md') },
				{ startIndex:29, type: 'emphasis.md' }
			]}],

			[{
			line: '<style>div { background: red }</style>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('style.md') },
				{ startIndex:7, type: cssTokenTypes.TOKEN_SELECTOR_TAG + '.css' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'punctuation.bracket.css' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: cssTokenTypes.TOKEN_PROPERTY + '.css' },
				{ startIndex:23, type: 'punctuation.css' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: cssTokenTypes.TOKEN_VALUE + '.css' },
				{ startIndex:28, type: '' },
				{ startIndex:29, type: 'punctuation.bracket.css' },
				{ startIndex:30, type: htmlTokenTypes.getTag('style.md') },
				{ startIndex:38, type: 'emphasis.md' }
			]}]
		]);
	});
});
