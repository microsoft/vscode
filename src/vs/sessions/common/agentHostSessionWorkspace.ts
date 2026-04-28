/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { match as matchGlob } from '../../base/common/glob.js';
import { extUri, basename } from '../../base/common/resources.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import type { ISessionGitState } from '../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ISessionWorkspace } from '../services/sessions/common/session.js';

export interface IAgentHostSessionProjectSummary {
	readonly uri: URI;
	readonly displayName: string;
}

export interface IAgentHostSessionWorkspaceOptions {
	readonly providerLabel?: string;
	readonly fallbackIcon: ThemeIcon;
	readonly requiresWorkspaceTrust: boolean;
	readonly description?: string;
	/**
	 * Configured `git.branchProtection` glob patterns. Used to compute
	 * `baseBranchProtected` on the resulting repository.
	 */
	readonly branchProtectionPatterns?: readonly string[];
}

/**
 * Returns true when `branchName` matches any of the configured
 * `git.branchProtection` glob patterns.
 */
export function matchesAnyBranchProtectionPattern(branchName: string, patterns: readonly string[] | undefined): boolean {
	if (!patterns) {
		return false;
	}
	for (const pattern of patterns) {
		const trimmed = pattern.trim();
		if (trimmed && matchGlob(trimmed, branchName)) {
			return true;
		}
	}
	return false;
}

/**
 * Reads `git.branchProtection` from configuration and normalizes the result
 * into an array of trimmed, non-empty pattern strings.
 */
export function readBranchProtectionPatterns(configurationService: IConfigurationService): readonly string[] {
	const raw = configurationService.getValue<unknown>('git.branchProtection') ?? [];
	const list = Array.isArray(raw) ? raw : [raw];
	return list
		.map(p => typeof p === 'string' ? p.trim() : '')
		.filter(p => p !== '');
}

export function agentHostSessionWorkspaceKey(workspace: ISessionWorkspace | undefined): string | undefined {
	const repository = workspace?.repositories[0];
	if (!workspace || !repository) {
		return undefined;
	}
	return [
		workspace.label,
		extUri.getComparisonKey(repository.uri),
		repository.workingDirectory ? extUri.getComparisonKey(repository.workingDirectory) : '',
		repository.branchName ?? '',
		repository.baseBranchName ?? '',
		String(repository.baseBranchProtected ?? ''),
		String(repository.hasGitHubRemote ?? ''),
		repository.upstreamBranchName ?? '',
		String(repository.incomingChanges ?? ''),
		String(repository.outgoingChanges ?? ''),
		String(repository.uncommittedChanges ?? ''),
	].join('\n');
}

export function buildAgentHostSessionWorkspace(project: IAgentHostSessionProjectSummary | undefined, workingDirectory: URI | undefined, options: IAgentHostSessionWorkspaceOptions, gitState?: ISessionGitState): ISessionWorkspace | undefined {
	const baseBranchName = gitState?.baseBranchName;
	const baseBranchProtected = baseBranchName !== undefined
		? matchesAnyBranchProtectionPattern(baseBranchName, options.branchProtectionPatterns)
		: undefined;
	const hasGitHubRemote = gitState?.hasGitHubRemote;
	const upstreamBranchName = gitState?.upstreamBranchName;
	const incomingChanges = gitState?.incomingChanges;
	const outgoingChanges = gitState?.outgoingChanges;
	const uncommittedChanges = gitState?.uncommittedChanges;
	const branchName = gitState?.branchName;
	const gitFields = { branchName, baseBranchName, baseBranchProtected, hasGitHubRemote, upstreamBranchName, incomingChanges, outgoingChanges, uncommittedChanges };
	if (project) {
		const repositoryWorkingDirectory = extUri.isEqual(workingDirectory, project.uri) ? undefined : workingDirectory;
		return {
			label: options.providerLabel ? `${project.displayName} [${options.providerLabel}]` : project.displayName,
			description: options.description,
			icon: Codicon.repo,
			repositories: [{ uri: project.uri, workingDirectory: repositoryWorkingDirectory, detail: undefined, ...gitFields }],
			requiresWorkspaceTrust: options.requiresWorkspaceTrust,
		};
	}

	if (!workingDirectory) {
		return undefined;
	}

	const folderName = basename(workingDirectory) || workingDirectory.path;
	return {
		label: options.providerLabel ? `${folderName} [${options.providerLabel}]` : folderName,
		description: options.description,
		icon: options.fallbackIcon,
		repositories: [{ uri: workingDirectory, workingDirectory: undefined, detail: undefined, ...gitFields }],
		requiresWorkspaceTrust: options.requiresWorkspaceTrust,
	};
}
