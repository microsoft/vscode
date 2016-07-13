/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {Model} from 'vs/editor/common/model/model';
import {getTag, DELIM_END, DELIM_START, DELIM_ASSIGN, ATTRIB_NAME, ATTRIB_VALUE, COMMENT, DELIM_COMMENT, DELIM_DOCTYPE, DOCTYPE} from 'vs/languages/html/common/htmlTokenTypes';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {TextModel} from 'vs/editor/common/model/textModel';
import {Range} from 'vs/editor/common/core/range';
import {MockModeService} from 'vs/editor/test/common/mocks/mockModeService';
import {HTMLMode} from 'vs/languages/html/common/html';
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import {MockTokenizingMode} from 'vs/editor/test/common/mocks/mockMode';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';

class MockJSMode extends MockTokenizingMode {

	constructor() {
		super('html-js-mock', 'mock-js');

		LanguageConfigurationRegistry.register(this.getId(), {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEnterRules: [
				{
					// e.g. /** | */
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					afterText: /^\s*\*\/$/,
					action: { indentAction: Modes.IndentAction.IndentOutdent, appendText: ' * ' }
				},
				{
					// e.g. /** ...|
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					action: { indentAction: Modes.IndentAction.None, appendText: ' * ' }
				},
				{
					// e.g.  * ...|
					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
					action: { indentAction: Modes.IndentAction.None, appendText: '* ' }
				},
				{
					// e.g.  */|
					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
					action: { indentAction: Modes.IndentAction.None, removeText: 1 }
				},
				{
					// e.g.  *-----*/|
					beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
					action: { indentAction: Modes.IndentAction.None, removeText: 1 }
				}
			]
		});
	}
}

class HTMLMockModeService extends MockModeService {
	isRegisteredMode(mimetypeOrModeId: string): boolean {
		if (mimetypeOrModeId === 'text/javascript') {
			return true;
		}
		if (mimetypeOrModeId === 'text/plain') {
			return false;
		}
		throw new Error('Not implemented');
	}

	getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): Modes.IMode {
		if (commaSeparatedMimetypesOrCommaSeparatedIds === 'text/javascript') {
			return new MockJSMode();
		}
		if (commaSeparatedMimetypesOrCommaSeparatedIds === 'text/plain') {
			return null;
		}
		throw new Error('Not implemented');
	}
}

