/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { settingKeyToDisplayFormat, parseQuery, IParsedQuery } from 'vs/workbench/contrib/preferences/browser/settingsTreeModels';

suite('SettingsTree', () => {
	test('settingKeyToDisplayFormat', () => {
		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar'),
			{
				category: 'Foo',
				label: 'Bar'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar.etc'),
			{
				category: 'Foo › Bar',
				label: 'Etc'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo'),
			{
				category: '',
				label: 'Foo'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.1leading.number'),
			{
				category: 'Foo › 1leading',
				label: 'Number'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.1Leading.number'),
			{
				category: 'Foo › 1 Leading',
				label: 'Number'
			});
	});

	test('settingKeyToDisplayFormat - with category', () => {
		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar', 'foo'),
			{
				category: '',
				label: 'Bar'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('disableligatures.ligatures', 'disableligatures'),
			{
				category: '',
				label: 'Ligatures'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething', 'foo'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo/bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'something/foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('bar.etc', 'something.bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('fooBar.etc', 'fooBar'),
			{
				category: '',
				label: 'Etc'
			});


		assert.deepEqual(
			settingKeyToDisplayFormat('fooBar.somethingElse.etc', 'fooBar'),
			{
				category: 'Something Else',
				label: 'Etc'
			});
	});

	test('settingKeyToDisplayFormat - known acronym/term', () => {
		assert.deepEqual(
			settingKeyToDisplayFormat('css.someCssSetting'),
			{
				category: 'CSS',
				label: 'Some CSS Setting'
			});

		assert.deepEqual(
			settingKeyToDisplayFormat('powershell.somePowerShellSetting'),
			{
				category: 'PowerShell',
				label: 'Some PowerShell Setting'
			});
	});

	test('parseQuery', () => {
		function testParseQuery(input: string, expected: IParsedQuery) {
			assert.deepEqual(
				parseQuery(input),
				expected,
				input
			);
		}

		testParseQuery(
			'',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: ''
			});

		testParseQuery(
			'@modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				featureFilters: [],
				query: ''
			});

		testParseQuery(
			'@tag:foo',
			<IParsedQuery>{
				tags: ['foo'],
				extensionFilters: [],
				featureFilters: [],
				query: ''
			});

		testParseQuery(
			'@modified foo',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				featureFilters: [],
				query: 'foo'
			});

		testParseQuery(
			'@tag:foo @modified',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				featureFilters: [],
				query: ''
			});

		testParseQuery(
			'@tag:foo @modified my query',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				featureFilters: [],
				query: 'my query'
			});

		testParseQuery(
			'test @modified query',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				featureFilters: [],
				query: 'test  query'
			});

		testParseQuery(
			'test @modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				featureFilters: [],
				query: 'test'
			});

		testParseQuery(
			'query has @ for some reason',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				query: 'query has @ for some reason',
				featureFilters: [],
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github'],
				featureFilters: [],
				query: ''
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github,vscode.git',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github', 'vscode.git'],
				featureFilters: [],
				query: ''
			});
		testParseQuery(
			'@feature:scm',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm'],
				query: ''
			});

		testParseQuery(
			'@feature:scm,terminal',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm', 'terminal'],
				query: ''
			});
	});
});
