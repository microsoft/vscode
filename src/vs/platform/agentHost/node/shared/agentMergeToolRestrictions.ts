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
const gitHubHostPattern = /(?:^|\.)(?:github\.com|githubcopilot\.com|ghe\.com)$/i;
const gitHubMcpServerPackagePattern = /(?:^|[\s\\/])(?:github-mcp-server|server-github)(?=$|[\s\\/:@.])/i;
const localMcpServerTypes: ReadonlySet<string> = new Set(['stdio', 'local']);
const remoteMcpServerTypes: ReadonlySet<string> = new Set(['http', 'sse']);

/** How an MCP server is launched, in the configuration shape of any provider. */
interface IMcpServerLaunch {
	readonly type?: string;
	readonly url?: string;
	readonly command?: string;
	readonly args?: readonly string[];
}

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

/**
 * Whether Agent Merge turns must not use an MCP server because it exposes GitHub. Other MCP servers stay available.
 * Matches a GitHub server name, or the endpoint or command that the server's transport uses; untyped shapes check both.
 */
export function isAgentMergeRestrictedMcpServer(name: string, server?: IMcpServerLaunch): boolean {
	if (name.toLowerCase().includes('github')) {
		return true;
	}
	const type = server?.type;
	const usesUrl = !isString(type) || !localMcpServerTypes.has(type);
	const usesCommand = !isString(type) || !remoteMcpServerTypes.has(type);
	return (usesUrl && isGitHubMcpServerUrl(server?.url)) || (usesCommand && runsGitHubMcpServerPackage(server?.command, server?.args));
}

function isGitHubMcpServerUrl(url: unknown): boolean {
	return isString(url) && URL.canParse(url) && gitHubHostPattern.test(new URL(url).hostname);
}

function runsGitHubMcpServerPackage(command: unknown, args: unknown): boolean {
	// Root MCP config entries are not schema-validated per server, so tolerate malformed arguments.
	const parts: readonly unknown[] = [command, ...(Array.isArray(args) ? args : [])];
	return parts.some(part => isString(part) && gitHubMcpServerPackagePattern.test(part));
}

export function isCopilotMcpToolName(toolName: string, serverNames: ReadonlySet<string>): boolean {
	const normalized = toolName.toLowerCase();
	return [...serverNames].some(name => normalized.startsWith(`${name.toLowerCase()}-`));
}
