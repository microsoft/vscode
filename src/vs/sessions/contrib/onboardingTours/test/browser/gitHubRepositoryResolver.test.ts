/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../../../workbench/contrib/git/common/utils.js';
import { parseGitHubRepositoryFromGitConfig, resolveGitHubRepositoryFromGitConfig } from '../../browser/gitHubRepositoryResolver.js';

const ROOT = URI.from({ scheme: 'vscode-tests', path: '/workspace' });

suite('GitHubRepositoryResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers the origin GitHub remote from git config', () => {
		assert.deepStrictEqual(parseGitHubRepositoryFromGitConfig(`
			[remote "upstream"]
				url = https://github.com/upstream/project.git
			[remote "origin"]
				url = git@github.com:owner/project.git
		`), {
			owner: 'owner',
			repo: 'project',
		});
	});

	test('does not normalize HTTP hosts that merely end in github.com', () => {
		assert.deepStrictEqual({
			lookalike: getGitHubRepositoryFromRemoteUrl('https://evil-github.com/owner/project.git'),
			sshAlias: getGitHubRepositoryFromRemoteUrl('ssh://work-github.com/owner/project.git'),
		}, {
			lookalike: undefined,
			sshAlias: { owner: 'owner', repo: 'project' },
		});
	});

	test('uses the configured GitHub Enterprise host exclusively', () => {
		assert.deepStrictEqual({
			https: getGitHubRepositoryFromRemoteUrl('https://ghe.example.com/owner/project.git', ['ghe.example.com']),
			ssh: getGitHubRepositoryFromRemoteUrl('git@ghe.example.com:owner/project.git', ['ghe.example.com']),
			lookalike: getGitHubRepositoryFromRemoteUrl('https://evil-ghe.example.com/owner/project.git', ['ghe.example.com']),
			githubDotCom: getGitHubRepositoryFromRemoteUrl('https://github.com/owner/project.git', ['ghe.example.com']),
			unconfigured: getGitHubRepositoryFromRemoteUrl('https://ghe.example.com/owner/project.git'),
		}, {
			https: { owner: 'owner', repo: 'project' },
			ssh: { owner: 'owner', repo: 'project' },
			lookalike: undefined,
			githubDotCom: undefined,
			unconfigured: undefined,
		});
	});

	test('resolves the configured GitHub Enterprise origin from git config', () => {
		assert.deepStrictEqual(parseGitHubRepositoryFromGitConfig(`
			[remote "origin"]
				url = https://ghe.example.com/owner/project.git
		`, ['ghe.example.com']), {
			owner: 'owner',
			repo: 'project',
		});
	});

	test('finds git config above a nested selected workspace folder', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, provider));
		await fileService.createFolder(joinPath(ROOT, '.git'));
		await fileService.createFolder(joinPath(ROOT, 'src', 'feature'));
		await fileService.writeFile(joinPath(ROOT, '.git', 'config'), VSBuffer.fromString(`
			[remote "origin"]
				url = https://github.com/microsoft/vscode.git
		`));

		assert.deepStrictEqual(await resolveGitHubRepositoryFromGitConfig(fileService, joinPath(ROOT, 'src', 'feature')), {
			owner: 'microsoft',
			repo: 'vscode',
		});
	});
});
