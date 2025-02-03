/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LineContext, SimpleCompletionModel } from '../../browser/simpleCompletionModel.js';
import { SimpleCompletionItem, type ISimpleCompletion } from '../../browser/simpleCompletionItem.js';

function createItem(options: Partial<ISimpleCompletion>): SimpleCompletionItem {
	return new SimpleCompletionItem({
		...options,
		label: options.label || 'defaultLabel',
		provider: options.provider || 'defaultProvider',
		replacementIndex: options.replacementIndex || 0,
		replacementLength: options.replacementLength || 1,
	});
}

function createFileItems(...labels: string[]): SimpleCompletionItem[] {
	return labels.map(label => createItem({ label, isFile: true }));
}

function createFileItemsModel(...labels: string[]): SimpleCompletionModel {
	return new SimpleCompletionModel(
		createFileItems(...labels),
		new LineContext('', 0)
	);
}

function createFolderItems(...labels: string[]): SimpleCompletionItem[] {
	return labels.map(label => createItem({ label, isDirectory: true }));
}

function createFolderItemsModel(...labels: string[]): SimpleCompletionModel {
	return new SimpleCompletionModel(
		createFolderItems(...labels),
		new LineContext('', 0)
	);
}

function assertItems(model: SimpleCompletionModel, labels: string[]): void {
	assert.deepStrictEqual(model.items.map(i => i.completion.label), labels);
	assert.strictEqual(model.items.length, labels.length); // sanity check
}

suite('SimpleCompletionModel', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	let model: SimpleCompletionModel;

	test('should handle an empty list', function () {
		model = new SimpleCompletionModel([], new LineContext('', 0));

		assert.strictEqual(model.items.length, 0);
	});

	test('should handle a list with one item', function () {
		model = new SimpleCompletionModel([
			createItem({ label: 'a' }),
		], new LineContext('', 0));

		assert.strictEqual(model.items.length, 1);
		assert.strictEqual(model.items[0].completion.label, 'a');
	});

	test('should sort alphabetically', function () {
		model = new SimpleCompletionModel([
			createItem({ label: 'b' }),
			createItem({ label: 'z' }),
			createItem({ label: 'a' }),
		], new LineContext('', 0));

		assert.strictEqual(model.items.length, 3);
		assert.strictEqual(model.items[0].completion.label, 'a');
		assert.strictEqual(model.items[1].completion.label, 'b');
		assert.strictEqual(model.items[2].completion.label, 'z');
	});

	suite('files and folders', () => {
		test('should deprioritize files that start with underscore', function () {
			const initial = ['_a', 'a', 'z'];
			const expected = ['a', 'z', '_a'];
			assertItems(createFileItemsModel(...initial), expected);
			assertItems(createFolderItemsModel(...initial), expected);
		});

		test('should ignore the dot in dotfiles when sorting', function () {
			const initial = ['b', '.a', 'a', '.b'];
			const expected = ['.a', 'a', 'b', '.b'];
			assertItems(createFileItemsModel(...initial), expected);
			assertItems(createFolderItemsModel(...initial), expected);
		});

		test('should handle many files and folders correctly', function () {
			// This is VS Code's root directory with some python items added that have special
			// sorting
			const items = [
				...createFolderItems(
					'__pycache',
					'.build',
					'.configurations',
					'.devcontainer',
					'.eslint-plugin-local',
					'.github',
					'.profile-oss',
					'.vscode',
					'.vscode-test',
					'build',
					'cli',
					'extensions',
					'node_modules',
					'out',
					'remote',
					'resources',
					'scripts',
					'src',
					'test',
				),
				...createFileItems(
					'__init__.py',
					'.editorconfig',
					'.eslint-ignore',
					'.git-blame-ignore-revs',
					'.gitattributes',
					'.gitignore',
					'.lsifrc.json',
					'.mailmap',
					'.mention-bot',
					'.npmrc',
					'.nvmrc',
					'.vscode-test.js',
					'cglicenses.json',
					'cgmanifest.json',
					'CodeQL.yml',
					'CONTRIBUTING.md',
					'eslint.config.js',
					'gulpfile.js',
					'LICENSE.txt',
					'package-lock.json',
					'package.json',
					'product.json',
					'README.md',
					'SECURITY.md',
					'ThirdPartyNotices.txt',
					'tsfmt.json',
				)
			];
			const model = new SimpleCompletionModel(items, new LineContext('', 0));
			assertItems(model, [
				'.build',
				'build',
				'cglicenses.json',
				'cgmanifest.json',
				'cli',
				'CodeQL.yml',
				'.configurations',
				'CONTRIBUTING.md',
				'.devcontainer',
				'.npmrc',
				'.gitignore',
				'.editorconfig',
				'eslint.config.js',
				'.eslint-ignore',
				'.eslint-plugin-local',
				'extensions',
				'.gitattributes',
				'.git-blame-ignore-revs',
				'.github',
				'gulpfile.js',
				'LICENSE.txt',
				'.lsifrc.json',
				'.nvmrc',
				'.mailmap',
				'.mention-bot',
				'node_modules',
				'out',
				'package.json',
				'package-lock.json',
				'product.json',
				'.profile-oss',
				'README.md',
				'remote',
				'resources',
				'scripts',
				'SECURITY.md',
				'src',
				'test',
				'ThirdPartyNotices.txt',
				'tsfmt.json',
				'.vscode',
				'.vscode-test',
				'.vscode-test.js',
				'__init__.py',
				'__pycache',
			]);
		});
	});
});
