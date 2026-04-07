/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { makeGitHubAPIRequest } from '../common/githubAPI';
import { GithubRepositoryItem, IGetRepositoryInfoResponseData, IGithubRepositoryService } from '../common/githubService';

export class GithubRepositoryService implements IGithubRepositoryService {

	declare readonly _serviceBrand: undefined;

	private readonly githubRepositoryInfoCache = new Map<string, IGetRepositoryInfoResponseData>();

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
	) {
	}

	private async _doGetRepositoryInfo(owner: string, repo: string): Promise<IGetRepositoryInfoResponseData | undefined> {
		const authToken: string | undefined = this._authenticationService.permissiveGitHubSession?.accessToken ?? this._authenticationService.anyGitHubSession?.accessToken;

		return makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, `repos/${owner}/${repo}`, 'GET', authToken, { callSite: 'github-rest-get-repo-info' });
	}

	async getRepositoryInfo(owner: string, repo: string) {
		const cachedInfo = this.githubRepositoryInfoCache.get(`${owner}/${repo}`);
		if (cachedInfo) {
			return cachedInfo;
		}

		const response = await this._doGetRepositoryInfo(owner, repo);
		if (response) {
			this.githubRepositoryInfoCache.set(`${owner}/${repo}`, response);
			return response;
		}
		throw new Error(`Failed to fetch repository info for ${owner}/${repo}`);
	}

	async isAvailable(org: string, repo: string): Promise<boolean> {
		try {
			const response = await this._doGetRepositoryInfo(org, repo);
			return response !== undefined;
		} catch (e) {
			return false;
		}
	}

	async getRepositoryItems(org: string, repo: string, path: string): Promise<GithubRepositoryItem[]> {
		const paths: GithubRepositoryItem[] = [];
		try {
			const authToken = this._authenticationService.permissiveGitHubSession?.accessToken;
			const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
			const data = await makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, `repos/${org}/${repo}/contents/${encodedPath}`, 'GET', authToken, { callSite: 'github-rest-get-repo-items' });

			if (!data) {
				this._logService.error(`Failed to fetch contents from ${org}:${repo}:${path}`);
				return [];
			}
			if (Array.isArray(data)) {
				for (const child of data) {
					if ('name' in child && 'path' in child && 'type' in child && 'html_url' in child) {
						paths.push({ name: child.name, path: child.path, type: child.type, html_url: child.html_url });
						if (child.type === 'dir') {
							paths.push(...await this.getRepositoryItems(org, repo, child.path));
						}
					}
				}
			}
		} catch {
			this._logService.error(`Failed to fetch contents from ${org}:${repo}:${path}`);
			return [];
		}
		return paths;
	}

	async getRepositoryItemContent(org: string, repo: string, path: string): Promise<Uint8Array | undefined> {
		try {
			const authToken = this._authenticationService.permissiveGitHubSession?.accessToken;
			const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
			const data = await makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, `repos/${org}/${repo}/contents/${encodedPath}`, 'GET', authToken, { callSite: 'github-rest-get-repo-item-content' });

			if (!data) {
				this._logService.error(`Failed to fetch content from ${org}:${repo}:${path}`);
				return undefined;
			}

			if ('content' in data) {
				const content = Buffer.from(data.content, 'base64');
				return new Uint8Array(content);
			}
			throw new Error('Unexpected data from GitHub');
		} catch {
			this._logService.error(`Failed to fetch content from ${org}:${repo}:${path}`);
		}
	}
}
