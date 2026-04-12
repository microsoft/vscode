/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { settingKeyToDisplayFormat, parseQuery, sanitizeId } from '../../browser/settingsTreeModels.js';
suite('SettingsTree', () => {
    test('settingKeyToDisplayFormat', () => {
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar'), {
            category: 'Foo',
            label: 'Bar'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar.etc'), {
            category: 'Foo › Bar',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('fooBar.etcSomething'), {
            category: 'Foo Bar',
            label: 'Etc Something'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo'), {
            category: '',
            label: 'Foo'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.1leading.number'), {
            category: 'Foo › 1leading',
            label: 'Number'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.1Leading.number'), {
            category: 'Foo › 1 Leading',
            label: 'Number'
        });
    });
    test('settingKeyToDisplayFormat - with category', () => {
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar', 'foo'), {
            category: '',
            label: 'Bar'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('disableligatures.ligatures', 'disableligatures'), {
            category: '',
            label: 'Ligatures'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar.etc', 'foo'), {
            category: 'Bar',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('fooBar.etcSomething', 'foo'), {
            category: 'Foo Bar',
            label: 'Etc Something'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar.etc', 'foo/bar'), {
            category: '',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('foo.bar.etc', 'something/foo'), {
            category: 'Bar',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('bar.etc', 'something.bar'), {
            category: '',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('fooBar.etc', 'fooBar'), {
            category: '',
            label: 'Etc'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('fooBar.somethingElse.etc', 'fooBar'), {
            category: 'Something Else',
            label: 'Etc'
        });
    });
    test('settingKeyToDisplayFormat - known acronym/term', () => {
        assert.deepStrictEqual(settingKeyToDisplayFormat('css.someCssSetting'), {
            category: 'CSS',
            label: 'Some CSS Setting'
        });
        assert.deepStrictEqual(settingKeyToDisplayFormat('powershell.somePowerShellSetting'), {
            category: 'PowerShell',
            label: 'Some PowerShell Setting'
        });
    });
    test('parseQuery', () => {
        function testParseQuery(input, expected) {
            assert.deepStrictEqual(parseQuery(input), expected, input);
        }
        testParseQuery('', {
            tags: [],
            extensionFilters: [],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@modified', {
            tags: ['modified'],
            extensionFilters: [],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@tag:foo', {
            tags: ['foo'],
            extensionFilters: [],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@modified foo', {
            tags: ['modified'],
            extensionFilters: [],
            query: 'foo',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@tag:foo @modified', {
            tags: ['foo', 'modified'],
            extensionFilters: [],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@tag:foo @modified my query', {
            tags: ['foo', 'modified'],
            extensionFilters: [],
            query: 'my query',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('test @modified query', {
            tags: ['modified'],
            extensionFilters: [],
            query: 'test  query',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('test @modified', {
            tags: ['modified'],
            extensionFilters: [],
            query: 'test',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('query has @ for some reason', {
            tags: [],
            extensionFilters: [],
            query: 'query has @ for some reason',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@ext:github.vscode-pull-request-github', {
            tags: [],
            extensionFilters: ['github.vscode-pull-request-github'],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@ext:github.vscode-pull-request-github,vscode.git', {
            tags: [],
            extensionFilters: ['github.vscode-pull-request-github', 'vscode.git'],
            query: '',
            featureFilters: [],
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@feature:scm', {
            tags: [],
            extensionFilters: [],
            featureFilters: ['scm'],
            query: '',
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@feature:scm,terminal', {
            tags: [],
            extensionFilters: [],
            featureFilters: ['scm', 'terminal'],
            query: '',
            idFilters: [],
            languageFilter: undefined
        });
        testParseQuery('@id:files.autoSave', {
            tags: [],
            extensionFilters: [],
            featureFilters: [],
            query: '',
            idFilters: ['files.autoSave'],
            languageFilter: undefined
        });
        testParseQuery('@id:files.autoSave,terminal.integrated.commandsToSkipShell', {
            tags: [],
            extensionFilters: [],
            featureFilters: [],
            query: '',
            idFilters: ['files.autoSave', 'terminal.integrated.commandsToSkipShell'],
            languageFilter: undefined
        });
        testParseQuery('@lang:cpp', {
            tags: [],
            extensionFilters: [],
            featureFilters: [],
            query: '',
            idFilters: [],
            languageFilter: 'cpp'
        });
        testParseQuery('@lang:cpp,python', {
            tags: [],
            extensionFilters: [],
            featureFilters: [],
            query: '',
            idFilters: [],
            languageFilter: 'cpp'
        });
    });
    test('sanitizeId replaces all dots and slashes', () => {
        assert.deepStrictEqual([
            sanitizeId('root.editor.font.size'),
            sanitizeId('group/subgroup/setting.key'),
            sanitizeId('no-special-chars'),
            sanitizeId('single.dot'),
        ], [
            'root_editor_font_size',
            'group_subgroup_setting_key',
            'no-special-chars',
            'single_dot',
        ]);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NUcmVlTW9kZWxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy90ZXN0L2Jyb3dzZXIvc2V0dGluZ3NUcmVlTW9kZWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxVQUFVLEVBQWdCLFVBQVUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXRILEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzFCLElBQUksQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7UUFDdEMsTUFBTSxDQUFDLGVBQWUsQ0FDckIseUJBQXlCLENBQUMsU0FBUyxDQUFDLEVBQ3BDO1lBQ0MsUUFBUSxFQUFFLEtBQUs7WUFDZixLQUFLLEVBQUUsS0FBSztTQUNaLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQ3JCLHlCQUF5QixDQUFDLGFBQWEsQ0FBQyxFQUN4QztZQUNDLFFBQVEsRUFBRSxXQUFXO1lBQ3JCLEtBQUssRUFBRSxLQUFLO1NBQ1osQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FDckIseUJBQXlCLENBQUMscUJBQXFCLENBQUMsRUFDaEQ7WUFDQyxRQUFRLEVBQUUsU0FBUztZQUNuQixLQUFLLEVBQUUsZUFBZTtTQUN0QixDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUNyQix5QkFBeUIsQ0FBQyxLQUFLLENBQUMsRUFDaEM7WUFDQyxRQUFRLEVBQUUsRUFBRTtZQUNaLEtBQUssRUFBRSxLQUFLO1NBQ1osQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFD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