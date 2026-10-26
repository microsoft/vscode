/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { suite, test } from 'node:test';
import { pathToFileURL } from 'url';
import { getChangedFiles, getChangedFilesScope, getEslintScope, getHygieneScope, parseNameStatus, typeAwareLintFolders, type IChangedFile } from '../changedFiles.ts';

const repositoryRoot = path.join(import.meta.dirname, '../../..');

function modified(...paths: string[]): IChangedFile[] {
	return paths.map(path => ({ path, deleted: false }));
}

function deleted(...paths: string[]): IChangedFile[] {
	return paths.map(path => ({ path, deleted: true }));
}

function noFiles(): string[] {
	throw new Error('Unexpected file listing');
}

suite('changedFiles', () => {

	test('parses git name-status output', () => {
		assert.deepStrictEqual(parseNameStatus('M\0src/a.ts\0A\0src/b ts.ts\0D\0src/c.ts\0T\0src/d.ts\0'), [
			...modified('src/a.ts', 'src/b ts.ts'),
			...deleted('src/c.ts'),
			...modified('src/d.ts'),
		]);
	});

	test('lists no changes between HEAD and HEAD', () => {
		assert.deepStrictEqual(getChangedFiles('HEAD'), []);
	});

	test('checks every file when the changes cannot be listed', () => {
		const scope = getChangedFilesScope('refs/heads/does-not-exist', () => assert.fail('Unexpected scope computation'));
		assert.deepStrictEqual({ kind: scope.kind, reason: scope.reason.startsWith('the files changed since refs/heads/does-not-exist could not be listed') }, { kind: 'full', reason: true });
	});

	suite('ESLint', () => {

		test('lints the changed files that the full lint covers', () => {
			assert.deepStrictEqual(getEslintScope([
				...modified(
					'src/vs/base/common/strings.ts',
					'src/vs/base/common/arrays.ts',
					'.github/actions/detect-changes/detect.ts',
					'README.md',
					'src/vs/base/browser/ui/button/button.css',
					// Excluded by .eslint-ignore.
					'extensions/git/src/api/git.d.ts',
				),
				...deleted('src/vs/base/common/async.ts'),
			], noFiles), {
				kind: 'files',
				files: [
					'.github/actions/detect-changes/detect.ts',
					'src/vs/base/common/arrays.ts',
					'src/vs/base/common/strings.ts',
				],
				reason: 'changed files',
			});
		});

		test('lints every file when a change can affect unchanged files', () => {
			assert.deepStrictEqual([
				modified('eslint.config.js'),
				modified('extensions/git/eslint.config.mjs'),
				modified('.eslint-ignore'),
				modified('.eslint-allowed-bracket-notation-files'),
				modified('.eslint-plugin-local/code-no-any-casts.ts'),
				modified('extensions/copilot/.eslintplugin/index.ts'),
				modified('package.json'),
				deleted('package-lock.json'),
				modified('extensions/copilot/package.json'),
				modified('extensions/copilot/package-lock.json'),
				modified('build/lib/i18n.resources.json'),
				modified('src/vs/base/common/arrays.ts', 'build/filters.ts'),
			].map(changes => getEslintScope(changes, noFiles)), [
				{ kind: 'full', reason: 'eslint.config.js changed' },
				{ kind: 'full', reason: 'extensions/git/eslint.config.mjs changed' },
				{ kind: 'full', reason: '.eslint-ignore changed' },
				{ kind: 'full', reason: '.eslint-allowed-bracket-notation-files changed' },
				{ kind: 'full', reason: '.eslint-plugin-local/code-no-any-casts.ts changed' },
				{ kind: 'full', reason: 'extensions/copilot/.eslintplugin/index.ts changed' },
				{ kind: 'full', reason: 'package.json changed' },
				{ kind: 'full', reason: 'package-lock.json changed' },
				{ kind: 'full', reason: 'extensions/copilot/package.json changed' },
				{ kind: 'full', reason: 'extensions/copilot/package-lock.json changed' },
				{ kind: 'full', reason: 'build/lib/i18n.resources.json changed' },
				{ kind: 'full', reason: 'build/filters.ts changed' },
			]);
		});

		test('lints the extensions with type information when their types can change', () => {
			const listed: (readonly string[])[] = [];
			const listFiles = (folders: readonly string[]) => {
				listed.push(folders);
				return ['extensions/simple-browser/src/extension.ts', 'extensions/simple-browser/package.json', 'extensions/typescript-language-features/src/api.ts'];
			};
			assert.deepStrictEqual({
				scopes: [
					getEslintScope(modified('src/vs/base/common/arrays.ts', 'extensions/simple-browser/src/extension.ts'), listFiles),
					getEslintScope(deleted('src/vscode-dts/vscode.proposed.externalUriOpener.d.ts'), listFiles),
				],
				listed,
			}, {
				scopes: [{
					kind: 'files',
					files: ['extensions/simple-browser/src/extension.ts', 'extensions/typescript-language-features/src/api.ts', 'src/vs/base/common/arrays.ts'],
					reason: 'changed files, plus the extensions linted with type information because extensions/simple-browser/src/extension.ts changed',
				}, {
					kind: 'files',
					files: ['extensions/simple-browser/src/extension.ts', 'extensions/typescript-language-features/src/api.ts'],
					reason: 'changed files, plus the extensions linted with type information because src/vscode-dts/vscode.proposed.externalUriOpener.d.ts changed',
				}],
				listed: [typeAwareLintFolders, typeAwareLintFolders],
			});
		});

		test('knows every extension that eslint.config.js lints with type information', async () => {
			const { default: config } = await import(pathToFileURL(path.join(repositoryRoot, 'eslint.config.js')).href) as { default: { files?: string[]; languageOptions?: { parserOptions?: { project?: string | string[]; projectService?: unknown } } }[] };
			const typeAwarePaths = config
				.filter(entry => entry.languageOptions?.parserOptions?.project || entry.languageOptions?.parserOptions?.projectService)
				.flatMap(entry => [...(entry.files ?? ['**']), ...[entry.languageOptions?.parserOptions?.project ?? []].flat()]);
			assert.deepStrictEqual({
				found: typeAwarePaths.length > 0,
				uncovered: typeAwarePaths.filter(p => !typeAwareLintFolders.some(folder => p.startsWith(folder))),
			}, { found: true, uncovered: [] });
		});
	});

	suite('hygiene', () => {

		test('checks the changed files', () => {
			assert.deepStrictEqual(getHygieneScope([
				...modified('src/vs/base/common/strings.ts', 'README.md'),
				...deleted('src/vs/base/common/async.ts'),
			]), {
				kind: 'files',
				files: ['README.md', 'src/vs/base/common/strings.ts'],
				reason: 'changed files',
			});
		});

		test('checks every file when the checks change', () => {
			assert.deepStrictEqual([
				modified('build/hygiene.ts'),
				modified('build/lib/stylelint/vscode-known-variables.json'),
				modified('tsfmt.json'),
				modified('extensions/copilot/tsfmt.json'),
				deleted('package-lock.json'),
			].map(changes => getHygieneScope(changes)), [
				{ kind: 'full', reason: 'build/hygiene.ts changed' },
				{ kind: 'full', reason: 'build/lib/stylelint/vscode-known-variables.json changed' },
				{ kind: 'full', reason: 'tsfmt.json changed' },
				{ kind: 'full', reason: 'extensions/copilot/tsfmt.json changed' },
				{ kind: 'full', reason: 'package-lock.json changed' },
			]);
		});
	});
});
