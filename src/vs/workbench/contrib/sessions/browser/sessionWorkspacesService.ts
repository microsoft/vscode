/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FileOperationError, FileOperationResult, FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { hasWorkspaceFileExtension, WORKSPACE_SUFFIX } from '../../../../platform/workspace/common/workspace.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../common/sessionConfig.js';
import { ISessionWorkspaceFileContent, parseSessionWorkspaceFile, stringifySessionWorkspaceFile } from '../common/sessionWorkspaceFile.js';
import { IRecentSessionWorkspace, ISessionWorkspaceAppearance, ISessionWorkspaceRemoveOptions, ISessionWorkspacesService, ISessionWorkspaceUpdate } from '../common/sessionWorkspaces.js';
import { ISessionsRecentWorkspacesService } from './sessionsRecentWorkspacesService.js';

const STORAGE_KEY_WORKSPACES = 'sessions.workspaces';
const STORAGE_KEY_FORGOTTEN_WORKSPACE_FILES = 'sessions.forgottenRecentWorkspaceFiles';
const MAX_MANAGED_WORKSPACES = 50;
const MAX_RECENT_WORKSPACE_FILES = 20;
const MAX_WORKSPACE_FILE_SIZE = 1024 * 1024;
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
function toWorkspaceFileName(name: string): string {
	const sanitized = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim();
	return `${sanitized || 'workspace'}${WORKSPACE_SUFFIX}`;
}

function withAppearance(workspace: IRecentSessionWorkspace, appearance: ISessionWorkspaceAppearance | undefined): IRecentSessionWorkspace {
	const { icon: _icon, color: _color, ...rest } = workspace;
	return {
		...rest,
		...(appearance?.icon ? { icon: appearance.icon } : {}),
		...(appearance?.color ? { color: appearance.color } : {}),
	};
}

