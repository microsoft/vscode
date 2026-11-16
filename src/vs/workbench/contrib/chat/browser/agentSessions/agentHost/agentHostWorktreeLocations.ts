/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { basename, extUriBiasedIgnorePathCase, normalizePath, removeTrailingPathSeparator } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../../platform/workspace/common/folderLocations.js';
import { IChatSessionsService, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { IAgentSession } from '../agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessionsService.js';

/** The id of the provider of the worktrees that the local agent host's sessions work in. */
export const AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID = 'agentHost.sessionWorktrees';

/**
 * The worktrees of the local folder `folder` that the local agent host's `sessions` work in, without duplicates: the working
 * directories of the sessions whose project, as the agent host resolves it with git (the primary worktree's root), is
 * `folder`, other than `folder` itself and the folders inside it. Archived sessions, those of other providers and those
 * without a project are left out. Each is described by the branch the session reports, as far as it does.
 *
 * `folder` is any of the forms of the one folder, such as the path the window opened and its real path: git, and so the
 * project, names a folder by its real path, such as `/private/tmp/x` of `/tmp/x` on macOS.
 */
export function getAgentHostSessionWorktrees(sessions: readonly IAgentSession[], folder: URI | readonly URI[]): IFolderLocation[] {
	const forms = (URI.isUri(folder) ? [folder] : folder).filter(form => form.scheme === Schemas.file).map(form => removeTrailingPathSeparator(normalizePath(form)));
	if (!forms.length) {
		return [];
	}
	const result: IFolderLocation[] = [];
	for (const session of sessions) {
		const workingDirectory = toFolder(session.metadata?.workingDirectoryPath);
		const project = toFolder(session.metadata?.projectPath);
		if (!isLocalAgentHostTarget(session.providerType) || session.isArchived() || !workingDirectory || !project
			|| !forms.some(form => extUriBiasedIgnorePathCase.isEqual(project, form))
			// The folder itself, or a folder inside it, is no location of it
			|| forms.some(form => extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, form))
			|| result.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, workingDirectory))) {
			continue;
		}
		const branch = session.metadata?.branchName;
		result.push({ uri: workingDirectory, label: basename(workingDirectory), description: typeof branch === 'string' && branch ? branch : undefined, icon: Codicon.gitBranchCheckout });
	}
	return result;
}

function toFolder(path: unknown): URI | undefined {
	return typeof path === 'string' && path ? removeTrailingPathSeparator(normalizePath(URI.file(path))) : undefined;
}

/**
 * The alternate locations of a local folder that its agent host sessions know: the worktrees that sessions work in whose
 * agent host project is the folder ({@link getAgentHostSessionWorktrees}). It reads no git data: the agent host decides with
 * git what a session's project is, so a location inherits the folder's trust on its word. It reads only the folder's real
 * path, once for each folder, as git names the project by it. There is no discovery of the repository's worktrees.
 */
export class AgentHostWorktreeLocationProvider extends Disposable implements IWorkspaceFolderLocationProvider {

	readonly id = AGENT_HOST_WORKTREE_LOCATIONS_PROVIDER_ID;

	/** The local agent host providers whose sessions the sessions list has resolved. */
	private readonly _resolvedProviders = new Set<string>();

	/** The forms of each folder asked about: as given, and its real path, read once. */
	private readonly _forms = new ResourceMap<Promise<readonly URI[]>>(uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));
	/** The forms of the folders whose real path is read. */
	private readonly _knownForms = new ResourceMap<readonly URI[]>(uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));

	private readonly _onDidChangeLocations = this._register(new Emitter<void>());
	/** Fires as the real path of a folder asked about is known to differ, which can make more of its worktrees known. */
	readonly onDidChangeLocations = this._onDidChangeLocations.event;

	constructor(
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(_agentSessionsService.model.onDidResolve(provider => {
			if (isLocalAgentHostTarget(provider)) {
				this._resolvedProviders.add(provider);
			}
		}));
	}

	/**
	 * The worktrees of `primary` among the sessions the sessions list has now: cheap, as it is asked at every start. It does
	 * not wait for the folder's real path the first time: those of a project named by it follow with {@link onDidChangeLocations}.
	 */
	async provideLocations(primary: URI, _token: CancellationToken): Promise<IFolderLocation[]> {
		return getAgentHostSessionWorktrees(this._agentSessionsService.model.sessions, this.getFolderForms(primary));
	}

	/**
	 * The forms of `folder` known now: itself, and its real path where it differs, once read. The first ask starts reading it,
	 * and {@link onDidChangeLocations} fires once it is known to differ, such as for a folder reached through a symbolic link.
	 */
	getFolderForms(folder: URI): readonly URI[] {
		const forms = this._knownForms.get(folder);
		if (!forms) {
			void this._formsOf(folder);
		}
		return forms ?? [folder];
	}

	/**
	 * `location` as a worktree of `primary`, once the local agent host's sessions are known: also before the sessions list
	 * first resolves them, such as to restore the location that the window's folder was at.
	 */
	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IFolderLocation | undefined> {
		const forms = await this._formsOf(primary);
		const find = () => getAgentHostSessionWorktrees(this._agentSessionsService.model.sessions, forms).find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, removeTrailingPathSeparator(normalizePath(location))));
		const found = find();
		if (found) {
			return found;
		}
		const model = this._agentSessionsService.model;
		const unresolved = this._chatSessionsService.getRegisteredChatSessionItemProviders().filter(provider => isLocalAgentHostTarget(provider) && !this._resolvedProviders.has(provider));
		if (unresolved.length) {
			await raceCancellation(model.resolve(unresolved, undefined, 'automatic'), token);
		} else if (!this._resolvedProviders.size) {
			// Before the local agent host registers its sessions: once it lists them
			const listed = Event.toPromise(Event.filter(model.onDidResolve, isLocalAgentHostTarget));
			try {
				await raceCancellation(listed, token);
			} finally {
				listed.cancel();
			}
		} else {
			return undefined;
		}
		return token.isCancellationRequested ? undefined : find();
	}

	/** `folder`, and its real path where it differs, such as of a folder reached through a symbolic link: read once for each folder. */
	private _formsOf(folder: URI): Promise<readonly URI[]> {
		let forms = this._forms.get(folder);
		if (!forms) {
			forms = folder.scheme !== Schemas.file ? Promise.resolve([folder]) : this._fileService.realpath(folder).then(
				real => {
					const known = real && !extUriBiasedIgnorePathCase.isEqual(real, folder) ? [folder, real] : [folder];
					this._knownForms.set(folder, known);
					if (known.length > 1) {
						this._onDidChangeLocations.fire();
					}
					return known;
				},
				() => {
					// Read again next time, such as once the folder is there
					this._forms.delete(folder);
					return [folder];
				});
			this._forms.set(folder, forms);
		}
		return forms;
	}
}
