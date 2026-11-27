/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { isValidBasename } from '../../../../base/common/extpath.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { dirname, IExtUri, joinPath } from '../../../../base/common/resources.js';
import { isWindows } from '../../../../base/common/platform.js';
import { isObject } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileOperationError, FileOperationResult, FileSystemProviderCapabilities, FileSystemProviderErrorCode, IFileContent, IFileService, toFileSystemProviderErrorCode } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { hasWorkspaceFileExtension, WORKSPACE_SUFFIX } from '../../../../platform/workspace/common/workspace.js';
import { isRecentWorkspace, IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../common/sessionConfig.js';
import { hasAmbiguousFolderPaths, ISessionWorkspaceFileContent, ISessionWorkspaceFileEdit, parseSessionWorkspaceFile, stringifySessionWorkspaceFile } from '../common/sessionWorkspaceFile.js';
import { IRecentSessionWorkspace, ISessionWorkspaceAppearance, ISessionWorkspaceRemoveOptions, ISessionWorkspacesService, ISessionWorkspaceUpdate, SessionWorkspaceError } from '../common/sessionWorkspaces.js';
import { ISessionsRecentWorkspacesService } from './sessionsRecentWorkspacesService.js';

const STORAGE_KEY_WORKSPACES = 'sessions.workspaces';
const STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES = 'sessions.forgottenRecentWorkspaceFiles';
const MAX_MANAGED_WORKSPACES = 50;
const MAX_RECENT_WORKSPACE_FILES = 20;
const MAX_WORKSPACE_FILE_SIZE = 1024 * 1024;
const MAX_CONCURRENT_READS = 4;
const OWNED_WORKSPACES_FOLDER = 'AgentsWorkspaces';

interface IStoredWorkspace {
	readonly uri: UriComponents;
	readonly name: string;
	readonly folders: readonly UriComponents[];
	readonly owned: boolean;
	/** The icon and color shown, as last read from or written to the workspace file. */
	readonly icon?: string;
	readonly color?: string;
	/** The icon and color kept on this computer: for a standalone folder, or when they could not be written to the file. */
	readonly local?: ISessionWorkspaceAppearance;
	readonly previousUris?: readonly UriComponents[];
}

/** A file name for an owned workspace file, so that VS Code names its window after the workspace. */
export function toWorkspaceFileName(name: string, isWindowsOS: boolean = isWindows): string {
	const sanitized = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim();
	const fileName = `${sanitized}${WORKSPACE_SUFFIX}`;
	// Names that the file system reserves, such as `CON` on Windows
	return sanitized && isValidBasename(fileName, isWindowsOS) ? fileName : `workspace${WORKSPACE_SUFFIX}`;
}

function withAppearance(workspace: IRecentSessionWorkspace, appearance: ISessionWorkspaceAppearance | undefined): IRecentSessionWorkspace {
	const { icon: _icon, color: _color, ...rest } = workspace;
	return {
		...rest,
		...(appearance?.icon ? { icon: appearance.icon } : {}),
		...(appearance?.color ? { color: appearance.color } : {}),
	};
}

/** The icon and color to write into a workspace file: only those the update sets, so an omitted one is left as it is in the file. */
function toFileAppearanceEdit(update: ISessionWorkspaceUpdate): Pick<ISessionWorkspaceFileEdit, 'icon' | 'color'> {
	return { icon: update.icon, color: update.color };
}

/** The icon and color still kept on this computer after an update was written to the file: those the update omitted. */
function remainingLocalAppearance(update: ISessionWorkspaceUpdate, local: ISessionWorkspaceAppearance | undefined): ISessionWorkspaceAppearance | undefined {
	return local && {
		icon: update.icon === undefined ? local.icon : undefined,
		color: update.color === undefined ? local.color : undefined,
	};
}

/** What is shown: the workspace file's icon and color, falling back to those kept on this computer. */
function displayAppearance(file: ISessionWorkspaceAppearance, local: ISessionWorkspaceAppearance | undefined): ISessionWorkspaceAppearance {
	return { icon: file.icon ?? local?.icon, color: file.color ?? local?.color };
}

function isSameWorkspace(a: IRecentSessionWorkspace, b: IRecentSessionWorkspace, extUri: IExtUri): boolean {
	return a.name === b.name && a.icon === b.icon && a.color === b.color && !!a.missing === !!b.missing
		&& a.folders.length === b.folders.length && a.folders.every((folder, index) => extUri.isEqual(folder, b.folders[index]));
}

function readAppearance(value: unknown): ISessionWorkspaceAppearance | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { icon, color } = value as { icon?: unknown; color?: unknown };
	return { icon: typeof icon === 'string' ? icon : undefined, color: typeof color === 'string' ? color : undefined };
}

/** A workspace file has folder paths that may be paths on a remote, while VS Code's recently opened list, which tells, cannot be read. */
function foldersUnknownError(fileName: string): SessionWorkspaceError {
	return new SessionWorkspaceError(localize('workspaceFileFoldersUnknown', "The folders of the workspace file '{0}' were not read or changed, since it is unknown whether they are on this computer or on a remote.", fileName), 'foldersUnknown');
}

