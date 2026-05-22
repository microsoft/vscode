/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { FileIconThemeData, FileIconThemeLoader } from '../../browser/fileIconThemeData.js';

function createIconThemeJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		iconDefinitions: {
			'_file': { iconPath: './icons/file.svg' },
			'_folder': { iconPath: './icons/folder.svg' },
			'_test': { iconPath: './icons/test.svg' },
			'_env': { iconPath: './icons/env.svg' },
			'_docker': { iconPath: './icons/docker.svg' },
			'_stories': { iconPath: './icons/stories.svg' },
			'_glob_folder': { iconPath: './icons/glob-folder.svg' },
		},
		file: '_file',
		folder: '_folder',
		folderExpanded: '_folder',
		...overrides,
	});
}

function createLoader(themeJson: string): FileIconThemeLoader {
	const fileService = new class extends mock<IExtensionResourceLoaderService>() {
		override readExtensionResource(): Promise<string> {
			return Promise.resolve(themeJson);
		}
	};

	const languageService = new class extends mock<ILanguageService>() {
		override getRegisteredLanguageIds(): string[] { return []; }
		override getIcon(): null { return null; }
	};

	return new FileIconThemeLoader(fileService, languageService);
}

function createThemeData(id: string = 'test-theme'): FileIconThemeData {
	const data = FileIconThemeData.createUnloadedTheme(id);
	(data as { location: URI }).location = URI.file('/test/icon-theme.json');
	return data;
}

suite('FileIconThemeData - Glob Patterns', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('fileNames globs', () => {

		test('prefix glob generates starts-with attribute selector', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { 'webpack.*': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-file-name^='), 'should contain starts-with selector');
			assert.ok(css.includes('webpack.'), 'should contain webpack. prefix');
		});

		test('suffix glob generates ends-with attribute selector', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { '*.test.ts': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-file-name$='), 'should contain ends-with selector');
			assert.ok(css.includes('.test.ts'), 'should contain .test.ts suffix');
		});

		test('middle glob generates both starts-with and ends-with selectors', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { 'docker-compose.*.yml': '_docker' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-file-name^='), 'should contain starts-with selector');
			assert.ok(css.includes('[data-file-name$='), 'should contain ends-with selector');
			assert.ok(css.includes('docker-compose.'), 'should contain prefix');
			assert.ok(css.includes('.yml'), 'should contain suffix');
		});

		test('bare * is rejected', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { '*': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(!css.includes('data-file-name'), 'bare * should not generate attribute selector');
		});

		test('exact fileNames produce class-based selectors', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { 'tsconfig.json': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('tsconfig\\.json-name-file-icon'), 'should use class-based name selector');
			assert.ok(!css.includes('data-file-name'), 'should not use attribute selector');
		});

		test('glob fileNames omit .name-file-icon score boost', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { 'tsconfig.json': '_file', 'tsconfig.*.json': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('.name-file-icon'), 'exact match should have name-file-icon boost');
			assert.ok(css.includes('[data-file-name^='), 'glob should use attribute selector');
		});

		test('attribute selectors are case insensitive', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { '*.test.ts': '_test' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes(' i]'), 'should contain case-insensitive flag');
		});

		test('multiple * in a key generates contains selector for middle segments', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { '*.env.*': '_env' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-file-name*='), 'should generate contains attribute selector for middle segment');
			assert.ok(css.includes('.env.'), 'should contain .env. pattern');
		});
	});

	suite('fileExtensions globs', () => {

		test('extension glob generates contains attribute selector', async () => {
			const loader = createLoader(createIconThemeJson({
				fileExtensions: { 'stories.*': '_stories' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-file-name*='), 'should contain contains selector');
			assert.ok(css.includes('.stories.'), 'should contain .stories. pattern');
		});

		test('exact fileExtensions produce class-based selectors', async () => {
			const loader = createLoader(createIconThemeJson({
				fileExtensions: { 'ts': '_file' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('ts-ext-file-icon'), 'should use class-based ext selector');
			assert.ok(!css.includes('data-file-name'), 'should not use attribute selector');
		});
	});

	suite('folderNames globs', () => {

		test('prefix glob for folders uses data-folder-name', async () => {
			const loader = createLoader(createIconThemeJson({
				folderNames: { 'test_*': '_glob_folder' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-folder-name^='), 'should contain starts-with folder selector');
			assert.ok(css.includes('folder-icon'), 'should target folder-icon');
		});

		test('suffix glob for folders uses data-folder-name', async () => {
			const loader = createLoader(createIconThemeJson({
				folderNames: { '*-module': '_glob_folder' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('[data-folder-name$='), 'should contain ends-with folder selector');
		});

		test('exact folderNames produce class-based selectors', async () => {
			const loader = createLoader(createIconThemeJson({
				folderNames: { 'src': '_folder' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('src-name-folder-icon'), 'should use class-based folder selector');
			assert.ok(!css.includes('data-folder-name'), 'should not use attribute selector');
		});
	});

	suite('folderNamesExpanded globs', () => {

		test('generates attribute selector with expanded twistie selector', async () => {
			const loader = createLoader(createIconThemeJson({
				folderNamesExpanded: { 'build_*': '_glob_folder' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('data-folder-name'), 'should target data-folder-name');
			assert.ok(css.includes('collapsible:not(.collapsed)'), 'should include expanded folder selector');
		});
	});

	suite('rootFolderNames globs', () => {

		test('generates attribute selector for root folder globs', async () => {
			const loader = createLoader(createIconThemeJson({
				rootFolderNames: { 'app-*': '_glob_folder' }
			}));
			const data = createThemeData();
			const css = await loader.load(data);
			assert.ok(css);
			assert.ok(css.includes('data-folder-name'), 'should target data-folder-name');
			assert.ok(css.includes('rootfolder-icon'), 'should target rootfolder-icon');
		});
	});

	suite('theme metadata', () => {

		test('hasFileIcons is set for glob fileNames', async () => {
			const loader = createLoader(createIconThemeJson({
				fileNames: { '*.test.ts': '_test' }
			}));
			const data = createThemeData();
			await loader.load(data);
			assert.strictEqual(data.hasFileIcons, true);
		});

		test('hasFolderIcons is set for glob folderNames', async () => {
			const loader = createLoader(createIconThemeJson({
				folderNames: { 'test_*': '_glob_folder' }
			}));
			const data = createThemeData();
			await loader.load(data);
			assert.strictEqual(data.hasFolderIcons, true);
		});
	});
});
