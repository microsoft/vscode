/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/markdown/common/markdown.contribution';
import modesUtil = require('vs/editor/test/common/modesUtil');
import markdownMode = require('vs/languages/markdown/common/markdown');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {htmlTokenTypes} from 'vs/languages/html/common/html';

suite('Markdown - tokenization', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	setup((done) => {
		modesUtil.load('markdown', ['html']).then(mode => {
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
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md'), bracket: Modes.Bracket.Open },
				{ startIndex:3, type: '' },
				{ startIndex:6, type: htmlTokenTypes.getTag('b.md'), bracket: Modes.Bracket.Close },
				{ startIndex:10, type: 'emphasis.md' }
			]}],

			[{
			line: '</b>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('b.md'), bracket: Modes.Bracket.Close },
				{ startIndex:4, type: 'emphasis.md' }
			]}],

			[{
			line: '<script>alert("foo")</script>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('script.md'), bracket: Modes.Bracket.Open },
				{ startIndex:8, type: 'identifier.js' },
				{ startIndex:13, type: 'delimiter.parenthesis.js', bracket: Modes.Bracket.Open },
				{ startIndex:14, type: 'string.js' },
				{ startIndex:19, type: 'delimiter.parenthesis.js', bracket: Modes.Bracket.Close },
				{ startIndex:20, type: htmlTokenTypes.getTag('script.md'), bracket: Modes.Bracket.Close },
				{ startIndex:29, type: 'emphasis.md' }
			]}],

			[{
			line: '<style>div { background: red }</style>*bar*',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.getTag('style.md'), bracket: Modes.Bracket.Open },
				{ startIndex:7, type: 'entity.name.tag.css' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'punctuation.bracket.css', bracket: Modes.Bracket.Open },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'support.type.property-name.css' },
				{ startIndex:23, type: 'punctuation.css' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: 'meta.property-value.css' },
				{ startIndex:28, type: '' },
				{ startIndex:29, type: 'punctuation.bracket.css', bracket: Modes.Bracket.Close },
				{ startIndex:30, type: htmlTokenTypes.getTag('style.md'), bracket: Modes.Bracket.Close },
				{ startIndex:38, type: 'emphasis.md' }
			]}]
		]);
	});
});
