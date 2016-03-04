/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/handlebars/common/handlebars.contribution';
import 'vs/languages/javascript/common/javascript.contribution';
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import handlebarsTokenTypes = require('vs/languages/handlebars/common/handlebarsTokenTypes');


suite('Handlebars', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	setup((done) => {
		modesUtil.load('handlebars', ['javascript']).then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			done();
		});
	});

	test('Just HTML', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<h1>handlebars!</h1>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: '' },
				{ startIndex:15, type: htmlTokenTypes.DELIM_END },
				{ startIndex:17, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:19, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Expressions', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<h1>{{ title }}</h1>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: handlebarsTokenTypes.EMBED },
				{ startIndex:6, type: '' },
				{ startIndex:7, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: handlebarsTokenTypes.EMBED },
				{ startIndex:15, type: htmlTokenTypes.DELIM_END },
				{ startIndex:17, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:19, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Expressions Sans Whitespace', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<h1>{{title}}</h1>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: handlebarsTokenTypes.EMBED },
				{ startIndex:6, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:11, type: handlebarsTokenTypes.EMBED },
				{ startIndex:13, type: htmlTokenTypes.DELIM_END },
				{ startIndex:15, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:17, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Unescaped Expressions', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<h1>{{{ title }}}</h1>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: handlebarsTokenTypes.EMBED_UNESCAPED },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: handlebarsTokenTypes.EMBED_UNESCAPED },
				{ startIndex:17, type: htmlTokenTypes.DELIM_END },
				{ startIndex:19, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:21, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Blocks', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<ul>{{#each items}}<li>{{item}}</li>{{/each}}</ul>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('ul') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: handlebarsTokenTypes.EMBED },
				{ startIndex:6, type: handlebarsTokenTypes.KEYWORD },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:17, type: handlebarsTokenTypes.EMBED },
				{ startIndex:19, type: htmlTokenTypes.DELIM_START },
				{ startIndex:20, type: htmlTokenTypes.getTag('li') },
				{ startIndex:22, type: htmlTokenTypes.DELIM_START },
				{ startIndex:23, type: handlebarsTokenTypes.EMBED },
				{ startIndex:25, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:29, type: handlebarsTokenTypes.EMBED },
				{ startIndex:31, type: htmlTokenTypes.DELIM_END },
				{ startIndex:33, type: htmlTokenTypes.getTag('li') },
				{ startIndex:35, type: htmlTokenTypes.DELIM_END },
				{ startIndex:36, type: handlebarsTokenTypes.EMBED },
				{ startIndex:38, type: handlebarsTokenTypes.KEYWORD },
				{ startIndex:43, type: handlebarsTokenTypes.EMBED },
				{ startIndex:45, type: htmlTokenTypes.DELIM_END },
				{ startIndex:47, type: htmlTokenTypes.getTag('ul') },
				{ startIndex:49, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Multiline', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<div>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('div') },
				{ startIndex:4, type: htmlTokenTypes.DELIM_START }
			]}, {
			line: '{{#if foo}}',
			tokens: [
				{ startIndex:0, type: handlebarsTokenTypes.EMBED },
				{ startIndex:2, type: handlebarsTokenTypes.KEYWORD },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:9, type: handlebarsTokenTypes.EMBED }
			]}, {
			line: '<span>{{bar}}</span>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('span') },
				{ startIndex:5, type: htmlTokenTypes.DELIM_START },
				{ startIndex:6, type: handlebarsTokenTypes.EMBED },
				{ startIndex:8, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:11, type: handlebarsTokenTypes.EMBED },
				{ startIndex:13, type: htmlTokenTypes.DELIM_END },
				{ startIndex:15, type: htmlTokenTypes.getTag('span') },
				{ startIndex:19, type: htmlTokenTypes.DELIM_END }
			]}, {
			line: '{{/if}}',
			tokens: null}
		]);
	});

	test('Div end', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '</div>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_END },
				{ startIndex:2, type: htmlTokenTypes.getTag('div') },
				{ startIndex:5, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	// shamelessly stolen from the HTML test bed since Handlebars are a superset of HTML
	test('Embedded Content in HTML', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript">var i= 10;</script>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: htmlTokenTypes.ATTRIB_NAME },
				{ startIndex:12, type: htmlTokenTypes.DELIM_ASSIGN },
				{ startIndex:13, type: htmlTokenTypes.ATTRIB_VALUE },
				{ startIndex:30, type: htmlTokenTypes.DELIM_START },
				{ startIndex:31, type: 'keyword.js' },
				{ startIndex:34, type: '' },
				{ startIndex:35, type: 'identifier.js' },
				{ startIndex:36, type: 'delimiter.js' },
				{ startIndex:37, type: '' },
				{ startIndex:38, type: 'number.js' },
				{ startIndex:40, type: 'delimiter.js' },
				{ startIndex:41, type: htmlTokenTypes.DELIM_END },
				{ startIndex:43, type: htmlTokenTypes.getTag('script') },
				{ startIndex:49, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('HTML Expressions', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/x-handlebars-template"><h1>{{ title }}</h1></script>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: htmlTokenTypes.ATTRIB_NAME },
				{ startIndex:12, type: htmlTokenTypes.DELIM_ASSIGN },
				{ startIndex:13, type: htmlTokenTypes.ATTRIB_VALUE },
				{ startIndex:41, type: htmlTokenTypes.DELIM_START },
				{ startIndex:42, type: htmlTokenTypes.DELIM_START },
				{ startIndex:43, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:45, type: htmlTokenTypes.DELIM_START },
				{ startIndex:46, type: handlebarsTokenTypes.EMBED },
				{ startIndex:48, type: '' },
				{ startIndex:49, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:54, type: '' },
				{ startIndex:55, type: handlebarsTokenTypes.EMBED },
				{ startIndex:57, type: htmlTokenTypes.DELIM_END },
				{ startIndex:59, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:61, type: htmlTokenTypes.DELIM_END },
				{ startIndex:62, type: htmlTokenTypes.DELIM_END },
				{ startIndex:64, type: htmlTokenTypes.getTag('script') },
				{ startIndex:70, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('Multi-line HTML Expressions', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/x-handlebars-template">',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: htmlTokenTypes.ATTRIB_NAME },
				{ startIndex:12, type: htmlTokenTypes.DELIM_ASSIGN },
				{ startIndex:13, type: htmlTokenTypes.ATTRIB_VALUE },
				{ startIndex:41, type: htmlTokenTypes.DELIM_START }
			]}, {
			line: '<h1>{{ title }}</h1>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:3, type: htmlTokenTypes.DELIM_START },
				{ startIndex:4, type: handlebarsTokenTypes.EMBED },
				{ startIndex:6, type: '' },
				{ startIndex:7, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: handlebarsTokenTypes.EMBED },
				{ startIndex:15, type: htmlTokenTypes.DELIM_END },
				{ startIndex:17, type: htmlTokenTypes.getTag('h1') },
				{ startIndex:19, type: htmlTokenTypes.DELIM_END }
			]}, {
			line: '</script>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_END },
				{ startIndex:2, type: htmlTokenTypes.getTag('script') },
				{ startIndex:8, type: htmlTokenTypes.DELIM_END }
			]}
		]);
	});

	test('HTML Nested Modes', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '{{foo}}<script></script>{{bar}}',
			tokens: [
				{ startIndex:0, type: handlebarsTokenTypes.EMBED },
				{ startIndex:2, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:5, type: handlebarsTokenTypes.EMBED },
				{ startIndex:7, type: htmlTokenTypes.DELIM_START },
				{ startIndex:8, type: htmlTokenTypes.getTag('script') },
				{ startIndex:14, type: htmlTokenTypes.DELIM_START },
				{ startIndex:15, type: htmlTokenTypes.DELIM_END },
				{ startIndex:17, type: htmlTokenTypes.getTag('script') },
				{ startIndex:23, type: htmlTokenTypes.DELIM_END },
				{ startIndex:24, type: handlebarsTokenTypes.EMBED },
				{ startIndex:26, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:29, type: handlebarsTokenTypes.EMBED }
			]}
		]);
	});

	test('else keyword', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '{{else}}',
			tokens: [
				{ startIndex:0, type: handlebarsTokenTypes.EMBED },
				{ startIndex:2, type: handlebarsTokenTypes.KEYWORD },
				{ startIndex:6, type: handlebarsTokenTypes.EMBED }
			]}
		]);
	});

	test('else keyword #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '{{elseFoo}}',
			tokens: [
				{ startIndex:0, type: handlebarsTokenTypes.EMBED },
				{ startIndex:2, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:9, type: handlebarsTokenTypes.EMBED }
			]}
		]);
	});

	test('Token inside attribute', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<a href="/posts/{{permalink}}">',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('a') },
				{ startIndex:2, type: '' },
				{ startIndex:3, type: htmlTokenTypes.ATTRIB_NAME },
				{ startIndex:7, type: htmlTokenTypes.DELIM_ASSIGN },
				{ startIndex:8, type: htmlTokenTypes.ATTRIB_VALUE },
				{ startIndex:16, type: handlebarsTokenTypes.EMBED },
				{ startIndex:18, type: handlebarsTokenTypes.VARIABLE },
				{ startIndex:27, type: handlebarsTokenTypes.EMBED },
				{ startIndex:29, type: htmlTokenTypes.ATTRIB_VALUE },
				{ startIndex:30, type: htmlTokenTypes.DELIM_START }
			]}
		]);
	});
});
