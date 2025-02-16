/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert, { notStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCompletionModel } from '../../browser/terminalCompletionModel.js';
import { LineContext } from '../../../../../services/suggest/browser/simpleCompletionModel.js';
import { TerminalCompletionItem, TerminalCompletionItemKind, type ITerminalCompletion } from '../../browser/terminalCompletionItem.js';

function createItem(options: Partial<ITerminalCompletion>): TerminalCompletionItem {
	return new TerminalCompletionItem({
		...options,
		kind: options.kind ?? TerminalCompletionItemKind.Method,
		label: options.label || 'defaultLabel',
		provider: options.provider || 'defaultProvider',
		replacementIndex: options.replacementIndex || 0,
		replacementLength: options.replacementLength || 1,
	});
}

function createFileItems(...labels: string[]): TerminalCompletionItem[] {
	return labels.map(label => createItem({ label, kind: TerminalCompletionItemKind.File }));
}

function createFileItemsModel(...labels: string[]): TerminalCompletionModel {
	return new TerminalCompletionModel(
		createFileItems(...labels),
		new LineContext('', 0)
	);
}

function createFolderItems(...labels: string[]): TerminalCompletionItem[] {
	return labels.map(label => createItem({ label, kind: TerminalCompletionItemKind.Folder }));
}

function createFolderItemsModel(...labels: string[]): TerminalCompletionModel {
	return new TerminalCompletionModel(
		createFolderItems(...labels),
		new LineContext('', 0)
	);
}

function assertItems(model: TerminalCompletionModel, labels: string[]): void {
	assert.deepStrictEqual(model.items.map(i => i.completion.label), labels);
	assert.strictEqual(model.items.length, labels.length); // sanity check
}

suite('TerminalCompletionModel', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	let model: TerminalCompletionModel;

	test('should handle an empty list', function () {
		model = new TerminalCompletionModel([], new LineContext('', 0));

		assert.strictEqual(model.items.length, 0);
	});

	test('should handle a list with one item', function () {
		model = new TerminalCompletionModel([
			createItem({ label: 'a' }),
		], new LineContext('', 0));

		assert.strictEqual(model.items.length, 1);
		assert.strictEqual(model.items[0].completion.label, 'a');
	});

	test('should sort alphabetically', function () {
		model = new TerminalCompletionModel([
			createItem({ label: 'b' }),
			createItem({ label: 'z' }),
			createItem({ label: 'a' }),
		], new LineContext('', 0));

		assert.strictEqual(model.items.length, 3);
		assert.strictEqual(model.items[0].completion.label, 'a');
		assert.strictEqual(model.items[1].completion.label, 'b');
		assert.strictEqual(model.items[2].completion.label, 'z');
	});

	test('fuzzy matching', () => {
		const initial = [
			'.\\.eslintrc',
			'.\\resources\\',
			'.\\scripts\\',
			'.\\src\\',
		];
		const expected = [
			'.\\scripts\\',
			'.\\src\\',
			'.\\.eslintrc',
			'.\\resources\\',
		];
		model = new TerminalCompletionModel(initial.map(e => (createItem({ label: e }))), new LineContext('s', 0));

		assertItems(model, expected);
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
			const model = new TerminalCompletionModel(items, new LineContext('', 0));
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
				'.editorconfig',
				'eslint.config.js',
				'.eslint-ignore',
				'.eslint-plugin-local',
				'extensions',
				'.gitattributes',
				'.git-blame-ignore-revs',
				'.github',
				'.gitignore',
				'gulpfile.js',
				'LICENSE.txt',
				'.lsifrc.json',
				'.mailmap',
				'.mention-bot',
				'node_modules',
				'.npmrc',
				'.nvmrc',
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

	suite('inline completions', () => {
		function createItems(kind: TerminalCompletionItemKind.InlineSuggestion | TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop) {
			return [
				...createFolderItems('a', 'c'),
				...createFileItems('b', 'd'),
				new TerminalCompletionItem({
					label: 'ab',
					provider: 'core',
					replacementIndex: 0,
					replacementLength: 0,
					kind
				})
			];
		}
		suite('InlineSuggestion', () => {
			test('should put on top generally', function () {
				const model = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext('', 0));
				strictEqual(model.items[0].completion.label, 'ab');
			});
			test('should NOT put on top when there\'s an exact match of another item', function () {
				const model = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext('a', 0));
				notStrictEqual(model.items[0].completion.label, 'ab');
				strictEqual(model.items[1].completion.label, 'ab');
			});
		});
		suite('InlineSuggestionAlwaysOnTop', () => {
			test('should put on top generally', function () {
				const model = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext('', 0));
				strictEqual(model.items[0].completion.label, 'ab');
			});
			test('should put on top even if there\'s an exact match of another item', function () {
				const model = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext('a', 0));
				strictEqual(model.items[0].completion.label, 'ab');
			});
		});
	});
});
