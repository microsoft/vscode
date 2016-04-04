/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/jade';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('jade', language, [
	// Tags [Jade]
	[{
	line: 'p 5',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 1, type: '' }
	]}],

	[{
	line: 'div#container.stuff',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 3, type: 'tag.id.jade' },
		{ startIndex: 13, type: 'tag.class.jade' }
	]}],

	[{
	line: 'div.container#stuff',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 3, type: 'tag.class.jade' },
		{ startIndex: 13, type: 'tag.id.jade' }
	]}],

	[{
	line: 'div.container#stuff .container',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 3, type: 'tag.class.jade' },
		{ startIndex: 13, type: 'tag.id.jade' },
		{ startIndex: 19, type: '' }
	]}],

	[{
	line: '#tag-id-1',
	tokens: [
		{ startIndex: 0, type: 'tag.id.jade' }
	]}],

	[{
	line: '.tag-id-1',
	tokens: [
		{ startIndex: 0, type: 'tag.class.jade' }
	]}],

	// Attributes - Single Line [Jade]
	[{
	line: 'input(type="checkbox")',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 5, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 6, type: 'attribute.name.jade' },
		{ startIndex: 10, type: 'delimiter.jade' },
		{ startIndex: 11, type: 'attribute.value.jade' },
		{ startIndex: 21, type: 'delimiter.parenthesis.jade' }
	]}],

	[{
	line: 'input (type="checkbox")',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 5, type: '' }
	]}],

	[{
	line: 'input(type="checkbox",name="agreement",checked)',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 5, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 6, type: 'attribute.name.jade' },
		{ startIndex: 10, type: 'delimiter.jade' },
		{ startIndex: 11, type: 'attribute.value.jade' },
		{ startIndex: 21, type: 'attribute.delimiter.jade' },
		{ startIndex: 22, type: 'attribute.name.jade' },
		{ startIndex: 26, type: 'delimiter.jade' },
		{ startIndex: 27, type: 'attribute.value.jade' },
		{ startIndex: 38, type: 'attribute.delimiter.jade' },
		{ startIndex: 39, type: 'attribute.name.jade' },
		{ startIndex: 46, type: 'delimiter.parenthesis.jade' }
	]}],

	[{
	line: 'input(type="checkbox"',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 5, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 6, type: 'attribute.name.jade' },
		{ startIndex: 10, type: 'delimiter.jade' },
		{ startIndex: 11, type: 'attribute.value.jade' }
	]}, {
	line: 'name="agreement"',
	tokens: [
		{ startIndex: 0, type: 'attribute.name.jade' },
		{ startIndex: 4, type: 'delimiter.jade' },
		{ startIndex: 5, type: 'attribute.value.jade' }
	]}, {
	line: 'checked)',
	tokens: [
		{ startIndex: 0, type: 'attribute.name.jade' },
		{ startIndex: 7, type: 'delimiter.parenthesis.jade' }
	]}, {
	line: 'body',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' }
	]}],

	// Attributes - MultiLine [Jade]
	[{
	line: 'input(type="checkbox"',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 5, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 6, type: 'attribute.name.jade' },
		{ startIndex: 10, type: 'delimiter.jade' },
		{ startIndex: 11, type: 'attribute.value.jade' }
	]}, {
	line: 'disabled',
	tokens: [
		{ startIndex: 0, type: 'attribute.name.jade' }
	]}, {
	line: 'checked)',
	tokens: [
		{ startIndex: 0, type: 'attribute.name.jade' },
		{ startIndex: 7, type: 'delimiter.parenthesis.jade' }
	]}, {
	line: 'body',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' }
	]}],

	// Interpolation [Jade]
	[{
	line: 'p print #{count} lines',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 1, type: '' },
		{ startIndex: 8, type: 'interpolation.delimiter.jade' },
		{ startIndex: 10, type: 'interpolation.jade' },
		{ startIndex: 15, type: 'interpolation.delimiter.jade' },
		{ startIndex: 16, type: '' }
	]}],

	[{
	line: 'p print "#{count}" lines',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 1, type: '' },
		{ startIndex: 9, type: 'interpolation.delimiter.jade' },
		{ startIndex: 11, type: 'interpolation.jade' },
		{ startIndex: 16, type: 'interpolation.delimiter.jade' },
		{ startIndex: 17, type: '' }
	]}],

	[{
	line: '{ key: 123 }',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.jade' },
		{ startIndex: 1, type: '' },
		{ startIndex: 5, type: 'delimiter.jade' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'number.jade' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.curly.jade' }
	]}],

	// Comments - Single Line [Jade]
	[{
	line: '// html#id1.class1',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}],

	[{
	line: 'body hello // not a comment 123',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 4, type: '' }
	]}],

	// Comments - MultiLine [Jade]
	[{
	line: '//',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: '    should be a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: '    should still be a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: 'div should not be a comment',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 3, type: '' }
	]}],

	// Code [Jade]
	[{
	line: '- var a = 1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.var.jade' },
		{ startIndex: 5, type: '' },
		{ startIndex: 8, type: 'delimiter.jade' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'number.jade' }
	]}],

	[{
	line: 'each item in items',
	tokens: [
		{ startIndex: 0, type: 'keyword.each.jade' },
		{ startIndex: 4, type: '' },
		{ startIndex: 10, type: 'keyword.in.jade' },
		{ startIndex: 12, type: '' }
	]}],

	[{
	line: '- var html = "<script></script>"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.var.jade' },
		{ startIndex: 5, type: '' },
		{ startIndex: 11, type: 'delimiter.jade' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'string.jade' }
	]}],

	// Generated from sample
	[{
	line: 'doctype 5',
	tokens: [
		{ startIndex: 0, type: 'keyword.doctype.jade' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.jade' }
	]}, {
	line: 'html(lang="en")',
	tokens: [
		{ startIndex: 0, type: 'tag.jade' },
		{ startIndex: 4, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 5, type: 'attribute.name.jade' },
		{ startIndex: 9, type: 'delimiter.jade' },
		{ startIndex: 10, type: 'attribute.value.jade' },
		{ startIndex: 14, type: 'delimiter.parenthesis.jade' }
	]}, {
	line: '    head',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'tag.jade' }
	]}, {
	line: '        title= pageTitle',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'tag.jade' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '        script(type=\'text/javascript\')',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'tag.jade' },
		{ startIndex: 14, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 15, type: 'attribute.name.jade' },
		{ startIndex: 19, type: 'delimiter.jade' },
		{ startIndex: 20, type: 'attribute.value.jade' },
		{ startIndex: 37, type: 'delimiter.parenthesis.jade' }
	]}, {
	line: '            if (foo) {',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 12, type: 'keyword.if.jade' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 16, type: '' },
		{ startIndex: 19, type: 'delimiter.parenthesis.jade' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'delimiter.curly.jade' }
	]}, {
	line: '                bar()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 19, type: 'delimiter.parenthesis.jade' }
	]}, {
	line: '            }',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 12, type: 'delimiter.curly.jade' }
	]}, {
	line: '    body',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'tag.jade' }
	]}, {
	line: '        // Disclaimer: You will need to turn insertSpaces to true in order for the',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: '         syntax highlighting to kick in properly (especially for comments)',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: '            Enjoy :)',
	tokens: [
		{ startIndex: 0, type: 'comment.jade' }
	]}, {
	line: '        h1 Jade - node template engine if in',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'tag.jade' },
		{ startIndex: 10, type: '' }
	]}, {
	line: '        p.',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'tag.jade' },
		{ startIndex: 9, type: 'delimiter.jade' }
	]}, {
	line: '          text ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '            text',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '          #container',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '         #container',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '        #container',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'tag.id.jade' }
	]}, {
	line: '          if youAreUsingJade',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'keyword.if.jade' },
		{ startIndex: 12, type: '' }
	]}, {
	line: '            p You are amazing',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 12, type: 'tag.jade' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '          else',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'keyword.else.jade' }
	]}, {
	line: '            p Get on it!',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 12, type: 'tag.jade' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '     p Text can be included in a number of different ways.',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'tag.jade' },
		{ startIndex: 6, type: '' }
	]}]
]);
