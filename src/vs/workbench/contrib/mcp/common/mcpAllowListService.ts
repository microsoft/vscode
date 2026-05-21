/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, LazyStatefulPromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { intersection } from '../../../../base/common/collections.js';
import { IMcpAllowlistEntry } from '../../../../base/common/defaultAccount.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpAllowListService, McpAllowListState } from '../../../../platform/mcp/common/mcpAllowListService.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IGitService } from '../../git/common/gitService.js';
import { ISCMService } from '../../scm/common/scm.js';
import { parseRemoteUrl } from '../../git/common/utils.js';

const ALLOWLIST_CACHE_KEY = 'mcp.enterprise.allowlist.cache';
const ALLOWLIST_REFETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * A list of allowed MCP server fingerprints, or undefined if the allow list is not applicable.
 */
type AllowList = Set<string> | undefined;

/**
 * A query to an enterprise registry endpoint, optionally scoped to a specific repo.
 */
type RegistryQuery = { entry: IMcpAllowlistEntry; repo?: string };

/**
 * Shape of the enterprise allow list API list/evaluate response.
 */
interface IAllowListApiResponse {
	readonly metadata?: { readonly count?: number; readonly nextCursor?: string };
	readonly servers?: ReadonlyArray<{
		readonly server?: {
			readonly name?: string;
			readonly fingerprints?: Readonly<Record<string, string>>;
		};
	}>;
}

/**
 * Extract all fingerprint values from an API response.
 */
function extractFingerprints(response: IAllowListApiResponse | null): Set<string> {
	const result = new Set<string>();
	if (response?.servers) {
		for (const server of response.servers) {
			if (server.server?.fingerprints) {
				for (const fp of Object.values(server.server.fingerprints)) {
					if (typeof fp === 'string') {
						result.add(fp);
					}
				}
			}
		}
	}
	return result;
}

export class McpAllowListService extends Disposable implements IMcpAllowListService {
	declare _serviceBrand: undefined;

	private readyDeferred = new DeferredPromise<void>();
	private allowList: AllowList;
	private fetchCts?: CancellationTokenSource;
	private readonly refreshTimer = this._register(new MutableDisposable());

