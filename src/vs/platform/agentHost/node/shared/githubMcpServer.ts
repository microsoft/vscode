/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import { gitHubMcpServerUrl } from '../../common/githubEndpoints.js';
import type { ICopilotApiService } from './copilotApiService.js';
import { findExecutable } from '../../../../base/node/processes.js';

export const GITHUB_MCP_SERVER_NAME = 'github-mcp-server';
export const GITHUB_MCP_FEATURES_HEADER = 'X-MCP-Features';
export const GITHUB_MCP_FEATURES = 'remote_mcp_ui_apps,mcp_apps_disable_form_deferral';
export const GITHUB_MCP_TOOLS_HEADER = 'X-MCP-Tools';

/**
 * The following tool logic mirrors that of the Copilot SDK for the
 * built-in GH MCP as exposed for other harnesses.
 */
export const GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS = [
	'get_file_contents',
	'search_code',
	'get_copilot_space',
	'list_copilot_spaces',
	'web_search',
	'search_users',
] as const;

export const GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS = [
	'search_repositories',
	'list_branches',
	'list_commits',
	'get_commit',
	'issue_read',
	'list_issues',
	'search_issues',
	'pull_request_read',
	'list_pull_requests',
	'search_pull_requests',
	'actions_list',
	'actions_get',
	'get_job_logs',
] as const;

export const GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS = [
	'list_workflow_runs',
	'get_workflow_run',
	'list_workflows',
	'get_workflow_run_logs',
	'get_workflow',
] as const;

let ghCliAvailable: Promise<boolean> | undefined;

async function isGhCliAvailable(): Promise<boolean> {
	ghCliAvailable ??= (async () => await findExecutable('gh').catch(() => undefined) !== undefined)();
	return ghCliAvailable;
}

export function getGitHubMcpTools(hasGhCli: boolean): readonly string[] {
	return hasGhCli
		? GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS
		: [
			...GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS,
			...GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS,
			...GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS,
		];
}

export function createGitHubMcpServerConfiguration(copilotApiBaseUri: string, hasGhCli = false): IMcpServerConfiguration {
	const url = gitHubMcpServerUrl(copilotApiBaseUri);
	if (!url) {
		throw new Error('Unable to resolve the GitHub MCP server URL');
	}
	const headers = {
		[GITHUB_MCP_FEATURES_HEADER]: GITHUB_MCP_FEATURES,
		[GITHUB_MCP_TOOLS_HEADER]: getGitHubMcpTools(hasGhCli).join(','),
	};
	return {
		type: McpServerType.REMOTE,
		url,
		headers,
	};
}

export async function resolveGitHubMcpServerConfiguration(copilotApiService: ICopilotApiService, token: string | undefined): Promise<IMcpServerConfiguration | undefined> {
	if (!token) {
		return undefined;
	}
	const [copilotApiBaseUri, hasGhCli] = await Promise.all([
		copilotApiService.resolveApiEndpoint(token),
		isGhCliAvailable(),
	]);
	if (!copilotApiBaseUri) {
		return undefined;
	}
	return createGitHubMcpServerConfiguration(copilotApiBaseUri, hasGhCli);
}
