/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { workspace, extensions, Uri, commands } from 'vscode';
import { findPullRequestTemplates, pickPullRequestTemplate } from '../pushErrorHandler.js';
import { getMatchTier, sortRemoteSources } from '../remoteSourceProvider.js';

suite('github smoke test', function () {
	const cwd = workspace.workspaceFolders![0].uri;

	suiteSetup(async function () {
		const ext = extensions.getExtension('vscode.github');
		await ext?.activate();
	});

	test('should find all templates', async function () {
		const expectedValuesSorted = [
			'PULL_REQUEST_TEMPLATE/a.md',
			'PULL_REQUEST_TEMPLATE/b.md',
			'docs/PULL_REQUEST_TEMPLATE.md',
			'docs/PULL_REQUEST_TEMPLATE/a.md',
			'docs/PULL_REQUEST_TEMPLATE/b.md',
			'.github/PULL_REQUEST_TEMPLATE.md',
			'.github/PULL_REQUEST_TEMPLATE/a.md',
			'.github/PULL_REQUEST_TEMPLATE/b.md',
			'PULL_REQUEST_TEMPLATE.md'
		];
		expectedValuesSorted.sort();

		const uris = await findPullRequestTemplates(cwd);

		const urisSorted = uris.map(x => x.path.slice(cwd.path.length));
		urisSorted.sort();

		assert.deepStrictEqual(urisSorted, expectedValuesSorted);
	});

	test('selecting non-default quick-pick item should correspond to a template', async () => {
		const template0 = Uri.file('some-imaginary-template-0');
		const template1 = Uri.file('some-imaginary-template-1');
		const templates = [template0, template1];

		const pick = pickPullRequestTemplate(Uri.file('/'), templates);

		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');

		assert.ok(await pick === template0);
	});

	test('selecting first quick-pick item should return undefined', async () => {
		const templates = [Uri.file('some-imaginary-file')];

		const pick = pickPullRequestTemplate(Uri.file('/'), templates);

		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');

		assert.ok(await pick === undefined);
	});
});

suite('GitHub remote source ordering (#163603)', function () {
	test('getMatchTier ranks exact match best, prefix next, substring after', () => {
		assert.strictEqual(getMatchTier('microsoft/vscode-pull-request-github', 'vscode-pull-request-github'), 0);
		assert.strictEqual(getMatchTier('microsoft/vscode-pull-request-github', 'vscode-pull'), 1);
		assert.strictEqual(getMatchTier('microsoft/vscode-pull-request-github', 'microsoft/vscode'), 2);
		assert.strictEqual(getMatchTier('someuser/awesome-vscode-pull-tool', 'vscode-pull'), 3);
		assert.strictEqual(getMatchTier('microsoft/vscode-pull-request-github', 'completely-unrelated'), 4);
		assert.strictEqual(getMatchTier('microsoft/vscode-pull-request-github', undefined), 4);
	});

	test('getMatchTier is case insensitive', () => {
		assert.strictEqual(getMatchTier('Microsoft/VSCode-Pull-Request-GitHub', 'vscode-pull'), 1);
		assert.strictEqual(getMatchTier('Microsoft/VSCode-Pull-Request-GitHub', 'VSCODE-PULL'), 1);
	});

	test('sortRemoteSources surfaces canonical repo over forks even when forks have higher API rank', () => {
		// Simulates the bug: GitHub search API returns a fork before the canonical
		// repo for query "vscode-pull". Without a stable local sort, the displayed
		// list matches the API response order. With our sort, the canonical repo
		// (whose name starts with the query) should appear first.
		const fork = {
			name: '$(github) someuser/my-vscode-pull-fork',
			url: 'https://github.com/someuser/my-vscode-pull-fork.git',
			fullName: 'someuser/my-vscode-pull-fork',
			stars: 5
		};
		const canonical = {
			name: '$(github) microsoft/vscode-pull-request-github',
			url: 'https://github.com/microsoft/vscode-pull-request-github.git',
			fullName: 'microsoft/vscode-pull-request-github',
			stars: 2000
		};
		const unrelated = {
			name: '$(github) other/totally-different',
			url: 'https://github.com/other/totally-different.git',
			fullName: 'other/totally-different',
			stars: 50000
		};

		// API returned them in this (relevance) order; without our fix the user
		// would see the fork first because it comes first in the merged map.
		const sorted = sortRemoteSources([fork, canonical, unrelated], 'vscode-pull');
		assert.deepStrictEqual(sorted.map(s => s.fullName), [
			'microsoft/vscode-pull-request-github',
			'someuser/my-vscode-pull-fork',
			'other/totally-different'
		]);
	});

	test('sortRemoteSources is deterministic across reorderings of the input', () => {
		// Each keystroke produces a new merged array in a different order because
		// the GitHub search API ranks results by fuzzy relevance. Our local sort
		// must produce the same display order regardless of input order.
		const a = { name: 'a', url: 'a', fullName: 'org/alpha', stars: 10 };
		const b = { name: 'b', url: 'b', fullName: 'org/beta', stars: 100 };
		const c = { name: 'c', url: 'c', fullName: 'org/gamma', stars: 1 };

		const order1 = sortRemoteSources([a, b, c], 'org').map(s => s.fullName);
		const order2 = sortRemoteSources([c, a, b], 'org').map(s => s.fullName);
		const order3 = sortRemoteSources([b, c, a], 'org').map(s => s.fullName);

		assert.deepStrictEqual(order1, order2);
		assert.deepStrictEqual(order2, order3);
	});

	test('sortRemoteSources falls back to stars then name when match tier ties', () => {
		const high = { name: 'h', url: 'h', fullName: 'org/zeta', stars: 100 };
		const mid = { name: 'm', url: 'm', fullName: 'org/alpha', stars: 50 };
		const low = { name: 'l', url: 'l', fullName: 'org/beta', stars: 50 };

		const sorted = sortRemoteSources([mid, low, high], 'org');
		assert.deepStrictEqual(sorted.map(s => s.fullName), [
			'org/zeta',  // highest stars
			'org/alpha', // tied stars, alphabetically first
			'org/beta'   // tied stars, alphabetically second
		]);
	});

	test('sortRemoteSources with no query orders by stars then name', () => {
		const a = { name: 'a', url: 'a', fullName: 'org/a', stars: 5 };
		const b = { name: 'b', url: 'b', fullName: 'org/b', stars: 100 };
		const c = { name: 'c', url: 'c', fullName: 'org/c', stars: 100 };

		const sorted = sortRemoteSources([a, b, c], undefined);
		assert.deepStrictEqual(sorted.map(s => s.fullName), ['org/b', 'org/c', 'org/a']);
	});
});
