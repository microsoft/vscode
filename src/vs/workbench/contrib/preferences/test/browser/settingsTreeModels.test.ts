/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { settingKeyToDisplayFormat, parseQuery, IParsedQuery, sanitizeId, toBilingualSettingTitle } from '../../browser/settingsTreeModels.js';

suite('SettingsTree', () => {
	test('settingKeyToDisplayFormat', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar'),
			{
				category: 'Foo',
				label: 'Bar'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc'),
			{
				category: 'Foo \u203A Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo'),
			{
				category: '',
				label: 'Foo'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.1leading.number'),
			{
				category: 'Foo \u203A 1leading',
				label: 'Number'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.1Leading.number'),
			{
				category: 'Foo \u203A 1 Leading',
				label: 'Number'
			});
	});

	test('settingKeyToDisplayFormat - with category', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar', 'foo'),
			{
				category: '',
				label: 'Bar'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('disableligatures.ligatures', 'disableligatures'),
			{
				category: '',
				label: 'Ligatures'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etcSomething', 'foo'),
			{
				category: 'Foo Bar',
				label: 'Etc Something'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'foo/bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('foo.bar.etc', 'something/foo'),
			{
				category: 'Bar',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('bar.etc', 'something.bar'),
			{
				category: '',
				label: 'Etc'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.etc', 'fooBar'),
			{
				category: '',
				label: 'Etc'
			});


		assert.deepStrictEqual(
			settingKeyToDisplayFormat('fooBar.somethingElse.etc', 'fooBar'),
			{
				category: 'Something Else',
				label: 'Etc'
			});
	});

	test('settingKeyToDisplayFormat - known acronym/term', () => {
		assert.deepStrictEqual(
			settingKeyToDisplayFormat('css.someCssSetting'),
			{
				category: 'CSS',
				label: 'Some CSS Setting'
			});

		assert.deepStrictEqual(
			settingKeyToDisplayFormat('powershell.somePowerShellSetting'),
			{
				category: 'PowerShell',
				label: 'Some PowerShell Setting'
			});
	});

	test('settingKeyToDisplayFormat - bilingual requested settings', () => {
		const expectedLabels = new Map<string, string>([
			['chat.agent.maxRequests', 'Chat Agent: Max Requests\n\u804A\u5929\u667A\u80FD\u4F53\uFF1A\u6700\u5927\u8BF7\u6C42\u6570'],
			['editor.defaultFormatter', 'Editor: Default Formatter\n\u7F16\u8F91\u5668\uFF1A\u9ED8\u8BA4\u683C\u5F0F\u5316\u7A0B\u5E8F'],
			['editor.fontFamily', 'Editor: Font Family\n\u7F16\u8F91\u5668\uFF1A\u5B57\u4F53\u7CFB\u5217'],
			['editor.fontSize', 'Editor: Font Size\n\u7F16\u8F91\u5668\uFF1A\u5B57\u4F53\u5927\u5C0F'],
			['editor.formatOnPaste', 'Editor: Format On Paste\n\u7F16\u8F91\u5668\uFF1A\u7C98\u8D34\u65F6\u683C\u5F0F\u5316'],
			['editor.formatOnSave', 'Editor: Format On Save\n\u7F16\u8F91\u5668\uFF1A\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316'],
			['editor.mouseWheelZoom', 'Editor: Mouse Wheel Zoom\n\u7F16\u8F91\u5668\uFF1A\u9F20\u6807\u6EDA\u8F6E\u7F29\u653E'],
			['editor.tabSize', 'Editor: Tab Size\n\u7F16\u8F91\u5668\uFF1A\u5236\u8868\u7B26\u5927\u5C0F'],
			['editor.wordWrap', 'Editor: Word Wrap\n\u7F16\u8F91\u5668\uFF1A\u81EA\u52A8\u6362\u884C'],
			['files.autoSave', 'Files: Auto Save\n\u6587\u4EF6\uFF1A\u81EA\u52A8\u4FDD\u5B58'],
			['files.exclude', 'Files: Exclude\n\u6587\u4EF6\uFF1A\u6392\u9664'],
			['workbench.colorTheme', 'Workbench: Color Theme\n\u5DE5\u4F5C\u53F0\uFF1A\u989C\u8272\u4E3B\u9898'],
			['editor.cursorBlinking', 'Cursor Blinking\n\u5149\u6807\u95EA\u70C1'],
			['editor.find.seedSearchStringFromSelection', 'Seed Search String From Selection\n\u4ECE\u9009\u533A\u586B\u5145\u641C\u7D22\u5B57\u7B26\u4E32'],
			['editor.fontLigatures', 'Font Ligatures\n\u5B57\u4F53\u8FDE\u5B57'],
			['editor.formatOnSaveMode', 'Format On Save Mode\n\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316\u6A21\u5F0F'],
			['diffEditor.renderSideBySide', 'Render Side By Side\n\u5E76\u6392\u6E32\u67D3'],
			['editor.minimap.showSlider', 'Show Slider\n\u663E\u793A\u6ED1\u5757'],
			['editor.inlineSuggest.fontFamily', 'Font Family\n\u5B57\u4F53\u7CFB\u5217'],
			['editor.screenReaderAnnounceInlineSuggestion', 'Screen Reader Announce Inline Suggestion\n\u5C4F\u5E55\u9605\u8BFB\u5668\u6717\u8BFB\u5185\u8054\u5EFA\u8BAE'],
			['editor.inlineSuggest.showToolbar', 'Show Toolbar\n\u663E\u793A\u5DE5\u5177\u680F'],
			['files.watcherInclude', 'Watcher Include\n\u76D1\u89C6\u5668\u5305\u542B']
		]);

		for (const [key, label] of expectedLabels) {
			assert.deepStrictEqual(
				settingKeyToDisplayFormat(key),
				{ category: '', label },
				key
			);
		}
	});

	test('toBilingualSettingTitle', () => {
		assert.strictEqual(
			toBilingualSettingTitle('Other', 'Accessibility Page Size'),
			'Other: Accessibility Page Size\n\u5176\u4ED6\uFF1A\u8F85\u52A9\u529F\u80FD\u9875\u9762\u5927\u5C0F'
		);

		assert.strictEqual(
			toBilingualSettingTitle('Other', 'Auto Closing Brackets'),
			'Other: Auto Closing Brackets\n\u5176\u4ED6\uFF1A\u81EA\u52A8\u95ED\u5408\u62EC\u53F7'
		);

		assert.strictEqual(
			toBilingualSettingTitle('Editor', 'Font Size'),
			'Editor: Font Size\n\u7F16\u8F91\u5668\uFF1A\u5B57\u4F53\u5927\u5C0F'
		);

		const requestedTitles = new Map<string, string>([
			['Trusted Domains: Prompt In Trusted Workspace', '\u53D7\u4FE1\u4EFB\u57DF\uFF1A\u5728\u53D7\u4FE1\u4EFB\u5DE5\u4F5C\u533A\u4E2D\u63D0\u793A'],
			['Notifications: Position', '\u901A\u77E5\uFF1A\u4F4D\u7F6E'],
			['Empty: Hint', '\u7A7A\uFF1A\u63D0\u793A'],
			['Other: Split Sizing', '\u5176\u4ED6\uFF1A\u62C6\u5206\u5927\u5C0F\u8C03\u6574'],
			['Other: Border', '\u5176\u4ED6\uFF1A\u8FB9\u6846'],
			['Other: Title Separator', '\u5176\u4ED6\uFF1A\u6807\u9898\u5206\u9694\u7B26'],
			['Other: Allowed Network Domains', '\u5176\u4ED6\uFF1A\u5141\u8BB8\u7684\u7F51\u7EDC\u57DF'],
			['Other: Network Filter', '\u5176\u4ED6\uFF1A\u7F51\u7EDC\u7B5B\u9009\u5668'],
			['Checkpoints: Show File Changes', '\u68C0\u67E5\u70B9\uFF1A\u663E\u793A\u6587\u4EF6\u66F4\u6539'],
			['Sandbox Advanced: Runtime', '\u6C99\u76D2\u9AD8\u7EA7\uFF1A\u8FD0\u884C\u65F6'],
			['Sandbox: Allow Auto Approve', '\u6C99\u76D2\uFF1A\u5141\u8BB8\u81EA\u52A8\u6279\u51C6'],
			['Detect Participant: Enabled', '\u68C0\u6D4B\u53C2\u4E0E\u8005\uFF1A\u542F\u7528'],
			['Implicit Context: Suggested Context', '\u9690\u5F0F\u4E0A\u4E0B\u6587\uFF1A\u5EFA\u8BAE\u7684\u4E0A\u4E0B\u6587'],
			['Other: Auto Indent On Paste Within String', '\u5176\u4ED6\uFF1A\u5728\u5B57\u7B26\u4E32\u5185\u7C98\u8D34\u65F6\uFF1A\u81EA\u52A8\u7F29\u8FDB'],
			['Other: Auto Surround', '\u5176\u4ED6\uFF1A\u81EA\u52A8\u5305\u56F4'],
			['Bracket Pair Colorization: Enabled', '\u5F69\u8272\u62EC\u53F7\uFF1A\u5DF2\u5F00\u542F'],
			['Editor \u203A Bracket Pair Colorization: Enabled', '\u7F16\u8F91\u5668 \u203A \u5F69\u8272\u62EC\u53F7\uFF1A\u5DF2\u5F00\u542F']
		]);

		for (const [englishTitle, chineseTitle] of requestedTitles) {
			const [category, label] = englishTitle.split(': ');
			assert.strictEqual(
				toBilingualSettingTitle(category, label),
				`${englishTitle}\n${chineseTitle}`,
				englishTitle
			);
		}
	});

	test('parseQuery', () => {
		function testParseQuery(input: string, expected: IParsedQuery) {
			assert.deepStrictEqual(
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
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo',
			<IParsedQuery>{
				tags: ['foo'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@modified foo',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'foo',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo @modified',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@tag:foo @modified my query',
			<IParsedQuery>{
				tags: ['foo', 'modified'],
				extensionFilters: [],
				query: 'my query',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'test @modified query',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'test  query',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'test @modified',
			<IParsedQuery>{
				tags: ['modified'],
				extensionFilters: [],
				query: 'test',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'query has @ for some reason',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				query: 'query has @ for some reason',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github'],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@ext:github.vscode-pull-request-github,vscode.git',
			<IParsedQuery>{
				tags: [],
				extensionFilters: ['github.vscode-pull-request-github', 'vscode.git'],
				query: '',
				featureFilters: [],
				idFilters: [],
				languageFilter: undefined
			});
		testParseQuery(
			'@feature:scm',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm'],
				query: '',
				idFilters: [],
				languageFilter: undefined
			});

		testParseQuery(
			'@feature:scm,terminal',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: ['scm', 'terminal'],
				query: '',
				idFilters: [],
				languageFilter: undefined
			});
		testParseQuery(
			'@id:files.autoSave',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: ['files.autoSave'],
				languageFilter: undefined
			});

		testParseQuery(
			'@id:files.autoSave,terminal.integrated.commandsToSkipShell',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: ['files.autoSave', 'terminal.integrated.commandsToSkipShell'],
				languageFilter: undefined
			});

		testParseQuery(
			'@lang:cpp',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: [],
				languageFilter: 'cpp'
			});

		testParseQuery(
			'@lang:cpp,python',
			<IParsedQuery>{
				tags: [],
				extensionFilters: [],
				featureFilters: [],
				query: '',
				idFilters: [],
				languageFilter: 'cpp'
			});
	});

	test('sanitizeId replaces all dots and slashes', () => {
		assert.deepStrictEqual(
			[
				sanitizeId('root.editor.font.size'),
				sanitizeId('group/subgroup/setting.key'),
				sanitizeId('no-special-chars'),
				sanitizeId('single.dot'),
			],
			[
				'root_editor_font_size',
				'group_subgroup_setting_key',
				'no-special-chars',
				'single_dot',
			]
		);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
