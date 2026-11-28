/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, suite, test, vi } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { MockFileSystemService } from '../../../filesystem/node/test/mockFileSystemService';
import { RemoteContentExclusion } from '../../../ignore/node/remoteContentExclusion';
import { MockAuthenticationService } from '../../../ignore/node/test/mockAuthenticationService';
import { MockCAPIClientService, rulesResponse } from '../../../ignore/node/test/mockCAPIClientService';
import { MockWorkspaceService } from '../../../ignore/node/test/mockWorkspaceService';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { TestLogService } from '../../../testing/common/testLogService';
import { IGitExtensionService } from '../../common/gitExtensionService';
import { API } from '../../vscode/git';
import { GitServiceImpl } from '../gitServiceImpl';

// Serves the file system from disk, so each layout is a real directory tree.
vi.mock('vscode', async importOriginal => {
	const original = await importOriginal<typeof import('vscode')>();
	const diskFs = await import('fs/promises');
	return {
		...original,
		ChatHookType: undefined,
		ChatRequest: undefined,
		LanguageModelToolInformation: undefined,
		Extension: undefined,
		ChatMcpToolInvocationData: undefined,
		workspace: {
			fs: {
				stat: async (uri: { fsPath: string }) => {
					const stat = await diskFs.stat(uri.fsPath);
					return { type: stat.isDirectory() ? original.FileType.Directory : original.FileType.File, ctime: 0, mtime: 0, size: stat.size };
				},
				readFile: (uri: { fsPath: string }) => diskFs.readFile(uri.fsPath),
			},
		},
	};
});

function remoteConfig(url: string): string {
	return `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
}

/** The path as `URI.fsPath` reports it. On Windows that lowercases the drive letter. */
function fsPathOf(...segments: string[]): string {
	return URI.file(path.join(...segments)).fsPath;
}

suite('GitServiceImpl.getRepositoryFetchUrls', () => {
	let tempRoot: string;
	let service: GitServiceImpl;

	/** Writes a file below the temp root, creating its folders. */
	function write(relativePath: string, contents: string): string {
		const fullPath = path.join(tempRoot, relativePath);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, contents);
		return fullPath;
	}

	/**
	 * Stands in for the Git extension. The repository root is the nearest folder with a `.git`
	 * entry, file or folder, which is what `git rev-parse --show-toplevel` finds.
	 */
	function fakeGitApi(): API {
		const getRepositoryRoot = async (uri: URI): Promise<URI | undefined> => {
			let directory = uri.fsPath;
			while (!fs.existsSync(path.join(directory, '.git'))) {
				const parent = path.dirname(directory);
				if (parent === directory) {
					return undefined;
				}
				directory = parent;
			}
			return URI.file(directory);
		};
		// These mocks implement the members used by GitServiceImpl. The cast covers the rest of the API.
		return {
			state: 'initialized',
			repositories: [],
			onDidOpenRepository: Event.None,
			onDidCloseRepository: Event.None,
			onDidChangeState: Event.None,
			getRepository: () => undefined,
			getRepositoryRoot,
		} as unknown as API;
	}

	async function remotesFor(file: string): Promise<{ root: string | undefined; remotes: (string | undefined)[] | undefined }> {
		const result = await service.getRepositoryFetchUrls(URI.file(file));
		return { root: result?.rootUri.fsPath, remotes: result?.remoteFetchUrls };
	}

	beforeEach(() => {
		tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-impl-')));
		const gitExtensionService: IGitExtensionService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			extensionAvailable: true,
			getExtensionApi: () => fakeGitApi(),
		};
		service = new GitServiceImpl(gitExtensionService, new TestLogService());
	});

	afterEach(() => {
		service.dispose();
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('reads the shared remotes for a file in a linked worktree', async () => {
		const repo = path.join(tempRoot, 'repo');
		write('repo/.git/config', remoteConfig('https://github.com/org/repo.git'));
		write('repo/.git/worktrees/feature/commondir', '../..\n');
		write('repo/feature/.git', `gitdir: ${path.join(repo, '.git', 'worktrees', 'feature')}\n`);
		const file = write('repo/feature/src/index.ts', '');

		expect(await remotesFor(file)).toEqual({ root: fsPathOf(repo, 'feature'), remotes: ['https://github.com/org/repo.git'] });
	});

	test('reads the shared remotes for a linked worktree with a relative gitdir pointer', async () => {
		write('repo/.git/config', remoteConfig('https://github.com/org/repo.git'));
		write('repo/.git/worktrees/feature/commondir', '../..\n');
		write('feature/.git', 'gitdir: ../repo/.git/worktrees/feature\n');
		const file = write('feature/src/index.ts', '');

		expect(await remotesFor(file)).toEqual({ root: fsPathOf(tempRoot, 'feature'), remotes: ['https://github.com/org/repo.git'] });
	});

	test('reads the module remotes for a file in a submodule', async () => {
		write('super/.git/config', remoteConfig('https://github.com/org/super.git'));
		write('super/.git/modules/lib/config', remoteConfig('https://github.com/org/lib.git'));
		write('super/lib/.git', 'gitdir: ../.git/modules/lib\n');
		const file = write('super/lib/src/index.ts', '');

		expect(await remotesFor(file)).toEqual({ root: fsPathOf(tempRoot, 'super', 'lib'), remotes: ['https://github.com/org/lib.git'] });
	});

	test('reads the remotes for a file in a repository with a separate git directory', async () => {
		write('separate/config', remoteConfig('https://github.com/org/separate.git'));
		write('repo/.git', `gitdir: ${path.join(tempRoot, 'separate')}\n`);
		const file = write('repo/src/index.ts', '');

		expect(await remotesFor(file)).toEqual({ root: fsPathOf(tempRoot, 'repo'), remotes: ['https://github.com/org/separate.git'] });
	});

	test('reads the remotes of an ordinary repository', async () => {
		write('repo/.git/config', remoteConfig('https://github.com/org/repo.git'));
		const file = write('repo/src/index.ts', '');

		expect(await remotesFor(file)).toEqual({ root: fsPathOf(tempRoot, 'repo'), remotes: ['https://github.com/org/repo.git'] });
	});

	describe('content exclusion', () => {
		let capi: MockCAPIClientService;
		let exclusion: RemoteContentExclusion;

		beforeEach(() => {
			capi = new MockCAPIClientService();
			exclusion = new RemoteContentExclusion(
				service,
				new TestLogService(),
				new MockAuthenticationService() as unknown as IAuthenticationService,
				capi as unknown as ICAPIClientService,
				new MockFileSystemService(),
				new MockWorkspaceService(),
				new NullRequestLogger(),
			);
		});

		afterEach(() => {
			exclusion.dispose();
		});

		test('excludes a file in a linked worktree by a rule on the worktree remote', async () => {
			write('repo/.git/config', remoteConfig('https://github.com/org/repo.git'));
			write('repo/.git/worktrees/feature/commondir', '../..\n');
			write('feature/.git', `gitdir: ${path.join(tempRoot, 'repo', '.git', 'worktrees', 'feature')}\n`);
			const secret = write('feature/secret.ts', '');
			const readme = write('feature/readme.md', '');
			// Rule paths are relative to the repository root.
			capi.setResponder(repos => rulesResponse(new Map([['https://github.com/org/repo.git', { paths: ['/secret.ts'] }]]), repos));

			expect({
				secret: await exclusion.isIgnored(URI.file(secret), CancellationToken.None),
				readme: await exclusion.isIgnored(URI.file(readme), CancellationToken.None),
			}).toEqual({ secret: true, readme: false });
		});
	});
});
