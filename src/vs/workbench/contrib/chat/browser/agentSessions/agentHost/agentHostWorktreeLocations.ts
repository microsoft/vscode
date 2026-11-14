/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase, joinPath } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { readFolderGitCheckout } from '../../../../../services/workspaces/common/gitFolderCheckout.js';
import { isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { IAgentSession } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';

/** The id of the provider of the worktrees that the local agent host's sessions work in. */
export const AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID = 'agentHost.sessionWorktrees';

/**
 * The working directories of the local agent host's sessions in `sessions`, without duplicates: the folders their agents
 * work in, such as a worktree a session created. Archived sessions and those of other providers, such as local chats,
 * which belong to the window's primary folder, are left out.
 */
export function getAgentHostSessionWorkingDirectories(sessions: readonly IAgentSession[]): URI[] {
	const result: URI[] = [];
	for (const session of sessions) {
		const path = session.metadata?.workingDirectoryPath;
		if (!isLocalAgentHostTarget(session.providerType) || session.isArchived() || typeof path !== 'string' || !path) {
			continue;
		}
		const directory = URI.file(path);
		if (!result.some(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, directory))) {
			result.push(directory);
		}
	}
	return result;
}

/**
 * The alternate locations of a local folder that its agent host sessions know: the worktrees of the folder's git
 * repository that sessions work in. There is no discovery of the repository's worktrees; a session's working directory is
 * one only when it is a linked checkout of that repository, as the editor window decides that a folder belongs to a
 * window's repository (see `WorkspaceFolderRepositories`), and when that repository's entry for it names its `.git` back.
 * That keeps a folder that only points into the repository from inheriting the primary's trust.
 */
export class AgentHostWorktreeLocationProvider implements IWorkspaceFolderLocationProvider {

	readonly id = AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;

	constructor(
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]> {
		const repository = await this._readRepository(primary);
		if (!repository || token.isCancellationRequested) {
			return [];
		}
		const candidates = getAgentHostSessionWorkingDirectories(this._agentSessionsService.model.sessions)
			.filter(directory => !extUriBiasedIgnorePathCase.isEqual(directory, primary));
		const locations = await Promise.all(candidates.map(candidate => this._resolve(repository, candidate)));
		return token.isCancellationRequested ? [] : locations.filter(isDefined);
	}

	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined> {
		// Any linked checkout of the repository resolves, also before the sessions load, such as to restore the location
		// that the window's folder was at
		if (extUriBiasedIgnorePathCase.isEqual(location, primary)) {
			return undefined;
		}
		const repository = await this._readRepository(primary);
		if (!repository || token.isCancellationRequested) {
			return undefined;
		}
		return this._resolve(repository, location);
	}

	/** The git repository of the local folder `folder` is a checkout of, if any. */
	private async _readRepository(folder: URI): Promise<URI | undefined> {
		if (folder.scheme !== Schemas.file) {
			return undefined;
		}
		try {
			return (await readFolderGitCheckout(this._fileService, folder))?.repository;
		} catch (error) {
			this._logService.warn(`[AgentHostWorktreeLocations] Could not read the git repository of ${folder.toString()}`, error);
			return undefined;
		}
	}

	/** `candidate` as a location of `repository`'s folder, when it is a linked checkout of that repository. */
	private async _resolve(repository: URI, candidate: URI): Promise<IFolderLocation | undefined> {
		if (candidate.scheme !== Schemas.file) {
			return undefined;
		}
		try {
			const checkout = await readFolderGitCheckout(this._fileService, candidate);
			if (!checkout?.worktreeGitDir || !extUriBiasedIgnorePathCase.isEqual(checkout.repository, repository) || !await this._namesBack(checkout.worktreeGitDir, candidate)) {
				return undefined;
			}
		} catch (error) {
			this._logService.warn(`[AgentHostWorktreeLocations] Could not read the git checkout of ${candidate.toString()}`, error);
			return undefined;
		}
		return { uri: candidate, label: basename(candidate), icon: Codicon.gitBranchCheckout };
	}

	/** Whether the repository's entry for a worktree, `worktreeGitDir`, names the `.git` of `folder` back. */
	private async _namesBack(worktreeGitDir: URI, folder: URI): Promise<boolean> {
		let content: string;
		try {
			content = (await this._fileService.readFile(joinPath(worktreeGitDir, 'gitdir'))).value.toString().trim();
		} catch (error) {
			if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
		return !!content && extUriBiasedIgnorePathCase.isEqual(isAbsolute(content) ? URI.file(content) : joinPath(worktreeGitDir, content), joinPath(folder, '.git'));
	}
}
