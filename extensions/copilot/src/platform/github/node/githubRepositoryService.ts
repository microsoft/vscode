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
import { IGetRepositoryInfoResponseData, IGithubRepositoryService } from '../common/githubService';

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
}
