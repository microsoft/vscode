/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createLibTestingContext } from '../../test/context';
import { makeFsUri } from '../../util/uri';
import { extractRepoInfo } from '../repository';
import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';

function findGitRoot(startDir: string): string {
	let dir = startDir;
	while (!fs.statSync(path.join(dir, '.git'), { throwIfNoEntry: false })?.isDirectory()) {
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error('Could not find git root');
		}
		dir = parent;
	}
	return dir;
}

function getOriginInfo(gitRoot: string): { org: string; repo: string } {
	const originUrl = execSync('git config --get remote.origin.url', { cwd: gitRoot, encoding: 'utf-8' }).trim();
	const match = originUrl.match(/github\.com[:/](?<org>[^/]+)\/(?<repo>[^/.]+)/);
	if (!match?.groups) {
		throw new Error(`Could not parse origin URL: ${originUrl}`);
	}
	return { org: match.groups.org, repo: match.groups.repo };
}

suite('Extract repo info tests', function () {
	const gitRoot = findGitRoot(__dirname);
	const baseFolder = { uri: makeFsUri(gitRoot) };
	const origin = getOriginInfo(gitRoot);

	test('Extract repo info', async function () {
		const accessor = createLibTestingContext().createTestingAccessor();
		const info = await extractRepoInfo(accessor, baseFolder.uri);

		assert.ok(info);

		// url and pathname get their own special treatment because they depend on how the repo was cloned.
		const { url, pathname, repoId, ...repoInfo } = info;

		assert.deepStrictEqual(repoInfo, {
			baseFolder,
			hostname: 'github.com'
		});
		assert.ok(repoId);
		assert.deepStrictEqual(
			{ org: repoId.org, repo: repoId.repo, type: repoId.type },
			{ org: origin.org, repo: origin.repo, type: 'github' }
		);
		assert.ok(
			[
				`git@github.com:${origin.org}/${origin.repo}`,
				`https://github.com/${origin.org}/${origin.repo}`,
				`https://github.com/${origin.org}/${origin.repo}.git`,
			].includes(url),
			`url is ${url}`
		);
		assert.ok(pathname.includes(`/${origin.repo}`));

		assert.deepStrictEqual(await extractRepoInfo(accessor, 'file:///tmp/does/not/exist/.git/config'), undefined);
	});

	test('Extract repo info - Jupyter Notebook vscode-notebook-cell ', async function () {
		const cellUri = baseFolder.uri.replace(/^file:/, 'vscode-notebook-cell:');
		assert.ok(cellUri.startsWith('vscode-notebook-cell:'));
		const accessor = createLibTestingContext().createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const info = await extractRepoInfo(accessor, cellUri);

		assert.ok(info);

		// url and pathname get their own special treatment because they depend on how the repo was cloned.
		const { url, pathname, repoId, ...repoInfo } = info;

		assert.deepStrictEqual(repoInfo, {
			baseFolder,
			hostname: 'github.com'
		});
		assert.ok(repoId);
		assert.deepStrictEqual(
			{ org: repoId.org, repo: repoId.repo, type: repoId.type },
			{ org: origin.org, repo: origin.repo, type: 'github' }
		);
		assert.ok(
			[
				`git@github.com:${origin.org}/${origin.repo}`,
				`https://github.com/${origin.org}/${origin.repo}`,
				`https://github.com/${origin.org}/${origin.repo}.git`,
			].includes(url),
			`url is ${url}`
		);
		assert.ok(pathname.includes(`/${origin.repo}`));

		assert.deepStrictEqual(await instantiationService.invokeFunction(extractRepoInfo, 'file:///tmp/does/not/exist/.git/config'), undefined);
	});
});
