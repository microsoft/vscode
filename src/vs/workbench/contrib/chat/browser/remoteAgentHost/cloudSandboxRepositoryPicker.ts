/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IGitHubClient } from '../../../../../platform/github/common/githubService.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { getGitHubRepositoryFromRemoteUrl } from '../../../git/common/utils.js';
import { RepositoryPicker } from '../agentSessions/repositoryPicker.js';

const REQUEST_CALLER = 'cloudSandbox.repositoryPicker';
const PAGE_SIZE = 100;

interface IGitHubLoginResponse {
	readonly login?: string;
}

/** A pasted GitHub URL stands for its `owner/repo`, both for the search and for filtering its results. */
function toRepositorySearchTerm(value: string): string {
	const trimmed = value.trim();
	const remote = getGitHubRepositoryFromRemoteUrl(trimmed);
	return remote ? `${remote.owner}/${remote.repo}` : trimmed;
}

/** Searches the signed-in account's GitHub repositories in the renderer, so no extension host is required. */
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
			const client = store.add(await raceCancellationError(this._gitHubService.acquireDefaultAccountClient(controller.signal), pickToken)).object;
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

	private async _searchRepositories(client: IGitHubClient, query: string, resolveScope: (signal: AbortSignal) => Promise<string>, signal: AbortSignal): Promise<readonly string[]> {
		const { account } = await client.credentials.getCredential(signal);
		const term = toRepositorySearchTerm(query);
		if (!term) {
			const page = await client.query.listRepositories(account, signal, {
				affiliation: ['owner', 'collaborator', 'organization_member'],
				sort: 'updated',
				perPage: PAGE_SIZE,
			});
			return page.repositories.map(repository => repository.nameWithOwner);
		}
		const page = await client.query.searchRepositories(account, `${term} in:name fork:true ${await resolveScope(signal)}`, signal, { sort: 'updated', perPage: PAGE_SIZE });
		return page.repositories.map(repository => repository.nameWithOwner);
	}

	/** `user:<login> org:<org>...` qualifiers restricting search to repositories the account can reach. */
	private async _resolveSearchScope(client: IGitHubClient, signal: AbortSignal): Promise<string> {
		const { account, token } = await client.credentials.getCredential(signal);
		const apiBaseUri = client.endpoint.getApiBaseUri();
		const [user, organizations] = await Promise.all([
			client.transport.rest<IGitHubLoginResponse>(account, token, { caller: REQUEST_CALLER, method: 'GET', url: `${apiBaseUri}/user`, etag: true, priority: 'interactive' }, signal),
			client.transport.rest<readonly IGitHubLoginResponse[]>(account, token, { caller: REQUEST_CALLER, method: 'GET', url: `${apiBaseUri}/user/orgs?per_page=${PAGE_SIZE}`, etag: true, priority: 'interactive' }, signal),
		]);
		if (!user.data?.login || !Array.isArray(organizations.data)) {
			throw new GitHubRequestError('GitHub did not return an account and organizations for repository search', 'malformedResponse');
		}
		return [`user:${user.data.login}`, ...organizations.data.flatMap(organization => organization.login ? [`org:${organization.login}`] : [])].join(' ');
	}
}
