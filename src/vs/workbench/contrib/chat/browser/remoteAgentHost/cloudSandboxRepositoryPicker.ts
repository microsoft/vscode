/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { RepositoryPicker } from '../agentSessions/repositoryPicker.js';

const REQUEST_CALLER = 'cloudSandbox.repositoryPicker';
const PAGE_SIZE = 100;

/** A pasted GitHub URL stands for its `owner/repo`, both for the search and for filtering its results. */
function toRepositorySearchTerm(value: string): string {
	const trimmed = value.trim();
	const remote = getGitHubRepositoryFromRemoteUrl(trimmed);
	return remote ? `${remote.owner}/${remote.repo}` : trimmed;
}

/** Searches the signed-in account's GitHub repositories without requiring an extension host. */
export class CloudSandboxRepositoryPicker extends Disposable {

	private readonly _currentPick = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	/** Resolves to the picked `owner/repo`, or `undefined` when dismissed. Rejects when no repository-scoped GitHub session exists. */
	async pick(token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		const store = new DisposableStore();
		this._currentPick.value = store;
		const pickToken = cancelOnDispose(store);
		store.add(token.onCancellationRequested(() => store.dispose()));
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		try {
			const client = store.add(await raceCancellationError(this._gitHubService.acquireDefaultAccountApiClient(controller.signal), pickToken));
			// The viewer and their organizations scope every search, so resolve them once per pick.
			let scope: Promise<string> | undefined;
			const resolveScope = (signal: AbortSignal) => scope ??= this._resolveSearchScope(client, signal).catch(error => { scope = undefined; throw error; });
			const picker = store.add(this._instantiationService.createInstance(RepositoryPicker));
			const selection = await picker.pickRepository(async (query, requestToken) => {
				const requestController = new AbortController();
				const listener = requestToken.onCancellationRequested(() => requestController.abort());
				try {
					return await this._searchRepositories(client, query, resolveScope, AbortSignal.any([controller.signal, requestController.signal]));
				} finally {
					listener.dispose();
				}
			}, { filterValue: toRepositorySearchTerm }, pickToken);
			return selection?.repository;
		} finally {
			store.dispose();
			if (this._currentPick.value === store) {
				this._currentPick.clear();
			}
		}
	}

	private async _searchRepositories(client: IGitHubAccountClient, query: string, resolveScope: (signal: AbortSignal) => Promise<string>, signal: AbortSignal): Promise<readonly string[]> {
		const term = toRepositorySearchTerm(query);
		if (!term) {
			const repositories = await client.repositories.listForAuthenticatedUser(signal, {
				caller: REQUEST_CALLER,
				query: {
					affiliation: 'owner,collaborator,organization_member',
					sort: 'updated',
					per_page: PAGE_SIZE,
				},
			});
			return repositories.map(repository => repository.full_name);
		}
		const page = await client.search.repositories(`${term} in:name fork:true ${await resolveScope(signal)}`, signal, {
			caller: REQUEST_CALLER,
			query: { sort: 'updated', per_page: PAGE_SIZE },
		});
		return page.items.map(repository => repository.full_name);
	}

	/** `user:<login> org:<org>...` qualifiers restricting search to repositories the account can reach. */
	private async _resolveSearchScope(client: IGitHubAccountClient, signal: AbortSignal): Promise<string> {
		const [user, organizations] = await Promise.all([
			client.users.getAuthenticated(signal, { caller: REQUEST_CALLER }),
			client.organizations.listForAuthenticatedUser(signal, { caller: REQUEST_CALLER, query: { per_page: PAGE_SIZE } }),
		]);
		return [`user:${user.login}`, ...organizations.map(organization => `org:${organization.login}`)].join(' ');
	}
}
