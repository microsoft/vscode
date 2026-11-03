/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import YAML, { Scalar } from 'yaml';
import { AGENT_FILE_EXTENSION, PromptsType } from '../../../platform/customInstructions/common/promptTypes';
import { CustomAgentDetails, CustomAgentListOptions, IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IGitHubOrgChatResourcesService } from './githubOrgChatResourcesService';

/**
 * Polling interval for refreshing custom agents from GitHub (5 minutes).
 * We poll a bit less frequently as we need to loop and fetch full agent details including prompt content.
 */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export class GitHubOrgCustomAgentProvider extends Disposable implements vscode.ChatCustomAgentProvider {
	private readonly _onDidChangeCustomAgents = this._register(new vscode.EventEmitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	constructor(
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
		@IGitHubOrgChatResourcesService private readonly githubOrgChatResourcesService: IGitHubOrgChatResourcesService,
	) {
		super();

		// Set up polling with provider-specific interval
		this._register(this.githubOrgChatResourcesService.startPolling(REFRESH_INTERVAL_MS, this.pollAgents.bind(this)));
	}

	async provideCustomAgents(_context: unknown, token: vscode.CancellationToken): Promise<vscode.ChatResource[]> {
		try {
			const orgId = await this.githubOrgChatResourcesService.getPreferredOrganizationName();
			if (!orgId) {
				this.logService.trace('[GitHubOrgCustomAgentProvider] No organization available for providing agents');
				return [];
			}

			if (token.isCancellationRequested) {
				this.logService.trace('[GitHubOrgCustomAgentProvider] provideCustomAgents was cancelled');
				return [];
			}

			return await this.githubOrgChatResourcesService.listCachedFiles(PromptsType.agent, orgId);
		} catch (error) {
			this.logService.error(`[GitHubOrgCustomAgentProvider] Error reading from cache: ${error}`);
			return [];
		}
	}

	private async pollAgents(orgId: string): Promise<void> {
		try {
			// Convert VS Code API options to internal options
			// It's okay to include enterprise agents here which may take from other orgs, as we only retrieve per org
			const internalOptions = { includeSources: ['org', 'enterprise'] } satisfies CustomAgentListOptions;

			// Note: we need to fetch an arbitrary visible/accessible repository, in case user does not have access to .github-private
			const repos = await this.octoKitService.getOrganizationRepositories(orgId, {}, 1);
			if (repos.length === 0) {
				this.logService.trace(`[GitHubOrgCustomAgentProvider] No repositories found for org ${orgId}`);
				return;
			}

			// Fetch custom agents from GitHub and compare with existing agents in cache
			const repoName = repos[0];
			const [agents, existingAgents] = await Promise.all([
				this.octoKitService.getCustomAgents(orgId, repoName, internalOptions, {}),
				this.githubOrgChatResourcesService.listCachedFiles(PromptsType.agent, orgId)
			]);

			let hasChanges: boolean = existingAgents.length !== agents.length;
			const newFiles = new Set<string>();
			for (const agent of agents) {
				// Fetch full agent details including prompt content
				const agentDetails = await this.octoKitService.getCustomAgentDetails(
					agent.repo_owner,
					agent.repo_name,
					agent.name,
					agent.version,
					{},
				);

				// Generate agent markdown file content
				if (agentDetails) {
					const filename = `${agent.name}${AGENT_FILE_EXTENSION}`;
					const content = this.generateAgentMarkdown(agentDetails);
					const result = await this.githubOrgChatResourcesService.writeCacheFile(
						PromptsType.agent,
						orgId,
						filename,
						content,
						{ checkForChanges: !hasChanges }
					);
					hasChanges ||= result;
					newFiles.add(filename);
				}
			}

			if (!hasChanges) {
				this.logService.trace('[GitHubOrgCustomAgentProvider] No changes detected in cache');
				return;
			}

			// Remove all cached agents that are no longer present
			await this.githubOrgChatResourcesService.clearCache(PromptsType.agent, orgId, newFiles);

			// Fire event to notify consumers that agents have changed
			this._onDidChangeCustomAgents.fire();
		} catch (error) {
			this.logService.error(`[GitHubOrgCustomAgentProvider] Error polling for agents: ${error}`);
		}
	}

	private generateAgentMarkdown(agent: CustomAgentDetails): string {
		const frontmatterObj: Record<string, unknown> = {};

		if (agent.display_name) {
			frontmatterObj.name = yamlString(agent.display_name);
		}
		if (agent.description) {
			frontmatterObj.description = yamlString(agent.description);
		}
		if (agent.tools && agent.tools.length > 0 && agent.tools[0] !== '*') {
			frontmatterObj.tools = agent.tools;
		}
		if (agent.argument_hint) {
			frontmatterObj['argument-hint'] = agent.argument_hint;
		}
		if (agent.target) {
			frontmatterObj.target = agent.target;
		}
		if (agent.model) {
			frontmatterObj.model = agent.model;
		}
		if (agent.disable_model_invocation !== undefined) {
			frontmatterObj['disable-model-invocation'] = agent.disable_model_invocation;
		}
		if (agent.user_invocable !== undefined) {
			frontmatterObj['user-invocable'] = agent.user_invocable;
		}

		const frontmatter = YAML.stringify(frontmatterObj, {
			lineWidth: 0,
			// Force double-quoted strings with newlines to use escape sequences rather than multi-line blocks.
			// The custom YAML parser doesn't support multi-line strings.
			doubleQuotedMinMultiLineLength: Infinity,
		}).trim();
		const body = agent.prompt ?? '';

		return `---\n${frontmatter}\n---\n${body}\n`;
	}
}

/**
 * Returns a YAML-safe value for a string. If the string contains characters
 * that need quoting (like #, :, etc.), wraps it in a Scalar with appropriate quoting.
 * The custom YAML parser doesn't handle escape sequences, so we prefer single quotes
 * unless the value contains single quotes or newlines (in which case we use double quotes).
 */
export function yamlString(value: string): string | Scalar {
	// Characters/patterns that require quoting in YAML values:
	// - # starts a comment, : is key-value separator, [] {} are collection syntax, , is separator
	// - Values starting with quotes need quoting to preserve as strings
	// - Values with leading/trailing whitespace need quoting
	// - Boolean keywords (true, false) would be parsed as booleans
	// - Null keywords (null, ~) would be parsed as null
	// - Numeric-looking strings would be parsed as numbers
	// - Newlines would corrupt the value (parser splits on newlines)
	// - Single quotes in value require double quotes (parser doesn't handle escapes)
	const needsQuoting =
		/[#:\[\]{},\n\r]/.test(value) ||
		value.startsWith('\'') ||
		value.startsWith('"') ||
		value !== value.trim() ||
		value === 'true' ||
		value === 'false' ||
		value === 'null' ||
		value === '~' ||
		looksLikeNumber(value);

	if (needsQuoting) {
		const scalar = new Scalar(value);
		// Use double quotes if value contains single quotes OR newlines.
		// - Single quotes can't be escaped in YAML single-quoted strings
		// - Newlines in single-quoted strings become multi-line blocks, but the custom
		//   YAML parser doesn't support multi-line strings. Double quotes preserve
		//   newlines as \n escape sequences.
		scalar.type = (value.includes('\'') || value.includes('\n') || value.includes('\r'))
			? Scalar.QUOTE_DOUBLE
			: Scalar.QUOTE_SINGLE;
		return scalar;
	}
	return value;
}

/**
 * Checks if a string looks like a number that would be parsed as a numeric value.
 * Matches the logic in the custom YAML parser's isValidNumber and createValueNode.
 */
export function looksLikeNumber(value: string): boolean {
	if (value === '') {
		return false;
	}
	const num = Number(value);
	// Matches parser logic: !isNaN && isFinite && passes regex /^-?\d*\.?\d+$/
	return !isNaN(num) && isFinite(num) && /^-?\d*\.?\d+$/.test(value);
}
