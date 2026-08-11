/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { match as matchGlob } from '../../base/common/glob.js';
import { IObservable } from '../../base/common/observable.js';
import { extUri, basename } from '../../base/common/resources.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import type { ISessionGitState } from '../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IGitHubInfo, ISessionFolder, ISessionWorkspace } from '../services/sessions/common/session.js';

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
	 * Group label used by the workspace picker to bucket the produced
	 * workspace into a top-level tab (e.g. `"Local"`, `"Remote"`).
	 */
	readonly group?: string;
	/**
	 * Configured `git.branchProtection` glob patterns. Used to compute
	 * `baseBranchProtected` on the resulting repository.
	 */
	readonly branchProtectionPatterns?: readonly string[];
	/** Overrides the inferred folder/worktree type icon. See {@link ISessionWorkspace.typeIcon}. */
	readonly typeIcon?: ThemeIcon;
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
 *
 * The `git.branchProtection` setting is `resource`-scoped, so the value can
 * differ between workspace folders. Pass the session's working directory (or
 * project URI as a fallback) as `resource` so we read the setting in the
 * scope of the folder VS Code actually has loaded rather than the host
 * window's active workspace.
 */
export function readBranchProtectionPatterns(configurationService: IConfigurationService, resource?: URI): readonly string[] {
	const raw = configurationService.getValue<unknown>('git.branchProtection', { resource }) ?? [];
	const list = Array.isArray(raw) ? raw : [raw];
	return list
		.map(p => typeof p === 'string' ? p.trim() : '')
		.filter(p => p !== '');
}

export function agentHostSessionWorkspaceKey(workspace: ISessionWorkspace | undefined): string | undefined {
	const folder = workspace?.folders[0];
	if (!workspace || !folder) {
		return undefined;
	}
	// Hash every folder so a change to any peer directory (added/removed/reordered)
	// invalidates the key, not just the primary.
	const folderKeys = workspace.folders.map(f => {
		const repo = f.gitRepository;
		return [
			extUri.getComparisonKey(f.root),
			f.workingDirectory ? extUri.getComparisonKey(f.workingDirectory) : '',
			repo?.branchName ?? '',
			repo?.baseBranchName ?? '',
			String(repo?.baseBranchProtected ?? ''),
			String(repo?.hasGitHubRemote ?? ''),
			repo?.upstreamBranchName ?? '',
			String(repo?.incomingChanges ?? ''),
			String(repo?.outgoingChanges ?? ''),
			String(repo?.uncommittedChanges ?? ''),
		].join('\u0001');
	});
	return [workspace.label, ...folderKeys].join('\n');
}

export function buildAgentHostSessionWorkspace(project: IAgentHostSessionProjectSummary | undefined, workingDirectories: readonly URI[] | undefined, options: IAgentHostSessionWorkspaceOptions, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState?: ISessionGitState): ISessionWorkspace | undefined {
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

	// The primary (index 0) is the session's process root; it carries the git
	// state / project association. Additional directories are emitted as plain
	// peer folders — per-folder git state is owned by the deferred git track and
	// is not populated here.
	const primary = workingDirectories?.[0];
	const additionalFolders: ISessionFolder[] = (workingDirectories ?? []).slice(1).map(dir => {
		const name = basename(dir) || dir.path;
		return { root: dir, workingDirectory: dir, name, description: options.description };
	});

	if (project) {
		const workTreeUri = extUri.isEqual(primary, project.uri) ? undefined : primary;
		const label = options.providerLabel ? `${project.displayName} [${options.providerLabel}]` : project.displayName;
		return {
			uri: project.uri,
			label,
			description: options.description,
			icon: Codicon.repo,
			group: options.group,
			folders: [{
				root: project.uri,
				workingDirectory: primary ?? project.uri,
				name: project.displayName,
				description: options.description,
				gitRepository: { uri: project.uri, workTreeUri, gitHubInfo, ...gitFields },
			}, ...additionalFolders],
			requiresWorkspaceTrust: options.requiresWorkspaceTrust,
			isVirtualWorkspace: false,
			typeIcon: options.typeIcon,
		};
	}

	if (!primary) {
		return undefined;
	}

	const folderName = basename(primary) || primary.path;
	const label = options.providerLabel ? `${folderName} [${options.providerLabel}]` : folderName;
	return {
		uri: primary,
		label,
		description: options.description,
		icon: options.fallbackIcon,
		group: options.group,
		folders: [{
			root: primary,
			workingDirectory: primary,
			name: folderName,
			description: options.description,
			gitRepository: { uri: primary, workTreeUri: undefined, gitHubInfo, ...gitFields },
		}, ...additionalFolders],
		requiresWorkspaceTrust: options.requiresWorkspaceTrust,
		isVirtualWorkspace: false,
		typeIcon: options.typeIcon,
	};
}
