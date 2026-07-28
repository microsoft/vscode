/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTextDocument } from '../../test/textDocument';
import { Language, LanguageDetection, languageDetection } from '../languageDetection';

suite('language detection', function () {
	test('reuse languages for untitled documents', function () {
		assert.deepStrictEqual(
			languageDetection.detectLanguage({ uri: 'untitled:///abc', languageId: 'typescript' }),
			new Language('typescript', true, '')
		);
	});

	test('normalizes "c" to "cpp" for untitled documents', function () {
		assert.deepStrictEqual(
			languageDetection.detectLanguage({ uri: 'untitled:///abc', languageId: 'c' }),
			new Language('cpp', true, '')
		);
	});

	test('reuse languages for notebook documents', function () {
		assert.deepStrictEqual(
			languageDetection.detectLanguage({ uri: 'vscode-notebook-cell:/abc', languageId: 'typescript' }).languageId,
			'typescript'
		);
	});

	const toDetectByExtension: [string, string][] = [
		['.ts', 'typescript'],
		['.js', 'javascript'],
		['.jsx', 'javascriptreact'],
		['.tsx', 'typescriptreact'],
		['.html', 'html'],
		['.html5', 'html'],
		['.css', 'css'],
		['.scss', 'scss'],
		['.less', 'less'],
		['.jsonc', 'jsonc'],
		['.json', 'json'],
		['.xml', 'xml'],
		['.yml', 'yaml'],
		['.yaml', 'yaml'],
		['.php', 'php'],
		['.py', 'python'],
		['.rb', 'ruby'],
		['.go', 'go'],
		['.java', 'java'],
		['.cs', 'csharp'],
		['.cpp', 'cpp'],
		['.c', 'cpp'],
		['.C', 'cpp'],
		['.h', 'cpp'],
		['.sh', 'shellscript'],
		['.bash', 'shellscript'],
		['.sql', 'sql'],
		['.swift', 'swift'],
		['.vb', 'vb'],
		['.frm', 'vb'],
		['.lua', 'lua'],
		['.tex', 'latex'],
		['.md', 'markdown'],
		['.markdown', 'markdown'],
		['.r', 'r'],
		['.R', 'r'],
		['.blade.php', 'blade'],
		['.BLADE.php', 'blade'],
		['.gradle', 'groovy'],
		['.gradle.kts', 'kotlin'],
		['.ejs', 'html'],
		['.liquid', 'html'],
		['.yml.erb', 'yaml'],
		['.yml.njk', 'yaml'],
		['.some.file.yml.njk', 'yaml'],
		['.phtml', 'html'],
		['f.sourcecode.php', 'php'],
		['.plist', 'xml'],
		['.svg', 'xml'],
		['.jsp', 'html'],
		['.code-workspace', 'jsonc'],
		['.wxss', 'css'],
		['.luau', 'lua'],
		['.codon', 'python'],
		['.edn', 'clojure'],
		['.tpl', 'html'],
		['.rs', 'rust'],
		['.bas', 'vb'],
		['.wxml', 'html'],
		['.nvue', 'vue'],
		['.jenkinsfile', 'groovy'],
		['.twig', 'html'],
		['.inc.php', 'php'],
		['.mm', 'objective-cpp'],
		['.module', 'php'],
		['.install', 'php'],
		['.theme', 'php'],
		['.rc', 'cpp'],
		['.idl', 'cpp'],
		['.pubxml', 'xml'],
		['.njk', 'html'],
		['.fish', 'shellscript'],
		['.vbs', 'vb'],
		['.sage', 'python'],
		['.mdx', 'markdown'],
		['.somethingelse', 'clientProvidedLanguageId'],
	];

	toDetectByExtension.forEach(([extension, languageId]) => {
		test(`detect ${languageId} by file extension ${extension}`, function () {
			assertLanguageId(`file:///test${extension}`, languageId);
		});
	});

	const toDetectByFilename: [string, string][] = [
		['.bash_history', 'shellscript'],
		['.bashrc', 'shellscript'],
		['.zshrc', 'shellscript'],
		['.irbrc', 'ruby'],
		['Gemfile', 'ruby'],
		['riemann.config', 'clojure'],
		['Dockerfile', 'dockerfile'],
		['Dockerfile.local', 'dockerfile'],
		['.env.production', 'dotenv'],
		['.env.development.local', 'dotenv'],
		['Jenkinsfile', 'groovy'],
		['Makefile', 'makefile'],
		['.classpath', 'xml'],
		['.gemrc', 'yaml'],
		['tsconfig.json', 'jsonc'],
		['.eslintrc.json', 'jsonc'],
		['settings.json', 'jsonc'],
		['tasks.json', 'jsonc'],
		['keybindings.json', 'jsonc'],
		['extensions.json', 'jsonc'],
		['argv.json', 'jsonc'],
		['profiles.json', 'jsonc'],
		['devcontainer.json', 'jsonc'],
		['.devcontainer.json', 'jsonc'],
	];

	toDetectByFilename.forEach(([filename, languageId]) => {
		test(`detect ${languageId} by filename ${filename}`, function () {
			assertLanguageId(`file:///${filename}`, languageId);
		});
	});

	const urls: [string, string][] = [
		['file:///some/path/test.ts', 'typescript'],
		['untitled:///some/path/test', 'clientProvidedLanguageId'],
		['file:////server-name/shared-resource-pathname/test.sh', 'shellscript'],
	];

	urls.forEach(([url, languageId]) => {
		test(`detect ${languageId} by url ${url}`, function () {
			assertLanguageId(url, languageId);
		});
	});

	const extensionsToDetect: [string, string][] = [
		['', ''],
		['.ts', '.ts'],
		['a.longer.path.ts', '.ts'],
		['.sh', '.sh'],
		['.html.erb', '.html.erb'],
		['.html.slim', '.html.slim'],
		['.unknown.erb', '.erb'],
		['.yaml.njk', '.yaml.njk'],
		['.unknown', '.unknown'],
	];

	extensionsToDetect.forEach(([filename, extension]) => {
		test(`detect extension ${extension} by filename test${filename}`, function () {
			assertExtension(`file:///test${filename}`, extension);
		});
	});

	test(`has no extension for filename without extension`, function () {
		assertExtension(`file:///.secretproduct`, '');
	});

	function assertExtension(uri: string, expectedExtension: string) {
		const doc = createTextDocument(uri, 'clientProvidedLanguageId', 1, 'test content');

		const language = languageDetection.detectLanguage(doc);

		assert.deepStrictEqual(language.fileExtension, expectedExtension);
	}

	function assertLanguageId(uri: string, expectedLanguageId: string) {
		const doc = createTextDocument(uri, 'clientProvidedLanguageId', 1, 'test content');

		const language = languageDetection.detectLanguage(doc);

		assert.deepStrictEqual(language.languageId, expectedLanguageId);
	}

	test('detected languages for ambiguous options will be re-detected', function () {
		assert.deepStrictEqual(detect('testfile.c', languageDetection).languageId, 'cpp');
		assert.deepStrictEqual(detect('testfile.h', languageDetection).languageId, 'cpp');
		assert.deepStrictEqual(detect('testfile.cpp', languageDetection).languageId, 'cpp');
		assert.deepStrictEqual(detect('testfile.h', languageDetection).languageId, 'cpp');
	});

	function detect(filename: string, languageDetection: LanguageDetection): Language {
		return languageDetection.detectLanguage(
			createTextDocument(`file:///${filename}`, 'clientProvidedLanguageId', 1, 'test content')
		);
	}
});
