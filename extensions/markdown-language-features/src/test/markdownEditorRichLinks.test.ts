/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { autorun, derived, observableValue } from '@vscode/observables';
import 'mocha';
import * as vscode from 'vscode';
import { getGitCommitPresentation, GitLinkPresentationResolver, normalizeGitRemoteUrl, resolveGitCommitHref } from '../preview/linkPresentation/gitLinkPresentationResolver';
import { createAsyncLinkPresentation, ImmutableLinkPresentationCache } from '../preview/linkPresentation/linkPresentationResolver';
import { LinkPresentationService } from '../preview/linkPresentation/linkPresentationService';

suite('Markdown editor rich links', () => {
	test('resolves repository hints relative to the authoritative Markdown document', () => {
		const resolve = (href: string, source: vscode.Uri) =>
			new URL(resolveGitCommitHref(href, source)).searchParams.get('path');
		const href = 'commit:1234567?path=../../my%20repo';
		assert.deepStrictEqual([
			resolve(href, vscode.Uri.parse('file:///workspace/notes/daily/note.md')),
			resolve(href, vscode.Uri.parse('file:///other/notes/daily/note.md')),
			resolve(href, vscode.Uri.parse('vscode-remote://ssh-remote+host/workspace/notes/daily/note.md')),
			resolve('commit:1234567?path=/repo', vscode.Uri.parse('vscode-remote://ssh-remote+host/notes/note.md')),
			resolve('commit:1234567?path=file%3A%2F%2F%2Frepo', vscode.Uri.parse('file:///notes/note.md')),
		], [
			'file:///workspace/my%20repo',
			'file:///other/my%20repo',
			'vscode-remote://ssh-remote%2Bhost/workspace/my%20repo',
			'vscode-remote://ssh-remote%2Bhost/repo',
			'file:///repo',
		]);
		assert.strictEqual(resolveGitCommitHref('https://example.com/resource?path=../repo', vscode.Uri.file('note.md')), 'https://example.com/resource?path=../repo');
		assert.strictEqual(resolveGitCommitHref(href), href);
	});

	test('canonicalizes Windows repository hints without losing query or fragment', () => {
		const href = 'commit:1234567?path=D%3A%5Crepos%5Cmy%20repo&other=value#details';
		const resolved = new URL(resolveGitCommitHref(href));
		assert.strictEqual(vscode.Uri.parse(resolved.searchParams.get('path')!).fsPath, 'd:\\repos\\my repo');
		assert.strictEqual(resolved.searchParams.get('other'), 'value');
		assert.strictEqual(resolved.hash, '#details');
	});

	test('normalizes common Git remote URL formats', () => {
		assert.deepStrictEqual([
			normalizeGitRemoteUrl('https://github.com/microsoft/vscode.git'),
			normalizeGitRemoteUrl('git@github.com:microsoft/vscode.git'),
			normalizeGitRemoteUrl('ssh://git@github.com/microsoft/vscode.git'),
		], [
			'github.com/microsoft/vscode',
			'github.com/microsoft/vscode',
			'github.com/microsoft/vscode',
		]);
	});

	test('supports local and forge Git commit links', () => {
		const refresh = new vscode.EventEmitter<void>();
		const resolver = new GitLinkPresentationResolver(new ImmutableLinkPresentationCache());
		try {
			const context = {
				onDidRequestRefresh: refresh.event,
				logger: { trace: () => { } },
			};
			assert.deepStrictEqual({
				local: !!resolver.resolve('commit://1234567890abcdef', context),
				github: !!resolver.resolve('https://github.com/microsoft/vscode/commit/1234567890abcdef', context),
				gitlab: !!resolver.resolve('https://gitlab.com/microsoft/vscode/-/commit/1234567890abcdef', context),
				invalidLocal: !!resolver.resolve('commit:--output=package.json', context),
				invalidForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/--output=package.json', context),
				malformedForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/%', context),
				other: !!resolver.resolve('https://example.com/resource', context),
			}, {
				local: true,
				github: true,
				gitlab: true,
				invalidLocal: false,
				invalidForge: false,
				malformedForge: false,
				other: false,
			});
		} finally {
			resolver.dispose();
			refresh.dispose();
		}
	});

	test('shows Git commit metadata', () => {
		assert.deepStrictEqual(getGitCommitPresentation({
			hash: '1234567890abcdef',
			message: 'Refactor rich-link resolvers\n\nUse observable lifetimes.',
			shortStat: {
				insertions: 20,
				deletions: 5,
			},
		}), {
			kind: 'commit',
			title: 'Refactor rich-link resolvers',
			changes: { insertions: 20, deletions: 5 },
			tooltip: '1234567 · Refactor rich-link resolvers · 20 insertions, 5 deletions',
			ariaLabel: 'Commit 1234567, 20 insertions and 5 deletions: Refactor rich-link resolvers',
		});

	});

	test('opens a hinted repository for metadata and never falls back to a different repository', async () => {
		const refresh = new vscode.EventEmitter<void>();
		const rootUri = vscode.Uri.file('D:\\repos\\hinted');
		const opened: vscode.Uri[] = [];
		let unrelatedLookups = 0;
		const repository = {
			rootUri,
			state: { remotes: [{ fetchUrl: 'https://github.com/owner/repo.git' }] },
			getCommit: async (ref: string) => ({ hash: ref, message: 'Hinted commit', shortStat: { insertions: 3, deletions: 2 } }),
		};
		const repositoriesChanged = new vscode.EventEmitter<typeof repository>();
		const resolver = new GitLinkPresentationResolver(new ImmutableLinkPresentationCache(), async () => ({
			enabled: true,
			getAPI: () => ({
				repositories: [{
					...repository,
					rootUri: vscode.Uri.file('D:\\repos\\other'),
					getCommit: async (ref: string) => {
						unrelatedLookups++;
						return { hash: ref, message: 'Wrong commit' };
					},
				}],
				onDidOpenRepository: repositoriesChanged.event,
				onDidCloseRepository: repositoriesChanged.event,
				getRepository: () => null,
				getRepositoryRoot: async uri => uri.toString() === rootUri.toString() ? rootUri : null,
				openRepository: async uri => { opened.push(uri); return repository; },
			}),
		}));
		const read = async (href: string) => {
			const value = resolver.resolve(href, { onDidRequestRefresh: refresh.event, logger: { trace: () => { } } })!;
			let complete!: () => void;
			const loaded = new Promise<void>(resolve => { complete = resolve; });
			const subscription = autorun(reader => {
				const presentation = value.read(reader);
				if (presentation.status?.kind !== 'pending') {
					complete();
				}
			});
			try {
				await loaded;
				return value.get();
			} finally {
				subscription.dispose();
			}
		};
		try {
			const hinted = `commit:1234567?path=${encodeURIComponent(rootUri.toString())}`;
			const presentation = await read(hinted);
			assert.deepStrictEqual(presentation.changes, { insertions: 3, deletions: 2 }, JSON.stringify(presentation));
			const missing = await read('commit:1234567?path=file%3A%2F%2F%2FD%3A%2Frepos%2Fmissing');
			assert.strictEqual(missing.status?.kind, 'error');
			assert.match(missing.tooltip!, /No Git repository was found/);
			assert.strictEqual(unrelatedLookups, 0);
			assert.deepStrictEqual(opened.map(uri => uri.toString()), [rootUri.toString()]);
		} finally {
			resolver.dispose();
			repositoriesChanged.dispose();
			refresh.dispose();
		}
	});

	test('owns async resolution through observable lifetime', () => {
		const refresh = new vscode.EventEmitter<void>();
		let resolveCount = 0;
		const presentation = createAsyncLinkPresentation(
			'https://example.com/resource',
			{ kind: 'file', status: { kind: 'pending', label: 'Loading' } },
			{
				onDidRequestRefresh: refresh.event,
				logger: { trace: () => { } },
			},
			async () => ({ kind: 'file', detail: String(++resolveCount) }),
			() => ({ kind: 'file', status: { kind: 'error', label: 'Error' } }),
		);

		assert.strictEqual(resolveCount, 0);
		const observer = autorun(reader => presentation.read(reader));
		assert.strictEqual(resolveCount, 1);
		refresh.fire();
		assert.strictEqual(resolveCount, 2);
		observer.dispose();
		refresh.fire();
		assert.strictEqual(resolveCount, 2);
		refresh.dispose();
	});

	test('shares one live resolver observable per canonical URL', () => {
		const source = observableValue('presentation', { kind: 'pullRequest' as const, title: 'Shared presentation' });
		let resolveCount = 0;
		let activeSubscriptions = 0;
		let resolverDisposeCount = 0;
		const resolver = {
			refreshOnInterval: false,
			resolve: () => {
				resolveCount++;
				return derived(reader => {
					activeSubscriptions++;
					reader.store.add({
						dispose: () => activeSubscriptions--,
					});
					return source.read(reader);
				});
			},
			dispose: () => resolverDisposeCount++,
		};
		const service = new LinkPresentationService([resolver], { trace: () => { } });

		const first = service.watch('https://example.com/pull/1')!;
		const second = service.watch('https://example.com/pull/1')!;
		assert.deepStrictEqual({ resolveCount, activeSubscriptions }, { resolveCount: 1, activeSubscriptions: 1 });

		first.dispose();
		assert.strictEqual(activeSubscriptions, 1);
		second.dispose();
		assert.strictEqual(activeSubscriptions, 0);

		const third = service.watch('https://example.com/pull/1')!;
		assert.deepStrictEqual({ resolveCount, activeSubscriptions }, { resolveCount: 2, activeSubscriptions: 1 });
		third.dispose();
		service.dispose();
		assert.deepStrictEqual({ activeSubscriptions, resolverDisposeCount }, { activeSubscriptions: 0, resolverDisposeCount: 1 });
	});

	test('caches immutable Git commit presentations without expiry', async () => {
		const cache = new ImmutableLinkPresentationCache();
		let resolveCount = 0;
		const resolve = async () => getGitCommitPresentation({
			hash: '1234567890abcdef',
			message: 'Cached commit',
			shortStat: {
				insertions: ++resolveCount,
				deletions: 0,
			},
		});

		const href = 'https://github.com/microsoft/vscode/commit/1234567890abcdef';
		const first = await cache.get(href, resolve);
		const second = await cache.get(href, resolve);
		const third = await cache.get(href, resolve);

		assert.deepStrictEqual({
			first,
			second,
			third,
			resolveCount,
		}, {
			first: {
				kind: 'commit',
				title: 'Cached commit',
				changes: { insertions: 1, deletions: 0 },
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			second: {
				kind: 'commit',
				title: 'Cached commit',
				changes: { insertions: 1, deletions: 0 },
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			third: {
				kind: 'commit',
				title: 'Cached commit',
				changes: { insertions: 1, deletions: 0 },
				tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
				ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
			},
			resolveCount: 1,
		});
	});

	test('keeps a restored presentation visible while loading in the background', async () => {
		const requestRefresh = new vscode.EventEmitter<void>();
		let completeRefresh!: (value: { kind: 'issue'; title: string }) => void;
		const refresh = new Promise<{ kind: 'issue'; title: string }>(resolve => completeRefresh = resolve);
		const presentation = createAsyncLinkPresentation(
			'https://example.com/issues/1',
			{ kind: 'issue', title: 'Cached issue', isLoading: true },
			{
				onDidRequestRefresh: requestRefresh.event,
				logger: { trace: () => { } },
			},
			() => refresh,
			() => ({ kind: 'issue', status: { kind: 'error', label: 'Error' } }),
			[],
		);
		const values: unknown[] = [];
		const observer = autorun(reader => values.push(presentation.read(reader)));
		completeRefresh({ kind: 'issue', title: 'Fresh issue' });
		await refresh;
		await Promise.resolve();
		observer.dispose();
		requestRefresh.dispose();

		assert.deepStrictEqual(values, [
			{ kind: 'issue', title: 'Cached issue', isLoading: true },
			{ kind: 'issue', title: 'Fresh issue', isLoading: undefined },
		]);
	});

	test('does not mark a fresh presentation loading during background refresh', async () => {
		const requestRefresh = new vscode.EventEmitter<void>();
		let resolveCount = 0;
		let completeRefresh!: (value: { kind: 'issue'; title: string }) => void;
		const presentation = createAsyncLinkPresentation(
			'https://example.com/issues/1',
			{ kind: 'issue', status: { kind: 'pending', label: 'Loading' } },
			{
				onDidRequestRefresh: requestRefresh.event,
				logger: { trace: () => { } },
			},
			() => {
				resolveCount++;
				return resolveCount === 1
					? Promise.resolve({ kind: 'issue', title: 'Fresh issue' })
					: new Promise(resolve => completeRefresh = resolve);
			},
			() => ({ kind: 'issue', status: { kind: 'error', label: 'Error' } }),
			[requestRefresh.event],
		);
		const values: unknown[] = [];
		const observer = autorun(reader => values.push(presentation.read(reader)));
		await Promise.resolve();
		await Promise.resolve();
		requestRefresh.fire();
		await Promise.resolve();
		completeRefresh({ kind: 'issue', title: 'Refreshed issue' });
		await Promise.resolve();
		await Promise.resolve();
		observer.dispose();
		requestRefresh.dispose();

		assert.deepStrictEqual(values, [
			{ kind: 'issue', status: { kind: 'pending', label: 'Loading' } },
			{ kind: 'issue', title: 'Fresh issue', isLoading: undefined },
			{ kind: 'issue', title: 'Refreshed issue', isLoading: undefined },
		]);
	});
});