function isFoldersUnknownError(error: unknown): boolean {
	return error instanceof SessionWorkspaceError && error.code === 'foldersUnknown';
}

export class SessionWorkspacesService extends Disposable implements ISessionWorkspacesService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;

	private readonly _managedWorkspaces = observableValue<readonly IRecentSessionWorkspace[]>(this, []);
	readonly managedWorkspaces: IObservable<readonly IRecentSessionWorkspace[]> = this._managedWorkspaces;

	/** The comparison keys of the recent workspace files that the user removed. */
	private readonly _forgottenWorkspaceFiles = observableValue<ReadonlySet<string>>(this, new Set());

	readonly recentWorkspaceFiles: IObservable<readonly IRecentSessionWorkspace[]> = derived(this, reader => {
		if (!this.enabled.read(reader)) {
			return [];
		}
		const extUri = this.uriIdentityService.extUri;
		const managed = this._managedWorkspaces.read(reader);
		const forgotten = this._forgottenWorkspaceFiles.read(reader);
		return this.recentWorkspacesService.vsCodeRecentWorkspaceFiles.read(reader)
			.filter(file =>
				// A workspace file of one folder is listed as that folder already
				file.folders.length > 1
				// VS Code's untitled workspaces are its own scratch files
				&& !extUri.isEqualOrParent(file.uri, this.untitledWorkspacesHome)
				&& !forgotten.has(extUri.getComparisonKey(file.uri))
				&& !managed.some(workspace => extUri.isEqual(workspace.uri, file.uri) || workspace.previousUris?.some(previous => extUri.isEqual(previous, file.uri)))
				// The folders of a remote VS Code window, which no session can work in here
				&& file.folders.every(folder => this.fileService.hasProvider(folder)))
			.slice(0, MAX_RECENT_WORKSPACE_FILES)
			.map(file => withAppearance({ uri: file.uri, name: file.name, folders: [...file.folders], owned: false }, file));
	});

	readonly workspaces: IObservable<readonly IRecentSessionWorkspace[]> = derived(this, reader => [...this._managedWorkspaces.read(reader), ...this.recentWorkspaceFiles.read(reader)]);

	private readonly ownedWorkspacesHome: URI;
	private readonly untitledWorkspacesHome: URI;

	/** The icon and color kept on this computer, by comparison key; the workspace file's own icon and color win over them. */
	private _localAppearance = new Map<string, ISessionWorkspaceAppearance>();
	private readonly _fileWatchers = this._register(new DisposableMap<string>());
	/** The comparison keys of the workspace files that changed on disk since they were last read. */
	private readonly _changedFiles = new Set<string>();
	/** Refreshes run one after another, so that an older read never wins over a newer one. */
	private readonly _refreshes = new Sequencer();
	/**
	 * Creates and updates run one after another, since each one decides from the workspaces that the one before it left,
	 * for example that a standalone folder still needs a workspace file. Removing is not queued behind them: an update in
	 * progress keeps a workspace that is removed meanwhile removed (see {@link _removals}), and an update still waiting
	 * for a workspace that is removed meanwhile is dropped.
	 */
	private readonly _mutations = new Sequencer();
	private _queuedMutations = 0;
	/**
	 * The URIs that workspaces had before a queued create or update moved them, for example a standalone folder that got a
	 * workspace file, by their comparison keys, so that an update queued meanwhile with the URI it had follows it.
	 * Cleared when no create or update is queued.
	 */
	private readonly _movedUris = new Map<string, URI>();
	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => {
		const changed = new Set(this._changedFiles);
		this._changedFiles.clear();
		void this._refreshes.queue(() => this._refresh(changed));
	}, 300));
	/** When each workspace was last removed, by the comparison keys of its URIs, so that an update finishing after its workspace was removed does not add it again. */
	private readonly _removedAt = new Map<string, number>();
	private _removals = 0;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
	) {
		super();

		this.untitledWorkspacesHome = environmentService.untitledWorkspacesHome;
		this.ownedWorkspacesHome = joinPath(dirname(environmentService.untitledWorkspacesHome), OWNED_WORKSPACES_FOLDER);
		this.enabled = observableConfigValue(SESSIONS_WORKSPACES_ENABLED_SETTING, false, configurationService);

		this._managedWorkspaces.set(this._readStorage(), undefined);
		// Other windows of the profile share the catalogue
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_WORKSPACES, this._store)(e => {
			if (e.external) {
				this._managedWorkspaces.set(this._readStorage(), undefined);
			}
		}));
		this._forgottenWorkspaceFiles.set(this._readForgottenWorkspaceFiles(), undefined);
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES, this._store)(e => {
			if (e.external) {
				this._forgottenWorkspaceFiles.set(this._readForgottenWorkspaceFiles(), undefined);
			}
		}));

		// Workspace files are read and watched only while workspaces are enabled
		this._register(autorun(reader => {
			if (this.enabled.read(reader)) {
				void this.refresh();
			}
		}));
		this._register(autorun(reader => this._watchWorkspaceFiles(this.enabled.read(reader) ? this._managedWorkspaces.read(reader) : [])));
	}

	getWorkspace(uri: URI): IRecentSessionWorkspace | undefined {
		return this._getManagedWorkspace(uri) ?? this.recentWorkspaceFiles.get().find(file => this.uriIdentityService.extUri.isEqual(file.uri, uri));
	}

	async resolveWorkspaceFile(workspaceFile: URI): Promise<IRecentSessionWorkspace> {
		const managed = this._getManagedWorkspace(workspaceFile);
		let parsed: ISessionWorkspaceFileContent;
		try {
			parsed = await this._readWorkspaceFile(workspaceFile, await this._getRemoteAuthorities());
		} catch (error) {
			// What is known about a managed workspace file stays, rather than folders that may be on another computer
			if (isFoldersUnknownError(error) && managed && this.uriIdentityService.extUri.isEqual(managed.uri, workspaceFile)) {
				return managed;
			}
			throw error;
		}
		const local = this._localAppearance.get(this.uriIdentityService.extUri.getComparisonKey(workspaceFile));
		return withAppearance({
			uri: workspaceFile,
			name: parsed.name,
			folders: parsed.folders,
			owned: managed?.owned ?? this._isOwnedWorkspaceFile(workspaceFile),
			...(managed?.previousUris ? { previousUris: managed.previousUris } : {}),
		}, displayAppearance(parsed, local));
	}

	createWorkspace(name: string, folders: readonly URI[], appearance?: ISessionWorkspaceAppearance): Promise<IRecentSessionWorkspace> {
		return this._queueMutation(() => this._createWorkspace(name, folders, appearance));
	}

	private _queueMutation<T>(mutation: () => Promise<T>): Promise<T> {
		this._queuedMutations++;
		return this._mutations.queue(async () => {
			try {
				return await mutation();
			} finally {
				if (--this._queuedMutations === 0) {
					this._movedUris.clear();
				}
			}
		});
	}

	/** The URI that a workspace has now, which a create or update queued before may have moved from `uri`. */
	private _currentUri(uri: URI): URI {
		const extUri = this.uriIdentityService.extUri;
		if (this._managedWorkspaces.get().some(workspace => extUri.isEqual(workspace.uri, uri))) {
			return uri;
		}
		return this._movedUris.get(extUri.getComparisonKey(uri)) ?? uri;
	}

	private async _createWorkspace(name: string, folders: readonly URI[], appearance: ISessionWorkspaceAppearance | undefined): Promise<IRecentSessionWorkspace> {
		const workspace = await this._create(name, folders, appearance);
		this._upsert(workspace);
		return workspace;
	}

	/** Creates a standalone folder for one folder, and an owned workspace file, with its icon and color, for several. */
	private async _create(name: string, folders: readonly URI[], appearance: ISessionWorkspaceAppearance | undefined): Promise<IRecentSessionWorkspace> {
		if (!folders.length) {
			throw new Error(localize('workspaceWithoutFolders', "A workspace needs at least one folder."));
		}
		if (folders.length === 1) {
			this._setLocalAppearance(folders[0], appearance);
			return withAppearance({ uri: folders[0], name, folders: [folders[0]], owned: true }, appearance);
		}
		const uri = joinPath(this.ownedWorkspacesHome, generateUuid(), toWorkspaceFileName(name));
		const content = stringifySessionWorkspaceFile(uri, { name, folders, icon: appearance?.icon ?? null, color: appearance?.color ?? null }, this.uriIdentityService.extUri, { forceAbsolute: true });
		await this.fileService.writeFile(uri, VSBuffer.fromString(content));
		this._setLocalAppearance(uri, undefined);
		return withAppearance({ uri, name, folders: [...folders], owned: true }, appearance);
	}

	updateWorkspace(uri: URI, update: ISessionWorkspaceUpdate): Promise<IRecentSessionWorkspace> {
		const removals = this._removals;
		return this._queueMutation(async () => {
			const current = this._currentUri(uri);
			// A workspace removed while its update waited stays removed, and its file is not written again
			if (this._removedSince([uri, current], removals)) {
				throw new CancellationError();
			}
			return this._updateWorkspace(current, update, removals);
		});
	}

	/**
	 * @param removals The count of removals when the update was asked for, so that a workspace removed since is not
	 * added again.
	 */
	private async _updateWorkspace(uri: URI, update: ISessionWorkspaceUpdate, removals: number): Promise<IRecentSessionWorkspace> {
		const extUri = this.uriIdentityService.extUri;
		const existing = this._getManagedWorkspace(uri);
		// What is shown for a standalone folder, which keeps its icon and color on this computer, or a new workspace file
		const appearance: ISessionWorkspaceAppearance = {
			icon: update.icon === undefined ? existing?.icon : update.icon ?? undefined,
			color: update.color === undefined ? existing?.color : update.color ?? undefined,
		};

		// Only the icon or color changed: a standalone folder keeps them on this computer, a workspace file stores them
		if (existing && update.name === undefined && update.folders === undefined) {
			let workspace: IRecentSessionWorkspace;
			if (this._isFolderWorkspace(existing)) {
				this._setLocalAppearance(existing.uri, appearance);
				workspace = withAppearance(existing, appearance);
			} else {
				workspace = await this._writeFileAppearance(existing, update);
			}
			this._replace(existing.uri, workspace, removals);
			return workspace;
		}

		// A standalone folder gets an owned workspace file once it has several folders
		if (existing && this._isFolderWorkspace(existing)) {
			const workspace = this._withHistory(existing, await this._create(update.name ?? existing.name, update.folders ?? existing.folders, appearance));
			this._replace(existing.uri, workspace, removals);
			return workspace;
		}

		// An owned workspace file reduced to one folder becomes that standalone folder, unless it has folder entries that are
		// not shown, which deleting it would lose; it then keeps them next to the one folder
		if (existing?.owned && this._isOwnedWorkspaceFile(existing.uri) && update.folders?.length === 1 && !await this._hasHiddenFolders(existing.uri)) {
			const workspace = this._withHistory(existing, await this._create(update.name ?? existing.name, update.folders, appearance));
			this._replace(existing.uri, workspace, removals);
			await this._deleteOwnedWorkspaceFile(existing.uri);
			return workspace;
		}

		if (update.folders && !update.folders.length) {
			throw new Error(localize('workspaceWithoutFolders', "A workspace needs at least one folder."));
		}

		// The workspace file, also when `uri` is one that it had before
		const fileUri = existing?.uri ?? uri;
		const local = this._localAppearance.get(extUri.getComparisonKey(fileUri));
		const { parsed, remoteFromRecents } = await this._editWorkspaceFile(fileUri, current => current
			? { name: update.name, folders: update.folders, ...toFileAppearanceEdit(update) }
			// A missing file is written again from what is known about the workspace
			: { name: update.name ?? existing?.name, folders: update.folders ?? existing?.folders, icon: update.icon === undefined ? existing?.icon : update.icon, color: update.color === undefined ? existing?.color : update.color },
			{ forceAbsolute: existing?.owned, knownFolders: existing?.folders });
		const remainingLocal = remainingLocalAppearance(update, local);
		this._setLocalAppearance(fileUri, undefined);

		// An owned workspace file is named after the workspace, which VS Code names its window after; a user's file keeps its name.
		// So does one that only VS Code's recently opened list tells is on a remote, which knows it by this name only.
		let newUri = fileUri;
		if (existing?.owned && this._isOwnedWorkspaceFile(fileUri) && update.name !== undefined && !remoteFromRecents) {
			const renamed = joinPath(dirname(fileUri), toWorkspaceFileName(parsed.name));
			if (!extUri.isEqual(renamed, fileUri)) {
				await this.fileService.move(fileUri, renamed);
				newUri = renamed;
			}
		}
		this._setLocalAppearance(newUri, remainingLocal);
		const workspace = withAppearance({ uri: newUri, name: parsed.name, folders: parsed.folders, owned: existing?.owned ?? this._isOwnedWorkspaceFile(newUri) }, displayAppearance(parsed, remainingLocal));
		const result = existing ? this._withHistory(existing, workspace) : workspace;
		this._replace(fileUri, result, removals);
		return result;
	}

	async removeWorkspace(uri: URI, options?: ISessionWorkspaceRemoveOptions): Promise<void> {
		const workspace = this._getManagedWorkspace(uri);
		const file = workspace?.uri ?? uri;
		const deleteFile = !!options?.deleteFile && hasWorkspaceFileExtension(file);
		// A workspace of one folder has no file, whatever the folder's name
		if (deleteFile && workspace && this._isFolderWorkspace(workspace)) {
			throw this._folderNotWorkspaceFileError(file);
		}
		// A user's own workspace file is only ever moved to the trash, never deleted permanently
		if (deleteFile && !this._isOwnedWorkspaceFile(file) && !this.fileService.hasCapability(file, FileSystemProviderCapabilities.Trash)) {
			throw new SessionWorkspaceError(localize('workspaceFileNoTrash', "The workspace file '{0}' cannot be moved to the trash.", this.uriIdentityService.extUri.basename(file)), 'noTrash');
		}
		// The workspace stays when its file cannot be deleted
		if (deleteFile) {
			await this._deleteWorkspaceFile(file);
		}
		const extUri = this.uriIdentityService.extUri;
		// By URI, since a refresh while the file was deleted may have replaced the workspace object
		const remaining = workspace ? this._managedWorkspaces.get().filter(candidate => !extUri.isEqual(candidate.uri, workspace.uri)) : this._managedWorkspaces.get();
		// A former file of the workspace that another workspace has now stays with that one
		const removed = (workspace ? [workspace.uri, ...workspace.previousUris ?? []] : [uri]).filter(removedUri =>
			!remaining.some(other => extUri.isEqual(other.uri, removedUri) || other.previousUris?.some(previous => extUri.isEqual(previous, removedUri))));
		this._recordRemoval(removed);
		if (workspace) {
			this._persist(remaining);
		}
		// Its workspace files are not listed with the recent workspace files again, where VS Code may still have them
		for (const removedUri of removed.filter(hasWorkspaceFileExtension)) {
			this._setForgotten(removedUri, true);
		}
	}

	async openWorkspace(workspaceFile: URI): Promise<IRecentSessionWorkspace> {
		const workspace = await this.resolveWorkspaceFile(workspaceFile);
		if (!workspace.folders.length) {
			throw new Error(localize('workspaceFileWithoutFolders', "The workspace file has no folders."));
		}
		this._upsert(workspace);
		this._setForgotten(workspaceFile, false);
		return workspace;
	}

	touchWorkspace(uri: URI): void {
		const workspace = this._getManagedWorkspace(uri);
		if (workspace) {
			this._upsert(workspace);
		}
	}

	refresh(): Promise<void> {
		return this._refreshes.queue(() => this._refresh(undefined));
	}

	/** Rereads the managed workspace files, or only those with the given comparison keys. */
	private async _refresh(keys: ReadonlySet<string> | undefined): Promise<void> {
		const extUri = this.uriIdentityService.extUri;
		const reads = new Limiter<readonly [IRecentSessionWorkspace, IRecentSessionWorkspace]>(MAX_CONCURRENT_READS);
		try {
			const toRead = this._managedWorkspaces.get().filter(workspace => !this._isFolderWorkspace(workspace) && (!keys || keys.has(extUri.getComparisonKey(workspace.uri))));
			if (!toRead.length) {
				return;
			}
			const remoteAuthorities = await this._getRemoteAuthorities();
			const read = await Promise.all(toRead
				.map(workspace => reads.queue(async (): Promise<readonly [IRecentSessionWorkspace, IRecentSessionWorkspace]> => {
					try {
						const { missing: _missing, ...rest } = workspace;
						const parsed = await this._readWorkspaceFile(workspace.uri, remoteAuthorities);
						const local = this._localAppearance.get(extUri.getComparisonKey(workspace.uri));
						return [workspace, withAppearance({ ...rest, name: parsed.name, folders: parsed.folders }, displayAppearance(parsed, local))];
					} catch (error) {
						// What is known about the workspace stays, rather than folders that may be on another computer
						if (isFoldersUnknownError(error)) {
							return [workspace, workspace];
						}
						this.logService.trace('[SessionWorkspaces] Could not read a workspace file', error);
						return [workspace, { ...workspace, missing: true }];
					}
				})));
			// Only workspaces that are unchanged since they were read take what was read, and unchanged ones keep their object
			const refreshed = new Map(read.filter(([before, after]) => !isSameWorkspace(before, after, extUri)));
			if (refreshed.size) {
				this._persist(this._managedWorkspaces.get().map(workspace => refreshed.get(workspace) ?? workspace));
			}
		} finally {
			reads.dispose();
		}
	}

	private _getManagedWorkspace(uri: URI): IRecentSessionWorkspace | undefined {
		const extUri = this.uriIdentityService.extUri;
		const workspaces = this._managedWorkspaces.get();
		return workspaces.find(workspace => extUri.isEqual(workspace.uri, uri))
			?? workspaces.find(workspace => workspace.previousUris?.some(previous => extUri.isEqual(previous, uri)));
	}

	private _isFolderWorkspace(workspace: IRecentSessionWorkspace): boolean {
		return workspace.folders.length === 1 && this.uriIdentityService.extUri.isEqual(workspace.uri, workspace.folders[0]);
	}

	/** Whether the file is one that {@link createWorkspace} wrote: `<home>/<id>/<name>.code-workspace`. */
	private _isOwnedWorkspaceFile(uri: URI): boolean {
		return this.uriIdentityService.extUri.isEqual(dirname(dirname(uri)), this.ownedWorkspacesHome);
	}

	/**
	 * Reads a workspace file with the remotes from {@link _getRemoteAuthorities}. Throws a `foldersUnknown`
	 * {@link SessionWorkspaceError} when those are unknown and the file has folder paths that may be on a remote.
	 */
	private async _readWorkspaceFile(uri: URI, remoteAuthorities: ReadonlyMap<string, string> | undefined): Promise<ISessionWorkspaceFileContent> {
		const content = (await this.fileService.readFile(uri, { limits: { size: MAX_WORKSPACE_FILE_SIZE } })).value.toString();
		if (!remoteAuthorities && hasAmbiguousFolderPaths(content, uri)) {
			throw foldersUnknownError(this.uriIdentityService.extUri.basename(uri));
		}
		return parseSessionWorkspaceFile(content, uri, this.uriIdentityService.extUri, { remoteAuthority: remoteAuthorities?.get(this.uriIdentityService.extUri.getComparisonKey(uri)) });
	}

	/** Whether a workspace file has folder entries that are not read, such as paths on a remote; throws when that is unknown. */
	private async _hasHiddenFolders(uri: URI): Promise<boolean> {
		try {
			return (await this._readWorkspaceFile(uri, await this._getRemoteAuthorities())).hasErrors;
		} catch (error) {
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
	}

	/**
	 * The remotes that VS Code opened workspace files in, by the comparison keys of the files, for files that do not say so
	 * themselves; `undefined` when VS Code's recently opened list cannot be read. Read from that list itself, which has them
	 * also for files whose folders are all on a remote.
	 */
	private async _getRemoteAuthorities(): Promise<ReadonlyMap<string, string> | undefined> {
		try {
			const { workspaces } = await this.workspacesService.getRecentlyOpened();
			const authorities = new Map<string, string>();
			for (const entry of workspaces) {
				if (isRecentWorkspace(entry) && entry.remoteAuthority) {
					authorities.set(this.uriIdentityService.extUri.getComparisonKey(entry.workspace.configPath), entry.remoteAuthority);
				}
			}
			return authorities;
		} catch (error) {
			this.logService.warn('[SessionWorkspaces] Could not read the recently opened workspaces', error);
			return undefined;
		}
	}

	/** Writes the icon and color into the workspace file, keeping them on this computer and warning when that fails. */
	private async _writeFileAppearance(workspace: IRecentSessionWorkspace, update: ISessionWorkspaceUpdate): Promise<IRecentSessionWorkspace> {
		const local = this._localAppearance.get(this.uriIdentityService.extUri.getComparisonKey(workspace.uri));
		try {
			const { parsed } = await this._editWorkspaceFile(workspace.uri, current => {
				if (!current) {
					throw new FileOperationError(localize('workspaceFileNotFound', "The workspace file does not exist."), FileOperationResult.FILE_NOT_FOUND);
				}
				return toFileAppearanceEdit(update);
			}, { knownFolders: workspace.folders });
			const remainingLocal = remainingLocalAppearance(update, local);
			this._setLocalAppearance(workspace.uri, remainingLocal);
			return withAppearance(workspace, displayAppearance(parsed, remainingLocal));
		} catch (error) {
			const appearance: ISessionWorkspaceAppearance = {
				icon: update.icon === undefined ? workspace.icon : update.icon ?? undefined,
				color: update.color === undefined ? workspace.color : update.color ?? undefined,
			};
			this._setLocalAppearance(workspace.uri, appearance);
			this.notificationService.warn(localize('workspaceAppearanceNotSaved', "Could not save the icon and color of '{0}' in its workspace file. They are kept on this computer only. {1}", workspace.name, toErrorMessage(error)));
			return withAppearance(workspace, appearance);
		}
	}

	/**
	 * Applies an edit to a workspace file, or writes a missing one, and returns what the file has then, and whether only
	 * VS Code's recently opened list tells, or would tell, whether its folder paths are on a remote. The file is validated
	 * before and after the edit, and written only if it did not change since it was read; when it did, the edit is applied
	 * once more to its new content, since an edit only sets the properties that it has.
	 *
	 * When that list cannot be read and the file has folder paths that may be on a remote, its folders are not changed and
	 * the returned ones are `knownFolders`; without those, the edit is refused.
	 */
	private async _editWorkspaceFile(uri: URI, toEdit: (current: ISessionWorkspaceFileContent | undefined) => ISessionWorkspaceFileEdit, options?: { readonly forceAbsolute?: boolean; readonly knownFolders?: readonly URI[] }): Promise<{ readonly parsed: ISessionWorkspaceFileContent; readonly remoteFromRecents: boolean }> {
		const extUri = this.uriIdentityService.extUri;
		const authorities = await this._getRemoteAuthorities();
		const remoteAuthority = authorities?.get(extUri.getComparisonKey(uri));
		for (let attempt = 0; ; attempt++) {
			let file: IFileContent | undefined;
			try {
				file = await this.fileService.readFile(uri, { limits: { size: MAX_WORKSPACE_FILE_SIZE } });
			} catch (error) {
				// Only a file that is missing from the start is written new; one deleted meanwhile stays deleted
				if (attempt > 0 || (error as FileOperationError).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
					throw error;
				}
			}
			const existing = file?.value.toString();
			const current = existing === undefined ? undefined : parseSessionWorkspaceFile(existing, uri, extUri, { remoteAuthority });
			const edit = toEdit(current);
			// Not knowing where VS Code opened the file, its folder paths may be paths on a remote that rewriting would lose,
			// and that are not this computer's folders
			const foldersUnknown = !authorities && existing !== undefined && hasAmbiguousFolderPaths(existing, uri);
			if (foldersUnknown && (edit.folders || !options?.knownFolders)) {
				throw foldersUnknownError(extUri.basename(uri));
			}
			const updated = stringifySessionWorkspaceFile(uri, edit, extUri, { existing, forceAbsolute: options?.forceAbsolute, remoteAuthority });
			try {
				if (!file) {
					await this.fileService.createFile(uri, VSBuffer.fromString(updated), { overwrite: false });
				} else if (updated !== existing) {
					// The file service lets an edit that keeps the size of the file through, so any newer modification counts
					const stat = await this.fileService.stat(uri);
					if (stat.mtime !== file.mtime || stat.etag !== file.etag) {
						throw new FileOperationError(localize('workspaceFileModified', "The workspace file '{0}' was changed meanwhile.", extUri.basename(uri)), FileOperationResult.FILE_MODIFIED_SINCE);
					}
					await this.fileService.writeFile(uri, VSBuffer.fromString(updated), { etag: file.etag, mtime: file.mtime });
				}
				const parsed = parseSessionWorkspaceFile(updated, uri, extUri, { remoteAuthority });
				const remoteFromRecents = hasAmbiguousFolderPaths(updated, uri) && (!authorities || authorities.has(extUri.getComparisonKey(uri)));
				return { parsed: foldersUnknown && options?.knownFolders ? { ...parsed, folders: [...options.knownFolders] } : parsed, remoteFromRecents };
			} catch (error) {
				if (attempt === 0 && (error as FileOperationError).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
					continue;
				}
				throw error;
			}
		}
	}

	private _setLocalAppearance(uri: URI, appearance: ISessionWorkspaceAppearance | undefined): void {
		const key = this.uriIdentityService.extUri.getComparisonKey(uri);
		if (appearance?.icon || appearance?.color) {
			this._localAppearance.set(key, { icon: appearance.icon, color: appearance.color });
		} else {
			this._localAppearance.delete(key);
		}
	}

	/** The workspace replacing `existing`, remembering the workspace files that `existing` had, which sessions may still reference. */
	private _withHistory(existing: IRecentSessionWorkspace, workspace: IRecentSessionWorkspace): IRecentSessionWorkspace {
		const extUri = this.uriIdentityService.extUri;
		const previous = [...existing.previousUris ?? [], ...(hasWorkspaceFileExtension(existing.uri) ? [existing.uri] : [])].filter((candidate, index, all) =>
			!extUri.isEqual(candidate, workspace.uri) && all.findIndex(other => extUri.isEqual(other, candidate)) === index);
		const { previousUris: _previousUris, ...rest } = workspace;
		return previous.length ? { ...rest, previousUris: previous } : rest;
	}

	/** Moves an owned workspace file that is no longer needed to the trash, logging a failure. */
	private async _deleteOwnedWorkspaceFile(uri: URI): Promise<void> {
		try {
			await this._deleteWorkspaceFile(uri);
		} catch (error) {
			this.logService.warn('[SessionWorkspaces] Could not delete the workspace file', error);
		}
	}

	/** Moves a workspace file to the trash, or deletes an owned one where there is no trash, and the folder of an owned workspace file when nothing else is in it. Never deletes a folder named like a workspace file. */
	private async _deleteWorkspaceFile(uri: URI): Promise<void> {
		let exists = true;
		try {
			if ((await this.fileService.stat(uri)).isDirectory) {
				throw this._folderNotWorkspaceFileError(uri);
			}
		} catch (error) {
			// A workspace file that is gone already counts as deleted
			if (toFileSystemProviderErrorCode(error as Error) !== FileSystemProviderErrorCode.FileNotFound && (error as FileOperationError).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			exists = false;
		}
		if (exists) {
			const useTrash = this.fileService.hasCapability(uri, FileSystemProviderCapabilities.Trash);
			await this.fileService.del(uri, { useTrash });
		}
		if (!this._isOwnedWorkspaceFile(uri)) {
			return;
		}
		// A non-recursive delete removes the folder only while it is empty, also if something is added to it meanwhile
		try {
			const folder = await this.fileService.resolve(dirname(uri));
			if (!folder.children?.length) {
				await this.fileService.del(folder.resource, { recursive: false });
			}
		} catch (error) {
			this.logService.trace('[SessionWorkspaces] Did not delete the folder of the workspace file', error);
		}
	}

	private _folderNotWorkspaceFileError(uri: URI): SessionWorkspaceError {
		return new SessionWorkspaceError(localize('workspaceFileIsFolder', "'{0}' is a folder, not a workspace file.", this.uriIdentityService.extUri.basename(uri)), 'folderNotWorkspaceFile');
	}

	/** Watches each managed workspace file, rereading the files when one changes. */
	private _watchWorkspaceFiles(workspaces: readonly IRecentSessionWorkspace[]): void {
		const extUri = this.uriIdentityService.extUri;
		const files = new Map(workspaces.filter(workspace => !this._isFolderWorkspace(workspace) && this.fileService.hasProvider(workspace.uri)).map(workspace => [extUri.getComparisonKey(workspace.uri), workspace.uri]));
		for (const key of [...this._fileWatchers.keys()]) {
			if (!files.has(key)) {
				this._fileWatchers.deleteAndDispose(key);
			}
		}
		for (const [key, uri] of files) {
			if (!this._fileWatchers.has(key)) {
				const store = new DisposableStore();
				const watcher = store.add(this.fileService.createWatcher(uri, { recursive: false, excludes: [] }));
				store.add(watcher.onDidChange(event => {
					if (event.affects(uri)) {
						this._changedFiles.add(key);
						this._refreshScheduler.schedule();
					}
				}));
				this._fileWatchers.set(key, store);
			}
		}
	}

	private _setForgotten(uri: URI, forgotten: boolean): void {
		const key = this.uriIdentityService.extUri.getComparisonKey(uri);
		const keys = new Set(this._forgottenWorkspaceFiles.get());
		if (forgotten === keys.has(key)) {
			return;
		}
		if (forgotten) {
			keys.add(key);
		} else {
			keys.delete(key);
		}
		this._forgottenWorkspaceFiles.set(keys, undefined);
		if (keys.size) {
			this.storageService.store(STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES, JSON.stringify([...keys]), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES, StorageScope.PROFILE);
		}
	}

	private _readForgottenWorkspaceFiles(): ReadonlySet<string> {
		const stored = this.storageService.getObject<unknown[]>(STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES, StorageScope.PROFILE, []);
		return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
	}

	/**
	 * Puts `workspace` where the workspace at `previousUri` is now, dropping any other entry with its URI. When that
	 * workspace is gone, `workspace` is added unless it was removed after `removals` was read.
	 */
	private _replace(previousUri: URI, workspace: IRecentSessionWorkspace, removals: number): void {
		const extUri = this.uriIdentityService.extUri;
		const workspaces = this._managedWorkspaces.get().filter(candidate => extUri.isEqual(candidate.uri, previousUri) || !extUri.isEqual(candidate.uri, workspace.uri));
		const index = workspaces.findIndex(candidate => extUri.isEqual(candidate.uri, previousUri));
		if (index >= 0) {
			workspaces[index] = workspace;
		} else if (!this._removedSince([previousUri, workspace.uri], removals)) {
			workspaces.unshift(workspace);
		} else {
			return;
		}
		if (this._queuedMutations && !extUri.isEqual(previousUri, workspace.uri)) {
			const previousKey = extUri.getComparisonKey(previousUri);
			for (const [key, moved] of this._movedUris) {
				if (extUri.isEqual(moved, previousUri)) {
					this._movedUris.set(key, workspace.uri);
				}
			}
			this._movedUris.set(previousKey, workspace.uri);
			this._movedUris.delete(extUri.getComparisonKey(workspace.uri));
		}
		this._persist(workspaces.slice(0, MAX_MANAGED_WORKSPACES));
	}

	/** Whether a workspace with one of `uris` was removed after `removals` was read. */
	private _removedSince(uris: readonly URI[], removals: number): boolean {
		return uris.some(uri => (this._removedAt.get(this.uriIdentityService.extUri.getComparisonKey(uri)) ?? 0) > removals);
	}

	private _recordRemoval(uris: readonly URI[]): void {
		this._removals++;
		for (const uri of uris) {
			this._removedAt.set(this.uriIdentityService.extUri.getComparisonKey(uri), this._removals);
		}
	}

	/** Puts `workspace` first, dropping the entry with its URI. */
	private _upsert(workspace: IRecentSessionWorkspace): void {
		const extUri = this.uriIdentityService.extUri;
		const workspaces = [workspace, ...this._managedWorkspaces.get().filter(candidate => !extUri.isEqual(candidate.uri, workspace.uri))];
		this._persist(workspaces.slice(0, MAX_MANAGED_WORKSPACES));
	}

	private _persist(workspaces: readonly IRecentSessionWorkspace[]): void {
		this._managedWorkspaces.set(workspaces, undefined);
		const extUri = this.uriIdentityService.extUri;
		const keys = new Set(workspaces.map(workspace => extUri.getComparisonKey(workspace.uri)));
		for (const key of [...this._localAppearance.keys()]) {
			if (!keys.has(key)) {
				this._localAppearance.delete(key);
			}
		}
		const stored: IStoredWorkspace[] = workspaces.map(workspace => {
			const local = this._localAppearance.get(extUri.getComparisonKey(workspace.uri));
			return {
				uri: workspace.uri.toJSON(),
				name: workspace.name,
				folders: workspace.folders.map(folder => folder.toJSON()),
				owned: workspace.owned,
				...(workspace.icon ? { icon: workspace.icon } : {}),
				...(workspace.color ? { color: workspace.color } : {}),
				...(local ? { local } : {}),
				...(workspace.previousUris?.length ? { previousUris: workspace.previousUris.map(previous => previous.toJSON()) } : {}),
			};
		});
		if (stored.length) {
			this.storageService.store(STORAGE_KEY_WORKSPACES, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(STORAGE_KEY_WORKSPACES, StorageScope.PROFILE);
		}
	}

	private _readStorage(): IRecentSessionWorkspace[] {
		const extUri = this.uriIdentityService.extUri;
		const stored = this.storageService.getObject<unknown[]>(STORAGE_KEY_WORKSPACES, StorageScope.PROFILE, []);
		const missing = new Set(this._managedWorkspaces.get().filter(workspace => workspace.missing).map(workspace => extUri.getComparisonKey(workspace.uri)));
		const localAppearance = new Map<string, ISessionWorkspaceAppearance>();
		const workspaces = (Array.isArray(stored) ? stored : []).flatMap((entry): IRecentSessionWorkspace[] => {
			try {
				const { uri: storedUri, name, folders, owned, icon, color, local, previousUris } = entry as IStoredWorkspace;
				if (typeof name !== 'string' || !Array.isArray(folders)) {
					return [];
				}
				const uri = URI.revive(storedUri);
				const key = extUri.getComparisonKey(uri);
				const localValue = readAppearance(local);
				if (localValue) {
					localAppearance.set(key, localValue);
				}
				const revivedPrevious = Array.isArray(previousUris) ? previousUris.map(previous => URI.revive(previous)) : [];
				return [withAppearance({
					uri,
					name,
					folders: folders.map(folder => URI.revive(folder)),
					owned: !!owned,
					...(missing.has(key) ? { missing: true } : {}),
					...(revivedPrevious.length ? { previousUris: revivedPrevious } : {}),
				}, { icon: typeof icon === 'string' ? icon : undefined, color: typeof color === 'string' ? color : undefined })];
			} catch {
				return [];
			}
		});
		this._localAppearance = localAppearance;
		return workspaces;
	}
}