function readAppearance(value: unknown): ISessionWorkspaceAppearance | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { icon, color } = value as { icon?: unknown; color?: unknown };
	return { icon: typeof icon === 'string' ? icon : undefined, color: typeof color === 'string' ? color : undefined };
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
	private readonly _refreshScheduler = this._register(new RunOnceScheduler(() => void this.refresh(), 300));

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsRecentWorkspacesService private readonly recentWorkspacesService: ISessionsRecentWorkspacesService,
		@INotificationService private readonly notificationService: INotificationService,
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
		const parsed = await this._readWorkspaceFile(workspaceFile);
		const managed = this._getManagedWorkspace(workspaceFile);
		const local = this._localAppearance.get(this.uriIdentityService.extUri.getComparisonKey(workspaceFile));
		return withAppearance({
			uri: workspaceFile,
			name: parsed.name,
			folders: parsed.folders,
			owned: managed?.owned ?? this._isOwnedWorkspaceFile(workspaceFile),
			...(managed?.previousUris ? { previousUris: managed.previousUris } : {}),
		}, { icon: parsed.icon ?? local?.icon, color: parsed.color ?? local?.color });
	}

	async createWorkspace(name: string, folders: readonly URI[], appearance?: ISessionWorkspaceAppearance): Promise<IRecentSessionWorkspace> {
		const workspace = await this._create(name, folders, appearance);
		this._upsert(workspace, true);
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

	async updateWorkspace(uri: URI, update: ISessionWorkspaceUpdate): Promise<IRecentSessionWorkspace> {
		const extUri = this.uriIdentityService.extUri;
		const existing = this._getManagedWorkspace(uri);
		const appearance: ISessionWorkspaceAppearance = {
			icon: update.icon === undefined ? existing?.icon : update.icon ?? undefined,
			color: update.color === undefined ? existing?.color : update.color ?? undefined,
		};

		// Only the icon or color changed: a standalone folder keeps them on this computer, a workspace file stores them
		if (existing && update.name === undefined && update.folders === undefined) {
			if (this._isFolderWorkspace(existing)) {
				this._setLocalAppearance(existing.uri, appearance);
			} else {
				await this._writeFileAppearance(existing, appearance);
			}
			const workspace = withAppearance(existing, appearance);
			this._upsert(workspace, false);
			return workspace;
		}

		// A standalone folder gets an owned workspace file once it has several folders
		if (existing && this._isFolderWorkspace(existing)) {
			const workspace = this._withHistory(existing, await this._create(update.name ?? existing.name, update.folders ?? existing.folders, appearance));
			this._replace(existing, workspace);
			return workspace;
		}

		// An owned workspace file reduced to one folder becomes that standalone folder
		if (existing?.owned && this._isOwnedWorkspaceFile(existing.uri) && update.folders?.length === 1) {
			const workspace = this._withHistory(existing, await this._create(update.name ?? existing.name, update.folders, appearance));
			this._replace(existing, workspace);
			await this._deleteOwnedWorkspaceFile(existing.uri);
			return workspace;
		}

		if (update.folders && !update.folders.length) {
			throw new Error(localize('workspaceWithoutFolders', "A workspace needs at least one folder."));
		}

		// The workspace file, also when `uri` is one that it had before
		const fileUri = existing?.uri ?? uri;
		let content: string | undefined;
		try {
			content = (await this.fileService.readFile(fileUri, { limits: { size: MAX_WORKSPACE_FILE_SIZE } })).value.toString();
		} catch (error) {
			if ((error as FileOperationError).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}
		// A missing file is written again from what is known about the workspace
		const fileAppearance = { icon: appearance.icon ?? null, color: appearance.color ?? null };
		const edit = content === undefined
			? { name: update.name ?? existing?.name, folders: update.folders ?? existing?.folders, ...fileAppearance }
			: { name: update.name, folders: update.folders, ...fileAppearance };
		const updated = stringifySessionWorkspaceFile(fileUri, edit, extUri, { existing: content, forceAbsolute: existing?.owned });
		await this.fileService.writeFile(fileUri, VSBuffer.fromString(updated));
		const parsed = parseSessionWorkspaceFile(updated, fileUri, extUri);

		// An owned workspace file is named after the workspace, which VS Code names its window after; a user's file keeps its name
		let newUri = fileUri;
		if (existing?.owned && this._isOwnedWorkspaceFile(fileUri) && update.name !== undefined) {
			const renamed = joinPath(dirname(fileUri), toWorkspaceFileName(parsed.name));
			if (!extUri.isEqual(renamed, fileUri)) {
				await this.fileService.move(fileUri, renamed);
				newUri = renamed;
			}
		}
		this._setLocalAppearance(fileUri, undefined);
		const workspace = withAppearance({ uri: newUri, name: parsed.name, folders: parsed.folders, owned: existing?.owned ?? this._isOwnedWorkspaceFile(newUri) }, appearance);
		if (existing && !extUri.isEqual(newUri, existing.uri)) {
			const renamed = this._withHistory(existing, workspace);
			this._replace(existing, renamed);
			return renamed;
		}
		const result = existing?.previousUris ? { ...workspace, previousUris: existing.previousUris } : workspace;
		this._upsert(result, false);
		return result;
	}

	async removeWorkspace(uri: URI, options?: ISessionWorkspaceRemoveOptions): Promise<void> {
		const workspace = this._getManagedWorkspace(uri);
		if (workspace) {
			this._persist(this._managedWorkspaces.get().filter(candidate => candidate !== workspace));
		} else if (hasWorkspaceFileExtension(uri)) {
			this._setForgotten(uri, true);
		}
		const file = workspace?.uri ?? uri;
		if (options?.deleteFile && hasWorkspaceFileExtension(file)) {
			await this._deleteWorkspaceFile(file);
		}
	}

	async openWorkspace(workspaceFile: URI): Promise<IRecentSessionWorkspace> {
		const workspace = await this.resolveWorkspaceFile(workspaceFile);
		if (!workspace.folders.length) {
			throw new Error(localize('workspaceFileWithoutFolders', "The workspace file has no folders."));
		}
		this._upsert(workspace, true);
		this._setForgotten(workspaceFile, false);
		return workspace;
	}

	touchWorkspace(uri: URI): void {
		const workspace = this._getManagedWorkspace(uri);
		if (workspace) {
			this._upsert(workspace, true);
		}
	}

	async refresh(): Promise<void> {
		const extUri = this.uriIdentityService.extUri;
		const read = await Promise.all(this._managedWorkspaces.get().map(async (workspace): Promise<readonly [IRecentSessionWorkspace, IRecentSessionWorkspace]> => {
			if (this._isFolderWorkspace(workspace)) {
				return [workspace, workspace];
			}
			try {
				const { missing: _missing, ...rest } = workspace;
				const parsed = await this._readWorkspaceFile(workspace.uri);
				const local = this._localAppearance.get(extUri.getComparisonKey(workspace.uri));
				return [workspace, withAppearance({ ...rest, name: parsed.name, folders: parsed.folders }, { icon: parsed.icon ?? local?.icon, color: parsed.color ?? local?.color })];
			} catch (error) {
				this.logService.trace('[SessionWorkspaces] Could not read a workspace file', error);
				return [workspace, { ...workspace, missing: true }];
			}
		}));
		// Workspaces added, changed or removed while the files were read are kept as they are now
		const refreshed = new Map(read);
		this._persist(this._managedWorkspaces.get().map(workspace => refreshed.get(workspace) ?? workspace));
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

	private async _readWorkspaceFile(uri: URI): Promise<ISessionWorkspaceFileContent> {
		const content = (await this.fileService.readFile(uri, { limits: { size: MAX_WORKSPACE_FILE_SIZE } })).value.toString();
		return parseSessionWorkspaceFile(content, uri, this.uriIdentityService.extUri);
	}

	/** Writes the icon and color into the workspace file, keeping them on this computer and warning when that fails. */
	private async _writeFileAppearance(workspace: IRecentSessionWorkspace, appearance: ISessionWorkspaceAppearance): Promise<void> {
		try {
			const content = (await this.fileService.readFile(workspace.uri, { limits: { size: MAX_WORKSPACE_FILE_SIZE } })).value.toString();
			const updated = stringifySessionWorkspaceFile(workspace.uri, { icon: appearance.icon ?? null, color: appearance.color ?? null }, this.uriIdentityService.extUri, { existing: content });
			if (updated !== content) {
				await this.fileService.writeFile(workspace.uri, VSBuffer.fromString(updated));
			}
			this._setLocalAppearance(workspace.uri, undefined);
		} catch (error) {
			this._setLocalAppearance(workspace.uri, appearance);
			this.notificationService.warn(localize('workspaceAppearanceNotSaved', "Could not save the icon and color of '{0}' in its workspace file. They are kept on this computer only. {1}", workspace.name, toErrorMessage(error)));
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

	/** Moves a workspace file to the trash, and the folder of an owned workspace file when nothing else is in it. */
	private async _deleteWorkspaceFile(uri: URI): Promise<void> {
		const useTrash = this.fileService.hasCapability(uri, FileSystemProviderCapabilities.Trash);
		await this.fileService.del(uri, { useTrash });
		if (!this._isOwnedWorkspaceFile(uri)) {
			return;
		}
		try {
			const folder = await this.fileService.resolve(dirname(uri));
			if (!folder.children?.length) {
				await this.fileService.del(folder.resource, { useTrash, recursive: true });
			}
		} catch (error) {
			this.logService.warn('[SessionWorkspaces] Could not delete the folder of the workspace file', error);
		}
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

	/** Puts `workspace` where `existing` was, dropping any other entry with the same URI. */
	private _replace(existing: IRecentSessionWorkspace, workspace: IRecentSessionWorkspace): void {
		const extUri = this.uriIdentityService.extUri;
		this._persist(this._managedWorkspaces.get()
			.filter(candidate => candidate === existing || !extUri.isEqual(candidate.uri, workspace.uri))
			.map(candidate => candidate === existing ? workspace : candidate));
	}

	private _upsert(workspace: IRecentSessionWorkspace, moveToFront: boolean): void {
		const workspaces = [...this._managedWorkspaces.get()];
		const index = workspaces.findIndex(candidate => this.uriIdentityService.extUri.isEqual(candidate.uri, workspace.uri));
		if (index >= 0 && !moveToFront) {
			workspaces[index] = workspace;
		} else {
			if (index >= 0) {
				workspaces.splice(index, 1);
			}
			workspaces.unshift(workspace);
		}
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
