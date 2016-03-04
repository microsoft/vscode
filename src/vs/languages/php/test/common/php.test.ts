/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/php/common/php.contribution';
import 'vs/languages/html/common/html.contribution';
import 'vs/languages/javascript/common/javascript.contribution';
import 'vs/languages/css/common/css.contribution';

import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {htmlTokenTypes} from 'vs/languages/html/common/html';
import {cssTokenTypes} from 'vs/languages/css/common/css';

suite('Syntax Highlighting - PHP', () => {

	var wordDefinition:RegExp;
	var assertWords = modesUtil.assertWords;
	var tokenizationSupport: Modes.ITokenizationSupport;
	var assertOnEnter: modesUtil.IOnEnterAsserter;

	setup((done) => {
		modesUtil.load('php', ['html', 'javascript', 'css']).then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			assertOnEnter = modesUtil.createOnEnterAsserter(mode.getId(), mode.richEditSupport);
			wordDefinition = mode.richEditSupport.wordDefinition;
			done();
		});
	});

	test('', () => {
		modesUtil.executeTests(tokenizationSupport, [

			// Bug 13596:[ErrorTelemetry] Stream did not advance while tokenizing. Mode id is php (stuck)
			// We're testing the fact that tokenize does not throw
			[
			{ line: '<?php', tokens: null},
			{ line: '"', tokens: null},
			{ line: '\\', tokens: null}
			],

			// Blocks
			[{
			line: '<?php',
			tokens: [
				{ startIndex:0, type: 'metatag.php' }
			]}],

			[{
			line: '<?php ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'metatag.php' }
			]}],

			[{
			line: '<?=',
			tokens: [
				{ startIndex:0, type: 'metatag.php' }
			]}],

			[{
			line: '<?php /* comment */ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			// Variables
			[{
			line: '<?php $abc = 5; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'delimiter.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'number.php' },
				{ startIndex:14, type: 'delimiter.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $a = "chris"; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'string.php' },
				{ startIndex:18, type: 'delimiter.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $myVar = -10; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'delimiter.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'delimiter.php' },
				{ startIndex:16, type: 'number.php' },
				{ startIndex:18, type: 'delimiter.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $myVar = 5 + (10 * 2); ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'delimiter.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'number.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'delimiter.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'delimiter.parenthesis.php' },
				{ startIndex:20, type: 'number.php' },
				{ startIndex:22, type: '' },
				{ startIndex:23, type: 'delimiter.php' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: 'number.php' },
				{ startIndex:26, type: 'delimiter.parenthesis.php' },
				{ startIndex:27, type: 'delimiter.php' },
				{ startIndex:28, type: '' },
				{ startIndex:29, type: 'metatag.php' }
			]}],

			// Keywords
			[{
			line: '<?php function myFunc() { } ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:21, type: 'delimiter.parenthesis.php' },
				{ startIndex:23, type: '' },
				{ startIndex:24, type: 'delimiter.bracket.php' },
				{ startIndex:25, type: '' },
				{ startIndex:26, type: 'delimiter.bracket.php' },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: 'metatag.php' }
			]}],

			[{
			line: '<?php function ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php if ($start > 52) { $start = 0; } ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.parenthesis.php' },
				{ startIndex:10, type: 'variable.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'delimiter.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'number.php' },
				{ startIndex:21, type: 'delimiter.parenthesis.php' },
				{ startIndex:22, type: '' },
				{ startIndex:23, type: 'delimiter.bracket.php' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: 'variable.php' },
				{ startIndex:31, type: '' },
				{ startIndex:32, type: 'delimiter.php' },
				{ startIndex:33, type: '' },
				{ startIndex:34, type: 'number.php' },
				{ startIndex:35, type: 'delimiter.php' },
				{ startIndex:36, type: '' },
				{ startIndex:37, type: 'delimiter.bracket.php' },
				{ startIndex:38, type: '' },
				{ startIndex:39, type: 'metatag.php' }
			]}],

			[{
			line: '<?php if (true) { $start = 0; } ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.parenthesis.php' },
				{ startIndex:10, type: 'keyword.php' },
				{ startIndex:14, type: 'delimiter.parenthesis.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'delimiter.bracket.php' },
				{ startIndex:17, type: '' },
				{ startIndex:18, type: 'variable.php' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: 'delimiter.php' },
				{ startIndex:26, type: '' },
				{ startIndex:27, type: 'number.php' },
				{ startIndex:28, type: 'delimiter.php' },
				{ startIndex:29, type: '' },
				{ startIndex:30, type: 'delimiter.bracket.php' },
				{ startIndex:31, type: '' },
				{ startIndex:32, type: 'metatag.php' }
			]}],

			[{
			line: '<?php abstract ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php and ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php array ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php as ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'metatag.php' }
			]}],

			[{
			line: '<?php break ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php case ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php catch ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php cfunction ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php class ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php clone ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php const ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php continue ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php declare ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php default ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php do ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'metatag.php' }
			]}],

			[{
			line: '<?php else ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php elseif ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php enddeclare ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php endfor ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php endforeach ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php endif ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php endswitch ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php endwhile ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php extends ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php false ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php final ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php for ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php foreach ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php function ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php global ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php goto ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php if ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'metatag.php' }
			]}],

			[{
			line: '<?php implements ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php interface ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php instanceof ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php namespace ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php new ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php null ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php object ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php old_function ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'metatag.php' }
			]}],

			[{
			line: '<?php or ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'metatag.php' }
			]}],

			[{
			line: '<?php private ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php protected ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php public ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php resource ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php static ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php switch ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php throw ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php try ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php true ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php use ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php var ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php while ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php xor ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php die ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php echo ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php empty ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php exit ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php eval ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php include ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php include_once ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'metatag.php' }
			]}],

			[{
			line: '<?php isset ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php list ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php require ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php require_once ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'metatag.php' }
			]}],

			[{
			line: '<?php return ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php print ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php unset ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __construct ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:17, type: '' },
				{ startIndex:18, type: 'metatag.php' }
			]}],

			// Compile Time Constants
			[{
			line: '<?php __FILE__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $myscript = __FILE__; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'delimiter.php' },
				{ startIndex:17, type: '' },
				{ startIndex:18, type: 'constant.php' },
				{ startIndex:26, type: 'delimiter.php' },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __CLASS__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __DIR__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __LINE__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __NAMESPACE__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __METHOD__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __FUNCTION__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: 'metatag.php' }
			]}],

			[{
			line: '<?php __TRAIT__ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'constant.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			// Predefined Variables
			[{
			line: '<?php $_ENV ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php echo $_ENV; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'keyword.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'variable.predefined.php' },
				{ startIndex:16, type: 'delimiter.php' },
				{ startIndex:17, type: '' },
				{ startIndex:18, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $GLOBALS ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_SERVER ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_GET ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_POST ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_FILES ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_REQUEST ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_SESSION ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_ENV ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $_COOKIE ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:14, type: '' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $php_errormsg ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $HTTP_RAW_POST_DATA ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:25, type: '' },
				{ startIndex:26, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $http_response_header ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $argc ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $argv ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.predefined.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			// Comments - single line
			[{
			line: '<?php // a',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php / / / not a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' }
			]}],

			[{
			line: '<?php    // a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:9, type: 'comment.php' }
			]}],

			[{
			line: '<?php // a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php //sticky comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php /almost a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' }
			]}],

			[{
			line: '<?php $x = 1; // my comment // is a nice one',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'number.php' },
				{ startIndex:12, type: 'delimiter.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'comment.php' }
			]}],

			// Comments - range comment, single line
			[{
			line: '<?php /* a simple comment */ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' },
				{ startIndex:28, type: '' },
				{ startIndex:29, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $x = /* a simple comment */ 1; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'comment.php' },
				{ startIndex:33, type: '' },
				{ startIndex:34, type: 'number.php' },
				{ startIndex:35, type: 'delimiter.php' },
				{ startIndex:36, type: '' },
				{ startIndex:37, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $x = /* comment */ 1; */ ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'comment.php' },
				{ startIndex:24, type: '' },
				{ startIndex:25, type: 'number.php' },
				{ startIndex:26, type: 'delimiter.php' },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: 'delimiter.php' },
				{ startIndex:29, type: '' },
				{ startIndex:31, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $x = /**/; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'comment.php' },
				{ startIndex:15, type: 'delimiter.php' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $x = /*/;',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'comment.php' }
			]}],

			// Comments - range comment, multi lines
			[{
			line: '<?php /* a multiline comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}, {
			line: 'can actually span',
			tokens: [
				{ startIndex:0, type: 'comment.php' }
			]}, {
			line: 'multiple lines */',
			tokens: [
				{ startIndex:0, type: 'comment.php' }
			]}],

			[{
			line: '<?php $x = /* start a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'comment.php' }
			]}, {
			line: ' a ',
			tokens: [
				{ startIndex:0, type: 'comment.php' }
			]}, {
			line: 'and end it */ var a = 2;',
			tokens: [
				{ startIndex:0, type: 'comment.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'keyword.php' },
				{ startIndex:17, type: '' },
				{ startIndex:20, type: 'delimiter.php' },
				{ startIndex:21, type: '' },
				{ startIndex:22, type: 'number.php' },
				{ startIndex:23, type: 'delimiter.php' }
			]}],

			// Strings
			[{
			line: '<?php $a = \'a\'; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'string.php' },
				{ startIndex:14, type: 'delimiter.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'metatag.php' }
			]}],

			[{
			line: '<?php \'use strict\'; ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'string.php' },
				{ startIndex:18, type: 'delimiter.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			[{
			line: '<?php $b = $a + " \'cool\'  " ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'variable.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'delimiter.php' },
				{ startIndex:15, type: '' },
				{ startIndex:16, type: 'string.php' },
				{ startIndex:27, type: '' },
				{ startIndex:28, type: 'metatag.php' }
			]}],

			[{
			line: '<?php \'\'\'',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'string.php' }
			]}],

			[{
			line: '<?php "multiline',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'string.php' }
			]}, {
			line: 'strings";',
			tokens: [
				{ startIndex:0, type: 'string.php' },
				{ startIndex:8, type: 'delimiter.php' }
			]}],

			// Numbers
			[{
			line: '<?php 0 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.php' },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0+0 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.php' },
				{ startIndex:7, type: 'delimiter.php' },
				{ startIndex:8, type: 'number.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 100+10 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.php' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: 'number.php' },
				{ startIndex:12, type: '' },
				{ startIndex:13, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0 + 0 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.php' },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: 'delimiter.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'number.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0123 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.octal.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 01239 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0x ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.hex.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0x123 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.hex.php' },
				{ startIndex:11, type: '' },
				{ startIndex:12, type: 'metatag.php' }
			]}],

			[{
			line: '<?php 0b1 ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'number.binary.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php { } ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'delimiter.bracket.php' },
				{ startIndex:7, type: '' },
				{ startIndex:8, type: 'delimiter.bracket.php' },
				{ startIndex:9, type: '' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<?php [1,2,3] ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'delimiter.array.php' },
				{ startIndex:7, type: 'number.php' },
				{ startIndex:8, type: 'delimiter.php' },
				{ startIndex:9, type: 'number.php' },
				{ startIndex:10, type: 'delimiter.php' },
				{ startIndex:11, type: 'number.php' },
				{ startIndex:12, type: 'delimiter.array.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'metatag.php' }
			]}],

			[{
			line: '<?php foo(123);',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:9, type: 'delimiter.parenthesis.php' },
				{ startIndex:10, type: 'number.php' },
				{ startIndex:13, type: 'delimiter.parenthesis.php' },
				{ startIndex:14, type: 'delimiter.php' }
			]}],

			[{
			line: '<?php $x = "[{()}]" ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'string.php' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'metatag.php' }
			]}],

			// Comments - comment with sharp
			[{
			line: '<?php # a',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php ## a',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php    # a comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:9, type: 'comment.php' }
			]}],

			[{
			line: '<?php #sticky comment',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' }
			]}],

			[{
			line: '<?php $x = 1; # my comment // is a nice one',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'variable.php' },
				{ startIndex:8, type: '' },
				{ startIndex:9, type: 'delimiter.php' },
				{ startIndex:10, type: '' },
				{ startIndex:11, type: 'number.php' },
				{ startIndex:12, type: 'delimiter.php' },
				{ startIndex:13, type: '' },
				{ startIndex:14, type: 'comment.php' }
			]}],

			[{
			line: '<?php # comment?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:6, type: 'comment.php' },
				{ startIndex:15, type: 'metatag.php' }
			]}],

			// 3-languages parser

			// php
			[{
			line: '<?=\'hi\'?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:3, type: 'string.php' },
				{ startIndex:7, type: 'metatag.php' }
			]}],

			// php/html/php
			[{
			line: '<?php5+3?><abc><?=1?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: 'number.php' },
				{ startIndex:6, type: 'delimiter.php' },
				{ startIndex:7, type: 'number.php' },
				{ startIndex:8, type: 'metatag.php' },
				{ startIndex:10, type: htmlTokenTypes.DELIM_START },
				{ startIndex:11, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:14, type: htmlTokenTypes.DELIM_START },
				{ startIndex:15, type: 'metatag.php' },
				{ startIndex:18, type: 'number.php' },
				{ startIndex:19, type: 'metatag.php' }
			]}],

			// html/php/html
			[{
			line: '<abc><?php5+3?><abc>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:4, type: htmlTokenTypes.DELIM_START },
				{ startIndex:5, type: 'metatag.php' },
				{ startIndex:10, type: 'number.php' },
				{ startIndex:11, type: 'delimiter.php' },
				{ startIndex:12, type: 'number.php' },
				{ startIndex:13, type: 'metatag.php' },
				{ startIndex:15, type: htmlTokenTypes.DELIM_START },
				{ startIndex:16, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:19, type: htmlTokenTypes.DELIM_START }
			]}],

			// html/js/php/html
			[{
			line: '<abc><script>var i= 10;</script><?php5+3?><abc>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:4, type: htmlTokenTypes.DELIM_START },
				{ startIndex:5, type: htmlTokenTypes.DELIM_START },
				{ startIndex:6, type: htmlTokenTypes.getTag('script') },
				{ startIndex:12, type: htmlTokenTypes.DELIM_START },
				{ startIndex:13, type: 'keyword.js' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'identifier.js' },
				{ startIndex:18, type: 'delimiter.js' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'number.js' },
				{ startIndex:22, type: 'delimiter.js' },
				{ startIndex:23, type: htmlTokenTypes.DELIM_END },
				{ startIndex:25, type: htmlTokenTypes.getTag('script') },
				{ startIndex:31, type: htmlTokenTypes.DELIM_END },
				{ startIndex:32, type: 'metatag.php' },
				{ startIndex:37, type: 'number.php' },
				{ startIndex:38, type: 'delimiter.php' },
				{ startIndex:39, type: 'number.php' },
				{ startIndex:40, type: 'metatag.php' },
				{ startIndex:42, type: htmlTokenTypes.DELIM_START },
				{ startIndex:43, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:46, type: htmlTokenTypes.DELIM_START }
			]}],

			// html/js/php/js/
			[{
			line: '<abc><script>var i= 10;</script><?php5+3?><script>var x= 15;</script>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('abc') },
				{ startIndex:4, type: htmlTokenTypes.DELIM_START },
				{ startIndex:5, type: htmlTokenTypes.DELIM_START },
				{ startIndex:6, type: htmlTokenTypes.getTag('script') },
				{ startIndex:12, type: htmlTokenTypes.DELIM_START },
				{ startIndex:13, type: 'keyword.js' },
				{ startIndex:16, type: '' },
				{ startIndex:17, type: 'identifier.js' },
				{ startIndex:18, type: 'delimiter.js' },
				{ startIndex:19, type: '' },
				{ startIndex:20, type: 'number.js' },
				{ startIndex:22, type: 'delimiter.js' },
				{ startIndex:23, type: htmlTokenTypes.DELIM_END },
				{ startIndex:25, type: htmlTokenTypes.getTag('script') },
				{ startIndex:31, type: htmlTokenTypes.DELIM_END },
				{ startIndex:32, type: 'metatag.php' },
				{ startIndex:37, type: 'number.php' },
				{ startIndex:38, type: 'delimiter.php' },
				{ startIndex:39, type: 'number.php' },
				{ startIndex:40, type: 'metatag.php' },
				{ startIndex:42, type: htmlTokenTypes.DELIM_START },
				{ startIndex:43, type: htmlTokenTypes.getTag('script') },
				{ startIndex:49, type: htmlTokenTypes.DELIM_START },
				{ startIndex:50, type: 'keyword.js' },
				{ startIndex:53, type: '' },
				{ startIndex:54, type: 'identifier.js' },
				{ startIndex:55, type: 'delimiter.js' },
				{ startIndex:56, type: '' },
				{ startIndex:57, type: 'number.js' },
				{ startIndex:59, type: 'delimiter.js' },
				{ startIndex:60, type: htmlTokenTypes.DELIM_END },
				{ startIndex:62, type: htmlTokenTypes.getTag('script') },
				{ startIndex:68, type: htmlTokenTypes.DELIM_END }
			]}],

			// Multiline test
			[{
			line: '<html>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('html') },
				{ startIndex:5, type: htmlTokenTypes.DELIM_START }
			]}, {
			line: '<style><?="div"?>{ color:blue; }</style>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('style') },
				{ startIndex:6, type: htmlTokenTypes.DELIM_START },
				{ startIndex:7, type: 'metatag.php' },
				{ startIndex:10, type: 'string.php' },
				{ startIndex:15, type: 'metatag.php' },
				{ startIndex:17, type: 'punctuation.bracket.css' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: cssTokenTypes.TOKEN_PROPERTY + '.css' },
				{ startIndex:24, type: 'punctuation.css' },
				{ startIndex:25, type: cssTokenTypes.TOKEN_VALUE + '.css' },
				{ startIndex:29, type: 'punctuation.css' },
				{ startIndex:30, type: '' },
				{ startIndex:31, type: 'punctuation.bracket.css' },
				{ startIndex:32, type: htmlTokenTypes.DELIM_END },
				{ startIndex:34, type: htmlTokenTypes.getTag('style') },
				{ startIndex:39, type: htmlTokenTypes.DELIM_END }
			]}, {
			line: '<style><?="div"?>{ color:blue; }</style>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('style') },
				{ startIndex:6, type: htmlTokenTypes.DELIM_START },
				{ startIndex:7, type: 'metatag.php' },
				{ startIndex:10, type: 'string.php' },
				{ startIndex:15, type: 'metatag.php' },
				{ startIndex:17, type: 'punctuation.bracket.css' },
				{ startIndex:18, type: '' },
				{ startIndex:19, type: cssTokenTypes.TOKEN_PROPERTY + '.css' },
				{ startIndex:24, type: 'punctuation.css' },
				{ startIndex:25, type: cssTokenTypes.TOKEN_VALUE + '.css' },
				{ startIndex:29, type: 'punctuation.css' },
				{ startIndex:30, type: '' },
				{ startIndex:31, type: 'punctuation.bracket.css' },
				{ startIndex:32, type: htmlTokenTypes.DELIM_END },
				{ startIndex:34, type: htmlTokenTypes.getTag('style') },
				{ startIndex:39, type: htmlTokenTypes.DELIM_END }
			]}],

			// HTML (CSS (PHP)), HTML ( PHP, JS (PHP), PHP)
			[{
			line: '<html><style><?="div"?> { color:blue; }</style><!--<?="HTML Comment"?>--><script>var x = 3;/* <?="JS Comment"/*</script>*/?> */var y = 4;</script></html><? $x = 3;?>',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('html') },
				{ startIndex:5, type: htmlTokenTypes.DELIM_START },
				{ startIndex:6, type: htmlTokenTypes.DELIM_START },
				{ startIndex:7, type: htmlTokenTypes.getTag('style') },
				{ startIndex:12, type: htmlTokenTypes.DELIM_START },
				{ startIndex:13, type: 'metatag.php' },
				{ startIndex:16, type: 'string.php' },
				{ startIndex:21, type: 'metatag.php' },
				{ startIndex:23, type: '' },
				{ startIndex:24, type: 'punctuation.bracket.css' },
				{ startIndex:25, type: '' },
				{ startIndex:26, type: cssTokenTypes.TOKEN_PROPERTY + '.css' },
				{ startIndex:31, type: 'punctuation.css' },
				{ startIndex:32, type: cssTokenTypes.TOKEN_VALUE + '.css' },
				{ startIndex:36, type: 'punctuation.css' },
				{ startIndex:37, type: '' },
				{ startIndex:38, type: 'punctuation.bracket.css' },
				{ startIndex:39, type: htmlTokenTypes.DELIM_END },
				{ startIndex:41, type: htmlTokenTypes.getTag('style') },
				{ startIndex:46, type: htmlTokenTypes.DELIM_END },
				{ startIndex:47, type: htmlTokenTypes.DELIM_COMMENT },
				{ startIndex:51, type: 'metatag.php' },
				{ startIndex:54, type: 'string.php' },
				{ startIndex:68, type: 'metatag.php' },
				{ startIndex:70, type: htmlTokenTypes.DELIM_COMMENT },
				{ startIndex:73, type: htmlTokenTypes.DELIM_START },
				{ startIndex:74, type: htmlTokenTypes.getTag('script') },
				{ startIndex:80, type: htmlTokenTypes.DELIM_START },
				{ startIndex:81, type: 'keyword.js' },
				{ startIndex:84, type: '' },
				{ startIndex:85, type: 'identifier.js' },
				{ startIndex:86, type: '' },
				{ startIndex:87, type: 'delimiter.js' },
				{ startIndex:88, type: '' },
				{ startIndex:89, type: 'number.js' },
				{ startIndex:90, type: 'delimiter.js' },
				{ startIndex:91, type: 'comment.js' },
				{ startIndex:94, type: 'metatag.php' },
				{ startIndex:97, type: 'string.php' },
				{ startIndex:109, type: 'comment.php' },
				{ startIndex:122, type: 'metatag.php' },
				{ startIndex:124, type: 'comment.js' },
				{ startIndex:127, type: 'keyword.js' },
				{ startIndex:130, type: '' },
				{ startIndex:131, type: 'identifier.js' },
				{ startIndex:132, type: '' },
				{ startIndex:133, type: 'delimiter.js' },
				{ startIndex:134, type: '' },
				{ startIndex:135, type: 'number.js' },
				{ startIndex:136, type: 'delimiter.js' },
				{ startIndex:137, type: htmlTokenTypes.DELIM_END },
				{ startIndex:139, type: htmlTokenTypes.getTag('script') },
				{ startIndex:145, type: htmlTokenTypes.DELIM_END },
				{ startIndex:146, type: htmlTokenTypes.DELIM_END },
				{ startIndex:148, type: htmlTokenTypes.getTag('html') },
				{ startIndex:152, type: htmlTokenTypes.DELIM_END },
				{ startIndex:153, type: 'metatag.php' },
				{ startIndex:155, type: '' },
				{ startIndex:156, type: 'variable.php' },
				{ startIndex:158, type: '' },
				{ startIndex:159, type: 'delimiter.php' },
				{ startIndex:160, type: '' },
				{ startIndex:161, type: 'number.php' },
				{ startIndex:162, type: 'delimiter.php' },
				{ startIndex:163, type: 'metatag.php' }
			]}],

			// PHP-tag detection
			[{
			line: '<!--c--><?',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_COMMENT },
				{ startIndex:4, type: htmlTokenTypes.COMMENT },
				{ startIndex:5, type: htmlTokenTypes.DELIM_COMMENT },
				{ startIndex:8, type: 'metatag.php' }
			]}],

			[{
			line: '<script>//<?',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('script') },
				{ startIndex:7, type: htmlTokenTypes.DELIM_START },
				{ startIndex:8, type: 'comment.js' },
				{ startIndex:10, type: 'metatag.php' }
			]}],

			[{
			line: '<script>"<?php5+3?>"',
			tokens: [
				{ startIndex:0, type: htmlTokenTypes.DELIM_START },
				{ startIndex:1, type: htmlTokenTypes.getTag('script') },
				{ startIndex:7, type: htmlTokenTypes.DELIM_START },
				{ startIndex:8, type: 'string.js' },
				{ startIndex:9, type: 'metatag.php' },
				{ startIndex:14, type: 'number.php' },
				{ startIndex:15, type: 'delimiter.php' },
				{ startIndex:16, type: 'number.php' },
				{ startIndex:17, type: 'metatag.php' },
				{ startIndex:19, type: 'string.js' }
			]}],

			[{
			line: '<?php toString(); ?>',
			tokens: [
				{ startIndex:0, type: 'metatag.php' },
				{ startIndex:5, type: '' },
				{ startIndex:14, type: 'delimiter.parenthesis.php' },
				{ startIndex:16, type: 'delimiter.php' },
				{ startIndex:17, type: '' },
				{ startIndex:18, type: 'metatag.php' }
			]}]
		]);
	});

	test('Word definition', function() {
		assertWords('a b cde'.match(wordDefinition), ['a', 'b', 'cde']);
		assertWords('$count = count($cards);'.match(wordDefinition), ['$count', 'count', '$cards']);
	});

	test('onEnter', function() {
		assertOnEnter.indents('', 'if (true) {', '');
		assertOnEnter.indents('', '$arr = [', '');
		assertOnEnter.indentsOutdents('', '$arr = [', ']');
	});
});
