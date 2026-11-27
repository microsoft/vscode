/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Queue } from '../../../../../base/common/async.js';
import { removeTrailingPathSeparator } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { Workspace, WorkspaceFolder, IWorkspace, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, IWorkspaceIdentifier, IEmptyWorkspaceIdentifier, isWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceFolder, WorkbenchState, WorkbenchMode } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData } from '../../../../../platform/workspaces/common/workspaces.js';
import { IWorkspaceEditingService } from '../../../workspaces/common/workspaceEditing.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';

import { localize } from '../../../../../nls.js';
import { IWorkbenchWorkspaceContextService } from '../../../workspaces/common/workbenchWorkspaceContextService.js';

/**
 * The Agents workspace keeps its identity when folders are mounted: its uri is its workspace file, if any, and never
 * the only mounted folder, so `toWorkspaceIdentifier` doesn't turn it into a single-folder workspace.
 */
class AgentsWorkspace extends Workspace {
	override get uri(): URI | undefined {
		return this.configuration ?? undefined;
	}
}

export class AgentsWorkspaceContextService extends Disposable implements IWorkbenchWorkspaceContextService, IWorkspaceEditingService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeWorkbenchState = Event.None;
	private readonly _onDidChangeWorkbenchScope = this._register(new Emitter<URI | undefined>());
	readonly onDidChangeWorkbenchScope = this._onDidChangeWorkbenchScope.event;
	readonly onDidChangeWorkbenchMode: Event<WorkbenchMode> = Event.None;
	readonly onDidChangeWorkspaceName = Event.None;
	readonly onDidEnterWorkspace = Event.None;
	readonly onWillRemoveFolders = Event.None;

	private readonly _onWillChangeWorkspaceFolders = this._register(new Emitter<IWorkspaceFoldersWillChangeEvent>());
	readonly onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceFolders = this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

	private workspace: Workspace;
	private readonly _updateFoldersQueue = this._register(new Queue<void>());

	/** The workspace the window is scoped to, if any; see {@link setWorkbenchScope}. */
	private workbenchScope: URI | undefined;

	/** The location each moved folder was mounted at, keyed by its current location. */
	private readonly primaryLocations: ResourceMap<URI>;

	/**
	 * @param workspaceIdentifier the Agents window's workspace, or the empty
	 * identifier of an editor window in Agentic Mode.
	 */
	constructor(
		workspaceIdentifier: IWorkspaceIdentifier | IEmptyWorkspaceIdentifier,
		private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
		this.primaryLocations = new ResourceMap<URI>(uri => uriIdentityService.extUri.getComparisonKey(uri));
		this.workspace = new AgentsWorkspace(workspaceIdentifier.id, [], false, isWorkspaceIdentifier(workspaceIdentifier) ? workspaceIdentifier.configPath : null, uri => uriIdentityService.extUri.ignorePathCasing(uri), localize('agentsWindow', "Agents Window"));
	}

	getCompleteWorkspace(): Promise<IWorkspace> {
		return Promise.resolve(this.workspace);
	}

	getWorkspace(): IWorkspace {
		return this.workspace;
	}

	getWorkbenchScope(): URI | undefined {
		return this.workbenchScope;
	}

	setWorkbenchScope(scope: URI | undefined): void {
		if (!this.uriIdentityService.extUri.isEqual(scope, this.workbenchScope)) {
			this.workbenchScope = scope;
			this._onDidChangeWorkbenchScope.fire(scope);
		}
	}

	resetWorkbenchScope(): void {
		this.setWorkbenchScope(undefined);
	}

	getWorkbenchMode(): WorkbenchMode {
		return WorkbenchMode.Agents;
	}

	getWorkbenchState(): WorkbenchState {
		return WorkbenchState.WORKSPACE;
	}

	hasWorkspaceData(): boolean {
		return true;
	}

	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(resource);
	}

	public isInsideWorkspace(resource: URI): boolean {
		return !!this.getWorkspaceFolder(resource);
	}

	public isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
		return false;
	}

	public addFolders(foldersToAdd: IWorkspaceFolderCreationData[]): Promise<void> {
		return this.doUpdateFolders(foldersToAdd, []);
	}

	public removeFolders(foldersToRemove: URI[]): Promise<void> {
		return this.doUpdateFolders([], foldersToRemove);
	}

	public async updateFolders(index: number, deleteCount?: number, foldersToAddCandidates?: IWorkspaceFolderCreationData[]): Promise<void> {
		const folders = this.workspace.folders;

		let foldersToDelete: URI[] = [];
		if (typeof deleteCount === 'number') {
			foldersToDelete = folders.slice(index, index + deleteCount).map(folder => folder.uri);
		}

		let foldersToAdd: IWorkspaceFolderCreationData[] = [];
		if (Array.isArray(foldersToAddCandidates)) {
			foldersToAdd = foldersToAddCandidates.map(folderToAdd => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
		}

		return this.doUpdateFolders(foldersToAdd, foldersToDelete, index);
	}

	/**
	 * Adds and removes folders in one edit, inserting the added folders at `index`.
	 */
	public applyFolderChanges(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		return this.doUpdateFolders(foldersToAdd.map(folder => ({ uri: removeTrailingPathSeparator(folder.uri), name: folder.name })), foldersToRemove, index);
	}

	async setFolderLocation(_location: URI, _options?: { readonly folder?: URI }): Promise<void> { }

	/**
	 * Moves a mounted folder, the first one by default, to another location of it, such as a worktree of its
	 * repository. The folder keeps its index and name, and remembers the location it was mounted at.
	 * Only Agentic Mode moves folders; the Agents window replaces them.
	 */
	async moveFolder(location: URI, options?: { readonly folder?: URI }): Promise<boolean> {
		let moved = false;
		await this._updateFoldersQueue.queue(async () => {
			moved = await this._moveFolder(options?.folder ?? this.workspace.folders[0]?.uri, removeTrailingPathSeparator(location));
		});
		return moved;
	}

	/**
	 * The location the folder at `folder` was mounted at before it was moved, or `folder` itself if it was never
	 * moved. `undefined` if `folder` is no mounted folder.
	 */
	getPrimaryLocation(folder: URI): URI | undefined {
		return this.workspace.folders.some(f => this.uriIdentityService.extUri.isEqual(f.uri, folder)) ? this.primaryLocations.get(folder) ?? folder : undefined;
	}

	/**
	 * Records `primary` as the location a folder at `folder` belongs to, such as the repository of a worktree, for when it
	 * is mounted next: its locations are then those of `primary`, as when it was moved there from `primary`. `undefined`
	 * forgets it. Has no effect on a mounted folder.
	 */
	setPrimaryLocation(folder: URI, primary: URI | undefined): void {
		const extUri = this.uriIdentityService.extUri;
		folder = removeTrailingPathSeparator(folder);
		if (this.workspace.folders.some(f => extUri.isEqual(f.uri, folder))) {
			return;
		}
		if (primary && !extUri.isEqual(primary, folder)) {
			this.primaryLocations.set(folder, removeTrailingPathSeparator(primary));
		} else {
			this.primaryLocations.delete(folder);
		}
	}

	async enterWorkspace(_path: URI): Promise<void> { }

	async createAndEnterWorkspace(_folders: IWorkspaceFolderCreationData[], _path?: URI): Promise<void> { }

	async saveAndEnterWorkspace(_path: URI): Promise<void> { }

	async copyWorkspaceSettings(_toWorkspace: IWorkspaceIdentifier): Promise<void> { }

	async pickNewWorkspacePath(): Promise<URI | undefined> { return undefined; }

	private async _moveFolder(folderUri: URI | undefined, location: URI): Promise<boolean> {
		const extUri = this.uriIdentityService.extUri;
		const currentFolders = this.workspace.folders;
		const index = folderUri ? currentFolders.findIndex(folder => extUri.isEqual(folder.uri, folderUri)) : -1;
		if (index < 0) {
			return false;
		}
		const current = currentFolders[index];
		if (extUri.isEqual(current.uri, location)) {
			return true;
		}
		if (currentFolders.some(folder => extUri.isEqual(folder.uri, location))) {
			return false; // another folder is mounted there already
		}

		const moved = new WorkspaceFolder({ uri: location, name: current.name, index }, { uri: location.toString() });
		const newFolders = currentFolders.map((folder, i) => i === index ? moved : folder);
		// A move is reported like an editor window reports one: the folder at its old location is removed and added at the new
		const changes: IWorkspaceFoldersChangeEvent = { added: [moved], removed: [current], changed: [] };

		const joinPromises: Promise<void>[] = [];
		this._onWillChangeWorkspaceFolders.fire({
			changes,
			fromCache: false,
			isFolderLocationChange: true,
			join(promise: Promise<void>) { joinPromises.push(promise); }
		});
		await Promise.allSettled(joinPromises);

		const primary = this.primaryLocations.get(current.uri) ?? current.uri;
		this.primaryLocations.delete(current.uri);
		this.primaryLocations.delete(location);
		if (!extUri.isEqual(primary, location)) {
			this.primaryLocations.set(location, primary);
		}

		this.workspace.update(new AgentsWorkspace(this.workspace.id, newFolders, false, this.workspace.configuration, uri => extUri.ignorePathCasing(uri), this.workspace.name));
		this._onDidChangeWorkspaceFolders.fire(changes);
		return true;
	}

	private doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		return this._updateFoldersQueue.queue(() => this._doUpdateFolders(foldersToAdd, foldersToRemove, index));
	}

	private async _doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
		if (foldersToAdd.length === 0 && foldersToRemove.length === 0) {
			return;
		}

		const currentFolders = this.workspace.folders;

		// Remove folders
		let newFolders = currentFolders.filter(folder =>
			!foldersToRemove.some(toRemove => this.uriIdentityService.extUri.isEqual(folder.uri, toRemove))
		);

		// Add folders
		const foldersToAddWorkspaceFolders = foldersToAdd
			.filter(folderToAdd => !newFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folderToAdd.uri)))
			.map(folderToAdd => new WorkspaceFolder(
				{ uri: folderToAdd.uri, name: folderToAdd.name || this.uriIdentityService.extUri.basenameOrAuthority(folderToAdd.uri), index: 0 },
				{ uri: folderToAdd.uri.toString() }
			));

		if (foldersToAddWorkspaceFolders.length > 0) {
			if (typeof index === 'number' && index >= 0 && index < newFolders.length) {
				newFolders = [...newFolders.slice(0, index), ...foldersToAddWorkspaceFolders, ...newFolders.slice(index)];
			} else {
				newFolders = [...newFolders, ...foldersToAddWorkspaceFolders];
			}
		}

		// Recompute indices
		newFolders = newFolders.map((f, i) => new WorkspaceFolder({ uri: f.uri, name: f.name, index: i }, f.raw));

		// Compute change event
		const added = newFolders.filter(folder => !currentFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folder.uri)));
		const removed = currentFolders.filter(folder => !newFolders.some(existing => this.uriIdentityService.extUri.isEqual(existing.uri, folder.uri)));
		const changed: IWorkspaceFolder[] = [];
		const changes: IWorkspaceFoldersChangeEvent = { added, removed, changed };

		if (added.length === 0 && removed.length === 0) {
			return;
		}

		// Fire will change event
		const joinPromises: Promise<void>[] = [];
		this._onWillChangeWorkspaceFolders.fire({
			changes,
			fromCache: false,
			join(promise: Promise<void>) { joinPromises.push(promise); }
		});
		await Promise.allSettled(joinPromises);

		for (const folder of removed) {
			this.primaryLocations.delete(folder.uri);
		}

		// Update workspace
		const workspace = new AgentsWorkspace(this.workspace.id, newFolders, false, this.workspace.configuration, uri => this.uriIdentityService.extUri.ignorePathCasing(uri), this.workspace.name);
		this.workspace.update(workspace);

		// Fire did change event
		this._onDidChangeWorkspaceFolders.fire(changes);
	}
}