suite('Colorizing - HTML', () => {

	let tokenizationSupport: Modes.ITokenizationSupport;
	let _mode: Modes.IMode;
	let onEnterSupport: Modes.IRichEditOnEnter;

	(function() {
		_mode = new HTMLMode<htmlWorker.HTMLWorker>(
			{ id: 'html' },
			null,
			new HTMLMockModeService(),
			null,
			null
		);

		tokenizationSupport = _mode.tokenizationSupport;

		onEnterSupport = LanguageConfigurationRegistry.getOnEnterSupport(_mode.getId());
	})();

	test('Open Start Tag #1', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') }
			]}
		]);
	});

	test('Open Start Tag #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<input',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('input') }
			]}
		]);
	});

	test('Open Start Tag with Invalid Tag', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '< abc',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: '' }
			]}
		]);
	});

	test('Open Start Tag #3', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '< abc>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: '' }
			]}
		]);
	});

	test('Open Start Tag #4', () => {
		modesUtil.assertTokenization(tokenizationSupport, 	[{
			line: 'i <len;',
			tokens: [
				{ startIndex:0, type: '' },
				{ startIndex:2, type: DELIM_START },
				{ startIndex:3, type: getTag('len') },
				{ startIndex:6, type: '' }
			]}
		]);
	});

	test('Open Start Tag #5', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<',
			tokens: [
				{ startIndex:0, type: DELIM_START }
			]}
		]);
	});

	test('Open End Tag', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '</a',
			tokens: [
				{ startIndex:0, type: DELIM_END },
				{ startIndex:2, type: getTag('a') }
			]}
		]);
	});

	test('Complete Start Tag', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: DELIM_START }
			]}
		]);
	});

	test('Complete Start Tag with Whitespace', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc >',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: DELIM_START }
			]}
		]);
	});

	test('bug 9809 - Complete Start Tag with Namespaceprefix', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<foo:bar>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('foo-bar') },
				{ startIndex:8, type: DELIM_START }
			]}
		]);
	});

	test('Complete End Tag', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '</abc>',
			tokens: [
				{ startIndex:0, type: DELIM_END },
				{ startIndex:2, type: getTag('abc') },
				{ startIndex:5, type: DELIM_END }
			]}
		]);
	});

	test('Complete End Tag with Whitespace', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '</abc  >',
			tokens: [
				{ startIndex:0, type: DELIM_END },
				{ startIndex:2, type: getTag('abc') },
				{ startIndex:5, type: '' },
				{ startIndex:7, type: DELIM_END }
			]}
		]);
	});

	test('Empty Tag', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc />',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: DELIM_START }
			]}
		]);
	});

	test('Embedded Content #1', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript">var i= 10;</script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: DELIM_START },
				{ startIndex:31, type: 'mock-js' },
				{ startIndex:41, type: DELIM_END },
				{ startIndex:43, type: getTag('script') },
				{ startIndex:49, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: DELIM_START }
			]}, {
			line: 'var i= 10;',
			tokens: [
				{ startIndex:0, type: 'mock-js' },
			]}, {
			line: '</script>',
			tokens: [
				{ startIndex:0, type: DELIM_END },
				{ startIndex:2, type: getTag('script') },
				{ startIndex:8, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #3', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript">var i= 10;',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: DELIM_START },
				{ startIndex:31, type: 'mock-js' },
			]}, {
			line: '</script>',
			tokens: [
				{ startIndex:0, type: DELIM_END },
				{ startIndex:2, type: getTag('script') },
				{ startIndex:8, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #4', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: DELIM_START }
			]}, {
			line: 'var i= 10;</script>',
			tokens: [
				{ startIndex:0, type: 'mock-js' },
				{ startIndex:10, type: DELIM_END },
				{ startIndex:12, type: getTag('script') },
				{ startIndex:18, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #5', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/plain">a\n<a</script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:25, type: DELIM_START },
				{ startIndex:26, type: '' },
				{ startIndex:30, type: DELIM_END },
				{ startIndex:32, type: getTag('script') },
				{ startIndex:38, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #6', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script>a</script><script>b</script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: DELIM_START },
				{ startIndex:8, type: 'mock-js' },
				{ startIndex:9, type: DELIM_END },
				{ startIndex:11, type: getTag('script') },
				{ startIndex:17, type: DELIM_END },
				{ startIndex:18, type: DELIM_START },
				{ startIndex:19, type: getTag('script') },
				{ startIndex:25, type: DELIM_START },
				{ startIndex:26, type: 'mock-js' },
				{ startIndex:27, type: DELIM_END },
				{ startIndex:29, type: getTag('script') },
				{ startIndex:35, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #7', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript"></script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: DELIM_START },
				{ startIndex:31, type: DELIM_END },
				{ startIndex:33, type: getTag('script') },
				{ startIndex:39, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #8', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script>var i= 10;</script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: DELIM_START },
				{ startIndex:8, type: 'mock-js' },
				{ startIndex:18, type: DELIM_END },
				{ startIndex:20, type: getTag('script') },
				{ startIndex:26, type: DELIM_END }
			]}
		]);
	});

	test('Embedded Content #9', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<script type="text/javascript" src="main.js"></script>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('script') },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_ASSIGN },
				{ startIndex:13, type: ATTRIB_VALUE },
				{ startIndex:30, type: '' },
				{ startIndex:31, type: ATTRIB_NAME },
				{ startIndex:34, type: DELIM_ASSIGN },
				{ startIndex:35, type: ATTRIB_VALUE },
				{ startIndex:44, type: DELIM_START },
				{ startIndex:45, type: DELIM_END },
				{ startIndex:47, type: getTag('script') },
				{ startIndex:53, type: DELIM_END }
			]}
		]);
	});

	test('Tag with Attribute', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo="bar">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE },
				{ startIndex:14, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Empty Attribute Value', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo=\'bar\'>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE },
				{ startIndex:14, type: DELIM_START }
			]}
		]);
	});

	test('Tag with empty attributes', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo="">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE },
				{ startIndex:11, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Attributes', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo="bar" bar=\'foo\'>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: ATTRIB_NAME },
				{ startIndex:18, type: DELIM_ASSIGN },
				{ startIndex:19, type: ATTRIB_VALUE },
				{ startIndex:24, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Attributes, no quotes', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo=bar bar=help-me>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: ATTRIB_NAME },
				{ startIndex:16, type: DELIM_ASSIGN },
				{ startIndex:17, type: ATTRIB_VALUE },
				{ startIndex:24, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Attribute And Whitespace', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo=  "bar">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: '' },
				{ startIndex:11, type: ATTRIB_VALUE },
				{ startIndex:16, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Attribute And Whitespace #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo = "bar">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: DELIM_ASSIGN },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: ATTRIB_VALUE },
				{ startIndex:16, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Name-Only-Attribute #1', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Name-Only-Attribute #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo bar>',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: ATTRIB_NAME },
				{ startIndex:12, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Interesting Attribute Name', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo!@#="bar">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:11, type: DELIM_ASSIGN },
				{ startIndex:12, type: ATTRIB_VALUE },
				{ startIndex:17, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Angular Attribute Name', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc #myinput (click)="bar" [value]="someProperty" *ngIf="someCondition">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: ATTRIB_NAME },
				{ startIndex:21, type: DELIM_ASSIGN },
				{ startIndex:22, type: ATTRIB_VALUE },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: ATTRIB_NAME },
				{ startIndex:35, type: DELIM_ASSIGN },
				{ startIndex:36, type: ATTRIB_VALUE },
				{ startIndex:50, type: '' },
				{ startIndex:51, type: ATTRIB_NAME },
				{ startIndex:56, type: DELIM_ASSIGN },
				{ startIndex:57, type: ATTRIB_VALUE },
				{ startIndex:72, type: DELIM_START }
			]}
		]);
	});

	test('Tag with Invalid Attribute Value', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo=">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: DELIM_ASSIGN },
				{ startIndex:9, type: ATTRIB_VALUE }
			]}
		]);
	});

	test('Simple Comment 1', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!--a-->',
			tokens: [
				{ startIndex:0, type: DELIM_COMMENT },
				{ startIndex:4, type: COMMENT },
				{ startIndex:5, type: DELIM_COMMENT }
			]}
		]);
	});

	test('Simple Comment 2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!--a>foo bar</a -->',
			tokens: [
				{ startIndex:0, type: DELIM_COMMENT },
				{ startIndex:4, type: COMMENT },
				{ startIndex:17, type: DELIM_COMMENT }
			]}
		]);
	});

	test('Multiline Comment', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!--a>\nfoo \nbar</a -->',
			tokens: [
				{ startIndex:0, type: DELIM_COMMENT },
				{ startIndex:4, type: COMMENT },
				{ startIndex:19, type: DELIM_COMMENT }
			]}
		]);
	});

	test('Simple Doctype', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!DOCTYPE a>',
			tokens: [
				{ startIndex:0, type: DELIM_DOCTYPE },
				{ startIndex:9, type: DOCTYPE },
				{ startIndex:11, type: DELIM_DOCTYPE }
			]}
		]);
	});

	test('Simple Doctype #2', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!doctype a>',
			tokens: [
				{ startIndex:0, type: DELIM_DOCTYPE },
				{ startIndex:9, type: DOCTYPE },
				{ startIndex:11, type: DELIM_DOCTYPE }
			]}
		]);
	});

	test('Simple Doctype #4', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<!DOCTYPE a\n"foo" \'bar\'>',
			tokens: [
				{ startIndex:0, type: DELIM_DOCTYPE },
				{ startIndex:9, type: DOCTYPE },
				{ startIndex:23, type: DELIM_DOCTYPE }
			]}
		]);
	});

	test('onEnter 1', function() {
		var model = Model.createFromString('<script type=\"text/javascript\">function f() { foo(); }', undefined, _mode);

		var actual = onEnterSupport.onEnter(model, {
			lineNumber: 1,
			column: 46
		});

		assert.equal(actual.indentAction, Modes.IndentAction.Indent);

		model.dispose();
	});

	test('onEnter 2', function() {
		function onEnter(line:string, offset:number): Modes.EnterAction {
			let model = new TextModelWithTokens([], TextModel.toRawText(line, TextModel.DEFAULT_CREATION_OPTIONS), _mode);
			let result = LanguageConfigurationRegistry.getRawEnterActionAtPosition(model, 1, offset + 1);
			model.dispose();
			return result;
		}

		function assertOnEnter(text:string, offset:number, expected: Modes.IndentAction): void {
			let _actual = onEnter(text, offset);
			let actual = _actual ? _actual.indentAction : null;
			let actualStr = actual ? Modes.IndentAction[actual] : null;
			let expectedStr = expected ? Modes.IndentAction[expected] : null;
			assert.equal(actualStr, expectedStr, 'TEXT: <<' + text + '>>, OFFSET: <<' + offset + '>>');
		}

		assertOnEnter('', 0, null);
		assertOnEnter('>', 1, null);
		assertOnEnter('span>', 5, null);
		assertOnEnter('</span>', 7, null);
		assertOnEnter('<img />', 7, null);
		assertOnEnter('<span>', 6, Modes.IndentAction.Indent);
		assertOnEnter('<p>', 3, Modes.IndentAction.Indent);
		assertOnEnter('<span><span>', 6, Modes.IndentAction.Indent);
		assertOnEnter('<p><span>', 3, Modes.IndentAction.Indent);
		assertOnEnter('<span></SPan>', 6, Modes.IndentAction.IndentOutdent);
		assertOnEnter('<span></span>', 6, Modes.IndentAction.IndentOutdent);
		assertOnEnter('<p></p>', 3, Modes.IndentAction.IndentOutdent);
		assertOnEnter('<span>a</span>', 6, Modes.IndentAction.Indent);
		assertOnEnter('<span>a</span>', 7, Modes.IndentAction.IndentOutdent);
		assertOnEnter('<span> </span>', 6, Modes.IndentAction.Indent);
		assertOnEnter('<span> </span>', 7, Modes.IndentAction.IndentOutdent);
	});

	test('matchBracket', () => {

		function toString(brackets:[Range, Range]): [string,string] {
			if (!brackets) {
				return null;
			}
			brackets.sort(Range.compareRangesUsingStarts);
			return [brackets[0].toString(), brackets[1].toString()];
		}

		function assertBracket(lines:string[], lineNumber:number, column:number, expected:[Range, Range]): void {
			let model = new TextModelWithTokens([], TextModel.toRawText(lines.join('\n'), TextModel.DEFAULT_CREATION_OPTIONS), _mode);
			// force tokenization
			model.getLineContext(model.getLineCount());
			let actual = model.matchBracket({
				lineNumber: lineNumber,
				column: column
			});
			assert.deepEqual(toString(actual), toString(expected), 'TEXT <<' + lines.join('\n') + '>>, POS: ' + lineNumber + ', ' + column);
		}

		assertBracket(['<p></p>'], 1, 1, [new Range(1, 1, 1, 2), new Range(1, 3, 1, 4)]);
		assertBracket(['<p></p>'], 1, 2, [new Range(1, 1, 1, 2), new Range(1, 3, 1, 4)]);
		assertBracket(['<p></p>'], 1, 3, [new Range(1, 1, 1, 2), new Range(1, 3, 1, 4)]);
		assertBracket(['<p></p>'], 1, 4, [new Range(1, 1, 1, 2), new Range(1, 3, 1, 4)]);
		assertBracket(['<p></p>'], 1, 5, [new Range(1, 4, 1, 5), new Range(1, 7, 1, 8)]);
		assertBracket(['<p></p>'], 1, 6, null);
		assertBracket(['<p></p>'], 1, 7, [new Range(1, 4, 1, 5), new Range(1, 7, 1, 8)]);
		assertBracket(['<p></p>'], 1, 8, [new Range(1, 4, 1, 5), new Range(1, 7, 1, 8)]);

		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 10, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 11, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 22, null);
		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 23, null);
		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 33, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a[a<script>a]a'], 1, 34, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);

		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 10, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 11, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 22, null);
		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 23, null);
		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 33, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
		assertBracket(['<script>a[a</script>a]a<script>a]a'], 1, 34, [new Range(1, 10, 1, 11), new Range(1, 33, 1, 34)]);
	});
});