	private _state = McpAllowListState.Unavailable;
	public get state() {
		return this._state;
	}
	private set state(value: McpAllowListState) {
		this._state = value;
	}

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISCMService private readonly scmService: ISCMService,
	) {
		super();

		this._register(this.defaultAccountService.onDidChangePolicyData(() => this.loadPolicy()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.loadPolicy()));
		this._register(this.scmService.onDidAddRepository(() => this.loadPolicy(/* isRefresh */ true)));
		void this.loadPolicy();
	}

	/**
	 * Blocks until the allow list is loaded or determined not applicable.
	 */
	async waitForReady(token?: CancellationToken): Promise<void> {
		if (token) {
			await raceCancellation(this.readyDeferred.p, token);
		} else {
			await this.readyDeferred.p;
		}
	}

	/**
	 * Checks whether a server fingerprint is permitted by the enterprise allow list.
	 */
	isAllowed(fingerprint: string): true | MarkdownString {
		switch (this.state) {
			case McpAllowListState.NotApplicable:
				return true;

			case McpAllowListState.Loading:
				return new MarkdownString(localize(
					'mcp.allowlist.loading',
					"MCP server access is being verified against your organization's policy. Please try again shortly."
				));

			case McpAllowListState.Unavailable:
				if (this.configurationService.getValue<string>(mcpAccessConfig) === McpAccessValue.All) {
					return true;
				} else {
					return new MarkdownString(localize(
						'mcp.allowlist.unavailable',
						"Unable to verify MCP server access against your organization's policy. Please check your network connection."
					));
				}

			default:
				if (this.allowList?.has(fingerprint)) {
					return true;
				} else {
					return new MarkdownString(localize(
						'mcp.allowlist.blocked',
						"This MCP server is not permitted by your organization's policy."
					));
				}
		}
	}

	/**
	 * Loads or refreshes the allow list. On initial/policy load, resets state and
	 * deferred gate. On background refresh, keeps existing data on failure.
	 */
	private async loadPolicy(isRefresh = false) {
		if (isRefresh && this.state === McpAllowListState.Loading) {
			return;
		}

		this.fetchCts?.dispose(true);
		const cts = this.fetchCts = new CancellationTokenSource();

		if (!isRefresh) {
			this.refreshTimer.clear();
			this.state = McpAllowListState.Loading;
			if (this.readyDeferred.isSettled) {
				this.readyDeferred.complete();
				this.readyDeferred = new DeferredPromise<void>();
			}
		}

		try {
			const result = await this.loadMergedAllowList(cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.allowList = result;
			this.state = result === undefined ? McpAllowListState.NotApplicable : McpAllowListState.Ready;
		} catch (error) {
			if (cts.token.isCancellationRequested) {
				return;
			}

			if (isRefresh) {
				this.logService.debug('[McpAllowlist] Background refresh failed, keeping existing data:', error);
			} else {
				this.logService.error('[McpAllowlist] Failed to load allowlist:', error);
				this.state = McpAllowListState.Unavailable;
			}
		}

		if (!isRefresh) {
			this.readyDeferred.complete();
		}

		this.refreshTimer.value = disposableTimeout(() => this.loadPolicy(true), ALLOWLIST_REFETCH_INTERVAL_MS);
	}

	/**
	 * Loads fingerprints from cache and (if authToken is specified) by fetching from the registry.
	 */
	private async loadMergedAllowList(token: CancellationToken): Promise<AllowList> {
		const authToken = new LazyStatefulPromise<string>(() => this.getAuthToken(token));
		let result: AllowList = undefined;
		let lastError: Error | undefined = undefined;

		for (const { entry, repo } of await this.listRegistryQueries()) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			try {
				const current = await this.loadAllowList({ entry, repo }, authToken, token);
				result = this.mergeAllowLists(result, current);
			} catch (error) {
				this.logService.debug(`[McpAllowlist] Error loading allowlist for ${entry.ownerLogin}${repo ? `/${repo}` : ''}:`, error);
				lastError = error;
			}
		}

		if (lastError) {
			throw lastError;
		}

		return result;
	}

	/**
	 * Merges two allowlists with an intersection; if one is undefined, returns the other.
	 */
	private mergeAllowLists(a: AllowList, b: AllowList): AllowList {
		return !a ? b : !b ? a : intersection(a, b);
	}

	/**
	 * Maps workspace repos to their enterprise entries; unmatched entries are queried without repo context.
	 */
	private async listRegistryQueries(): Promise<RegistryQuery[]> {
		const entries = this.defaultAccountService.policyData?.mcpAllowlistEntries;
		if (!entries || entries.length === 0) {
			return [];
		}

		const entryMap = new Map(entries.map(e => [e.ownerLogin, e]));
		const queries: RegistryQuery[] = [];
		const seenRepos = new Set<string>();
		const matchedOwners = new Set<string>();

		for (const scmRepo of this.scmService.repositories) {
			if (!scmRepo.provider.rootUri) {
				continue;
			}

			const gitRepo = await this.gitService.openRepository(scmRepo.provider.rootUri);
			if (!gitRepo) {
				continue;
			}

			for (const remote of gitRepo.state.get().remotes) {
				if (!remote.fetchUrl) {
					continue;
				}

				const parsed = parseRemoteUrl(remote.fetchUrl);
				if (!parsed || !/^(.*\.)?(github|ghe)\.com$/.test(parsed.host)) {
					continue;
				}

				const match = parsed.path.match(/^\/?([^/]+)\/([^/]+?)(?:\.git\/?)?$/i);
				if (!match) {
					continue;
				}

				const owner = match[1];
				const repo = `${owner}/${match[2]}`;
				if (seenRepos.has(repo)) {
					continue;
				}

				seenRepos.add(repo);
				const entry = entryMap.get(owner);
				if (entry) {
					queries.push({ entry, repo });
					matchedOwners.add(owner);
				}
			}
		}

		// Entries with no matching repos are queried without repo context
		for (const [owner, entry] of entryMap) {
			if (!matchedOwners.has(owner)) {
				queries.push({ entry });
			}
		}

		return queries;
	}

	/**
	 * Loads list of allowed MCP server fingerprints from cache if available, or fetches from the API if not.
	 */
	private async loadAllowList(query: RegistryQuery, authToken: LazyStatefulPromise<string>, token: CancellationToken): Promise<AllowList> {
		const { entry, repo } = query;
		const storageKey = `${ALLOWLIST_CACHE_KEY}.${entry.ownerId}${repo ? `.${repo}` : ''}`;

		const cached = this.storageService.getObject<{ value: AllowList }>(storageKey, StorageScope.APPLICATION);
		if (cached) {
			this.logService.debug(`[McpAllowlist] Loaded allowlist for ${repo ?? '<none>'} from cache`);
			return cached.value;
		}

		const value = await this.fetchAllowList(query, authToken, token);
		this.storageService.store(storageKey, JSON.stringify({ value }), StorageScope.APPLICATION, StorageTarget.MACHINE);
		return value;
	}

	/**
	 * Fetches list of allowed MCP server fingerprints for the specified registry query.
	 */
	private async fetchAllowList(query: RegistryQuery, authToken: LazyStatefulPromise<string>, token: CancellationToken): Promise<AllowList> {
		const { entry, repo } = query;
		const url = `${entry.registryUrl}/v0.1/servers${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`;

		this.logService.debug(`[McpAllowlist] Fetching allowlist from ${url}`);
		const response = await this.requestService.request({
			type: 'GET',
			url,
			headers: { 'Authorization': `Bearer ${await authToken.getPromise()}` },
			callSite: 'mcpAllowlist.fetchFingerprints',
		}, token);

		const code = response.res.statusCode;
		switch (code) {
			case 200:
				return extractFingerprints(await asJson(response));
			case 422:
				return undefined;
			default:
				throw new Error(`Unexpected status code ${code} from allowlist API`);
		}
	}

	/**
	 * Attempts to retrieve the access token for the signed-in default account.
	 */
	private async getAuthToken(token: CancellationToken): Promise<string> {
		const account = await this.defaultAccountService.getDefaultAccount();
		if (!account) {
			throw new Error('No default account');
		}

		if (token.isCancellationRequested) {
			throw new Error('Cancelled');
		}

		const sessions = await this.authenticationService.getSessions(account.authenticationProvider.id, undefined, { silent: true });
		const session = sessions.find(o => o.id === account.sessionId);
		if (!session?.accessToken) {
			throw new Error('No session or access token found for default account');
		}

		return session?.accessToken;
	}
}
