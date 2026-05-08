/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthOptions, CCAEnabledResult, CustomAgentDetails, CustomAgentListItem, CustomAgentListOptions, GitHubOutageStatus, IOctoKitService, PermissiveAuthRequiredError } from '../../../../platform/github/common/githubService';

/**
 * Mock implementation of IOctoKitService for testing
 */
export class MockOctoKitService implements IOctoKitService {
	_serviceBrand: undefined;

	private customAgents: CustomAgentListItem[] = [];
	private agentDetails: Map<string, CustomAgentDetails> = new Map();
	private orgInstructions: Map<string, string> = new Map();
	private userOrganizations: string[] = ['testorg'];

	getCurrentAuthedUser = async () => ({ login: 'testuser', name: 'Test User', avatar_url: '' });
	getCopilotPullRequestsForUser = async () => [];
	getGitHubOutageStatus = async (): Promise<GitHubOutageStatus> => GitHubOutageStatus.None;
	getCopilotSessionsForPR = async () => [];
	getSessionLogs = async () => '';
	getSessionInfo = async () => undefined;
	postCopilotAgentJob = async () => undefined;
	getJobByJobId = async () => undefined;
	getJobBySessionId = async () => undefined;
	addPullRequestComment = async () => null;
	getAllOpenSessions = async () => [];
	getAllSessions = async () => [];
	getPullRequestFromGlobalId = async () => null;
	getPullRequestFiles = async () => [];
	closePullRequest = async () => false;
	findPullRequestByHeadBranch = async () => undefined;
	getOpenPullRequestsForUser = async () => [];
	getFileContent = async () => '';
	getUserRepositories = async () => [];
	getRecentlyCommittedRepositories = async () => [];
	getCopilotAgentModels = async () => [];
	getAssignableActors = async () => [];
	isCCAEnabled = async (): Promise<CCAEnabledResult> => ({ enabled: true });

	getUserOrganizations = async (_authOptions?: AuthOptions, _pageSize?: number) => this.userOrganizations;
	isUserMemberOfOrg = async (org: string, _authOptions?: AuthOptions) => this.userOrganizations.includes(org);
	getOrganizationRepositories = async (org: string, _authOptions?: AuthOptions, _pageSize?: number) => [org === 'testorg' ? 'testrepo' : 'repo'];

	async getOrgCustomInstructions(orgLogin: string, _authOptions?: AuthOptions): Promise<string | undefined> {
		return this.orgInstructions.get(orgLogin);
	}

	async getCustomAgents(_owner: string, _repo: string, _options: CustomAgentListOptions, _authOptions: AuthOptions): Promise<CustomAgentListItem[]> {
		if (!(await this.getCurrentAuthedUser())) {
			throw new PermissiveAuthRequiredError();
		}
		return this.customAgents;
	}

	async getCustomAgentDetails(_owner: string, _repo: string, agentName: string, _version: string, _authOptions: AuthOptions): Promise<CustomAgentDetails | undefined> {
		return this.agentDetails.get(agentName);
	}

	// Helper methods for test setup

	setOrgInstructions(orgLogin: string, instructions: string | undefined) {
		if (instructions === undefined) {
			this.orgInstructions.delete(orgLogin);
		} else {
			this.orgInstructions.set(orgLogin, instructions);
		}
	}

	clearInstructions() {
		this.orgInstructions.clear();
	}

	setCustomAgents(agents: CustomAgentListItem[]) {
		this.customAgents = agents;
	}

	setAgentDetails(name: string, details: CustomAgentDetails) {
		this.agentDetails.set(name, details);
	}

	setUserOrganizations(orgs: string[]) {
		this.userOrganizations = orgs;
	}

	clearAgents() {
		this.customAgents = [];
		this.agentDetails.clear();
	}

	/**
	 * Resets all mock state
	 */
	reset() {
		this.clearInstructions();
		this.clearAgents();
		this.userOrganizations = ['testorg'];
	}
}
