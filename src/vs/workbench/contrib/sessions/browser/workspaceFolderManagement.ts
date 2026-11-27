/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchMode, WorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditableWorkspaceContextService } from '../../../services/configuration/common/configuration.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { ensureSessionWorktreesTrusted } from '../../../services/sessions/browser/worktreeTrust.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';
import { IWorkspaceFolderLabelService } from '../../../services/workspaces/common/workspaceFolderLabelService.js';

export class WorkspaceFolderManagementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceFolderManagement';

	constructor(
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		// The window's folders follow the focused session only in the Agents mode, as in the Agents window and in Agentic Mode
		const isActive = () => workspaceContextService.getWorkbenchMode() === WorkbenchMode.Agents;
		const active = observableFromEvent(this, workspaceContextService.onDidChangeWorkbenchMode, isActive);
		this._register(autorun(reader => {
			if (active.read(reader)) {
				reader.store.add(instantiationService.createInstance(SessionWorkspaceFolderMount, isActive));
			}
		}));
	}
}

interface ISessionFolderMountData extends IWorkspaceFolderCreationData {
	/** The repository the folder belongs to: its source repository, or the folder itself. */
	readonly repository: URI;
}

class SessionWorkspaceFolderMount extends Disposable {

	private readonly queue = this._register(new Queue<void>());

	/** The repository of the single mounted folder, which a session in the same repository moves to its own location. */
	private mountedRepository: URI | undefined;
	private movingFolder = false;

