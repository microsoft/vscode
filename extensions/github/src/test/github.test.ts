/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { workspace, extensions, Uri, commands } from 'vscode';
import type { TelemetryReporter } from '@vscode/extension-telemetry';
import { findPullRequestTemplates, GithubPushErrorHandler, pickPullRequestTemplate } from '../pushErrorHandler.js';
import { GitErrorCodes } from '../typings/git.constants.js';
import type { Repository } from '../typings/git.d.ts';

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

suite('github push error handler', function () {
	const commitRefs = 'remote: fatal error in commit_refs\n ! [remote rejected] main -> main (failure)\nerror: failed to push some refs to \'github.com:user/repo.git\'\n';
	const nonFastForward = ' ! [rejected] main -> main (fetch first)\nerror: failed to push some refs to \'github.com:user/repo.git\'\n';
	const pushProtection = 'remote: error: GH009: Secrets detected! This push failed.\nerror: failed to push some refs to \'github.com:user/repo.git\'\n';

	// Modal dialogs are refused in integration tests, so a routed error rejects with the dialog's message
	async function handlePushError(pushUrl: string, stderr: string): Promise<boolean> {
		const handler = new GithubPushErrorHandler({ sendTelemetryEvent() { } } as Partial<TelemetryReporter> as TelemetryReporter);
		try {
			const error = Object.assign(new Error('push failed'), { stderr, gitErrorCode: GitErrorCodes.PushRejected as GitErrorCodes });
			return await handler.handlePushError({} as Repository, { name: 'origin', pushUrl, isReadOnly: false }, 'main:main', error);
		} finally {
			handler.dispose();
		}
	}

	teardown(async function () {
		await commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('commit_refs failure on a GitHub remote shows the commit_refs dialog', async function () {
		for (const pushUrl of ['git@github.com:user/repo.git', 'https://github.com/user/repo.git']) {
			await assert.rejects(handlePushError(pushUrl, commitRefs), /GitHub could not update the remote refs/);
		}
	});

	test('other rejections and non-GitHub remotes do not get the commit_refs dialog', async function () {
		assert.strictEqual(await handlePushError('git@github.com:user/repo.git', nonFastForward), false);
		assert.strictEqual(await handlePushError('git@gitlab.com:user/repo.git', commitRefs), false);
		await assert.rejects(handlePushError('git@github.com:user/repo.git', pushProtection), /push protection is enabled/);
	});
});
