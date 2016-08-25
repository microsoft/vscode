/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Scanner, TokenType, ScannerState, createScanner} from '../parser/htmlScanner';

suite('HTML Scanner', () => {

	interface Token {
		offset:number;
		type:TokenType;
		content?: string;
	}

	function assertTokens(tests: {input: string; tokens: Token[]; }[]) {
		
		let scannerState = ScannerState.Content;
		for (let t of tests) {
			let scanner = createScanner(t.input, 0, scannerState);
			let tokenType = scanner.scan();
			let actual : Token[] = [];
			while (tokenType !== TokenType.EOS) {
				let actualToken : Token= { offset: scanner.getTokenOffset(), type: tokenType };
				if (tokenType == TokenType.StartTag || tokenType == TokenType.EndTag) {
					actualToken.content = t.input.substr(scanner.getTokenOffset(), scanner.getTokenLength());
				}
				actual.push(actualToken);
				tokenType = scanner.scan();
			}
			assert.deepEqual(actual, t.tokens);
			scannerState = scanner.getScannerState();
		}
	}

	test('Open Start Tag #1', () => {
		assertTokens([{
			input: '<abc',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' }
			]}
		]);
	});

	test('Open Start Tag #2', () => {
		assertTokens([{
			input: '<input',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'input' }
			]}
		]);
	});

	test('Open Start Tag with Invalid Tag', () => {
		assertTokens([{
			input: '< abc',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.Unknown },
				{ offset:2, type: TokenType.Content }
			]}
		]);
	});

	test('Open Start Tag #3', () => {
		assertTokens([{
			input: '< abc>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.Unknown },
				{ offset:2, type: TokenType.Content }
			]}
		]);
	});

	test('Open Start Tag #4', () => {
		assertTokens([{
			input: 'i <len;',
			tokens: [
				{ offset:0, type: TokenType.Content },
				{ offset:2, type: TokenType.StartTagOpen },
				{ offset:3, type: TokenType.StartTag, content: 'len' },
				{ offset:6, type: TokenType.Unknown }
			]}
		]);
	});

	test('Open Start Tag #5', () => {
		assertTokens([{
			input: '<',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen }
			]}
		]);
	});

	test('Open End Tag', () => {
		assertTokens([{
			input: '</a',
			tokens: [
				{ offset:0, type: TokenType.EndTagOpen },
				{ offset:2, type: TokenType.EndTag, content: 'a' }
			]}
		]);
	});

	test('Complete Start Tag', () => {
		assertTokens([{
			input: '<abc>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Complete Start Tag with Whitespace', () => {
		assertTokens([{
			input: '<abc >',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('bug 9809 - Complete Start Tag with Namespaceprefix', () => {
		assertTokens([{
			input: '<foo:bar>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'foo:bar' },
				{ offset:8, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Complete End Tag', () => {
		assertTokens([{
			input: '</abc>',
			tokens: [
				{ offset:0, type: TokenType.EndTagOpen },
				{ offset:2, type: TokenType.EndTag, content: 'abc' },
				{ offset:5, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Complete End Tag with Whitespace', () => {
		assertTokens([{
			input: '</abc  >',
			tokens: [
				{ offset:0, type: TokenType.EndTagOpen },
				{ offset:2, type: TokenType.EndTag, content: 'abc' },
				{ offset:5, type: TokenType.Whitespace },
				{ offset:7, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Empty Tag', () => {
		assertTokens([{
			input: '<abc />',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.StartTagSelfClose }
			]}
		]);
	});

	test('Embedded Content #1', () => {
		assertTokens([{
			input: '<script type="text/javascript">var i= 10;</script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.StartTagClose },
				{ offset:31, type: TokenType.Script },
				{ offset:41, type: TokenType.EndTagOpen },
				{ offset:43, type: TokenType.EndTag, content: 'script' },
				{ offset:49, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #2', () => {
		assertTokens([{
			input: '<script type="text/javascript">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.StartTagClose }
			]}, {
			input: 'var i= 10;',
			tokens: [
				{ offset:0, type: TokenType.Script }
			]}, {
			input: '</script>',
			tokens: [
				{ offset:0, type: TokenType.EndTagOpen },
				{ offset:2, type: TokenType.EndTag, content: 'script' },
				{ offset:8, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #3', () => {
		assertTokens([{
			input: '<script type="text/javascript">var i= 10;',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.StartTagClose },
				{ offset:31, type: TokenType.Script }
			]}, {
			input: '</script>',
			tokens: [
				{ offset:0, type: TokenType.EndTagOpen },
				{ offset:2, type: TokenType.EndTag, content: 'script' },
				{ offset:8, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #4', () => {
		assertTokens([{
			input: '<script type="text/javascript">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.StartTagClose }
			]}, {
			input: 'var i= 10;</script>',
			tokens: [
				{ offset:0, type: TokenType.Script },
				{ offset:10, type: TokenType.EndTagOpen },
				{ offset:12, type: TokenType.EndTag, content: 'script' },
				{ offset:18, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #5', () => {
		assertTokens([{
			input: '<script type="text/plain">a\n<a</script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:25, type: TokenType.StartTagClose },
				{ offset:26, type: TokenType.Script },
				{ offset:30, type: TokenType.EndTagOpen },
				{ offset:32, type: TokenType.EndTag, content: 'script' },
				{ offset:38, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #6', () => {
		assertTokens([{
			input: '<script>a</script><script>b</script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:9, type: TokenType.EndTagOpen },
				{ offset:11, type: TokenType.EndTag, content: 'script' },
				{ offset:17, type: TokenType.EndTagClose },
				{ offset:18, type: TokenType.StartTagOpen },
				{ offset:19, type: TokenType.StartTag, content: 'script' },
				{ offset:25, type: TokenType.StartTagClose },
				{ offset:26, type: TokenType.Script },
				{ offset:27, type: TokenType.EndTagOpen },
				{ offset:29, type: TokenType.EndTag, content: 'script' },
				{ offset:35, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #7', () => {
		assertTokens([{
			input: '<script type="text/javascript"></script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.StartTagClose },
				{ offset:31, type: TokenType.EndTagOpen },
				{ offset:33, type: TokenType.EndTag, content: 'script' },
				{ offset:39, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #8', () => {
		assertTokens([{
			input: '<script>var i= 10;</script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:18, type: TokenType.EndTagOpen },
				{ offset:20, type: TokenType.EndTag, content: 'script' },
				{ offset:26, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #9', () => {
		assertTokens([{
			input: '<script type="text/javascript" src="main.js"></script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.Whitespace },
				{ offset:8, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.DelimiterAssign },
				{ offset:13, type: TokenType.AttributeValue },
				{ offset:30, type: TokenType.Whitespace },
				{ offset:31, type: TokenType.AttributeName },
				{ offset:34, type: TokenType.DelimiterAssign },
				{ offset:35, type: TokenType.AttributeValue },
				{ offset:44, type: TokenType.StartTagClose },
				{ offset:45, type: TokenType.EndTagOpen },
				{ offset:47, type: TokenType.EndTag, content: 'script' },
				{ offset:53, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #10', () => {
		assertTokens([{
			input: '<script><!-- alert("<script></script>"); --></script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:44, type: TokenType.EndTagOpen },
				{ offset:46, type: TokenType.EndTag, content: 'script' },
				{ offset:52, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #11', () => {
		assertTokens([{
			input: '<script><!-- alert("<script></script>"); </script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:41, type: TokenType.EndTagOpen },
				{ offset:43, type: TokenType.EndTag, content: 'script' },
				{ offset:49, type: TokenType.EndTagClose }
			]}
		]);
	});


	test('Embedded Content #12', () => {
		assertTokens([{
			input: '<script><!-- alert("</script>"); </script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:20, type: TokenType.EndTagOpen },
				{ offset:22, type: TokenType.EndTag, content: 'script' },
				{ offset:28, type: TokenType.EndTagClose },
				{ offset:29, type: TokenType.Content },
				{ offset:33, type: TokenType.EndTagOpen },
				{ offset:35, type: TokenType.EndTag, content: 'script' },
				{ offset:41, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Embedded Content #13', () => {
		assertTokens([{
			input: '<script> alert("<script></script>"); </script>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'script' },
				{ offset:7, type: TokenType.StartTagClose },
				{ offset:8, type: TokenType.Script },
				{ offset:24, type: TokenType.EndTagOpen },
				{ offset:26, type: TokenType.EndTag, content: 'script' },
				{ offset:32, type: TokenType.EndTagClose },
				{ offset:33, type: TokenType.Content },
				{ offset:37, type: TokenType.EndTagOpen },
				{ offset:39, type: TokenType.EndTag, content: 'script' },
				{ offset:45, type: TokenType.EndTagClose }
			]}
		]);
	});

	test('Tag with Attribute', () => {
		assertTokens([{
			input: '<abc foo="bar">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue },
				{ offset:14, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Empty Attribute Value', () => {
		assertTokens([{
			input: '<abc foo=\'bar\'>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue },
				{ offset:14, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with empty attributes', () => {
		assertTokens([{
			input: '<abc foo="">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue },
				{ offset:11, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Attributes', () => {
		assertTokens([{
			input: '<abc foo="bar" bar=\'foo\'>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue },
				{ offset:14, type: TokenType.Whitespace },
				{ offset:15, type: TokenType.AttributeName },
				{ offset:18, type: TokenType.DelimiterAssign },
				{ offset:19, type: TokenType.AttributeValue },
				{ offset:24, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Attributes, no quotes', () => {
		assertTokens([{
			input: '<abc foo=bar bar=help-me>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue },
				{ offset:12, type: TokenType.Whitespace },
				{ offset:13, type: TokenType.AttributeName },
				{ offset:16, type: TokenType.DelimiterAssign },
				{ offset:17, type: TokenType.AttributeValue },
				{ offset:24, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Attribute And Whitespace', () => {
		assertTokens([{
			input: '<abc foo=  "bar">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.Whitespace },
				{ offset:11, type: TokenType.AttributeValue },
				{ offset:16, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Attribute And Whitespace #2', () => {
		assertTokens([{
			input: '<abc foo = "bar">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.Whitespace },
				{ offset:9, type: TokenType.DelimiterAssign },
				{ offset:10, type: TokenType.Whitespace },
				{ offset:11, type: TokenType.AttributeValue },
				{ offset:16, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Name-Only-Attribute #1', () => {
		assertTokens([{
			input: '<abc foo>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Name-Only-Attribute #2', () => {
		assertTokens([{
			input: '<abc foo bar>',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.Whitespace },
				{ offset:9, type: TokenType.AttributeName },
				{ offset:12, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Interesting Attribute Name', () => {
		assertTokens([{
			input: '<abc foo!@#="bar">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:11, type: TokenType.DelimiterAssign },
				{ offset:12, type: TokenType.AttributeValue },
				{ offset:17, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Angular Attribute Name', () => {
		assertTokens([{
			input: '<abc #myinput (click)="bar" [value]="someProperty" *ngIf="someCondition">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:13, type: TokenType.Whitespace },
				{ offset:14, type: TokenType.AttributeName },
				{ offset:21, type: TokenType.DelimiterAssign },
				{ offset:22, type: TokenType.AttributeValue },
				{ offset:27, type: TokenType.Whitespace },
				{ offset:28, type: TokenType.AttributeName },
				{ offset:35, type: TokenType.DelimiterAssign },
				{ offset:36, type: TokenType.AttributeValue },
				{ offset:50, type: TokenType.Whitespace },
				{ offset:51, type: TokenType.AttributeName },
				{ offset:56, type: TokenType.DelimiterAssign },
				{ offset:57, type: TokenType.AttributeValue },
				{ offset:72, type: TokenType.StartTagClose }
			]}
		]);
	});

	test('Tag with Invalid Attribute Value', () => {
		assertTokens([{
			input: '<abc foo=">',
			tokens: [
				{ offset:0, type: TokenType.StartTagOpen },
				{ offset:1, type: TokenType.StartTag, content: 'abc' },
				{ offset:4, type: TokenType.Whitespace },
				{ offset:5, type: TokenType.AttributeName },
				{ offset:8, type: TokenType.DelimiterAssign },
				{ offset:9, type: TokenType.AttributeValue }
			]}
		]);
	});

	test('Simple Comment 1', () => {
		assertTokens([{
			input: '<!--a-->',
			tokens: [
				{ offset:0, type: TokenType.StartCommentTag },
				{ offset:4, type: TokenType.Comment },
				{ offset:5, type: TokenType.EndCommentTag }
			]}
		]);
	});

	test('Simple Comment 2', () => {
		assertTokens([{
			input: '<!--a>foo bar</a -->',
			tokens: [
				{ offset:0, type: TokenType.StartCommentTag },
				{ offset:4, type: TokenType.Comment },
				{ offset:17, type: TokenType.EndCommentTag }
			]}
		]);
	});

	test('Multiline Comment', () => {
		assertTokens([{
			input: '<!--a>\nfoo \nbar</a -->',
			tokens: [
				{ offset:0, type: TokenType.StartCommentTag },
				{ offset:4, type: TokenType.Comment },
				{ offset:19, type: TokenType.EndCommentTag }
			]}
		]);
	});

	test('Simple Doctype', () => {
		assertTokens([{
			input: '<!Doctype a>',
			tokens: [
				{ offset:0, type: TokenType.StartDoctypeTag },
				{ offset:9, type: TokenType.Doctype },
				{ offset:11, type: TokenType.EndDoctypeTag }
			]}
		]);
	});

	test('Simple Doctype #2', () => {
		assertTokens([{
			input: '<!doctype a>',
			tokens: [
				{ offset:0, type: TokenType.StartDoctypeTag },
				{ offset:9, type: TokenType.Doctype },
				{ offset:11, type: TokenType.EndDoctypeTag }
			]}
		]);
	});

	test('Simple Doctype #4', () => {
		assertTokens([{
			input: '<!DOCTYPE a\n"foo" \'bar\'>',
			tokens: [
				{ offset:0, type: TokenType.StartDoctypeTag },
				{ offset:9, type: TokenType.Doctype },
				{ offset:23, type: TokenType.EndDoctypeTag }
			]}
		]);
	});
});