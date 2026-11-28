/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../../../base/common/arrays.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { WORKSPACE_SUFFIX } from '../../../../../../platform/workspace/common/workspace.js';
import { readChangesetFolderFailures } from '../../../../../../platform/agentHost/common/meta/agentChangesetFolderFailuresMeta.js';
import { readSessionNonRepositoryFolders } from '../../../../../../platform/agentHost/common/meta/agentSessionNonRepositoryFoldersMeta.js';
import { readSessionRepositories } from '../../../../../../platform/agentHost/common/meta/agentSessionRepositoriesMeta.js';
import { readFolderScopeGitState, readSessionMultiRootMetadata, readWorkingDirectoryKey, readWorkingDirectoryScopeId, withSessionMultiRootMetadata, type ISessionGitState, type SessionMeta } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChangesetFolderFailure, ISessionFolder, ISessionGitRepository, ISessionRepository, ISessionWorkspace, ISessionWorkspaceConfig, SessionRepositoryKind } from '../../../../../services/sessions/common/session.js';
import { withFolderGitState } from '../../../common/agentHostSessionWorkspace.js';

/** Maps a URI between the client's and the host's URI space, with the owning connection's mapper. */
export type AgentHostUriSpaceMapper = (uri: URI) => URI;

/**
 * The workspace configuration a session records in its `multiRoot` metadata, in the client's URI space. The metadata
 * records only the workspace file: the workspace is named after it and takes the session's current folders. Its own
 * name and folders are in the file, which the workspaces service reads.
 *
 * @param toClient Maps a host URI into the client's URI space.
 * @param sessionFolders The session's folders, in the client's URI space.
 */
export function readSessionWorkspaceConfig(meta: SessionMeta | undefined, toClient: AgentHostUriSpaceMapper, sessionFolders: readonly URI[]): ISessionWorkspaceConfig | undefined {
	const multiRoot = readSessionMultiRootMetadata(meta);
	if (!multiRoot) {
		return undefined;
	}
	const uri = toClient(URI.parse(multiRoot.workspaceFile));
	if (!sessionFolders.length) {
		return undefined;
	}
	const fileName = basename(uri);
	const name = fileName.endsWith(WORKSPACE_SUFFIX) ? fileName.slice(0, -WORKSPACE_SUFFIX.length) : fileName;
	return { uri, name, folders: [...sessionFolders] };
}

/**
 * Returns `meta` with the session's workspace configuration recorded as its `multiRoot` metadata: its workspace file, in
 * the host's URI space.
 *
 * @param toHost Maps a client URI into the host's URI space.
 */
export function withSessionWorkspaceConfig(meta: Record<string, unknown> | undefined, config: ISessionWorkspaceConfig, toHost: AgentHostUriSpaceMapper): Record<string, unknown> | undefined {
	return withSessionMultiRootMetadata(meta, {
		workspaceFile: toHost(config.uri).toString(),
	});
}

/**
 * The folders a session is created in, the default folder first: `folders` when they start with the default folder,
 * else the workspace configuration's folders when it starts with it, else the default folder alone.
 */
export function getSessionWorkingDirectories(defaultFolder: URI, workspaceConfig: ISessionWorkspaceConfig | undefined, folders: readonly URI[] | undefined): readonly URI[] {
	if (folders?.length && extUriBiasedIgnorePathCase.isEqual(folders[0], defaultFolder)) {
		return distinct(folders, folder => extUriBiasedIgnorePathCase.getComparisonKey(folder));
	}
	if (workspaceConfig?.folders.length && extUriBiasedIgnorePathCase.isEqual(workspaceConfig.folders[0], defaultFolder)) {
		return distinct(workspaceConfig.folders, folder => extUriBiasedIgnorePathCase.getComparisonKey(folder));
	}
	return [defaultFolder];
}

/**
 * Adds what the host reports about the folders of a session to its workspace: each folder other than the first gets its
 * own Git state, or is marked as not being a repository, and the workspace lists the repositories found in its folders,
 * also those nested in a session's only folder. A folder the host has not read yet keeps what the workspace had.
 *
 * @param toHost Maps a client URI into the host's URI space, for the host's records keyed by working directory.
 * @param toClient Maps a host URI into the client's URI space.
 */
