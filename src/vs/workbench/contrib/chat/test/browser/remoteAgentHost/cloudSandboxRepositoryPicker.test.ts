/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Emitter } from '../../../../../../base/common/event.js';
import { matchesFuzzy } from '../../../../../../base/common/filters.js';
import { DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GitHubCredential, IGitHubCredentials } from '../../../../../../platform/github/common/githubCredentialService.js';
import { GitHubQueryApi, GitHubRepositoriesPage, GitHubRepository, GitHubRepositoryListOptions, GitHubRepositorySearchOptions, GitHubRepositorySearchPage } from '../../../../../../platform/github/common/githubQueryService.js';
import { IGitHubClient } from '../../../../../../platform/github/common/githubService.js';
import { GitHubRestRequest, GitHubRestResponse, IGitHubTransport } from '../../../../../../platform/github/common/githubTransport.js';
import { GitHubRequestError, IGitHubEndpointProvider } from '../../../../../../platform/github/common/githubTypes.js';
import { AccountHandle } from '../../../../../../platform/github/common/types.js';
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
	const account: AccountHandle = { host: 'api.github.com', accountId: '1' };
	let clock: sinon.SinonFakeTimers;

	setup(() => { clock = sinon.useFakeTimers(); });
	teardown(() => sinon.restore());

	function createPicker(options?: { readonly acquireClient?: () => Promise<IReference<IGitHubClient>> }) {
		const quickPicks: TestQuickPick[] = [];
		const requests: { readonly kind: string; readonly value: string; readonly options?: object }[] = [];
		const client = upcastPartial<IGitHubClient>({
			credentials: upcastPartial<IGitHubCredentials>({
				getCredential: async () => upcastPartial<GitHubCredential>({ account, token: 'token' }),
			}),
			endpoint: upcastPartial<IGitHubEndpointProvider>({ getApiBaseUri: () => 'https://api.github.com' }),
			transport: upcastPartial<IGitHubTransport>({
				rest: async <T>(_account: AccountHandle, _token: string, request: GitHubRestRequest): Promise<GitHubRestResponse<T>> => {
					requests.push({ kind: 'rest', value: request.url });
					const data = request.url.endsWith('/user') ? { login: 'octocat' } : [{ login: 'github' }, { login: 'microsoft' }];
					return upcastPartial<GitHubRestResponse<T>>({ data: data as T });
				},
			}),
			query: upcastPartial<GitHubQueryApi>({
				listRepositories: async (_account: AccountHandle, _signal: AbortSignal, listOptions?: GitHubRepositoryListOptions): Promise<GitHubRepositoriesPage> => {
					requests.push({ kind: 'list', value: '', options: listOptions });
					return { repositories: [upcastPartial<GitHubRepository>({ nameWithOwner: 'octocat/recent' })] };
				},
				searchRepositories: async (_account: AccountHandle, query: string, _signal: AbortSignal, searchOptions?: GitHubRepositorySearchOptions): Promise<GitHubRepositorySearchPage> => {
					requests.push({ kind: 'search', value: query, options: searchOptions });
					return { repositories: [upcastPartial<GitHubRepository>({ nameWithOwner: 'microsoft/vscode' })], totalCount: 1, incompleteResults: false, limitReached: false };
				},
			}),
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IQuickInputService, {}, 'createQuickPick', () => {
			const quickPick = new TestQuickPick();
			quickPicks.push(quickPick);
			return quickPick;
		});
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({
			acquireDefaultAccountClient: options?.acquireClient ?? (async () => ({ object: client, dispose: () => { } })),
		}));
		const picker = store.add(instantiationService.createInstance(CloudSandboxRepositoryPicker));
		return { picker, quickPicks, requests };
	}

	test('lists recent repositories for an empty query and scopes searches to the viewer and their organizations', async () => {
		const { picker, quickPicks, requests } = createPicker();
		const result = picker.pick();
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		const initialItems = quickPick.items.map(item => item.label);
		quickPick.changeValue('https://github.com/microsoft/vscode.git');
		await clock.tickAsync(300);
		const visibleAfterUrl = quickPick.visibleItems.map(item => item.label);
		quickPick.acceptItem();
		assert.deepStrictEqual({ initialItems, visibleAfterUrl, requests, result: await result }, {
			initialItems: ['octocat/recent'],
			visibleAfterUrl: ['microsoft/vscode'],
			requests: [
				{ kind: 'list', value: '', options: { affiliation: ['owner', 'collaborator', 'organization_member'], sort: 'updated', perPage: 100 } },
				{ kind: 'rest', value: 'https://api.github.com/user' },
				{ kind: 'rest', value: 'https://api.github.com/user/orgs?per_page=100' },
				{ kind: 'search', value: 'microsoft/vscode in:name fork:true user:octocat org:github org:microsoft', options: { sort: 'updated', perPage: 100 } },
			],
			result: 'microsoft/vscode',
		});
	});

	test('rejects before showing a picker when no repository-scoped GitHub session exists', async () => {
		const { picker, quickPicks } = createPicker({
			acquireClient: async () => { throw new GitHubRequestError('Sign in to GitHub with repository access to load GitHub data.', 'authentication'); },
		});
		await assert.rejects(picker.pick(), { kind: 'authentication' });
		assert.strictEqual(quickPicks.length, 0);
	});
});
