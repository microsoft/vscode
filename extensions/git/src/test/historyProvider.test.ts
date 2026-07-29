/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import { CancellationToken, ConfigurationTarget, EventEmitter, LogOutputChannel, SourceControlHistoryItemRef, ThemeIcon, workspace } from 'vscode';
import type { Branch, LogOptions, Ref, RefQuery } from '../api/git';
import { RefType } from '../api/git.constants';
import { Commit, Stash } from '../git';
import { ISourceControlHistoryItemDetailsProviderRegistry } from '../historyItemDetailsProvider';
import { OperationKind } from '../operation';
import { GitHistoryProvider } from '../historyProvider';
import { Repository } from '../repository';

const mockLogger = {
	trace: (_message: string, ..._args: any[]): void => { },
	error: (_error: string | Error, ..._args: any[]): void => { }
} as unknown as LogOutputChannel;

const mockRegistry = {
	getSourceControlHistoryItemDetailsProviders: () => [],
	registerSourceControlHistoryItemDetailsProvider: () => ({ dispose: () => { } })
} as unknown as ISourceControlHistoryItemDetailsProviderRegistry;

type MockRepository = Repository & {
	getStashes: sinon.SinonStub<[], Promise<Stash[]>>;
	getRefs: sinon.SinonStub<[query?: RefQuery, cancellationToken?: CancellationToken], Promise<(Ref | Branch)[]>>;
	log: sinon.SinonStub<[options?: LogOptions & { silent?: boolean }, cancellationToken?: CancellationToken], Promise<Commit[]>>;
};