	constructor(
		isActive: () => boolean,
		@IFocusedSessionHostService focusedSessionHostService: IFocusedSessionHostService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService & Partial<Pick<IEditableWorkspaceContextService, 'getFolderPrimaryLocation' | 'setFolderPrimaryLocation'>>,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceFolderLabelService private readonly workspaceFolderLabelService: IWorkspaceFolderLabelService,
		@IHistoryService historyService: IHistoryService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceFolderLocationService private readonly workspaceFolderLocationService: IWorkspaceFolderLocationService,
	) {
		super();
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(event => {
			// Leaving Agentic Mode also removes folders; that is not a session switch
			// Moving the folder to another location of its repository, such as a worktree, is no switch to another folder either
			if (event.removed.length > 0 && isActive() && !this.movingFolder) {
				historyService.clearRecentlyOpened();
			}
		}));
		this._register(autorun(reader => {
			const activeChat = focusedSessionHostService.focusedHost.read(reader).chat.read(reader);
			const workspace = activeChat?.workspace.read(reader);
			const token = cancelOnDispose(reader.store);
			this.queue.queue(() => this.updateWorkspaceFolders(workspace, () => !token.isCancellationRequested && isActive())).catch(onUnexpectedError);
		}));
	}

	private async updateWorkspaceFolders(workspace: ISessionWorkspace | undefined, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) {
			return;
		}
		// Auto-trust an isolated worktree VS Code created off a trusted repo, so a
		// worktree session mounts without tripping the untrusted-folder backstop.
		await ensureSessionWorktreesTrusted(workspace, this.workspaceTrustManagementService);
		const sessionFolders = this.getWorkspaceFolderData(workspace);
		// A folder this window can't read, such as the web address of a session's repository, is no folder to mount.
		const readable = await Promise.all(sessionFolders.map(folder => this.fileService.canHandleResource(folder.uri)));
		const activeSessionFolders = sessionFolders.filter((_, index) => readable[index]);

		// Never mount untrusted folders: mounting one would flip the whole Agents
		// Window into Restricted Mode. Sessions opened from the list are already
		// gated on trust (see `ISessionsService.canOpenSession`); this backstop
		// keeps paths that bypass that gate (e.g. startup restore) safe too.
		const mountable = await Promise.all(activeSessionFolders.map(folder => this.isFolderMountable(workspace, folder.uri)));
		if (!isCurrent()) {
			return;
		}

		const currentFolders = this.workspaceContextService.getWorkspace().folders;
		// In Agentic Mode the window keeps its folder while no chat says where to work, such as between closing the last chat
		// and the new session that replaces it, or while a chat's workspace is still loading
		if (!workspace && currentFolders.length > 0 && this.movesFoldersInPlace(currentFolders[0].uri)) {
			return;
		}
		if (activeSessionFolders.length === 0 || mountable.some(isMountable => !isMountable)) {
			this.mountedRepository = undefined;
			if (currentFolders.length > 0) {
				await this.workspaceEditingService.removeFolders(currentFolders.map(folder => folder.uri), { donotNotifyError: true, force: true });
			}
			return;
		}

		const repository = activeSessionFolders.length === 1 ? activeSessionFolders[0].repository : undefined;
		if (currentFolders.length === 0) {
			await this.recordPrimaryLocation(activeSessionFolders);
			if (!isCurrent()) {
				return;
			}
			this.mountedRepository = repository;
			await this.workspaceEditingService.addFolders(activeSessionFolders.map(({ uri, name }) => ({ uri, name })), true);
			return;
		}

		const foldersMatch = currentFolders.length === activeSessionFolders.length
			&& currentFolders.every((folder, index) =>
				this.uriIdentityService.extUri.isEqual(folder.uri, activeSessionFolders[index].uri)
				&& folder.name === activeSessionFolders[index].name);
		if (foldersMatch) {
			return;
		}

		// In Agentic Mode a session in the repository of the mounted folder moves the folder to its own location: the folder
		// keeps its index and name, and the change is reported as a location change. As in a single-folder editor window,
		// each location keeps its own open editors (see FolderLocationWorkingSetsContribution)
		const sharedRepository = repository && currentFolders.length === 1 && this.movesFoldersInPlace(currentFolders[0].uri)
			&& !this.uriIdentityService.extUri.isEqual(currentFolders[0].uri, activeSessionFolders[0].uri)
			? await this.getSharedRepository(currentFolders[0], repository, activeSessionFolders[0].uri)
			: undefined;
		if (sharedRepository) {
			if (!isCurrent()) {
				return;
			}
			this.movingFolder = true;
			try {
				await this.workspaceEditingService.setFolderLocation(activeSessionFolders[0].uri, { folder: currentFolders[0].uri, force: true });
				this.mountedRepository = sharedRepository;
				return;
			} catch (error) {
				onUnexpectedError(error);
			} finally {
				this.movingFolder = false;
			}
		}

		await this.recordPrimaryLocation(activeSessionFolders);
		if (!isCurrent()) {
			return;
		}
		this.mountedRepository = repository;
		await this.workspaceEditingService.updateFolders(0, currentFolders.length, activeSessionFolders.map(({ uri, name }) => ({ uri, name })), { donotNotifyError: true, force: true });
	}

	/**
	 * Before a single folder is mounted where the workspace moves its folders in place (only in Agentic Mode): records the
	 * repository of a linked worktree as the location the folder belongs to, so that the folder is known by the
	 * repository's locations, as when the repository was mounted first and the folder moved to the worktree. Otherwise a
	 * worktree mounted first only knows its own locations, and moving it to its repository would look like replacing it.
	 */
	private async recordPrimaryLocation(folders: readonly ISessionFolderMountData[]): Promise<void> {
		const contextService = this.workspaceContextService;
		if (!contextService.setFolderPrimaryLocation) {
			return;
		}
		if (folders.length !== 1) {
			// Forget what an earlier mount that did not happen may have recorded
			folders.forEach(({ uri }) => contextService.setFolderPrimaryLocation?.(uri, undefined));
			return;
		}
		const folder = folders[0].uri;
		const primary = await this.getWorktreeRepository(folder);
		contextService.setFolderPrimaryLocation?.(folder, primary);
	}

	/**
	 * The repository that the mounted `folder` and a session folder at `location` in `repository` both belong to, if any:
	 * the session's repository is the mounted one; or the session works in a location of the mounted repository, such as
	 * a worktree of it that the session picked directly, whose own root is the worktree; or, the other way round, the
	 * mounted folder is a location of the session's repository, such as a worktree whose session was mounted first; or git
	 * records one of the two as a worktree of the other's repository, as for a worktree made by hand.
	 */
	private async getSharedRepository(folder: IWorkspaceFolder, repository: URI, location: URI): Promise<URI | undefined> {
		const extUri = this.uriIdentityService.extUri;
		const mounted = this.mountedRepository ?? folder.uri;
		if (extUri.isEqual(mounted, repository)) {
			return mounted;
		}
		const isLocationOf = async (primary: URI, candidates: readonly URI[]) => {
			const locations = await this.workspaceFolderLocationService.getLocations(primary, CancellationToken.None);
			return locations.some(known => candidates.some(candidate => extUri.isEqual(known.uri, candidate)));
		};
		if (await isLocationOf(mounted, [location])) {
			return mounted;
		}
		if (await isLocationOf(repository, [folder.uri, mounted])) {
			return repository;
		}
		// A worktree that git knows but no session works in, such as one made by hand
		const [mountedRepository, sessionRepository] = await Promise.all([this.getWorktreeRepository(mounted), this.getWorktreeRepository(location)]);
		const shared = sessionRepository ?? repository;
		return extUri.isEqual(mountedRepository ?? mounted, shared) ? shared : undefined;
	}

	/**
	 * The main repository of `folder` if it is a linked worktree of it, as git records one: the folder's `.git` file names
	 * a folder under the repository's `.git/worktrees`, which names the folder's `.git` back. Runs no git.
	 */
	private async getWorktreeRepository(folder: URI): Promise<URI | undefined> {
		const extUri = this.uriIdentityService.extUri;
		const maxSize = 4096;
		const readPath = async (file: URI, prefix: string) => {
			try {
				// Reading a FIFO or a device would block until a writer appears, stalling every later mount
				const stat = await this.fileService.stat(file);
				if (!stat.isFile || stat.size > maxSize) {
					return undefined;
				}
				const content = (await this.fileService.readFile(file, { limits: { size: maxSize } })).value.toString().trim();
				const path = content.startsWith(prefix) ? content.substring(prefix.length).trim() : undefined;
				if (!path || path.includes('\n')) {
					return undefined;
				}
				// A UNC path keeps the folder's authority here, so it never matches and the folder is replaced. A relative path
				// is joined rather than resolved, which would make it absolute against the current directory's drive on Windows
				return /^([a-zA-Z]:)?[\\/]/.test(path) ? extUri.normalizePath(file.with({ path: URI.file(path).path })) : extUri.joinPath(extUri.dirname(file), path);
			} catch {
				return undefined;
			}
		};
		const dotGit = extUri.joinPath(folder, '.git');
		const gitDir = await readPath(dotGit, 'gitdir:');
		const commonDir = gitDir && extUri.dirname(extUri.dirname(gitDir));
		if (!gitDir || !commonDir || extUri.basename(extUri.dirname(gitDir)) !== 'worktrees' || extUri.basename(commonDir) !== '.git') {
			return undefined;
		}
		const back = await readPath(extUri.joinPath(gitDir, 'gitdir'), '');
		return back && extUri.isEqual(back, dotGit) ? extUri.dirname(commonDir) : undefined;
	}

	/**
	 * Whether the workspace moves the mounted folder in place, remembering where it was mounted. Only Agentic Mode does;
	 * the Agents window replaces the folder.
	 */
	private movesFoldersInPlace(folder: URI): boolean {
		return !!this.workspaceContextService.getFolderPrimaryLocation?.(folder);
	}

	private getWorkspaceFolderData(workspace: ISessionWorkspace | undefined): ISessionFolderMountData[] {
		if (!workspace) {
			return [];
		}

		return workspace.folders.map((folder, index) => {
			const name = index === 0 ? workspace.label : folder.name;
			return {
				uri: folder.workingDirectory,
				repository: folder.gitRepository?.uri ?? folder.root,
				name: this.workspaceFolderLabelService.getWorkspaceFolderLabel(
					new WorkspaceFolder({ uri: folder.workingDirectory, name, index })
				) ?? name
			};
		});
	}

	/**
	 * Whether `uri` may be mounted as the workspace folder. A session that
	 * requires workspace trust may only mount a trusted folder; anything else is
	 * left unmounted so the window never enters Restricted Mode behind the user's
	 * back. Sessions that don't require trust (e.g. virtual/cloud) always mount.
	 */
	private async isFolderMountable(workspace: ISessionWorkspace | undefined, uri: URI): Promise<boolean> {
		if (!workspace?.requiresWorkspaceTrust) {
			return true;
		}
		return (await this.workspaceTrustManagementService.getUriTrustInfo(uri)).trusted;
	}
}
