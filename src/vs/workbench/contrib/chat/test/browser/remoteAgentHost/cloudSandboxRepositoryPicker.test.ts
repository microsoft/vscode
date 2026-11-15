/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { matchesFuzzy } from '../../../../../../base/common/filters.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import Severity from '../../../../../../base/common/severity.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IGitHubAccountClient } from '../../../../../../platform/github/common/account/account.js';
import { ApiRequestOptions } from '../../../../../../platform/github/common/client/request.js';
import { OrganizationSummary } from '../../../../../../platform/github/common/core/organizations.js';
import { Repository } from '../../../../../../platform/github/common/core/repositories.js';
import { RepositorySearchItem, SearchPage } from '../../../../../../platform/github/common/core/search.js';
import { User } from '../../../../../../platform/github/common/core/users.js';
import { GitHubRequestError } from '../../../../../../platform/github/common/githubTypes.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { CloudSandboxRepositoryPicker } from '../../../browser/remoteAgentHost/cloudSandboxRepositoryPicker.js';

class TestQuickPick extends mock<IQuickPick<IQuickPickItem>>() {
	private readonly store = new DisposableStore();
	private readonly hideEmitter = this.store.add(new Emitter<IQuickInputHideEvent>());
	private readonly valueEmitter = this.store.add(new Emitter<string>());
	private readonly acceptEmitter = this.store.add(new Emitter<IQuickPickDidAcceptEvent>());
	override readonly onDidHide = this.hideEmitter.event;
	override readonly onDidChangeValue = this.valueEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override items: readonly IQuickPickItem[] = [];
	override selectedItems: readonly IQuickPickItem[] = [];
	override value = '';
	override busy = false;
	override filterValue = (value: string) => value;
	private shown = false;

	/** Items surviving the label filter the real quick pick applies to the typed value. */
	get visibleItems(): readonly IQuickPickItem[] {
		const filter = this.filterValue(this.value).trim();
		return filter ? this.items.filter(item => matchesFuzzy(filter, item.label, true)) : this.items;
	}

	override show(): void { this.shown = true; }
	override hide(): void {
		if (this.shown) {
			this.shown = false;
			this.hideEmitter.fire({ reason: QuickInputHideReason.Other });
		}
	}
	changeValue(value: string): void {
		this.value = value;
		this.valueEmitter.fire(value);
	}
	acceptItem(index = 0): void {
		const item = this.visibleItems[index];
		assert.ok(item, 'the item must survive local filtering to be accepted');
		this.selectedItems = [item];
		this.acceptEmitter.fire({ inBackground: false });
	}
	override dispose(): void {
		this.hide();
		this.store.dispose();
	}
}

suite('CloudSandboxRepositoryPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => { clock = sinon.useFakeTimers(); });
	teardown(() => sinon.restore());

	function searchPage(fullName: string): SearchPage<RepositorySearchItem> {
		return { items: [upcastPartial<RepositorySearchItem>({ full_name: fullName })], total_count: 1, incomplete_results: false };
	}

	function createPicker(options?: { readonly acquireClient?: (signal: AbortSignal) => Promise<IGitHubAccountClient> }) {
		const quickPicks: TestQuickPick[] = [];
		const requests: { readonly kind: string; readonly value: string; readonly options?: ApiRequestOptions; readonly signal: AbortSignal }[] = [];
		const acquisitions: AbortSignal[] = [];
		let disposeCount = 0;
		const client = upcastPartial<IGitHubAccountClient>({
			users: upcastPartial<IGitHubAccountClient['users']>({
				getAuthenticated: async (signal, options) => {
					requests.push({ kind: 'user', value: '', options, signal });
					return upcastPartial<User>({ login: 'octocat' });
				},
			}),
			organizations: upcastPartial<IGitHubAccountClient['organizations']>({
				listForAuthenticatedUser: async (signal, options) => {
					requests.push({ kind: 'organizations', value: '', options, signal });
					return ['github', 'microsoft'].map(login => upcastPartial<OrganizationSummary>({ login }));
				},
			}),
			repositories: upcastPartial<IGitHubAccountClient['repositories']>({
				listForAuthenticatedUser: async (signal, options) => {
					requests.push({ kind: 'list', value: '', options, signal });
					return [upcastPartial<Repository>({ full_name: 'octocat/recent' })];
				},
			}),
			search: upcastPartial<IGitHubAccountClient['search']>({
				repositories: async (query, signal, options) => {
					requests.push({ kind: 'search', value: query, options, signal });
					return searchPage('microsoft/vscode');
				},
			}),
			dispose: () => { disposeCount++; },
		});
		const instantiationService = store.add(new TestInstantiationService());
		const logService = store.add(new NullLogService());
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IQuickInputService, {}, 'createQuickPick', () => {
			const quickPick = new TestQuickPick();
			quickPicks.push(quickPick);
			return quickPick;
		});
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({
			acquireDefaultAccountApiClient: async signal => {
				acquisitions.push(signal);
				return options?.acquireClient ? options.acquireClient(signal) : client;
			},
		}));
		const picker = store.add(instantiationService.createInstance(CloudSandboxRepositoryPicker));
		return { picker, quickPicks, requests, acquisitions, client, logService, disposed: () => disposeCount };
	}

	test('lists recent repositories for an empty query and scopes searches to the viewer and their organizations', async () => {
		const { picker, quickPicks, requests, acquisitions, disposed } = createPicker();
		const result = picker.pick();
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		const initialItems = quickPick.items.map(item => item.label);
		quickPick.changeValue('https://github.com/microsoft/vscode.git');
		await clock.tickAsync(300);
		const visibleAfterUrl = quickPick.visibleItems.map(item => item.label);
		quickPick.acceptItem();
		const selection = await result;
		assert.deepStrictEqual({
			initialItems, visibleAfterUrl,
			requests: requests.map(({ signal, ...request }) => request),
			result: selection, acquisitions: acquisitions.length, disposed: disposed(),
		}, {
			initialItems: ['octocat/recent'],
			visibleAfterUrl: ['microsoft/vscode'],
			requests: [
				{ kind: 'list', value: '', options: { caller: 'cloudSandbox.repositoryPicker', query: { affiliation: 'owner,collaborator,organization_member', sort: 'updated', per_page: 100 } } },
				{ kind: 'user', value: '', options: { caller: 'cloudSandbox.repositoryPicker' } },
				{ kind: 'organizations', value: '', options: { caller: 'cloudSandbox.repositoryPicker', query: { per_page: 100 } } },
				{ kind: 'search', value: 'microsoft/vscode in:name fork:true user:octocat org:github org:microsoft', options: { caller: 'cloudSandbox.repositoryPicker', query: { sort: 'updated', per_page: 100 } } },
			],
			result: 'microsoft/vscode', acquisitions: 1, disposed: 1,
		});
	});

	test('rejects before showing a picker when no repository-scoped GitHub session exists', async () => {
		const { picker, quickPicks } = createPicker({
			acquireClient: async () => { throw new GitHubRequestError('Sign in to GitHub with repository access to load GitHub data.', 'authentication'); },
		});
		await assert.rejects(picker.pick(), { kind: 'authentication' });
		assert.strictEqual(quickPicks.length, 0);
	});

	test('resolves the search scope only once per pick', async () => {
		const { picker, quickPicks, requests } = createPicker();
		const result = picker.pick();
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		for (const term of ['first', 'second']) {
			quickPick.changeValue(term);
			await clock.tickAsync(300);
		}
		quickPick.hide();
		await result;
		assert.deepStrictEqual(requests.map(request => [request.kind, request.value]), [
			['list', ''],
			['user', ''],
			['organizations', ''],
			['search', 'first in:name fork:true user:octocat org:github org:microsoft'],
			['search', 'second in:name fork:true user:octocat org:github org:microsoft'],
		]);
	});

	test('retains the viewer qualifier when the account has no organizations', async () => {
		const { picker, quickPicks, requests, client } = createPicker();
		sinon.stub(client.organizations, 'listForAuthenticatedUser').resolves([]);
		const result = picker.pick();
		await clock.tickAsync(0);
		quickPicks[0].changeValue('vscode');
		await clock.tickAsync(300);
		quickPicks[0].hide();
		await result;
		assert.deepStrictEqual(requests.filter(request => request.kind === 'search').map(request => request.value), [
			'vscode in:name fork:true user:octocat',
		]);
	});

	test('reports a failed scope lookup without searching broadly and retries on the next query', async () => {
		const { picker, quickPicks, requests, client, logService } = createPicker();
		const failure = new GitHubRequestError('Organization access denied', 'authorization', 403);
		const organizations = sinon.stub(client.organizations, 'listForAuthenticatedUser');
		organizations.onFirstCall().rejects(failure);
		organizations.onSecondCall().resolves([]);
		const errors = sinon.spy(logService, 'error');
		const result = picker.pick();
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		quickPick.changeValue('first');
		await clock.tickAsync(300);
		const failed = {
			searches: requests.filter(request => request.kind === 'search').length,
			items: quickPick.items,
			severity: quickPick.severity,
			message: quickPick.validationMessage,
			logged: errors.calledWith('Error fetching repositories', failure),
		};
		quickPick.changeValue('second');
		await clock.tickAsync(300);
		const recovered = {
			queries: requests.filter(request => request.kind === 'search').map(request => request.value),
			message: quickPick.validationMessage,
			lookups: organizations.callCount,
		};
		quickPick.hide();
		await result;
		assert.deepStrictEqual({ failed, recovered }, {
			failed: {
				searches: 0, items: [], severity: Severity.Error,
				message: 'Could not load repositories. Check your GitHub sign-in and connection, then try searching again.',
				logged: true,
			},
			recovered: { queries: ['second in:name fork:true user:octocat'], message: undefined, lookups: 2 },
		});
	});

	test('aborts superseded searches and ignores late results', async () => {
		const { picker, quickPicks, client } = createPicker();
		const first = new DeferredPromise<SearchPage<RepositorySearchItem>>();
		const second = new DeferredPromise<SearchPage<RepositorySearchItem>>();
		const search = sinon.stub(client.search, 'repositories');
		search.onFirstCall().returns(first.p);
		search.onSecondCall().returns(second.p);
		const result = picker.pick();
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		quickPick.changeValue('old');
		await clock.tickAsync(300);
		quickPick.changeValue('new');
		await clock.tickAsync(300);
		await second.complete(searchPage('octocat/new'));
		await clock.tickAsync(0);
		await first.complete(searchPage('octocat/old'));
		await clock.tickAsync(0);
		const observed = {
			aborted: search.getCalls().map(call => call.args[1].aborted),
			items: quickPick.items.map(item => item.label),
		};
		quickPick.acceptItem();
		assert.deepStrictEqual({ ...observed, result: await result }, { aborted: [true, false], items: ['octocat/new'], result: 'octocat/new' });
	});

	for (const stop of ['dismiss', 'dispose', 'cancel'] as const) {
		test(`aborts pending reads and disposes its client on ${stop}`, async () => {
			const { picker, quickPicks, client, disposed } = createPicker();
			const cancellation = store.add(new CancellationTokenSource());
			const pending = new DeferredPromise<SearchPage<RepositorySearchItem>>();
			const search = sinon.stub(client.search, 'repositories').returns(pending.p);
			const result = picker.pick(cancellation.token);
			await clock.tickAsync(0);
			quickPicks[0].changeValue('vscode');
			await clock.tickAsync(300);
			if (stop === 'dismiss') {
				quickPicks[0].hide();
			} else if (stop === 'dispose') {
				picker.dispose();
			} else {
				cancellation.cancel();
			}
			const selection = await result;
			await pending.complete(searchPage('microsoft/vscode'));
			await clock.tickAsync(0);
			assert.deepStrictEqual({
				result: selection,
				aborted: search.firstCall.args[1].aborted,
				disposed: disposed(),
			}, { result: undefined, aborted: true, disposed: 1 });
		});
	}

	test('cancels acquisition without opening a picker after disposal', async () => {
		const pending = new DeferredPromise<IGitHubAccountClient>();
		const { picker, quickPicks, acquisitions } = createPicker({ acquireClient: () => pending.p });
		const rejected = assert.rejects(picker.pick(), isCancellationError);
		await clock.tickAsync(0);
		picker.dispose();
		await rejected;
		await pending.error(new CancellationError());
		assert.deepStrictEqual({ acquisitions: acquisitions.length, aborted: acquisitions[0].aborted, quickPicks: quickPicks.length }, {
			acquisitions: 1, aborted: true, quickPicks: 0,
		});
	});
});