export function withSessionFolderState(workspace: ISessionWorkspace | undefined, meta: SessionMeta | undefined, toHost: AgentHostUriSpaceMapper, toClient: AgentHostUriSpaceMapper): ISessionWorkspace | undefined {
	if (!workspace) {
		return workspace;
	}
	const hostDirectory = (folder: URI) => toHost(folder).toString();
	const folderKey = (folder: URI) => readWorkingDirectoryKey(meta, hostDirectory(folder));
	const nonRepositoryFolders = new Set(readSessionNonRepositoryFolders(meta));
	const folders = workspace.folders.map((folder, index): ISessionFolder => {
		if (index === 0) {
			return folder;
		}
		const gitState = readFolderScopeGitState(meta, readWorkingDirectoryScopeId(meta, [hostDirectory(folder.workingDirectory)]));
		if (gitState) {
			return withFolderGitState(folder, gitState);
		}
		if (nonRepositoryFolders.has(folderKey(folder.workingDirectory))) {
			return { ...folder, gitRepository: { uri: folder.root, workTreeUri: undefined, baseBranchName: undefined, isRepository: constObservable(false), gitHubInfo: constObservable(undefined) } };
		}
		return folder;
	});
	const repositories = readFolderRepositories(folders, meta, folderKey, toClient, root => readFolderScopeGitState(meta, readWorkingDirectoryScopeId(meta, [hostDirectory(root)])));
	if (!repositories && folders.every((folder, index) => folder === workspace.folders[index])) {
		return workspace;
	}
	return { ...workspace, folders, ...(repositories ? { repositories } : {}) };
}

/** The repositories the host found for each folder, in folder order; `undefined` when it has not said. */
function readFolderRepositories(folders: readonly ISessionFolder[], meta: SessionMeta | undefined, folderKey: (folder: URI) => string, toClient: AgentHostUriSpaceMapper, rootGitState: (root: URI) => ISessionGitState | undefined): ISessionRepository[] | undefined {
	const repositories = readSessionRepositories(meta);
	if (!repositories) {
		return undefined;
	}
	const result: ISessionRepository[] = [];
	const roots = new Set<string>();
	for (const folder of folders) {
		for (const entry of repositories[folderKey(folder.workingDirectory)] ?? []) {
			const root = toClient(URI.parse(entry.root));
			// Two folders in one repository share it: list it once, under the first
			const rootKey = extUriBiasedIgnorePathCase.getComparisonKey(root);
			if (roots.has(rootKey)) {
				continue;
			}
			roots.add(rootKey);
			const kind = entry.kind === 'nested' ? SessionRepositoryKind.Nested : SessionRepositoryKind.Folder;
			// A folder's own repository has the folder's Git state (the session's, for its first folder); any other, its root's
			const gitRepository = kind === SessionRepositoryKind.Folder ? folder.gitRepository : toRepositoryGitState(root, rootGitState(root));
			result.push({ root, folder: folder.workingDirectory, kind, ...(gitRepository ? { gitRepository } : {}) });
		}
	}
	return result;

	function toRepositoryGitState(root: URI, gitState: ISessionGitState | undefined): ISessionGitRepository | undefined {
		return gitState ? withFolderGitState({ root, workingDirectory: root, name: basename(root), description: undefined }, gitState).gitRepository : undefined;
	}
}

/**
 * The folders a changeset could not compute the changes of, which the host records in the session's metadata by
 * changeset URI, in the client's URI space.
 */
export function readSessionChangesetFolderFailures(meta: SessionMeta | undefined, changeset: string, toClient: AgentHostUriSpaceMapper): readonly ISessionChangesetFolderFailure[] {
	return (readChangesetFolderFailures(meta)[changeset] ?? []).map(failure => ({
		workingDirectory: toClient(URI.parse(failure.folder)),
		message: failure.message,
		...(failure.detail !== undefined ? { detail: failure.detail } : {}),
	}));
}
