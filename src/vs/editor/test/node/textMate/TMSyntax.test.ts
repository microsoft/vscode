/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { decodeTextMateToken, decodeTextMateTokens, DecodeMap, TMScopeRegistry, TMLanguageRegistration } from 'vs/editor/node/textMate/TMSyntax';

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
			'html',
			decodeMap,
			'text<style>body{}</style><script>var x=3;</script>text',
			0,
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
			null
		);

		assert.deepEqual(actual.tokens, [
			{ offset: 0, language: 'html', type: '' },
			{ offset: 4, language: 'html', type: 'style.tag.open' },
			{ offset: 11, language: 'css', type: 'source.css' },
			{ offset: 17, language: 'html', type: 'style.tag.close' },
			{ offset: 25, language: 'html', type: 'tag.open.script' },
			{ offset: 33, language: 'javascript', type: 'source.js' },
			{ offset: 41, language: 'html', type: 'tag.close.script' },
			{ offset: 50, language: 'html', type: '' },
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
					{ offset: 0, language: 'html', type: 'meta.tag.any.html.punctuation.definition' },
					{ offset: 1, language: 'html', type: 'meta.tag.any.html.entity.name' },
					{ offset: 4, language: 'html', type: 'meta.tag.any.html.punctuation.definition' },
					{ offset: 5, language: 'html', type: 'meta.tag.any.html.punctuation.definition.scope.between-tag-pair' },
					{ offset: 6, language: 'html', type: 'meta.tag.any.html.punctuation.definition' },
					{ offset: 7, language: 'html', type: 'meta.tag.any.html.entity.name' },
					{ offset: 10, language: 'html', type: 'meta.tag.any.html.punctuation.definition' }
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
					{ offset: 0, language: 'html', type: 'tag.html.punctuation.definition' },
					{ offset: 1, language: 'html', type: 'tag.html.entity.name.script' },
					{ offset: 7, language: 'javascript', type: 'tag.html.punctuation.definition.source.js.embedded' },
					{ offset: 8, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr.storage.type' },
					{ offset: 11, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr' },
					{ offset: 12, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr.var-single-variable.variable.other.readwrite' },
					{ offset: 13, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr.var-single-variable' },
					{ offset: 14, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr.keyword.operator.assignment' },
					{ offset: 15, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr' },
					{ offset: 16, language: 'javascript', type: 'meta.html.source.js.embedded.var.expr.constant.numeric.decimal' },
					{ offset: 17, language: 'javascript', type: 'html.punctuation.source.js.embedded.terminator.statement' },
					{ offset: 18, language: 'javascript', type: 'tag.html.punctuation.definition.source.js.embedded' },
					{ offset: 20, language: 'javascript', type: 'tag.html.entity.name.script.source.js.embedded' },
					{ offset: 26, language: 'html', type: 'tag.html.punctuation.definition' }
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
					{ offset: 0, language: 'html', type: 'tag.html.punctuation.definition' },
					{ offset: 1, language: 'html', type: 'tag.html.entity.name.style' },
					{ offset: 6, language: 'css', type: 'tag.html.punctuation.definition.source.embedded.css' },
					{ offset: 7, language: 'css', type: 'meta.tag.html.entity.name.source.embedded.css.selector' },
					{ offset: 11, language: 'css', type: 'meta.html.punctuation.source.embedded.css.property-list.section.begin' },
					{ offset: 12, language: 'css', type: 'meta.html.source.embedded.type.css.property-list.property-name.support' },
					{ offset: 28, language: 'css', type: 'meta.html.punctuation.source.embedded.css.property-list.property-value.separator.key-value' },
					{ offset: 29, language: 'css', type: 'meta.html.source.embedded.constant.css.property-list.support.property-value.color.w3c-standard-color-name' },
					{ offset: 32, language: 'css', type: 'meta.html.punctuation.source.embedded.terminator.css.property-list.property-value.rule' },
					{ offset: 33, language: 'css', type: 'meta.html.punctuation.source.embedded.css.property-list.section.end' },
					{ offset: 34, language: 'html', type: 'tag.html.punctuation.definition' },
					{ offset: 36, language: 'html', type: 'tag.html.entity.name.style' },
					{ offset: 41, language: 'html', type: 'tag.html.punctuation.definition' }
				]
			}, {
				line: '<?php',
				tmTokens: [
					{ startIndex: 0, endIndex: 5, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.begin.php'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.punctuation.embedded.section.begin.block.php.metatag' }
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
					{ offset: 0, language: 'php', type: 'meta.punctuation.definition.source.embedded.variable.other.block.php' },
					{ offset: 1, language: 'php', type: 'meta.source.embedded.variable.other.block.php' },
					{ offset: 6, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 7, language: 'php', type: 'meta.source.embedded.keyword.operator.assignment.block.php' },
					{ offset: 8, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 9, language: 'php', type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double.sql' },
					{ offset: 10, language: 'sql', type: 'meta.source.embedded.other.keyword.block.php.string.quoted.double.sql.DML' },
					{ offset: 16, language: 'sql', type: 'meta.source.embedded.block.php.string.quoted.double.sql' },
					{ offset: 28, language: 'sql', type: 'meta.source.embedded.other.keyword.block.php.string.quoted.double.sql.DML' },
					{ offset: 32, language: 'sql', type: 'meta.source.embedded.block.php.string.quoted.double.sql' },
					{ offset: 37, language: 'sql', type: 'meta.source.embedded.block.php.string.quoted.double.sql.comment.line.double-dash' },
					{ offset: 56, language: 'php', type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double.sql' },
					{ offset: 57, language: 'php', type: 'meta.punctuation.source.embedded.terminator.block.php.expression' },
					{ offset: 58, language: 'php', type: 'meta.source.embedded.block.php' }
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
					{ offset: 0, language: 'php', type: 'meta.punctuation.definition.source.embedded.variable.other.block.php' },
					{ offset: 1, language: 'php', type: 'meta.source.embedded.variable.other.block.php' },
					{ offset: 2, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 3, language: 'php', type: 'meta.source.embedded.keyword.operator.assignment.block.php' },
					{ offset: 4, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 5, language: 'php', type: 'meta.source.embedded.keyword.operator.block.php.comparison' },
					{ offset: 8, language: 'php', type: 'meta.source.embedded.other.constant.block.php' },
					{ offset: 12, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 13, language: 'php', type: 'meta.punctuation.scope.source.embedded.section.begin.block.php' },
					{ offset: 14, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 15, language: 'php', type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double' },
					{ offset: 16, language: 'php', type: 'meta.source.embedded.block.php.string.quoted.double.string-contents' },
					{ offset: 17, language: 'php', type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double' },
					{ offset: 18, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 20, language: 'php', type: 'meta.punctuation.definition.source.embedded.begin.block.php.string.quoted.double' },
					{ offset: 21, language: 'php', type: 'meta.source.embedded.block.php.string.quoted.double.string-contents' },
					{ offset: 22, language: 'php', type: 'meta.punctuation.definition.source.embedded.end.block.php.string.quoted.double' },
					{ offset: 23, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 24, language: 'php', type: 'meta.punctuation.scope.source.embedded.section.end.block.php' },
					{ offset: 25, language: 'php', type: 'meta.source.embedded.block.php' },
					{ offset: 26, language: 'php', type: 'meta.source.embedded.other.constant.block.php' },
					{ offset: 30, language: 'php', type: 'meta.punctuation.source.embedded.terminator.block.php.expression' }
				]
			}, {
				line: '?>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.end.php', 'source.php'] },
					{ startIndex: 1, endIndex: 2, scopes: ['text.html.php', 'meta.embedded.block.php', 'punctuation.section.embedded.metatag.end.php'] }
				],
				tokens: [
					{ offset: 0, language: 'php', type: 'meta.punctuation.source.embedded.section.end.block.php.metatag' },
					{ offset: 1, language: 'html', type: 'meta.punctuation.embedded.section.end.block.php.metatag' }
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
					{ offset: 0, language: 'html', type: 'meta.tag.any.html.punctuation.definition.begin.block' },
					{ offset: 1, language: 'html', type: 'meta.tag.any.html.entity.name.block' },
					{ offset: 4, language: 'html', type: 'meta.tag.any.html.punctuation.definition.end.block' },
					{ offset: 5, language: 'html', type: 'meta.punctuation.embedded.section.begin.php.line' },
					{ offset: 8, language: 'php', type: 'meta.punctuation.definition.source.embedded.begin.php.string.quoted.double.line' },
					{ offset: 9, language: 'php', type: 'meta.source.embedded.php.string.quoted.double.line.string-contents' },
					{ offset: 18, language: 'php', type: 'meta.punctuation.definition.source.embedded.end.php.string.quoted.double.line' },
					{ offset: 19, language: 'php', type: 'meta.punctuation.source.embedded.section.end.php.line' },
					{ offset: 20, language: 'html', type: 'meta.punctuation.embedded.section.end.php.line' },
					{ offset: 21, language: 'html', type: 'meta.tag.any.html.punctuation.definition.begin.block' },
					{ offset: 23, language: 'html', type: 'meta.tag.any.html.entity.name.block' },
					{ offset: 26, language: 'html', type: 'meta.tag.any.html.punctuation.definition.end.block' }
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
			let actual = decodeTextMateTokens('html', decodeMap, test.line, 0, test.tmTokens, null);
			assert.deepEqual(actual.tokens, test.tokens, 'test ' + test.line);
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
					{ offset: 0, language: 'html', type: 'meta.tag.sgml.html.punctuation.definition' },
					{ offset: 2, language: 'html', type: 'meta.tag.sgml.html.doctype' },
					{ offset: 14, language: 'html', type: 'meta.tag.sgml.html.punctuation.definition' },
				],
			}, {
				line: '<!-- ',
				tmTokens: [
					{ startIndex: 0, endIndex: 4, scopes: ['text.html.basic', 'comment.block.html', 'punctuation.definition.comment.html'] },
					{ startIndex: 4, endIndex: 6, scopes: ['text.html.basic', 'comment.block.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'html.punctuation.definition.comment.block' },
					{ offset: 4, language: 'html', type: 'html.comment.block' },
				],
			}, {
				line: '\tComments are overrated',
				tmTokens: [
					{ startIndex: 0, endIndex: 24, scopes: ['text.html.basic', 'comment.block.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'html.comment.block' },
				],
			}, {
				line: '-->',
				tmTokens: [
					{ startIndex: 0, endIndex: 3, scopes: ['text.html.basic', 'comment.block.html', 'punctuation.definition.comment.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'html.punctuation.definition.comment.block' },
				],
			}, {
				line: '<html>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 5, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
			}, {
				line: '<head>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 5, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
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
					{ offset: 0, language: 'html', type: '' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.any.entity.name.inline' },
					{ offset: 7, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end' },
					{ offset: 8, language: 'html', type: '' },
					{ offset: 19, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ offset: 21, language: 'html', type: 'meta.tag.html.any.entity.name.inline' },
					{ offset: 26, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
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
					{ offset: 0, language: 'html', type: '' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.any.entity.name.inline' },
					{ offset: 6, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 7, language: 'html', type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ offset: 17, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 18, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ offset: 19, language: 'html', type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ offset: 34, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ offset: 35, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 36, language: 'html', type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ offset: 43, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 44, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ offset: 45, language: 'html', type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ offset: 52, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ offset: 53, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
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
					{ offset: 0, language: 'css', type: 'html.source.css.embedded' },
					{ offset: 1, language: 'css', type: 'tag.html.punctuation.definition.source.css.embedded' },
					{ offset: 2, language: 'css', type: 'tag.html.entity.name.source.css.embedded.style' },
					{ offset: 7, language: 'css', type: 'html.source.css.embedded' },
					{ offset: 8, language: 'css', type: 'html.entity.other.attribute-name.source.css.embedded' },
					{ offset: 12, language: 'css', type: 'html.source.css.embedded' },
					{ offset: 13, language: 'css', type: 'html.punctuation.definition.begin.string.quoted.double.source.css.embedded' },
					{ offset: 14, language: 'css', type: 'html.string.quoted.double.source.css.embedded' },
					{ offset: 22, language: 'css', type: 'html.punctuation.definition.end.string.quoted.double.source.css.embedded' },
					{ offset: 23, language: 'css', type: 'tag.html.punctuation.definition.source.css.embedded' },
				],
			}, {
				line: '\t\th1 {',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css'] },
					{ startIndex: 2, endIndex: 4, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css', 'entity.name.tag.css'] },
					{ startIndex: 4, endIndex: 5, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.selector.css'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.begin.css'] }
				],
				tokens: [
					{ offset: 0, language: 'css', type: 'meta.html.source.css.embedded.selector' },
					{ offset: 2, language: 'css', type: 'meta.tag.html.entity.name.source.css.embedded.selector' },
					{ offset: 4, language: 'css', type: 'meta.html.source.css.embedded.selector' },
					{ offset: 5, language: 'css', type: 'meta.html.punctuation.begin.source.css.embedded.property-list.section' },
				],
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
					{ offset: 0, language: 'css', type: 'meta.html.source.css.embedded.property-list' },
					{ offset: 3, language: 'css', type: 'meta.html.source.css.embedded.property-list.property-name.support.type' },
					{ offset: 8, language: 'css', type: 'meta.html.punctuation.source.css.embedded.property-list.property-value.separator.key-value' },
					{ offset: 9, language: 'css', type: 'meta.html.source.css.embedded.property-list.property-value' },
					{ offset: 10, language: 'css', type: 'meta.html.punctuation.definition.other.source.css.embedded.property-list.property-value.constant.color.rgb-value' },
					{ offset: 11, language: 'css', type: 'meta.html.other.source.css.embedded.property-list.property-value.constant.color.rgb-value' },
					{ offset: 17, language: 'css', type: 'meta.html.punctuation.source.css.embedded.property-list.property-value.terminator.rule' },
				],
			}, {
				line: '\t\t}',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css'] },
					{ startIndex: 2, endIndex: 3, scopes: ['text.html.basic', 'source.css.embedded.html', 'meta.property-list.css', 'punctuation.section.property-list.end.css'] }
				],
				tokens: [
					{ offset: 0, language: 'css', type: 'meta.html.source.css.embedded.property-list' },
					{ offset: 2, language: 'css', type: 'meta.html.punctuation.end.source.css.embedded.property-list.section' },
				],
			}, {
				line: '\t</style>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'source.css.embedded.html'] },
					{ startIndex: 1, endIndex: 3, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 3, endIndex: 8, scopes: ['text.html.basic', 'source.css.embedded.html', 'entity.name.tag.style.html'] },
					{ startIndex: 8, endIndex: 9, scopes: ['text.html.basic', 'source.css.embedded.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'css', type: 'html.source.css.embedded' },
					{ offset: 1, language: 'css', type: 'tag.html.punctuation.definition.source.css.embedded' },
					{ offset: 3, language: 'css', type: 'tag.html.entity.name.source.css.embedded.style' },
					{ offset: 8, language: 'css', type: 'tag.html.punctuation.definition.source.css.embedded' },
				],
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
					{ offset: 0, language: 'javascript', type: 'html.source.embedded.js' },
					{ offset: 1, language: 'javascript', type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ offset: 2, language: 'javascript', type: 'tag.html.entity.name.source.embedded.js.script' },
					{ offset: 8, language: 'javascript', type: 'html.source.embedded.js' },
					{ offset: 9, language: 'javascript', type: 'html.entity.other.attribute-name.source.embedded.js' },
					{ offset: 13, language: 'javascript', type: 'html.source.embedded.js' },
					{ offset: 14, language: 'javascript', type: 'html.punctuation.definition.begin.string.quoted.double.source.embedded.js' },
					{ offset: 15, language: 'javascript', type: 'html.string.quoted.double.source.embedded.js' },
					{ offset: 30, language: 'javascript', type: 'html.punctuation.definition.end.string.quoted.double.source.embedded.js' },
					{ offset: 31, language: 'javascript', type: 'tag.html.punctuation.definition.source.embedded.js' },
				],
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
					{ offset: 0, language: 'javascript', type: 'html.source.embedded.js' },
					{ offset: 2, language: 'javascript', type: 'html.source.embedded.support.js.variable.dom' },
					{ offset: 8, language: 'javascript', type: 'html.punctuation.source.embedded.js.accessor' },
					{ offset: 9, language: 'javascript', type: 'html.source.embedded.support.js.function' },
					{ offset: 14, language: 'javascript', type: 'meta.html.source.embedded.js.brace.round' },
					{ offset: 15, language: 'javascript', type: 'html.punctuation.definition.begin.string.quoted.double.source.embedded.js' },
					{ offset: 16, language: 'javascript', type: 'html.string.quoted.double.source.embedded.js' },
					{ offset: 32, language: 'javascript', type: 'html.punctuation.definition.end.string.quoted.double.source.embedded.js' },
					{ offset: 33, language: 'javascript', type: 'meta.html.source.embedded.js.brace.round' },
					{ offset: 34, language: 'javascript', type: 'html.punctuation.source.embedded.terminator.js.statement' },
				],
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
					{ offset: 0, language: 'javascript', type: 'html.source.embedded.js' },
					{ offset: 1, language: 'javascript', type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ offset: 3, language: 'javascript', type: 'tag.html.entity.name.source.embedded.js.script' },
					{ offset: 9, language: 'javascript', type: 'tag.html.punctuation.definition.source.embedded.js' },
					{ offset: 10, language: 'html', type: '' },
				],
			}, {
				line: '</head>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 6, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
			}, {
				line: '<body>',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 1, endIndex: 5, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 5, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 5, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
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
					{ offset: 0, language: 'html', type: '' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.punctuation.definition.block.any.begin' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.block.any.entity.name' },
					{ offset: 4, language: 'html', type: 'meta.tag.html.punctuation.definition.block.any.end' },
					{ offset: 5, language: 'html', type: '' },
					{ offset: 17, language: 'html', type: 'meta.tag.html.punctuation.definition.block.any.begin' },
					{ offset: 19, language: 'html', type: 'meta.tag.html.block.any.entity.name' },
					{ offset: 21, language: 'html', type: 'meta.tag.html.punctuation.definition.block.any.end' },
				],
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
					{ offset: 0, language: 'html', type: '' },
					{ offset: 1, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.any.entity.name.inline' },
					{ offset: 7, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 8, language: 'html', type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ offset: 16, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 17, language: 'html', type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ offset: 21, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 22, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ offset: 23, language: 'html', type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ offset: 29, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ offset: 30, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 31, language: 'html', type: 'meta.tag.html.any.entity.inline.other.attribute-name' },
					{ offset: 36, language: 'html', type: 'meta.tag.html.any.inline' },
					{ offset: 37, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.begin.string.quoted.double' },
					{ offset: 38, language: 'html', type: 'meta.tag.html.any.inline.string.quoted.double' },
					{ offset: 46, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end.string.quoted.double' },
					{ offset: 47, language: 'html', type: 'meta.tag.html.punctuation.definition.any.inline.end' },
				],
			}, {
				line: '</body>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 6, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
			}, {
				line: '</html>',
				tmTokens: [
					{ startIndex: 0, endIndex: 2, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] },
					{ startIndex: 2, endIndex: 6, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'entity.name.tag.structure.any.html'] },
					{ startIndex: 6, endIndex: 7, scopes: ['text.html.basic', 'meta.tag.structure.any.html', 'punctuation.definition.tag.html'] }
				],
				tokens: [
					{ offset: 0, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
					{ offset: 2, language: 'html', type: 'meta.tag.html.structure.any.entity.name' },
					{ offset: 6, language: 'html', type: 'meta.tag.html.punctuation.definition.structure.any' },
				],
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
			let actual = decodeTextMateTokens('html', decodeMap, test.line, 0, test.tmTokens, null);

			assert.deepEqual(actual.tokens, test.tokens, 'test ' + test.line);
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
					{ offset: 0, language: 'scss', type: '' },
					{ offset: 6, language: 'scss', type: 'meta.property-list.scss.punctuation.section.begin.bracket.curly' }
				],
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
					{ offset: 0, language: 'scss', type: 'meta.property-list.scss' },
					{ offset: 4, language: 'scss', type: 'meta.property-list.scss.property-name.support.type' },
					{ offset: 14, language: 'scss', type: 'meta.property-list.scss.punctuation.separator.key-value' },
					{ offset: 15, language: 'scss', type: 'meta.property-list.scss' },
					{ offset: 16, language: 'scss', type: 'meta.property-list.scss.support.property-value.constant.color.w3c-standard-color-name' },
					{ offset: 19, language: 'scss', type: 'meta.property-list.scss.punctuation.terminator.rule' }
				],
			}, {
				line: '}',
				tmTokens: [
					{ startIndex: 0, endIndex: 1, scopes: ['source.css.scss', 'meta.property-list.scss', 'punctuation.section.property-list.end.bracket.curly.scss'] }
				],
				tokens: [
					{ offset: 0, language: 'scss', type: 'meta.property-list.scss.punctuation.section.bracket.curly.end' }
				],
			}
		];

		let registry = new TMScopeRegistry();

		registry.register('source.css.scss', './syntaxes/scss.json');

		let decodeMap = new DecodeMap(registry.getLanguageRegistration('source.css.scss'));

		for (let i = 0, len = tests.length; i < len; i++) {
			let test = tests[i];
			let actual = decodeTextMateTokens('scss', decodeMap, test.line, 0, test.tmTokens, null);

			assert.deepEqual(actual.tokens, test.tokens, 'test ' + test.line);
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
