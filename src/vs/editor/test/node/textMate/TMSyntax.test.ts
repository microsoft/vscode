/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { decodeTextMateToken, decodeTextMateTokens, DecodeMap, TMScopeRegistry, TMLanguageRegistration } from 'vs/editor/node/textMate/TMSyntax';
import { TMState } from 'vs/editor/node/textMate/TMState';

suite('TextMate.TMScopeRegistry', () => {

	test('getFilePath', () => {
		let registry = new TMScopeRegistry();

		registry.register('source.a', './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), null);
		assert.equal(registry.getFilePath('b'), null);

		registry.register('source.b', './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('b'), null);

		registry.register('source.a', './grammar/ax.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/ax.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('b'), null);
	});

	test('scopeToLanguage', () => {
		let registry = new TMScopeRegistry();
		registry.register('source.html', './grammar/html.tmLanguage', {
			'source.html': 'html',
			'source.c': 'c',
			'source.css': 'css',
			'source.js': 'javascript',
			'source.python': 'python',
			'source.smarty': 'smarty',
			'source.baz': null,
		});
		let languageRegistration = registry.getLanguageRegistration('source.html');

		// exact matches
		assert.equal(languageRegistration.scopeToLanguage('source.html'), 'html');
		assert.equal(languageRegistration.scopeToLanguage('source.css'), 'css');
		assert.equal(languageRegistration.scopeToLanguage('source.c'), 'c');
		assert.equal(languageRegistration.scopeToLanguage('source.js'), 'javascript');
		assert.equal(languageRegistration.scopeToLanguage('source.python'), 'python');
		assert.equal(languageRegistration.scopeToLanguage('source.smarty'), 'smarty');

		// prefix matches
		assert.equal(languageRegistration.scopeToLanguage('source.css.embedded.html'), 'css');
		assert.equal(languageRegistration.scopeToLanguage('source.js.embedded.html'), 'javascript');
		assert.equal(languageRegistration.scopeToLanguage('source.python.embedded.html'), 'python');
		assert.equal(languageRegistration.scopeToLanguage('source.smarty.embedded.html'), 'smarty');

		// misses
		assert.equal(languageRegistration.scopeToLanguage('source.ts'), null);
		assert.equal(languageRegistration.scopeToLanguage('source.csss'), null);
		assert.equal(languageRegistration.scopeToLanguage('source.baz'), null);
		assert.equal(languageRegistration.scopeToLanguage('asource.css'), null);
		assert.equal(languageRegistration.scopeToLanguage('a.source.css'), null);
		assert.equal(languageRegistration.scopeToLanguage('source_css'), null);
		assert.equal(languageRegistration.scopeToLanguage('punctuation.definition.tag.html'), null);
	});

});

suite('TextMate.decodeTextMateTokens', () => {

	test('embedded modes', () => {
		let registry = new TMScopeRegistry();
		registry.register('source.html', './grammar/html.tmLanguage', {
			'source.html': 'html',
			'source.c': 'c',
			'source.css': 'css',
			'source.js': 'javascript',
			'source.python': 'python',
			'source.smarty': 'smarty',
			'source.baz': null,
		});
		let languageRegistration = registry.getLanguageRegistration('source.html');

		let decodeMap = new DecodeMap(languageRegistration);
		let actual = decodeTextMateTokens(
			'text<style>body{}</style><script>var x=3;</script>text',
			0,
			decodeMap,
			[
				{ startIndex: 0, endIndex: 4, scopes: ['source.html'] },
				{ startIndex: 4, endIndex: 11, scopes: ['source.html', 'style.tag.open'] },
				{ startIndex: 11, endIndex: 17, scopes: ['source.html', 'source.css'] },
				{ startIndex: 17, endIndex: 25, scopes: ['source.html', 'style.tag.close'] },
				{ startIndex: 25, endIndex: 33, scopes: ['source.html', 'script.tag.open'] },
				{ startIndex: 33, endIndex: 41, scopes: ['source.html', 'source.js'] },
				{ startIndex: 41, endIndex: 50, scopes: ['source.html', 'script.tag.close'] },
				{ startIndex: 50, endIndex: 54, scopes: ['source.html'] },
			],
			new TMState('html', null, null)
		);

		let actualModeTransitions = actual.modeTransitions.map((t) => { return { startIndex: t.startIndex, modeId: t.modeId }; });

		assert.deepEqual(actualModeTransitions, [
			{ startIndex: 0, modeId: 'html' },
			{ startIndex: 11, modeId: 'css' },
			{ startIndex: 17, modeId: 'html' },
			{ startIndex: 33, modeId: 'javascript' },
			{ startIndex: 41, modeId: 'html' },
		]);
	});

	test('php and embedded', () => {
		var tests = [
			{
				line: '<div></div>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.tag.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 4, scopes: ['text.html.php', 'meta.tag.any.html', 'entity.name.tag.html'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.php', 'meta.tag.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.php', 'meta.tag.any.html', 'punctuation.definition.tag.html', 'meta.scope.between-tag-pair.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.php', 'meta.tag.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 7, endIndex: 10, scopes: ['text.html.php', 'meta.tag.any.html', 'entity.name.tag.html'] },
					{ startIndex: 10, endIndex: 11, scopes: ['text.html.php', 'meta.tag.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.any.html.punctuation.definition' },
					{ startIndex: 1, type: 'meta.tag.any.html.entity.name' },
					{ startIndex: 4, type: 'meta.tag.any.html.punctuation.definition' },
					{ startIndex: 5, type: 'meta.tag.any.html.punctuation.definition.scope.between-tag-pair' },
					{ startIndex: 6, type: 'meta.tag.any.html.punctuation.definition' },
					{ startIndex: 7, type: 'meta.tag.any.html.entity.name' },
					{ startIndex: 10, type: 'meta.tag.any.html.punctuation.definition' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'html' }
				]
			}, {
				line: '<script>var x = 3;</script>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 7, scopes: ['text.html.php', 'entity.name.tag.script.html'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.php', 'source.js.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 8, endIndex: 11, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js', 'storage.type.js'] },
					{ startIndex: 11, endIndex: 12, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js'] },
					{ startIndex: 12, endIndex: 13, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js', 'meta.var-single-variable.expr.js', 'variable.other.readwrite.js'] },
					{ startIndex: 13, endIndex: 14, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js', 'meta.var-single-variable.expr.js'] },
					{ startIndex: 14, endIndex: 15, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js', 'keyword.operator.assignment.js'] },
					{ startIndex: 15, endIndex: 16, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js'] },
					{ startIndex: 16, endIndex: 17, scopes: ['text.html.php', 'source.js.embedded.html', 'meta.var.expr.js', 'constant.numeric.decimal.js'] },
					{ startIndex: 17, endIndex: 18, scopes: ['text.html.php', 'source.js.embedded.html', 'punctuation.terminator.statement.js'] },
					{ startIndex: 18, endIndex: 20, scopes: ['text.html.php', 'source.js.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 20, endIndex: 26, scopes: ['text.html.php', 'source.js.embedded.html', 'entity.name.tag.script.html'] },
					{ startIndex: 26, endIndex: 27, scopes: ['text.html.php', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'tag.html.punctuation.definition' },
					{ startIndex: 1, type: 'tag.html.entity.name.script' },
					{ startIndex: 7, type: 'tag.html.punctuation.definition.source.js.embedded' },
					{ startIndex: 8, type: 'meta.html.source.js.embedded.var.expr.storage.type' },
					{ startIndex: 11, type: 'meta.html.source.js.embedded.var.expr' },
					{ startIndex: 12, type: 'meta.html.source.js.embedded.var.expr.var-single-variable.variable.other.readwrite' },
					{ startIndex: 13, type: 'meta.html.source.js.embedded.var.expr.var-single-variable' },
					{ startIndex: 14, type: 'meta.html.source.js.embedded.var.expr.keyword.operator.assignment' },
					{ startIndex: 15, type: 'meta.html.source.js.embedded.var.expr' },
					{ startIndex: 16, type: 'meta.html.source.js.embedded.var.expr.constant.numeric.decimal' },
					{ startIndex: 17, type: 'html.punctuation.source.js.embedded.terminator.statement' },
					{ startIndex: 18, type: 'tag.html.punctuation.definition.source.js.embedded' },
					{ startIndex: 20, type: 'tag.html.entity.name.script.source.js.embedded' },
					{ startIndex: 26, type: 'tag.html.punctuation.definition' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'html' },
					{ startIndex: 7, modeId: 'javascript' },
					{ startIndex: 26, modeId: 'html' }
				]
			}, {
				line: '<style>body{background-color:red;}</style>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 6, scopes: ['text.html.php', 'entity.name.tag.style.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.php', 'source.css.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 7, endIndex: 11, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.selector.css', 'entity.name.tag.css'] },
					{ startIndex: 11, endIndex: 12, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.begin.css'] },
					{ startIndex: 12, endIndex: 28, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-name.css', 'support.type.property-name.css'] },
					{ startIndex: 28, endIndex: 29, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'punctuation.separator.key-value.css'] },
					{ startIndex: 29, endIndex: 32, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'support.constant.color.w3c-standard-color-name.css'] },
					{ startIndex: 32, endIndex: 33, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'punctuation.terminator.rule.css'] },
					{ startIndex: 33, endIndex: 34, scopes: ['text.html.php', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.end.css'] },
					{ startIndex: 34, endIndex: 36, scopes: ['text.html.php', 'punctuation.definition.tag.html'] },
					{ startIndex: 36, endIndex: 41, scopes: ['text.html.php', 'entity.name.tag.style.html'] },
					{ startIndex: 41, endIndex: 42, scopes: ['text.html.php', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'tag.html.punctuation.definition' },
					{ startIndex: 1, type: 'tag.html.entity.name.style' },
					{ startIndex: 6, type: 'tag.html.punctuation.definition.source.embedded.css' },
					{ startIndex: 7, type: 'meta.tag.html.entity.name.source.embedded.css.selector' },
					{ startIndex: 11, type: 'meta.html.punctuation.source.embedded.css.property-list.section.begin' },
					{ startIndex: 12, type: 'meta.html.source.embedded.type.css.property-list.property-name.support' },
					{ startIndex: 28, type: 'meta.html.punctuation.source.embedded.css.property-list.property-value.separator.key-value' },
					{ startIndex: 29, type: 'meta.html.source.embedded.constant.css.property-list.support.property-value.color.w3c-standard-color-name' },
					{ startIndex: 32, type: 'meta.html.punctuation.source.embedded.terminator.css.property-list.property-value.rule' },
					{ startIndex: 33, type: 'meta.html.punctuation.source.embedded.css.property-list.section.end' },
					{ startIndex: 34, type: 'tag.html.punctuation.definition' },
					{ startIndex: 36, type: 'tag.html.entity.name.style' },
					{ startIndex: 41, type: 'tag.html.punctuation.definition' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'html' },
					{ startIndex: 6, modeId: 'css' },
					{ startIndex: 34, modeId: 'html' }
				]
			}, {
				line: '<?php',
				tmTokens: [
					{ startIndex: 0, endIndex: 5, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.begin.php'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.punctuation.embedded.section.begin.block.php.metatag' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'html' }
				]
			}, {
				line: '$query = \"SELECT col1, col2 FROM db; -- selects from sql\"; ',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'variable.other.php', 'punctuation.definition.variable.php'] },
					{ startIndex: 1, endIndex: 6, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'variable.other.php'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'keyword.operator.assignment.php'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 9, endIndex: 10, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'punctuation.definition.string.begin.php'] },
					{ startIndex: 10, endIndex: 16, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'source.sql.embedded.php', 'keyword.other.DML.sql'] },
					{ startIndex: 16, endIndex: 28, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'source.sql.embedded.php'] },
					{ startIndex: 28, endIndex: 32, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'source.sql.embedded.php', 'keyword.other.DML.sql'] },
					{ startIndex: 32, endIndex: 37, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'source.sql.embedded.php'] },
					{ startIndex: 37, endIndex: 56, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'source.sql.embedded.php', 'comment.line.double-dash.sql'] },
					{ startIndex: 56, endIndex: 57, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.sql.php', 'punctuation.definition.string.end.php'] },
					{ startIndex: 57, endIndex: 58, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'punctuation.terminator.expression.php'] },
					{ startIndex: 58, endIndex: 60, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.punctuation.definition.source.embedded.variable.other.block.php' },
					{ startIndex: 1, type: 'meta.source.embedded.variable.other.block.php' },
					{ startIndex: 6, type: 'meta.source.embedded.block.php' },
					{ startIndex: 7, type: 'meta.source.embedded.keyword.operator.assignment.block.php' },
					{ startIndex: 8, type: 'meta.source.embedded.block.php' },
					{ startIndex: 9, type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double.sql' },
					{ startIndex: 10, type: 'meta.source.embedded.other.keyword.block.php.string.quoted.double.sql.DML' },
					{ startIndex: 16, type: 'meta.source.embedded.block.php.string.quoted.double.sql' },
					{ startIndex: 28, type: 'meta.source.embedded.other.keyword.block.php.string.quoted.double.sql.DML' },
					{ startIndex: 32, type: 'meta.source.embedded.block.php.string.quoted.double.sql' },
					{ startIndex: 37, type: 'meta.source.embedded.block.php.string.quoted.double.sql.comment.line.double-dash' },
					{ startIndex: 56, type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double.sql' },
					{ startIndex: 57, type: 'meta.punctuation.source.embedded.terminator.block.php.expression' },
					{ startIndex: 58, type: 'meta.source.embedded.block.php' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'php' },
					{ startIndex: 10, modeId: 'sql' },
					{ startIndex: 56, modeId: 'php' }
				]
			}, {
				line: '$a = <<<JSON { \"3\": \"4\" } JSON;',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'variable.other.php', 'punctuation.definition.variable.php'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'variable.other.php'] },
					{ startIndex: 2, endIndex: 3, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 3, endIndex: 4, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'keyword.operator.assignment.php'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'keyword.operator.comparison.php'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'keyword.operator.comparison.php'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'keyword.operator.comparison.php'] },
					{ startIndex: 8, endIndex: 12, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'constant.other.php'] },
					{ startIndex: 12, endIndex: 13, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 13, endIndex: 14, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'punctuation.section.scope.begin.php'] },
					{ startIndex: 14, endIndex: 15, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 15, endIndex: 16, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.begin.php'] },
					{ startIndex: 16, endIndex: 17, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'meta.string-contents.quoted.double.php'] },
					{ startIndex: 17, endIndex: 18, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.end.php'] },
					{ startIndex: 18, endIndex: 20, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 20, endIndex: 21, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.begin.php'] },
					{ startIndex: 21, endIndex: 22, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'meta.string-contents.quoted.double.php'] },
					{ startIndex: 22, endIndex: 23, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.end.php'] },
					{ startIndex: 23, endIndex: 24, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 24, endIndex: 25, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'punctuation.section.scope.end.php'] },
					{ startIndex: 25, endIndex: 26, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php'] },
					{ startIndex: 26, endIndex: 30, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'constant.other.php'] },
					{ startIndex: 30, endIndex: 31, scopes: ['text.html.php', 'meta.embedded.block.php', 'source.php', 'punctuation.terminator.expression.php'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.punctuation.definition.source.embedded.variable.other.block.php' },
					{ startIndex: 1, type: 'meta.source.embedded.variable.other.block.php' },
					{ startIndex: 2, type: 'meta.source.embedded.block.php' },
					{ startIndex: 3, type: 'meta.source.embedded.keyword.operator.assignment.block.php' },
					{ startIndex: 4, type: 'meta.source.embedded.block.php' },
					{ startIndex: 5, type: 'meta.source.embedded.keyword.operator.block.php.comparison' },
					{ startIndex: 8, type: 'meta.source.embedded.other.constant.block.php' },
					{ startIndex: 12, type: 'meta.source.embedded.block.php' },
					{ startIndex: 13, type: 'meta.punctuation.scope.source.embedded.section.begin.block.php' },
					{ startIndex: 14, type: 'meta.source.embedded.block.php' },
					{ startIndex: 15, type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double' },
					{ startIndex: 16, type: 'meta.source.embedded.block.php.string.quoted.double.string-contents' },
					{ startIndex: 17, type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double' },
					{ startIndex: 18, type: 'meta.source.embedded.block.php' },
					{ startIndex: 20, type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double' },
					{ startIndex: 21, type: 'meta.source.embedded.block.php.string.quoted.double.string-contents' },
					{ startIndex: 22, type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double' },
					{ startIndex: 23, type: 'meta.source.embedded.block.php' },
					{ startIndex: 24, type: 'meta.punctuation.scope.source.embedded.section.end.block.php' },
					{ startIndex: 25, type: 'meta.source.embedded.block.php' },
					{ startIndex: 26, type: 'meta.source.embedded.other.constant.block.php' },
					{ startIndex: 30, type: 'meta.punctuation.source.embedded.terminator.block.php.expression' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'php' }
				]
			}, {
				line: '?>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.end.php', 'source.php'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.end.php'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.punctuation.source.embedded.section.end.block.php.metatag' },
					{ startIndex: 1, type: 'meta.punctuation.embedded.section.end.block.php.metatag' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'php' },
					{ startIndex: 1, modeId: 'html' }
				]
			}, {
				line: '<div><?=\"something\"?></div>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.tag.block.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 1, endIndex: 4, scopes: ['text.html.php', 'meta.tag.block.any.html', 'entity.name.tag.block.any.html'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.php', 'meta.tag.block.any.html', 'punctuation.definition.tag.end.html'] },
					{ startIndex: 5, endIndex: 8, scopes: ['text.html.php', 'meta.embedded.line.php', 'punctuation.section.embedded.begin.php'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.php', 'meta.embedded.line.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.begin.php'] },
					{ startIndex: 9, endIndex: 18, scopes: ['text.html.php', 'meta.embedded.line.php', 'source.php', 'string.quoted.double.php', 'meta.string-contents.quoted.double.php'] },
					{ startIndex: 18, endIndex: 19, scopes: ['text.html.php', 'meta.embedded.line.php', 'source.php', 'string.quoted.double.php', 'punctuation.definition.string.end.php'] },
					{ startIndex: 19, endIndex: 20, scopes: ['text.html.php', 'meta.embedded.line.php', 'punctuation.section.embedded.end.php', 'source.php'] },
					{ startIndex: 20, endIndex: 21, scopes: ['text.html.php', 'meta.embedded.line.php', 'punctuation.section.embedded.end.php'] },
					{ startIndex: 21, endIndex: 23, scopes: ['text.html.php', 'meta.tag.block.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 23, endIndex: 26, scopes: ['text.html.php', 'meta.tag.block.any.html', 'entity.name.tag.block.any.html'] },
					{ startIndex: 26, endIndex: 27, scopes: ['text.html.php', 'meta.tag.block.any.html', 'punctuation.definition.tag.end.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.any.html.punctuation.definition.begin.block' },
					{ startIndex: 1, type: 'meta.tag.any.html.entity.name.block' },
					{ startIndex: 4, type: 'meta.tag.any.html.punctuation.definition.end.block' },
					{ startIndex: 5, type: 'meta.punctuation.embedded.section.begin.php.line' },
					{ startIndex: 8, type: 'meta.punctuation.definition.source.embedded.begin.php.string.quoted.double.line' },
					{ startIndex: 9, type: 'meta.source.embedded.php.string.quoted.double.line.string-contents' },
					{ startIndex: 18, type: 'meta.punctuation.definition.source.embedded.end.php.string.quoted.double.line' },
					{ startIndex: 19, type: 'meta.punctuation.source.embedded.section.end.php.line' },
					{ startIndex: 20, type: 'meta.punctuation.embedded.section.end.php.line' },
					{ startIndex: 21, type: 'meta.tag.any.html.punctuation.definition.begin.block' },
					{ startIndex: 23, type: 'meta.tag.any.html.entity.name.block' },
					{ startIndex: 26, type: 'meta.tag.any.html.punctuation.definition.end.block' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'html' },
					{ startIndex: 8, modeId: 'php' },
					{ startIndex: 20, modeId: 'html' }
				]
			}
		];

		let registry = new TMScopeRegistry();

		registry.register('text.html.php', null, {
			'text.html': 'html',
			'source.php': 'php',
			'source.sql': 'sql',
			'text.xml': 'xml',
			'source.js': 'javascript',
			'source.json': 'json',
			'source.css': 'css'
		});

		let decodeMap = new DecodeMap(registry.getLanguageRegistration('text.html.php'));

		for (let i = 0, len = tests.length; i < len; i++) {
			let test = tests[i];
			let actual = decodeTextMateTokens(test.line, 0, decodeMap, test.tmTokens, new TMState('html', null, null));

			let actualTokens = actual.tokens.map((t) => { return { startIndex: t.startIndex, type: t.type }; });
			let actualModeTransitions = actual.modeTransitions.map((t) => { return { startIndex: t.startIndex, modeId: t.modeId }; });

			assert.deepEqual(actualTokens, test.tokens, 'test ' + test.line);
			assert.deepEqual(actualModeTransitions, test.modeTransitions, 'test ' + test.line);
		}
	});

	test('html and embedded', () => {

		var tests = [
			{
				line: '<!DOCTYPE HTML>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.sgml.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 9, scopes: ['text.html.basic', 'meta.tag.sgml.html', 'meta.tag.sgml.doctype.html'] },
					{ startIndex: 9, endIndex: 14, scopes: ['text.html.basic', 'meta.tag.sgml.html', 'meta.tag.sgml.doctype.html'] },
					{ startIndex: 14, endIndex: 15, scopes: ['text.html.basic', 'meta.tag.sgml.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.sgml.html.punctuation.definition' },
					{ startIndex: 2, type: 'meta.tag.sgml.html.doctype' },
					{ startIndex: 14, type: 'meta.tag.sgml.html.punctuation.definition' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '<!-- ',
				tmTokens: [
					{ startIndex: 0, endIndex: 4, scopes: ['text.html.basic', 'comment.block.html', 'punctuation.definition.comment.html'] },
					{ startIndex: 4, endIndex: 6, scopes: ['text.html.basic', 'comment.block.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.punctuation.definition.comment.block' },
					{ startIndex: 4, type: 'html.comment.block' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\tComments are overrated',
				tmTokens: [
					{ startIndex: 0, endIndex: 24, scopes: ['text.html.basic', 'comment.block.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.comment.block' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '-->',
				tmTokens: [
					{ startIndex: 0, endIndex: 3, scopes: ['text.html.basic', 'comment.block.html', 'punctuation.definition.comment.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.punctuation.definition.comment.block' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '<html>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 1, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 5, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '<head>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 1, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 5, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\t<title>HTML Sample</title>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 2, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.name.tag.inline.any.html'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.end.html'] },
					{ startIndex: 8, endIndex: 19, scopes: ['text.html.basic'] },
					{ startIndex: 19, endIndex: 21, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 21, endIndex: 26, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.name.tag.inline.any.html'] },
					{ startIndex: 26, endIndex: 27, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.end.html'] }
				],
				tokens: [
					{ startIndex: 0, type: '' },
					{ startIndex: 1, type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ startIndex: 2, type: 'meta.tag.html.any.entity.name.inline' },
					{ startIndex: 7, type: 'meta.tag.html.punctuation.definition.any.inline.end' },
					{ startIndex: 8, type: '' },
					{ startIndex: 19, type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ startIndex: 21, type: 'meta.tag.html.any.entity.name.inline' },
					{ startIndex: 26, type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\t<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.name.tag.inline.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 7, endIndex: 17, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 17, endIndex: 18, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 18, endIndex: 19, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 19, endIndex: 34, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html'] },
					{ startIndex: 34, endIndex: 35, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 35, endIndex: 36, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 36, endIndex: 43, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 43, endIndex: 44, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 44, endIndex: 45, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 45, endIndex: 52, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html'] },
					{ startIndex: 52, endIndex: 53, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 53, endIndex: 54, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.end.html'] }
				],
				tokens: [
					{ startIndex: 0, type: '' },
					{ startIndex: 1, type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ startIndex: 2, type: 'meta.tag.html.any.entity.name.inline' },
					{ startIndex: 6, type: 'meta.tag.html.any.inline' },
					{ startIndex: 7, type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ startIndex: 17, type: 'meta.tag.html.any.inline' },
					{ startIndex: 18, type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ startIndex: 19, type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ startIndex: 34, type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ startIndex: 35, type: 'meta.tag.html.any.inline' },
					{ startIndex: 36, type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ startIndex: 43, type: 'meta.tag.html.any.inline' },
					{ startIndex: 44, type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ startIndex: 45, type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ startIndex: 52, type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ startIndex: 53, type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\t<style type=\"text/css\">',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'source.css.embedded.html'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 7, scopes: ['text.html.basic', 'source.css.embedded.html', 'entity.name.tag.style.html'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.basic', 'source.css.embedded.html'] },
					{ startIndex: 8, endIndex: 12, scopes: ['text.html.basic', 'source.css.embedded.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 12, endIndex: 13, scopes: ['text.html.basic', 'source.css.embedded.html'] },
					{ startIndex: 13, endIndex: 14, scopes: ['text.html.basic', 'source.css.embedded.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 14, endIndex: 22, scopes: ['text.html.basic', 'source.css.embedded.html', 'string.quoted.double.html'] },
					{ startIndex: 22, endIndex: 23, scopes: ['text.html.basic', 'source.css.embedded.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 23, endIndex: 24, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.source.css.embedded' },
					{ startIndex: 1, type: 'tag.html.punctuation.definition.source.css.embedded' },
					{ startIndex: 2, type: 'tag.html.entity.name.source.css.embedded.style' },
					{ startIndex: 7, type: 'html.source.css.embedded' },
					{ startIndex: 8, type: 'html.entity.other.attribute-name.source.css.embedded' },
					{ startIndex: 12, type: 'html.source.css.embedded' },
					{ startIndex: 13, type: 'html.punctuation.definition.begin.string.quoted.double.source.css.embedded' },
					{ startIndex: 14, type: 'html.string.quoted.double.source.css.embedded' },
					{ startIndex: 22, type: 'html.punctuation.definition.end.string.quoted.double.source.css.embedded' },
					{ startIndex: 23, type: 'tag.html.punctuation.definition.source.css.embedded' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'css' }]
			}, {
				line: '\t\th1 {',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css'] },
					{ startIndex: 2, endIndex: 4, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css', 'entity.name.tag.css'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.begin.css'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.html.source.css.embedded.selector' },
					{ startIndex: 2, type: 'meta.tag.html.entity.name.source.css.embedded.selector' },
					{ startIndex: 4, type: 'meta.html.source.css.embedded.selector' },
					{ startIndex: 5, type: 'meta.html.punctuation.begin.source.css.embedded.property-list.section' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'css' }]
			}, {
				line: '\t\t\tcolor: #CCA3A3;',
				tmTokens: [
					{ startIndex: 0, endIndex: 3, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css'] },
					{ startIndex: 3, endIndex: 8, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-name.css', 'support.type.property-name.css'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'punctuation.separator.key-value.css'] },
					{ startIndex: 9, endIndex: 10, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css'] },
					{ startIndex: 10, endIndex: 11, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'constant.other.color.rgb-value.css', 'punctuation.definition.constant.css'] },
					{ startIndex: 11, endIndex: 17, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'constant.other.color.rgb-value.css'] },
					{ startIndex: 17, endIndex: 18, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'meta.property-value.css', 'punctuation.terminator.rule.css'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.html.source.css.embedded.property-list' },
					{ startIndex: 3, type: 'meta.html.source.css.embedded.property-list.property-name.support.type' },
					{ startIndex: 8, type: 'meta.html.punctuation.source.css.embedded.property-list.property-value.separator.key-value' },
					{ startIndex: 9, type: 'meta.html.source.css.embedded.property-list.property-value' },
					{ startIndex: 10, type: 'meta.html.punctuation.definition.other.source.css.embedded.property-list.property-value.constant.color.rgb-value' },
					{ startIndex: 11, type: 'meta.html.other.source.css.embedded.property-list.property-value.constant.color.rgb-value' },
					{ startIndex: 17, type: 'meta.html.punctuation.source.css.embedded.property-list.property-value.terminator.rule' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'css' }]
			}, {
				line: '\t\t}',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css'] },
					{ startIndex: 2, endIndex: 3, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.end.css'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.html.source.css.embedded.property-list' },
					{ startIndex: 2, type: 'meta.html.punctuation.end.source.css.embedded.property-list.section' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'css' }]
			}, {
				line: '\t</style>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'source.css.embedded.html'] },
					{ startIndex: 1, endIndex: 3, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 3, endIndex: 8, scopes: ['text.html.basic', 'source.css.embedded.html', 'entity.name.tag.style.html'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.source.css.embedded' },
					{ startIndex: 1, type: 'tag.html.punctuation.definition.source.css.embedded' },
					{ startIndex: 3, type: 'tag.html.entity.name.source.css.embedded.style' },
					{ startIndex: 8, type: 'tag.html.punctuation.definition.source.css.embedded' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'css' }]
			}, {
				line: '\t<script type=\"text/javascript\">',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'source.js.embedded.html'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 8, scopes: ['text.html.basic', 'source.js.embedded.html', 'entity.name.tag.script.html'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.basic', 'source.js.embedded.html'] },
					{ startIndex: 9, endIndex: 13, scopes: ['text.html.basic', 'source.js.embedded.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 13, endIndex: 14, scopes: ['text.html.basic', 'source.js.embedded.html'] },
					{ startIndex: 14, endIndex: 15, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 15, endIndex: 30, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.html'] },
					{ startIndex: 30, endIndex: 31, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 31, endIndex: 32, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.source.embedded.js' },
					{ startIndex: 1, type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ startIndex: 2, type: 'tag.html.entity.name.source.embedded.js.script' },
					{ startIndex: 8, type: 'html.source.embedded.js' },
					{ startIndex: 9, type: 'html.entity.other.attribute-name.source.embedded.js' },
					{ startIndex: 13, type: 'html.source.embedded.js' },
					{ startIndex: 14, type: 'html.punctuation.definition.begin.string.quoted.double.source.embedded.js' },
					{ startIndex: 15, type: 'html.string.quoted.double.source.embedded.js' },
					{ startIndex: 30, type: 'html.punctuation.definition.end.string.quoted.double.source.embedded.js' },
					{ startIndex: 31, type: 'tag.html.punctuation.definition.source.embedded.js' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'javascript' }]
			}, {
				line: '\t\twindow.alert(\"I am a sample...\");',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'source.js.embedded.html'] },
					{ startIndex: 2, endIndex: 8, scopes: ['text.html.basic', 'source.js.embedded.html', 'support.variable.dom.js'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.accessor.js'] },
					{ startIndex: 9, endIndex: 14, scopes: ['text.html.basic', 'source.js.embedded.html', 'support.function.js'] },
					{ startIndex: 14, endIndex: 15, scopes: ['text.html.basic', 'source.js.embedded.html', 'meta.brace.round.js'] },
					{ startIndex: 15, endIndex: 16, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.js', 'punctuation.definition.string.begin.js'] },
					{ startIndex: 16, endIndex: 32, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.js'] },
					{ startIndex: 32, endIndex: 33, scopes: ['text.html.basic', 'source.js.embedded.html', 'string.quoted.double.js', 'punctuation.definition.string.end.js'] },
					{ startIndex: 33, endIndex: 34, scopes: ['text.html.basic', 'source.js.embedded.html', 'meta.brace.round.js'] },
					{ startIndex: 34, endIndex: 35, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.terminator.statement.js'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.source.embedded.js' },
					{ startIndex: 2, type: 'html.source.embedded.support.js.variable.dom' },
					{ startIndex: 8, type: 'html.punctuation.source.embedded.js.accessor' },
					{ startIndex: 9, type: 'html.source.embedded.support.js.function' },
					{ startIndex: 14, type: 'meta.html.source.embedded.js.brace.round' },
					{ startIndex: 15, type: 'html.punctuation.definition.begin.string.quoted.double.source.embedded.js' },
					{ startIndex: 16, type: 'html.string.quoted.double.source.embedded.js' },
					{ startIndex: 32, type: 'html.punctuation.definition.end.string.quoted.double.source.embedded.js' },
					{ startIndex: 33, type: 'meta.html.source.embedded.js.brace.round' },
					{ startIndex: 34, type: 'html.punctuation.source.embedded.terminator.js.statement' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'javascript' }]
			}, {
				line: '\t</script>After',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'source.js.embedded.html'] },
					{ startIndex: 1, endIndex: 3, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 3, endIndex: 9, scopes: ['text.html.basic', 'source.js.embedded.html', 'entity.name.tag.script.html'] },
					{ startIndex: 9, endIndex: 10, scopes: ['text.html.basic', 'source.js.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 10, endIndex: 15, scopes: ['text.html.basic'] }
				],
				tokens: [
					{ startIndex: 0, type: 'html.source.embedded.js' },
					{ startIndex: 1, type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ startIndex: 3, type: 'tag.html.entity.name.source.embedded.js.script' },
					{ startIndex: 9, type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ startIndex: 10, type: '' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'javascript' }, { startIndex: 10, modeId: 'html' }]
			}, {
				line: '</head>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 2, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 6, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '<body>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 1, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 5, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\t<h1>Heading No.1</h1>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 2, endIndex: 4, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'entity.name.tag.block.any.html'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'punctuation.definition.tag.end.html'] },
					{ startIndex: 5, endIndex: 17, scopes: ['text.html.basic'] },
					{ startIndex: 17, endIndex: 19, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 19, endIndex: 21, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'entity.name.tag.block.any.html'] },
					{ startIndex: 21, endIndex: 22, scopes: ['text.html.basic', 'meta.tag.block.any.html', 'punctuation.definition.tag.end.html'] }
				],
				tokens: [
					{ startIndex: 0, type: '' },
					{ startIndex: 1, type: 'meta.tag.html.punctuation.definition.block.any.begin' },
					{ startIndex: 2, type: 'meta.tag.html.block.any.entity.name' },
					{ startIndex: 4, type: 'meta.tag.html.punctuation.definition.block.any.end' },
					{ startIndex: 5, type: '' },
					{ startIndex: 17, type: 'meta.tag.html.punctuation.definition.block.any.begin' },
					{ startIndex: 19, type: 'meta.tag.html.block.any.entity.name' },
					{ startIndex: 21, type: 'meta.tag.html.punctuation.definition.block.any.end' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '\t<input disabled type=\"button\" value=\"Click me\" />',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.begin.html'] },
					{ startIndex: 2, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.name.tag.inline.any.html'] },
					{ startIndex: 7, endIndex: 8, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 8, endIndex: 16, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 16, endIndex: 17, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 17, endIndex: 21, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 21, endIndex: 22, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 22, endIndex: 23, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 23, endIndex: 29, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html'] },
					{ startIndex: 29, endIndex: 30, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 30, endIndex: 31, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 31, endIndex: 36, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'entity.other.attribute-name.html'] },
					{ startIndex: 36, endIndex: 37, scopes: ['text.html.basic', 'meta.tag.inline.any.html'] },
					{ startIndex: 37, endIndex: 38, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.begin.html'] },
					{ startIndex: 38, endIndex: 46, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html'] },
					{ startIndex: 46, endIndex: 47, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'string.quoted.double.html', 'punctuation.definition.string.end.html'] },
					{ startIndex: 47, endIndex: 50, scopes: ['text.html.basic', 'meta.tag.inline.any.html', 'punctuation.definition.tag.end.html'] }
				],
				tokens: [
					{ startIndex: 0, type: '' },
					{ startIndex: 1, type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ startIndex: 2, type: 'meta.tag.html.any.entity.name.inline' },
					{ startIndex: 7, type: 'meta.tag.html.any.inline' },
					{ startIndex: 8, type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ startIndex: 16, type: 'meta.tag.html.any.inline' },
					{ startIndex: 17, type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ startIndex: 21, type: 'meta.tag.html.any.inline' },
					{ startIndex: 22, type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ startIndex: 23, type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ startIndex: 29, type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ startIndex: 30, type: 'meta.tag.html.any.inline' },
					{ startIndex: 31, type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ startIndex: 36, type: 'meta.tag.html.any.inline' },
					{ startIndex: 37, type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ startIndex: 38, type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ startIndex: 46, type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ startIndex: 47, type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '</body>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 2, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 6, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}, {
				line: '</html>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ startIndex: 2, type: 'meta.tag.html.structure.any.entity.name' },
					{ startIndex: 6, type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
				modeTransitions: [{ startIndex: 0, modeId: 'html' }]
			}
		];

		let registry = new TMScopeRegistry();

		registry.register('text.html.basic', null, {
			'text.html.basic': 'html',
			'source.css': 'css',
			'source.js': 'javascript',
			'source.python': 'python',
			'source.smarty': 'smarty'
		});

		let decodeMap = new DecodeMap(registry.getLanguageRegistration('text.html.basic'));

		for (let i = 0, len = tests.length; i < len; i++) {
			let test = tests[i];
			let actual = decodeTextMateTokens(test.line, 0, decodeMap, test.tmTokens, new TMState('html', null, null));

			let actualTokens = actual.tokens.map((t) => { return { startIndex: t.startIndex, type: t.type }; });
			let actualModeTransitions = actual.modeTransitions.map((t) => { return { startIndex: t.startIndex, modeId: t.modeId }; });

			assert.deepEqual(actualTokens, test.tokens, 'test ' + test.line);
			assert.deepEqual(actualModeTransitions, test.modeTransitions, 'test ' + test.line);
		}
	});

	test('issue #14661: Comment shortcut in SCSS now using CSS style comments', () => {
		let tests = [
			{
				line: 'class {',
				tmTokens: [
					{ startIndex: 0, endIndex: 6, scopes: ['source.css.scss'] },
					{ startIndex: 6, endIndex: 7, scopes: ['source.css.scss', 'meta.property-list.scss', 'punctuation.section.property-list.begin.bracket.curly.scss'] }
				],
				tokens: [
					{ startIndex: 0, type: '' },
					{ startIndex: 6, type: 'meta.property-list.scss.punctuation.section.begin.bracket.curly' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'scss' }
				]
			}, {
				line: '    background: red;',
				tmTokens: [
					{ startIndex: 0, endIndex: 4, scopes: ['source.css.scss', 'meta.property-list.scss'] },
					{ startIndex: 4, endIndex: 14, scopes: ['source.css.scss', 'meta.property-list.scss', 'meta.property-name.scss', 'support.type.property-name.scss'] },
					{ startIndex: 14, endIndex: 15, scopes: ['source.css.scss', 'meta.property-list.scss', 'punctuation.separator.key-value.scss'] },
					{ startIndex: 15, endIndex: 16, scopes: ['source.css.scss', 'meta.property-list.scss'] },
					{ startIndex: 16, endIndex: 19, scopes: ['source.css.scss', 'meta.property-list.scss', 'meta.property-value.scss', 'support.constant.color.w3c-standard-color-name.scss'] },
					{ startIndex: 19, endIndex: 20, scopes: ['source.css.scss', 'meta.property-list.scss', 'punctuation.terminator.rule.scss'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.property-list.scss' },
					{ startIndex: 4, type: 'meta.property-list.scss.property-name.support.type' },
					{ startIndex: 14, type: 'meta.property-list.scss.punctuation.separator.key-value' },
					{ startIndex: 15, type: 'meta.property-list.scss' },
					{ startIndex: 16, type: 'meta.property-list.scss.support.property-value.constant.color.w3c-standard-color-name' },
					{ startIndex: 19, type: 'meta.property-list.scss.punctuation.terminator.rule' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'scss' }
				]
			}, {
				line: '}',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['source.css.scss', 'meta.property-list.scss', 'punctuation.section.property-list.end.bracket.curly.scss'] }
				],
				tokens: [
					{ startIndex: 0, type: 'meta.property-list.scss.punctuation.section.bracket.curly.end' }
				],
				modeTransitions: [
					{ startIndex: 0, modeId: 'scss' }
				]
			}
		];

		let registry = new TMScopeRegistry();

		registry.register('source.css.scss', './syntaxes/scss.json');

		let decodeMap = new DecodeMap(registry.getLanguageRegistration('source.css.scss'));

		for (let i = 0, len = tests.length; i < len; i++) {
			let test = tests[i];
			let actual = decodeTextMateTokens(test.line, 0, decodeMap, test.tmTokens, new TMState('scss', null, null));

			let actualTokens = actual.tokens.map((t) => { return { startIndex: t.startIndex, type: t.type }; });
			let actualModeTransitions = actual.modeTransitions.map((t) => { return { startIndex: t.startIndex, modeId: t.modeId }; });

			assert.deepEqual(actualTokens, test.tokens, 'test ' + test.line);
			assert.deepEqual(actualModeTransitions, test.modeTransitions, 'test ' + test.line);
		}

	});
});

suite('textMate', () => {

	function assertRelaxedEqual(a: string, b: string): void {
		let relaxString = (str: string) => {
			let pieces = str.split('.');
			pieces.sort();
			return pieces.join('.');
		};
		assert.equal(relaxString(a), relaxString(b));
	}

	function slowDecodeTextMateToken(scopes: string[]): string {
		let allTokensMap: { [token: string]: boolean; } = Object.create(null);
		for (let i = 1; i < scopes.length; i++) {
			let pieces = scopes[i].split('.');
			for (let j = 0; j < pieces.length; j++) {
				allTokensMap[pieces[j]] = true;
			}
		}
		return Object.keys(allTokensMap).join('.');
	}

	function testOneDecodeTextMateToken(decodeMap: DecodeMap, scopes: string[], expected: string): void {
		let actualDecodedToken = decodeTextMateToken(decodeMap, scopes);
		let actual = actualDecodedToken ? decodeMap.getToken(actualDecodedToken.tokensMask) : '';
		assert.equal(actual, expected);

		// Sanity-check
		let alternativeExpected = slowDecodeTextMateToken(scopes);
		assertRelaxedEqual(actual, alternativeExpected);
	}

	function testDecodeTextMateToken(input: string[][], expected: string[]): void {
		let decodeMap = new DecodeMap(new TMLanguageRegistration(null, null, null, null));

		for (let i = 0; i < input.length; i++) {
			testOneDecodeTextMateToken(decodeMap, input[i], expected[i]);
		}
	}

	test('decodeTextMateToken JSON regression', () => {
		let input = [
			['source.json', 'meta.structure.dictionary.json'],
			['source.json', 'meta.structure.dictionary.json', 'support.type.property-name.json', 'punctuation.support.type.property-name.begin.json'],
			['source.json', 'meta.structure.dictionary.json', 'support.type.property-name.json'],
			['source.json', 'meta.structure.dictionary.json', 'support.type.property-name.json', 'punctuation.support.type.property-name.end.json'],
			['source.json', 'meta.structure.dictionary.json', 'meta.structure.dictionary.value.json', 'punctuation.separator.dictionary.key-value.json'],
			['source.json', 'meta.structure.dictionary.json', 'meta.structure.dictionary.value.json'],
			['source.json', 'meta.structure.dictionary.json', 'meta.structure.dictionary.value.json', 'string.quoted.double.json', 'punctuation.definition.string.begin.json'],
			['source.json', 'meta.structure.dictionary.json', 'meta.structure.dictionary.value.json', 'string.quoted.double.json', 'punctuation.definition.string.end.json'],
			['source.json', 'meta.structure.dictionary.json', 'meta.structure.dictionary.value.json', 'punctuation.separator.dictionary.pair.json']
		];

		let expected = [
			'meta.structure.dictionary.json',
			'meta.structure.dictionary.json.support.type.property-name.punctuation.begin',
			'meta.structure.dictionary.json.support.type.property-name',
			'meta.structure.dictionary.json.support.type.property-name.punctuation.end',
			'meta.structure.dictionary.json.punctuation.value.separator.key-value',
			'meta.structure.dictionary.json.value',
			'meta.structure.dictionary.json.punctuation.begin.value.string.quoted.double.definition',
			'meta.structure.dictionary.json.punctuation.end.value.string.quoted.double.definition',
			'meta.structure.dictionary.json.punctuation.value.separator.pair'
		];

		testDecodeTextMateToken(input, expected);
	});

	test('decodeTextMateToken', () => {
		let input = getTestScopes();

		let expected = [
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.entity.name',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter.brace.round',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name.parameter.variable',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name.parameter.variable',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name.parameter.variable',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter.brace.round',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.entity.name.overload',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter.brace.round',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name.parameter.variable',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.parameter.brace.round',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.brace.curly',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.keyword.operator.comparison',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.keyword.operator.arithmetic',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.keyword.operator.arithmetic',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.string.double',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.brace.array.literal.square',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.array.literal',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.brace.array.literal.square',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.keyword.operator.comparison',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.brace.curly',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.brace.curly',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member.name',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member',
			'meta.function.js.decl.block.type.parameters.paren.cover.object.method.declaration.field.member'
		];

		testDecodeTextMateToken(input, expected);
	});
});

function getTestScopes(): string[][] {
	return [
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'entity.name.function.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'meta.brace.round.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'parameter.name.js', 'variable.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'parameter.name.js', 'variable.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'parameter.name.js', 'variable.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'meta.brace.round.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.method.overload.declaration.js', 'entity.name.function.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'meta.brace.round.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'parameter.name.js', 'variable.parameter.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.function.type.parameter.js', 'meta.brace.round.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.brace.curly.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'keyword.operator.comparison.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'keyword.operator.arithmetic.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'keyword.operator.arithmetic.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'string.double.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.array.literal.js', 'meta.brace.square.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.array.literal.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.array.literal.js', 'meta.brace.square.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'keyword.operator.comparison.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.brace.curly.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.brace.curly.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.name.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.name.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js'],
		['source.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js', 'meta.object.type.js', 'meta.field.declaration.js', 'meta.block.js', 'meta.object.member.js', 'meta.function.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.object.type.js', 'meta.method.declaration.js', 'meta.decl.block.js', 'meta.type.parameters.js', 'meta.type.paren.cover.js']
	];
}
