/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert, { notStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCompletionModel } from '../../browser/terminalCompletionModel.js';
import { LineContext } from '../../../../../services/suggest/browser/simpleCompletionModel.js';
import { TerminalCompletionItem, TerminalCompletionItemKind, type ITerminalCompletion } from '../../browser/terminalCompletionItem.js';
import type { CompletionItemLabel } from '../../../../../services/suggest/browser/simpleCompletionItem.js';

function createItem(options: Partial<ITerminalCompletion>): TerminalCompletionItem {
	return new TerminalCompletionItem({
		...options,
		kind: options.kind ?? TerminalCompletionItemKind.Method,
		label: options.label || 'defaultLabel',
		provider: options.provider || 'defaultProvider',
		replacementRange: options.replacementRange || [0, 1],
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

function assertItems(model: TerminalCompletionModel, labels: (string | CompletionItemLabel)[]): void {
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

	suite('Punctuation', () => {
		test('punctuation chars should be below other methods', function () {
			const items = [
				createItem({ label: 'a' }),
				createItem({ label: 'b' }),
				createItem({ label: ',' }),
				createItem({ label: ';' }),
				createItem({ label: ':' }),
				createItem({ label: 'c' }),
				createItem({ label: '[' }),
				createItem({ label: '...' }),
			];
			model = new TerminalCompletionModel(items, new LineContext('', 0));
			assertItems(model, ['a', 'b', 'c', ',', ';', ':', '[', '...']);
		});
		test('punctuation chars should be below other files', function () {
			const items = [
				createItem({ label: '..' }),
				createItem({ label: '...' }),
				createItem({ label: '../' }),
				createItem({ label: './a/' }),
				createItem({ label: './b/' }),
			];
			model = new TerminalCompletionModel(items, new LineContext('', 0));
			assertItems(model, ['./a/', './b/', '..', '...', '../']);
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
					replacementRange: [0, 0],
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


	suite('git branch priority sorting', () => {
		test('should prioritize main and master branches for git commands', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'feature-branch' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'development' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('git checkout ', 0));
			assertItems(model, ['main', 'master', 'development', 'feature-branch']);
		});

		test('should prioritize main and master branches for git switch command', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'feature-branch' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'another-feature' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('git switch ', 0));
			assertItems(model, ['main', 'master', 'another-feature', 'feature-branch']);
		});

		test('should not prioritize main and master for non-git commands', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'feature-branch' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('ls ', 0));
			assertItems(model, ['feature-branch', 'main', 'master']);
		});

		test('should handle git commands with leading whitespace', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'feature-branch' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('  git checkout ', 0));
			assertItems(model, ['main', 'master', 'feature-branch']);
		});

		test('should work with complex label objects', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: 'feature-branch', description: 'Feature branch' } }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: 'master', description: 'Master branch' } }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: 'main', description: 'Main branch' } })
			];
			const model = new TerminalCompletionModel(items, new LineContext('git checkout ', 0));
			assertItems(model, [
				{ label: 'main', description: 'Main branch' },
				{ label: 'master', description: 'Master branch' },
				{ label: 'feature-branch', description: 'Feature branch' },
			]);
		});

		test('should not prioritize branches with similar names', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'mainline' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'masterpiece' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('git checkout ', 0));
			assertItems(model, ['main', 'master', 'mainline', 'masterpiece']);
		});

		test('should prioritize for git branch -d', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'main' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'master' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'dev' })
			];
			const model = new TerminalCompletionModel(items, new LineContext('git branch -d ', 0));
			assertItems(model, ['main', 'master', 'dev']);
		});
	});

	suite('mixed kind sorting', () => {
		test('should sort arguments before flags and options', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.Flag, label: '--verbose' }),
				createItem({ kind: TerminalCompletionItemKind.Option, label: '--config' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'value2' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'value1' }),
				createItem({ kind: TerminalCompletionItemKind.Flag, label: '--all' }),
			];
			const model = new TerminalCompletionModel(items, new LineContext('cmd ', 0));
			assertItems(model, ['value1', 'value2', '--all', '--config', '--verbose']);
		});

		test('should sort by kind hierarchy: methods/aliases, arguments, others, files/folders', () => {
			const items = [
				createItem({ kind: TerminalCompletionItemKind.File, label: 'file.txt' }),
				createItem({ kind: TerminalCompletionItemKind.Flag, label: '--flag' }),
				createItem({ kind: TerminalCompletionItemKind.Argument, label: 'arg' }),
				createItem({ kind: TerminalCompletionItemKind.Method, label: 'method' }),
				createItem({ kind: TerminalCompletionItemKind.Folder, label: 'folder/' }),
				createItem({ kind: TerminalCompletionItemKind.Option, label: '--option' }),
				createItem({ kind: TerminalCompletionItemKind.Alias, label: 'alias' }),
				createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFile, label: 'file2.txt' }),
				createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFolder, label: 'folder2/' }),
			];
			const model = new TerminalCompletionModel(items, new LineContext('', 0));
			assertItems(model, ['alias', 'method', 'arg', '--flag', '--option', 'file2.txt', 'file.txt', 'folder/', 'folder2/']);
		});
	});
});

