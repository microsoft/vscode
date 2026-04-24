/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CCAModel, RemoteAgentJobPayload, RequestType } from '@vscode/copilot-api';
import type { AuthenticationSession } from 'vscode';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AssignableActor, getAssignableActorsWithAssignableUsers, getAssignableActorsWithSuggestedActors, PullRequestComment, PullRequestSearchItem, SessionInfo } from './githubAPI';
import { AuthOptions, BaseOctoKitService, CCAEnabledResult, CustomAgentDetails, CustomAgentListItem, CustomAgentListOptions, ErrorResponseWithStatusCode, IOctoKitService, IOctoKitUser, JobInfo, PermissiveAuthRequiredError, PullRequestFile, RemoteAgentJobResponse } from './githubService';

export class OctoKitService extends BaseOctoKitService implements IOctoKitService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(capiClientService, fetcherService, logService, telemetryService);
	}

	private _getPermissiveSession(authOptions: AuthOptions): Promise<AuthenticationSession | undefined> {
		if (authOptions.createIfNone) {
			return this._authService.getGitHubSession('permissive', { createIfNone: authOptions.createIfNone });
		}
		return this._authService.getGitHubSession('permissive', { silent: true });
	}

	async getCurrentAuthedUser(): Promise<IOctoKitUser | undefined> {
		const authToken = (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getCurrentAuthedUser');
			return undefined;
		}
		return await this.getCurrentAuthedUserWithToken(authToken);
	}

	async getOpenPullRequestsForUser(owner: string, repo: string, authOptions: AuthOptions): Promise<PullRequestSearchItem[]> {
		const auth = (await this._getPermissiveSession(authOptions));
		if (!auth?.accessToken) {
			this._logService.trace('No authentication token available for getOpenPullRequestsForUser');
			return [];
		}
		const response = await this.getOpenPullRequestForUserWithToken(
			owner,
			repo,
			auth.account.label,
			auth.accessToken
		);
		return response;
	}

	async getCopilotSessionsForPR(prId: string, authOptions: AuthOptions): Promise<SessionInfo[]> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getCopilotSessionsForPR');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotSessions, prId });
			if (!response.ok) {
				throw new Error(`Failed to fetch copilot sessions for PR ${prId}: ${response.statusText}`);
			}
			const data = await response.json() as { sessions?: SessionInfo[] };
			if (data && Array.isArray(data.sessions)) {
				return data.sessions;
			}
			throw new Error('Invalid response format');
		} catch (e) {
			this._logService.error(e);
			return [];
		}
	}

	async getSessionLogs(sessionId: string, authOptions: AuthOptions): Promise<string> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getSessionLogs');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotSessionLogs, sessionId });
			if (!response.ok) {
				throw new Error(`Failed to fetch session logs for session ${sessionId}: ${response.statusText}`);
			}
			return response.text();
		} catch (e) {
			this._logService.error(e);
			return '';
		}
	}

	async getSessionInfo(sessionId: string, authOptions: AuthOptions): Promise<SessionInfo | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getSessionInfo');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotSessionDetails, sessionId });
			if (!response.ok) {
				throw new Error(`Failed to fetch session info for session ${sessionId}: ${response.statusText}`);
			}
			const responseData = await response.text();
			if (typeof responseData === 'string') {
				return JSON.parse(responseData) as SessionInfo;
			}
			throw new Error('Invalid response format');
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async postCopilotAgentJob(owner: string, name: string, apiVersion: string, payload: RemoteAgentJobPayload, authOptions: AuthOptions): Promise<RemoteAgentJobResponse | ErrorResponseWithStatusCode | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for postCopilotAgentJob');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'POST',
				body: JSON.stringify(payload),
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotAgentJob, owner, repo: name, apiVersion, payload });
			if (!response.ok) {
				return {
					status: response.status,
				};
			}
			return await response.json() as RemoteAgentJobResponse;
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async getJobByJobId(owner: string, repo: string, jobId: string, userAgent: string, authOptions: AuthOptions): Promise<JobInfo | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getJobByJobId');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotAgentJob, owner, repo, jobId });
			if (!response.ok) {
				throw new Error(`Failed to fetch job info for job ${jobId}: ${response.statusText}`);
			}
			return await response.json() as JobInfo;
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async getJobBySessionId(owner: string, repo: string, sessionId: string, userAgent: string, authOptions: AuthOptions): Promise<JobInfo | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getJobBySessionId');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotAgentJob, owner, repo, sessionId });
			if (!response.ok) {
				throw new Error(`Failed to fetch job info for session ${sessionId}: ${response.statusText}`);
			}
			return await response.json() as JobInfo;
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async addPullRequestComment(pullRequestId: string, commentBody: string, authOptions: AuthOptions): Promise<PullRequestComment | null> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for addPullRequestComment');
			throw new PermissiveAuthRequiredError();
		}
		return this.addPullRequestCommentWithToken(pullRequestId, commentBody, authToken);
	}

	async getAllSessions(nwo: string | undefined, open: boolean, authOptions: AuthOptions): Promise<SessionInfo[]> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.debug(`[getAllSessions] No authentication token available (nwo=${nwo})`);
				throw new PermissiveAuthRequiredError();
			}
			this._logService.debug(`[getAllSessions] Fetching sessions for nwo=${nwo}, open=${open}`);
			const result = await this._capiClientService.makeRequest<SessionInfo[]>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotSessions, nwo, resourceState: open ? 'draft,open' : undefined });
			this._logService.debug(`[getAllSessions] Got ${Array.isArray(result) ? result.length : 'non-array'} sessions for nwo=${nwo}`);
			return result;
		} catch (e) {
			if (e instanceof Error) {
				this._logService.error(e, 'Error in getAllSessions');
				this._logService.debug(`[getAllSessions] Error for nwo=${nwo}: ${e.message}`);
			} else {
				this._logService.error('Non-Error thrown in getAllSessions');
				this._logService.debug(`[getAllSessions] Non-Error thrown for nwo=${nwo}: ${String(e)}`);
			}
			return [];
		}
	}

	async getPullRequestFromGlobalId(globalId: string, authOptions: AuthOptions): Promise<PullRequestSearchItem | null> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getPullRequestFromGlobalId');
			throw new PermissiveAuthRequiredError();
		}
		return this.getPullRequestFromSessionWithToken(globalId, authToken);
	}

	async getCustomAgents(owner: string, repo: string, options: CustomAgentListOptions, authOptions: AuthOptions): Promise<CustomAgentListItem[]> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getCustomAgents');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, {
				type: RequestType.CopilotCustomAgents,
				owner,
				repo,
				target: options?.target,
				exclude_invalid_config: options?.excludeInvalidConfig,
				dedupe: options?.dedupe,
				include_sources: options?.includeSources
			});
			if (!response.ok) {
				throw new Error(`Failed to fetch custom agents for ${owner} ${repo}: ${response.statusText}`);
			}
			const data = await response.json() as {
				agents?: CustomAgentListItem[];
			};
			if (data && Array.isArray(data.agents)) {
				return data.agents;
			}
			throw new Error('Invalid response format');
		} catch (e) {
			this._logService.error(e);
			return [];
		}
	}

	async getCustomAgentDetails(owner: string, repo: string, agentName: string, version: string, authOptions: AuthOptions): Promise<CustomAgentDetails | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getCustomAgentDetails');
				throw new PermissiveAuthRequiredError();
			}

			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotCustomAgentsDetail, owner, repo, version, customAgentName: agentName });

			if (!response.ok) {
				if (response.status === 404) {
					this._logService.trace(`Custom agent '${agentName}' not found for ${owner}/${repo}`);
					return undefined;
				}
				throw new Error(`Failed to fetch custom agent details for ${agentName}: ${response.statusText}`);
			}

			const data = await response.json() as CustomAgentDetails;
			return data;
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async getPullRequestFiles(owner: string, repo: string, pullNumber: number, authOptions: AuthOptions): Promise<PullRequestFile[]> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getPullRequestFiles');
			return [];
		}
		return this.getPullRequestFilesWithToken(owner, repo, pullNumber, authToken);
	}

	async closePullRequest(owner: string, repo: string, pullNumber: number, authOptions: AuthOptions): Promise<boolean> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for closePullRequest');
			return false;
		}
		return this.closePullRequestWithToken(owner, repo, pullNumber, authToken);
	}

	async findPullRequestByHeadBranch(owner: string, repo: string, headBranch: string, authOptions: AuthOptions): Promise<PullRequestSearchItem | undefined> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for findPullRequestByHeadBranch');
			return undefined;
		}
		return this.findPullRequestByHeadBranchWithToken(owner, repo, headBranch, authToken);
	}

	async getFileContent(owner: string, repo: string, ref: string, path: string, authOptions: AuthOptions): Promise<string> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getFileContent');
			throw new PermissiveAuthRequiredError();
		}
		return this.getFileContentWithToken(owner, repo, ref, path, authToken);
	}

	async getUserOrganizations(authOptions: AuthOptions, pageSize?: number): Promise<string[]> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getUserOrganizations');
			throw new PermissiveAuthRequiredError();
		}
		return this.getUserOrganizationsWithToken(authToken, pageSize);
	}

	async isUserMemberOfOrg(org: string, authOptions: AuthOptions): Promise<boolean> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for isUserMemberOfOrg');
			return false;
		}
		return this.isUserMemberOfOrgWithToken(org, authToken);
	}

	async getOrganizationRepositories(org: string, authOptions: AuthOptions, pageSize?: number): Promise<string[]> {
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getOrganizationRepositories');
			throw new PermissiveAuthRequiredError();
		}
		return this.getOrganizationRepositoriesWithToken(org, authToken, pageSize);
	}

	async getOrgCustomInstructions(orgLogin: string, authOptions: AuthOptions): Promise<string | undefined> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				throw new Error('No authentication token available');
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, {
				type: RequestType.OrgCustomInstructions,
				orgLogin
			});
			if (!response.ok) {
				if (response.status === 404) {
					return undefined;
				}
				throw new Error(`Failed to fetch custom instructions for org ${orgLogin}: ${response.statusText}`);
			}
			const data = await response.json() as { prompt: string };
			return data.prompt;
		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}

	async getUserRepositories(authOptions: AuthOptions, query?: string): Promise<{ owner: string; name: string }[]> {
		// Use 'permissive' auth to ensure we have the 'repo' scope needed to list private repositories
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getUserRepositories');
			throw new PermissiveAuthRequiredError();
		}
		return this.getUserRepositoriesWithToken(authToken, query);
	}

	async getRecentlyCommittedRepositories(authOptions: AuthOptions): Promise<{ owner: string; name: string }[]> {
		// Use 'permissive' auth to ensure we have access to private repository events
		const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
		if (!authToken) {
			this._logService.trace('No authentication token available for getRecentlyCommittedRepositories');
			throw new PermissiveAuthRequiredError();
		}
		return this.getRecentlyCommittedReposWithToken(authToken);
	}

	async getCopilotAgentModels(authOptions: AuthOptions): Promise<CCAModel[]> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for getCopilotAgentModels');
				throw new PermissiveAuthRequiredError();
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CCAModelsList });
			if (!response.ok) {
				this._logService.trace(`Failed to fetch Copilot agent models: ${response.statusText}`);
				return [];
			}
			const data = await response.json() as { data?: CCAModel[] };
			if (data && Array.isArray(data.data)) {
				return data.data;
			}
			return [];
		} catch (e) {
			this._logService.error(e);
			return [];
		}
	}

	async getAssignableActors(owner: string, repo: string, authOptions: AuthOptions): Promise<AssignableActor[]> {
		const auth = (await this._getPermissiveSession(authOptions));
		if (!auth?.accessToken) {
			this._logService.trace('No authentication token available for getAssignableActors');
			throw new PermissiveAuthRequiredError();
		}

		let usedSuggestedActors = true;
		try {
			// Try suggestedActors first (preferred API)
			const actors = await getAssignableActorsWithSuggestedActors(
				this._fetcherService,
				this._logService,
				this._telemetryService,
				this._capiClientService.dotcomAPIURL,
				auth.accessToken,
				owner,
				repo
			);

			if (actors.length > 0) {
				return actors;
			}

			// Fall back to assignableUsers for older GitHub Enterprise Server instances
			this._logService.trace('Falling back to assignableUsers API');
			usedSuggestedActors = false;
			return await getAssignableActorsWithAssignableUsers(
				this._fetcherService,
				this._logService,
				this._telemetryService,
				this._capiClientService.dotcomAPIURL,
				auth.accessToken,
				owner,
				repo
			);
		} catch (e) {
			this._logService.error(`Error fetching assignable actors: ${e}`);
			const properties: { errorCode?: string; usedSuggestedActors: string } = {
				usedSuggestedActors: String(usedSuggestedActors),
			};
			const errorCode = getErrorCode(e);
			if (errorCode) {
				properties.errorCode = errorCode;
			}

			/* __GDPR__
				"pr.getAssignableUsersFailed" : {
					"errorCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"usedSuggestedActors": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('pr.getAssignableUsersFailed', properties);
			return [];
		}
	}

	async isCCAEnabled(owner: string, repo: string, authOptions: AuthOptions): Promise<CCAEnabledResult> {
		try {
			const authToken = (await this._getPermissiveSession(authOptions))?.accessToken;
			if (!authToken) {
				this._logService.trace('No authentication token available for isCCAEnabled');
				return { enabled: undefined };
			}
			const response = await this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
				}
			}, { type: RequestType.CopilotAgentJobEnabled, owner, repo });

			if (response.ok) {
				// 200 - OK - CCA is enabled and repository rules pass
				return { enabled: true };
			}

			switch (response.status) {
				case 401:
					// 401 - Unauthorized - Unauthenticated request
					return { enabled: false, statusCode: 401 };
				case 403:
					// 403 - Forbidden - CCA disabled
					return { enabled: false, statusCode: 403 };
				case 422:
					// 422 - Unprocessable entity - Repository rules violation
					return { enabled: false, statusCode: 422 };
				default:
					this._logService.trace(`Unexpected status code for isCCAEnabled: ${response.status}`);
					return { enabled: undefined, statusCode: response.status };
			}
		} catch (e) {
			this._logService.error(`Error checking if CCA is enabled: ${e}`);
			return { enabled: undefined };
		}
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function getErrorCode(e: unknown): string | undefined {
	if (!isObject(e)) {
		return undefined;
	}

	if (e.status !== undefined) {
		return String(e.status);
	}

	const networkError = e.networkError;
	if (isObject(networkError) && networkError.statusCode !== undefined) {
		return String(networkError.statusCode);
	}

	const graphQLErrors = e.graphQLErrors;
	if (Array.isArray(graphQLErrors)) {
		const firstGraphQLError = graphQLErrors[0];
		if (isObject(firstGraphQLError)) {
			const extensions = firstGraphQLError.extensions;
			if (isObject(extensions) && extensions.code !== undefined) {
				return String(extensions.code);
			}
		}
	}

	if (e.code !== undefined) {
		return String(e.code);
	}

	if (typeof e.name === 'string' && e.name) {
		return e.name;
	}

	return undefined;
}
