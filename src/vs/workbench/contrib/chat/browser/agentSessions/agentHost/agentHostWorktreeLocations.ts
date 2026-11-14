/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isAbsolute } from '../../../../../../base/common/path.js';
import { basename, dirname, extUriBiasedIgnorePathCase, joinPath, normalizePath } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { readFolderGitCheckout } from '../../../../../services/workspaces/common/gitFolderCheckout.js';
import { IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
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
export class AgentHostWorktreeLocationProvider extends Disposable implements IWorkspaceFolderLocationProvider {

	readonly id = AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;

	/** The local agent host providers whose sessions the sessions list has resolved. */
	private readonly _resolvedProviders = new Set<string>();

	constructor(
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_agentSessionsService.model.onDidResolve(provider => {
			if (isLocalAgentHostTarget(provider)) {
				this._resolvedProviders.add(provider);
			}
		}));
	}

	async provideLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]> {
		const worktreesDir = await this._worktreesDir(primary);
		if (!worktreesDir || token.isCancellationRequested) {
			return [];
		}
		// Before the sessions list first resolves a local agent host provider, it has only the sessions it cached of it:
		// wait for that provider, also while others have resolved, and leave the others alone
		const model = this._agentSessionsService.model;
		const unresolved = this._chatSessionsService.getRegisteredChatSessionItemProviders().filter(provider => isLocalAgentHostTarget(provider) && !this._resolvedProviders.has(provider));
		if (unresolved.length) {
			await raceCancellation(model.resolve(unresolved, undefined, 'automatic'), token);
			if (token.isCancellationRequested) {
				return [];
			}
		}
		const candidates = getAgentHostSessionWorkingDirectories(model.sessions)
			.filter(directory => !extUriBiasedIgnorePathCase.isEqual(directory, primary));
		const locations = await Promise.all(candidates.map(async candidate => {
			try {
				return await this._resolve(worktreesDir, primary, candidate);
			} catch (error) {
				// One working directory that fails to read, such as a pruned worktree, does not hide the others
				this._logService.warn(`[AgentHostWorktreeLocations] Could not read the git checkout of ${candidate.toString()}`, error);
				return undefined;
			}
		}));
		return token.isCancellationRequested ? [] : locations.filter(isDefined);
	}

	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined> {
		// Any linked checkout of the repository resolves, also before the sessions load, such as to restore the location
		// that the window's folder was at
		const worktreesDir = await this._worktreesDir(primary);
		return worktreesDir && !token.isCancellationRequested ? this._resolve(worktreesDir, primary, location) : undefined;
	}

	/** Where the worktrees of the repository of the local folder `primary` are kept: `.git/worktrees` of its real path. */
	private async _worktreesDir(primary: URI): Promise<URI | undefined> {
		if (primary.scheme !== Schemas.file) {
			return undefined;
		}
		try {
			const checkout = await readFolderGitCheckout(this._fileService, await this._real(primary));
			// Its real path also where `.git` or `.git/worktrees` is a symbolic link
			return checkout && await this._real(joinPath(await this._real(checkout.repository), '.git', 'worktrees'));
		} catch (error) {
			this._logService.warn(`[AgentHostWorktreeLocations] Could not read the git repository of ${primary.toString()}`, error);
			return undefined;
		}
	}

	/**
	 * `location` as a location of the folder at `primary`, when git links it both ways with an entry of `worktreesDir`: its
	 * `.git` file names the entry, and the entry's `gitdir` file names its `.git` back, by their real paths, such as of a
	 * folder reached through a symbolic link.
	 */
	private async _resolve(worktreesDir: URI, primary: URI, location: URI): Promise<IFolderLocation | undefined> {
		if (location.scheme !== Schemas.file) {
			return undefined;
		}
		const realLocation = await this._real(location);
		if (extUriBiasedIgnorePathCase.isEqual(await this._real(primary), realLocation)) {
			return undefined;
		}
		const locationGitFile = joinPath(realLocation, '.git');
		const entry = await this._readLink(locationGitFile, realLocation, /^gitdir:\s*(?<path>.+?)\s*$/m);
		if (!entry || !extUriBiasedIgnorePathCase.isEqual(dirname(await this._real(entry)), worktreesDir)) {
			return undefined;
		}
		const backlink = await this._readLink(joinPath(entry, 'gitdir'), entry);
		// The `.git` file by its real path, also where it is a symbolic link
		if (!backlink || !extUriBiasedIgnorePathCase.isEqual(await this._real(backlink), await this._real(locationGitFile))) {
			return undefined;
		}
		// Its branch, from the entry's HEAD: read again each time the location is resolved
		const head = await this._readOrUndefined(async () => (await this._fileService.readFile(joinPath(entry, 'HEAD'))).value.toString());
		return { uri: location, label: basename(location), description: head !== undefined ? parseGitHead(head) : undefined, icon: Codicon.gitBranchCheckout };
	}

	/** The path a link file names, absolute and normalized: its content, or the `pattern`'s `path` group of it, relative to `base`. */
	private async _readLink(file: URI, base: URI, pattern?: RegExp): Promise<URI | undefined> {
		const content = await this._readOrUndefined(async () => (await this._fileService.readFile(file)).value.toString());
		const path = content && (pattern ? pattern.exec(content)?.groups?.path : content.trim());
		if (!path) {
			return undefined;
		}
		return normalizePath(isAbsolute(path) ? URI.file(path) : joinPath(base, path));
	}

	/** `resource` with its symbolic links resolved, or itself where it is not there. */
	private async _real(resource: URI): Promise<URI> {
		return normalizePath(await this._readOrUndefined(() => this._fileService.realpath(resource)) ?? resource);
	}

	/** The result of `read`, or `undefined` where what it reads is not there or is a folder, such as an ordinary checkout's `.git`; any other failure throws. */
	private async _readOrUndefined<T>(read: () => Promise<T>): Promise<T | undefined> {
		try {
			return await read();
		} catch (error) {
			const result = error instanceof Error ? toFileOperationResult(error) : undefined;
			if (result === FileOperationResult.FILE_NOT_FOUND || result === FileOperationResult.FILE_IS_DIRECTORY) {
				return undefined;
			}
			throw error;
		}
	}
}

/** The branch a git HEAD names (`ref: refs/heads/<branch>`), the short commit of a detached one, or `undefined`. */
export function parseGitHead(head: string): string | undefined {
	const content = head.trim();
	const branch = /^ref:\s*refs\/heads\/(?<branch>.+)$/.exec(content)?.groups?.branch;
	if (branch) {
		return branch;
	}
	return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(content) ? content.slice(0, 7) : undefined;
}