suite(GitHistoryProvider.name, () => {
	let mockRepository: MockRepository;
	let gitHistoryProvider: GitHistoryProvider;
	let onDidRunOperationEmitter: EventEmitter<any>;

	setup(() => {
		sinon.stub(workspace, 'getConfiguration').returns({
			get: (_key: string, defaultValue?: any) => defaultValue,
			has: (_: string) => { throw new Error('Not implemented.'); },
			update: (_arg1: string, _arg2: any, _arg3?: ConfigurationTarget | boolean | null, _arg4?: boolean) => { throw new Error('Not implemented.'); },
			inspect: (_: string) => { throw new Error('Not implemented.'); }
		});

		onDidRunOperationEmitter = new EventEmitter<any>();

		mockRepository = {
			refs: [{ name: 'main', type: RefType.Head, commit: 'abc1234' }],
			root: '/test/repo',
			HEAD: { name: 'main', type: RefType.Head, commit: 'abc1234' },
			onDidRunOperation: onDidRunOperationEmitter.event,
			getStashes: sinon.stub().resolves([]),
			getRefs: sinon.stub().callsFake(() => Promise.resolve(mockRepository.refs)),
			log: sinon.stub().resolves([])
		} as MockRepository;

		gitHistoryProvider = new GitHistoryProvider(mockRegistry, mockRepository, mockLogger);
	});

	teardown(() => {
		gitHistoryProvider?.dispose();
		sinon.restore();
	});

	suite('provideHistoryItemRefs', () => {
		test('includes stashes', async () => {
			const stashes = [
				{ index: 0, hash: 'stash1', description: 'WIP: feature', branchName: 'main', parents: [] },
				{ index: 1, hash: 'stash2', description: 'WIP: bugfix', branchName: 'main', parents: [] }
			];
			mockRepository.getStashes.resolves(stashes);

			const historyItemRefs = await gitHistoryProvider.provideHistoryItemRefs(undefined);

			const stashRefs = historyItemRefs.filter(ref => ref.id.startsWith('stash@{'));
			assert.strictEqual(stashRefs.length, 2, 'Should have 2 stash refs');

			const expectedStash0: SourceControlHistoryItemRef = {
				id: 'stash@{0}',
				name: 'WIP: feature',
				description: 'main',
				revision: 'stash1',
				category: 'stashes',
				icon: new ThemeIcon('git-stash')
			};
			const expectedStash1: SourceControlHistoryItemRef = {
				id: 'stash@{1}',
				name: 'WIP: bugfix',
				description: 'main',
				revision: 'stash2',
				category: 'stashes',
				icon: new ThemeIcon('git-stash')
			};
			assert.deepStrictEqual(stashRefs[0], expectedStash0);
			assert.deepStrictEqual(stashRefs[1], expectedStash1);
		});

		test('stashes are sorted numerically by index', async () => {
			const stashes = [
				{ index: 12, hash: 'stash12', description: 'WIP: oldest', branchName: 'main', parents: [] },
				{ index: 0, hash: 'stash0', description: 'WIP: newest', branchName: 'main', parents: [] },
				{ index: 5, hash: 'stash5', description: 'WIP: middle', branchName: 'main', parents: [] },
				{ index: 2, hash: 'stash2', description: 'WIP: recent', branchName: 'main', parents: [] }
			];
			mockRepository.getStashes.resolves(stashes);

			const historyItemRefs = await gitHistoryProvider.provideHistoryItemRefs(undefined);
			const stashRefs = historyItemRefs.filter(ref => ref.id.startsWith('stash@{'));

			assert.strictEqual(stashRefs.length, 4);
			assert.strictEqual(stashRefs[0].id, 'stash@{0}');
			assert.strictEqual(stashRefs[1].id, 'stash@{2}');
			assert.strictEqual(stashRefs[2].id, 'stash@{5}');
			assert.strictEqual(stashRefs[3].id, 'stash@{12}');
		});

		test('handles stash errors', async () => {
			mockRepository.getStashes.rejects(new Error('Git stash failed'));

			const historyItemRefs = await gitHistoryProvider.provideHistoryItemRefs(undefined);

			assert.ok(historyItemRefs.length > 0, 'Should still return results despite stash error');
			const stashRefs = historyItemRefs.filter(ref => ref.id.startsWith('stash@{'));
			assert.strictEqual(stashRefs.length, 0, 'Should have no stash refs on error with no previous state');
		});

		test('falls back to previous stash state on error', async () => {
			const stashes = [{ index: 0, hash: 'stash1', description: 'WIP: feature', branchName: 'main', parents: [] }];
			mockRepository.getStashes.resolves(stashes);

			let historyItemRefs = await gitHistoryProvider.provideHistoryItemRefs(undefined);
			let stashRefs = historyItemRefs.filter(ref => ref.id.startsWith('stash@{'));
			assert.strictEqual(stashRefs.length, 1, 'First call should have stash');

			mockRepository.getStashes.rejects(new Error('Git stash failed'));

			historyItemRefs = await gitHistoryProvider.provideHistoryItemRefs(undefined);
			stashRefs = historyItemRefs.filter(ref => ref.id.startsWith('stash@{'));
			assert.strictEqual(stashRefs.length, 1, 'Should fall back to previous stash state on error');
			assert.strictEqual(stashRefs[0].id, 'stash@{0}');
		});
	});

	suite('provideHistoryItems', () => {
		test('filters out git stash index commits', async () => {
			const commits: Commit[] = [
				{ hash: 'def5678', message: 'index on main: abc1234 feat: add feature', parents: [], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] },
				{ hash: 'abc1234', message: 'feat: add feature', parents: [], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] },
				{ hash: 'bbb3456', message: 'index on main: aaa9012 fix: bug fix', parents: [], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] },
				{ hash: 'aaa9012', message: 'fix: bug fix', parents: [], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] }
			];
			mockRepository.log.resolves(commits);

			const updateComplete = new Promise<void>(resolve => {
				gitHistoryProvider.onDidChangeCurrentHistoryItemRefs(() => resolve(), { dispose: () => { } });
			});
			onDidRunOperationEmitter.fire({ operation: { kind: OperationKind.Commit, readOnly: false, showProgress: false } });
			await updateComplete;

			const historyItems = await gitHistoryProvider.provideHistoryItems({ historyItemRefs: ['refs/heads/main'] }, {} as CancellationToken);

			assert.strictEqual(historyItems.length, 2, 'Should filter out stash index commits');
			assert.strictEqual(historyItems[0].id, 'abc1234');
			assert.strictEqual(historyItems[1].id, 'aaa9012');
		});

		test('attaches stash ref to history item with matching hash', async () => {
			const stashes = [
				{ index: 0, hash: 'stash1hash', description: 'WIP: feature', branchName: 'main', parents: [] }
			];
			mockRepository.getStashes.resolves(stashes);

			const updateComplete = new Promise<void>(resolve => {
				gitHistoryProvider.onDidChangeCurrentHistoryItemRefs(() => resolve(), { dispose: () => { } });
			});
			onDidRunOperationEmitter.fire({ operation: { kind: OperationKind.Stash, readOnly: false, showProgress: false } });
			await updateComplete;

			const commits: Commit[] = [
				{ hash: 'stash1hash', message: 'WIP on main: abc1234 feat: add feature', parents: ['abc1234'], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] },
				{ hash: 'abc1234', message: 'feat: add feature', parents: [], authorDate: new Date(), authorName: 'Author', authorEmail: 'author@example.com', commitDate: new Date(), refNames: [] }
			];
			mockRepository.log.resolves(commits);

			const historyItems = await gitHistoryProvider.provideHistoryItems({ historyItemRefs: ['refs/heads/main'] }, {} as CancellationToken);

			assert.strictEqual(historyItems.length, 2);

			const stashItem = historyItems.find(item => item.id === 'stash1hash');
			assert.ok(stashItem?.references, 'Stash commit should have references');
			const stashRef = stashItem!.references!.find(ref => ref.id === 'stash@{0}');
			assert.ok(stashRef, 'Stash commit should have stash@{0} reference');
			assert.strictEqual(stashRef!.name, 'WIP: feature');
			assert.deepStrictEqual(stashRef!.icon, new ThemeIcon('git-stash'));

			const regularItem = historyItems.find(item => item.id === 'abc1234');
			assert.strictEqual(regularItem?.references, undefined, 'Regular commit should not have references');
		});
	});
});
