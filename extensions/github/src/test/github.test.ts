/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { workspace, extensions, Uri, commands } from 'vscode';
import { findPullRequestTemplates, pickPullRequestTemplate, createPullRequest } from '../pushErrorHandler';

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
			'PULL_REQUEST_TEMPLATE.md',
			'src/PULL_REQUEST_TEMPLATE.md',
			'src/PULL_REQUEST_TEMPLATE/a.md',
			'src/PULL_REQUEST_TEMPLATE/b.md',
			'templates/PULL_REQUEST_TEMPLATE.md',
			'templates/PULL_REQUEST_TEMPLATE/a.md',
			'templates/PULL_REQUEST_TEMPLATE/b.md'
		];
		expectedValuesSorted.sort();

		const uris = await findPullRequestTemplates(cwd);

		const urisSorted = uris.map(x => x.path.slice(cwd.path.length));
		urisSorted.sort();

		assert.deepStrictEqual(urisSorted, expectedValuesSorted);
	});

	test('selecting non-default quick-pick item should correspond to a template', async () => {
		const template0 = Uri.file("some-imaginary-template-0");
		const template1 = Uri.file("some-imaginary-template-1");
		const templates = [template0, template1];

		const pick = pickPullRequestTemplate(Uri.file("/"), templates);

		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');

		assert.ok(await pick === template0);
	});

	test('selecting first quick-pick item should return undefined', async () => {
		const templates = [Uri.file("some-imaginary-file")];

		const pick = pickPullRequestTemplate(Uri.file("/"), templates);

		await commands.executeCommand('workbench.action.quickOpenSelectNext');
		await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');

		assert.ok(await pick === undefined);
	});

	test('should create a pull request', async function () {
		const repository = {
			rootUri: cwd,
			state: {
				HEAD: {
					name: 'main'
				}
			},
			getCommit: async (head: string) => ({
				message: 'Test commit message\n\nThis is a test commit.'
			}),
			setConfig: async (key: string, value: string) => { }
		};

		const octokit = {
			pulls: {
				create: async (params: any) => ({
					data: {
						number: 1,
						html_url: 'https://github.com/test/test-repo/pull/1'
					}
				})
			}
		};

		const owner = 'test';
		const repo = 'test-repo';
		const ghRepository = {
			full_name: 'test/test-repo',
			html_url: 'https://github.com/test/test-repo',
			owner: {
				login: 'test'
			},
			default_branch: 'main'
		};
		const localName = 'main';
		const remoteName = 'main';

		const pr = await createPullRequest(repository, octokit, owner, repo, ghRepository, localName, remoteName);

		assert.strictEqual(pr.number, 1);
		assert.strictEqual(pr.html_url, 'https://github.com/test/test-repo/pull/1');
	});
});
