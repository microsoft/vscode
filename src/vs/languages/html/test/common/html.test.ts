/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/html/common/html.contribution';
import 'vs/languages/javascript/common/javascript.contribution';
import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {Model} from 'vs/editor/common/model/model';
import {getTag, DELIM_END, DELIM_START, DELIM_ASSIGN, ATTRIB_NAME, ATTRIB_VALUE, COMMENT, DELIM_COMMENT, DELIM_DOCTYPE, DOCTYPE} from 'vs/languages/html/common/htmlTokenTypes';
import {getRawEnterActionAtPosition} from 'vs/editor/common/modes/supports/onEnter';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {TextModel} from 'vs/editor/common/model/textModel';
import {Range} from 'vs/editor/common/core/range';

suite('Colorizing - HTML', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	var _mode: Modes.IMode;

	suiteSetup((done) => {
		modesUtil.load('html', ['javascript']).then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			_mode = mode;
			done();
		});
	});

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
				{ startIndex:31, type: 'keyword.js' },
				{ startIndex:34, type: '' },
				{ startIndex:35, type: 'identifier.js' },
				{ startIndex:36, type: 'delimiter.js' },
				{ startIndex:37, type: '' },
				{ startIndex:38, type: 'number.js' },
				{ startIndex:40, type: 'delimiter.js' },
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
				{ startIndex:0, type: 'keyword.js' },
				{ startIndex:3, type: '' },
				{ startIndex:4, type: 'identifier.js' },
				{ startIndex:5, type: 'delimiter.js' },
				{ startIndex:6, type: '' },
				{ startIndex:7, type: 'number.js' },
				{ startIndex:9, type: 'delimiter.js' }
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
				{ startIndex:31, type: 'keyword.js' },
				{ startIndex:34, type: '' },
				{ startIndex:35, type: 'identifier.js' },
				{ startIndex:36, type: 'delimiter.js' },
				{ startIndex:37, type: '' },
				{ startIndex:38, type: 'number.js' },
				{ startIndex:40, type: 'delimiter.js' }
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
				{ startIndex:0, type: 'keyword.js' },
				{ startIndex:3, type: '' },
				{ startIndex:4, type: 'identifier.js' },
				{ startIndex:5, type: 'delimiter.js' },
				{ startIndex:6, type: '' },
				{ startIndex:7, type: 'number.js' },
				{ startIndex:9, type: 'delimiter.js' },
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
				{ startIndex:8, type: 'identifier.js' },
				{ startIndex:9, type: DELIM_END },
				{ startIndex:11, type: getTag('script') },
				{ startIndex:17, type: DELIM_END },
				{ startIndex:18, type: DELIM_START },
				{ startIndex:19, type: getTag('script') },
				{ startIndex:25, type: DELIM_START },
				{ startIndex:26, type: 'identifier.js' },
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
				{ startIndex:8, type: 'keyword.js' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'identifier.js' },
				{ startIndex:13, type: 'delimiter.js' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'number.js' },
				{ startIndex:17, type: 'delimiter.js' },
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

	test('Tag with empty atrributes', () => {
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
			line: '<abc foo="bar" bar="foo">',
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

	test('Tag with Invalid Attribute Name', () => {
		modesUtil.assertTokenization(tokenizationSupport, [{
			line: '<abc foo!@#="bar">',
			tokens: [
				{ startIndex:0, type: DELIM_START },
				{ startIndex:1, type: getTag('abc') },
				{ startIndex:4, type: '' },
				{ startIndex:5, type: ATTRIB_NAME },
				{ startIndex:8, type: '' },
				{ startIndex:13, type: ATTRIB_NAME },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: DELIM_START }
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

	test('onEnter', function() {
		var model = new Model('<script type=\"text/javascript\">function f() { foo(); }', Model.DEFAULT_CREATION_OPTIONS, _mode);

		var actual = _mode.richEditSupport.onEnter.onEnter(model, {
			lineNumber: 1,
			column: 46
		});

		assert.equal(actual.indentAction, Modes.IndentAction.Indent);

		model.dispose();
	});

	test('onEnter', function() {
		function onEnter(line:string, offset:number): Modes.IEnterAction {
			let model = new TextModelWithTokens([], TextModel.toRawText(line, Model.DEFAULT_CREATION_OPTIONS), false, _mode);
			let result = getRawEnterActionAtPosition(model, 1, offset + 1);
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

		function toString(brackets:EditorCommon.IEditorRange[]): string[] {
			if (!brackets) {
				return null;
			}
			brackets.sort(Range.compareRangesUsingStarts);
			return brackets.map(b => b.toString());
		}

		function assertBracket(lines:string[], lineNumber:number, column:number, expected:EditorCommon.IEditorRange[]): void {
			let model = new TextModelWithTokens([], TextModel.toRawText(lines.join('\n'), TextModel.DEFAULT_CREATION_OPTIONS), false, _mode);
			// force tokenization
			model.getLineContext(model.getLineCount());
			let actual = model.matchBracket({
				lineNumber: lineNumber,
				column: column
			});
			let actualStr = actual ? toString(actual.brackets) : null;
			let expectedStr = toString(expected);
			assert.deepEqual(actualStr, expectedStr, 'TEXT <<' + lines.join('\n') + '>>, POS: ' + lineNumber + ', ' + column);
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
