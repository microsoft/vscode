/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject, isString } from '../../../../base/common/types.js';
import { GITHUB_MCP_SERVER_NAME } from './githubMcpServer.js';

export const AGENT_MERGE_GITHUB_TOOL_RESTRICTION = 'Agent Merge must use its dedicated GitHub tools for CI details, review-thread mutations, and workflow reruns. Stop this turn instead of using another GitHub tool or the GitHub CLI.';

const githubCliPattern = /(?:^|[\s;&|=()`'"])(?:gh(?:\.exe)?|github-mcp-server)(?=$|[\s;&|()`'"])/i;
const githubCliPathPattern = /[\\/](?:gh(?:\.exe)?|github-mcp-server)(?=$|[\s;&|()`'"])/i;
const directGitHubApiPattern = /\b(?:api\.github\.com|github\.com\/api\/v3)\b/i;

export function getAgentMergeGitHubToolRestriction(toolName: string, input: unknown): string | undefined {
	if (isGitHubMcpToolName(toolName)) {
		return AGENT_MERGE_GITHUB_TOOL_RESTRICTION;
	}
	const command = isObject(input) ? Reflect.get(input, 'command') : undefined;
	return isString(command) && (githubCliPattern.test(command) || githubCliPathPattern.test(command) || directGitHubApiPattern.test(command))
		? AGENT_MERGE_GITHUB_TOOL_RESTRICTION
		: undefined;
}

export function isGitHubMcpToolName(toolName: string): boolean {
	const normalized = toolName.toLowerCase();
	return normalized.startsWith(`${GITHUB_MCP_SERVER_NAME}-`)
		|| normalized.includes(`__${GITHUB_MCP_SERVER_NAME}__`)
		|| normalized.startsWith('mcp_github_')
		|| normalized.includes('__github__')
		|| /(?:^|[-_])(?:pull_request|review_thread|issue|workflow|check_run|actions?)(?:[-_]|$)/.test(normalized);
}

export function isCopilotMcpToolName(toolName: string, serverNames: ReadonlySet<string>): boolean {
	const normalized = toolName.toLowerCase();
	return [...serverNames].some(name => normalized.startsWith(`${name.toLowerCase()}-`));
}
