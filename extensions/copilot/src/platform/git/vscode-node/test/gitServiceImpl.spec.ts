/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import { FileType, Uri } from 'vscode';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { TestLogService } from '../../../testing/common/testLogService';
import { IGitExtensionService } from '../../common/gitExtensionService';
import { API, Repository } from '../../vscode/git';
import { GitServiceImpl } from '../gitServiceImpl';

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }));

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	workspace: { fs: { stat } },
}));

suite('GitServiceImpl', () => {
	const folder = '/home/user/.rustup/toolchains/stable/share/doc/rust/html/core/arch/aarch64';
	let onDidOpenRepository: Emitter<Repository>;
	let getRepositoryRoot: ReturnType<typeof vi.fn<(uri: Uri) => Promise<Uri | null>>>;
	let gitService: GitServiceImpl;
	let now: number;

	function fileIn(dir: string, name: string): URI {
		return URI.file(`${dir}/${name}`);
	}

	function openRepository(root: string): void {
		onDidOpenRepository.fire({
			rootUri: Uri.file(root),
			state: { HEAD: { name: 'main' }, onDidChange: Event.None, remotes: [], worktrees: [] },
			ui: { selected: false, onDidChange: Event.None },
		} as unknown as Repository);
	}

	beforeEach(() => {
		now = Date.UTC(2026, 0, 1);
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		stat.mockImplementation(async (uri: Uri) => ({ type: uri.path.endsWith('.html') ? FileType.File : FileType.Directory }));
		onDidOpenRepository = new Emitter<Repository>();
		getRepositoryRoot = vi.fn(async () => null);
		const gitAPI = {
			state: 'initialized',
			onDidChangeState: Event.None,
			onDidOpenRepository: onDidOpenRepository.event,
			onDidCloseRepository: Event.None,
			repositories: [],
			getRepository: () => null,
			getRepositoryRoot,
		} as unknown as API;
		const gitExtensionService: IGitExtensionService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			extensionAvailable: true,
			getExtensionApi: () => gitAPI,
		};
		gitService = new GitServiceImpl(gitExtensionService, new TestLogService());
	});

	afterEach(() => {
		gitService.dispose();
		onDidOpenRepository.dispose();
		vi.restoreAllMocks();
	});

	test('files in a folder outside any repository share one repository root lookup', async () => {
		const concurrent = await Promise.all(Array.from({ length: 20 }, (_, i) => gitService.getRepositoryFetchUrls(fileIn(folder, `fn.a${i}.html`))));
		const later = await gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.b.html'));
		await gitService.getRepositoryFetchUrls(fileIn('/home/user/other', 'index.html'));

		expect({
			results: new Set([...concurrent, later]),
			lookedUp: getRepositoryRoot.mock.calls.map(([uri]) => uri.path),
		}).toEqual({
			results: new Set([undefined]),
			lookedUp: [folder, '/home/user/other'],
		});
	});

	test('a folder outside any repository is looked up again once the answer expires or a repository opens', async () => {
		await gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.a.html'));
		now += 5 * 60 * 1000;
		await gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.b.html'));
		openRepository('/home/user');
		await gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.c.html'));

		expect(getRepositoryRoot).toHaveBeenCalledTimes(3);
	});

	test('a lookup that was in flight when a repository opened is not remembered', async () => {
		const pending = new DeferredPromise<Uri | null>();
		getRepositoryRoot.mockReturnValueOnce(pending.p);

		const lookup = gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.a.html'));
		await vi.waitFor(() => expect(getRepositoryRoot).toHaveBeenCalledTimes(1));
		openRepository('/home/user');
		await pending.complete(null);
		await lookup;
		await gitService.getRepositoryFetchUrls(fileIn(folder, 'fn.b.html'));

		expect(getRepositoryRoot).toHaveBeenCalledTimes(2);
	});
});
