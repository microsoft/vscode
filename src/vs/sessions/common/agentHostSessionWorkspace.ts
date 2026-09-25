/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { match as matchGlob } from '../../base/common/glob.js';
import { constObservable, derived, IObservable } from '../../base/common/observable.js';
import { extUri, basename } from '../../base/common/resources.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { URI } from '../../base/common/uri.js';
import type { ISessionGitState } from '../../platform/agentHost/common/state/sessionState.js';
import { getRepositoryRootFromWorktree } from '../../platform/agentHost/common/worktreePaths.js';
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
 * scope of the folder JustRide actually has loaded rather than the host
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
			String(repo?.hasGitRemote ?? ''),
			String(repo?.hasGitHubRemote ?? ''),
			repo?.upstreamBranchName ?? '',
			String(repo?.incomingChanges ?? ''),
			String(repo?.outgoingChanges ?? ''),
			String(repo?.uncommittedChanges ?? ''),
		].join('\u0001');
	});
	return [workspace.label, ...folderKeys].join('\n');
}

/** Resolves the GitHub info a session folder reports, by working directory. */
export type IFolderGitHubInfoResolver = (workingDirectory: URI) => IObservable<IGitHubInfo | undefined> | undefined;

/**
 * Projects a chat's working-directory scope onto its owning session workspace.
 * Returns no workspace rather than exposing a partial scope when a required folder is unavailable.
 *
 * Pass `getFolderGitHubInfo` to have each folder report its own repository and
 * pull request information instead of what the session workspace carries.
 * Pass `gitState` to project the chat scope's branch state onto its primary folder.
 */
export function buildAgentHostChatWorkspace(sessionWorkspace: ISessionWorkspace | undefined, workingDirectories: readonly URI[] | undefined, getFolderGitHubInfo?: IFolderGitHubInfoResolver, gitState?: ISessionGitState): ISessionWorkspace | undefined {
	if (!sessionWorkspace || (workingDirectories === undefined && !getFolderGitHubInfo && !gitState)) {
		return sessionWorkspace;
	}

	const folders: ISessionFolder[] = [];
	for (const workingDirectory of workingDirectories ?? sessionWorkspace.folders.map(folder => folder.workingDirectory)) {
		const folder = sessionWorkspace.folders.find(candidate => extUri.isEqual(candidate.workingDirectory, workingDirectory));
		if (!folder) {
			return undefined;
		}
		const folderWithGitState = folders.length === 0 && gitState ? withFolderGitState(folder, gitState) : folder;
		const gitHubInfo = getFolderGitHubInfo?.(folder.workingDirectory);
		folders.push(gitHubInfo && folderWithGitState.gitRepository?.gitHubInfo !== gitHubInfo ? withFolderGitHubInfo(folderWithGitState, gitHubInfo) : folderWithGitState);
	}

	if (folders.length === 0) {
		return undefined;
	}
	if (folders.length === sessionWorkspace.folders.length && folders.every((folder, index) => folder === sessionWorkspace.folders[index])) {
		return sessionWorkspace;
	}

	const primaryFolder = folders[0];
	const usesSessionPrimary = extUri.isEqual(primaryFolder.workingDirectory, sessionWorkspace.folders[0].workingDirectory);
	return {
		...sessionWorkspace,
		uri: usesSessionPrimary ? sessionWorkspace.uri : primaryFolder.root,
		label: usesSessionPrimary ? sessionWorkspace.label : primaryFolder.name,
		folders,
	};
}

function withFolderGitState(folder: ISessionFolder, gitState: ISessionGitState): ISessionFolder {
	const repository = folder.gitRepository ?? {
		uri: folder.root,
		workTreeUri: undefined,
		baseBranchName: undefined,
		gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined),
	};
	return {
		...folder,
		gitRepository: {
			...repository,
			isRepository: constObservable(true),
			branchName: gitState.branchName,
			baseBranchName: gitState.baseBranchName,
			hasGitRemote: gitState.hasGitRemote,
			hasGitHubRemote: gitState.hasGitHubRemote,
			upstreamBranchName: gitState.upstreamBranchName,
			incomingChanges: gitState.incomingChanges,
			outgoingChanges: gitState.outgoingChanges,
			uncommittedChanges: gitState.uncommittedChanges,
		},
	};
}

/** A folder reporting `gitHubInfo`; a folder without a repository gains one once the GitHub state resolves. */
function withFolderGitHubInfo(folder: ISessionFolder, gitHubInfo: IObservable<IGitHubInfo | undefined>): ISessionFolder {
	return {
		...folder,
		gitRepository: folder.gitRepository
			? { ...folder.gitRepository, gitHubInfo }
			: { uri: folder.root, workTreeUri: undefined, baseBranchName: undefined, isRepository: derived(reader => gitHubInfo.read(reader) !== undefined), gitHubInfo },
	};
}

export function buildAgentHostSessionWorkspace(project: IAgentHostSessionProjectSummary | undefined, workingDirectories: readonly URI[] | undefined, options: IAgentHostSessionWorkspaceOptions, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState?: ISessionGitState): ISessionWorkspace | undefined {
	const baseBranchName = gitState?.baseBranchName;
	const baseBranchProtected = baseBranchName !== undefined
		? matchesAnyBranchProtectionPattern(baseBranchName, options.branchProtectionPatterns)
		: undefined;
	const hasGitRemote = gitState?.hasGitRemote;
	const hasGitHubRemote = gitState?.hasGitHubRemote;
	const upstreamBranchName = gitState?.upstreamBranchName;
	const incomingChanges = gitState?.incomingChanges;
	const outgoingChanges = gitState?.outgoingChanges;
	const uncommittedChanges = gitState?.uncommittedChanges;
	const branchName = gitState?.branchName;
	const gitFields = { branchName, baseBranchName, baseBranchProtected, hasGitRemote, hasGitHubRemote, upstreamBranchName, incomingChanges, outgoingChanges, uncommittedChanges };

	// The primary (index 0) is the session's process root; it carries the git
	// state / project association. Additional directories carry no per-folder
	// git state; a JustRide-created worktree reports its repository as the
	// folder's project, so a chat working in it shows that project.
	const primary = workingDirectories?.[0];
	const additionalFolders: ISessionFolder[] = (workingDirectories ?? []).slice(1).map(dir => {
		const repositoryRoot = getRepositoryRootFromWorktree(dir);
		const root = repositoryRoot ?? dir;
		return {
			root,
			workingDirectory: dir,
			name: basename(root) || root.path,
			description: options.description,
			...(repositoryRoot ? {
				gitRepository: { uri: repositoryRoot, workTreeUri: dir, baseBranchName: undefined, isRepository: constObservable(true), gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) },
			} : {}),
		};
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
				gitRepository: { uri: project.uri, workTreeUri, isRepository: constObservable(true), gitHubInfo, ...gitFields },
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
			gitRepository: { uri: primary, workTreeUri: undefined, isRepository: constObservable(gitState !== undefined), gitHubInfo, ...gitFields },
		}, ...additionalFolders],
		requiresWorkspaceTrust: options.requiresWorkspaceTrust,
		isVirtualWorkspace: false,
		typeIcon: options.typeIcon,
	};
}
