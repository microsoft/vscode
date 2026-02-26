/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { removeTrailingPathSeparator } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Workspace, WorkspaceFolder, IWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { getWorkspaceIdentifier } from '../../../../workbench/services/workspaces/browser/workspaces.js';
import { IDidEnterWorkspaceEvent, IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';

export class SessionsWorkspaceContextService implements IWorkspaceContextService, IWorkspaceEditingService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeWorkbenchState = Event.None;
	readonly onDidChangeWorkspaceName = Event.None;
	readonly onDidEnterWorkspace = Event.None as Event<IDidEnterWorkspaceEvent>;

	private readonly _onWillChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersWillChangeEvent>();
	readonly onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
	readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

	private workspace: Workspace;

	constructor(
		sessionsWorkspaceUri: URI,
		private readonly uriIdentityService: IUriIdentityService
	) {
		const workspaceIdentifier = getWorkspaceIdentifier(sessionsWorkspaceUri);
		this.workspace = new Workspace(workspaceIdentifier.id, [], false, workspaceIdentifier.configPath, uri => uriIdentityService.extUri.ignorePathCasing(uri));
	}

	getCompleteWorkspace(): Promise<IWorkspace> {
		return Promise.resolve(this.workspace);
	}

	getWorkspace(): IWorkspace {
		return this.workspace;
	}

	getWorkbenchState(): WorkbenchState {
		return WorkbenchState.EMPTY;
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

	async enterWorkspace(_path: URI): Promise<void> { }

	async createAndEnterWorkspace(_folders: IWorkspaceFolderCreationData[], _path?: URI): Promise<void> { }

	async saveAndEnterWorkspace(_path: URI): Promise<void> { }

	async copyWorkspaceSettings(_toWorkspace: IWorkspaceIdentifier): Promise<void> { }

	async pickNewWorkspacePath(): Promise<URI | undefined> { return undefined; }

	private async doUpdateFolders(foldersToAdd: IWorkspaceFolderCreationData[], foldersToRemove: URI[], index?: number): Promise<void> {
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

		// Update workspace
		const workspaceIdentifier = getWorkspaceIdentifier(this.workspace.configuration!);
		this.workspace = new Workspace(workspaceIdentifier.id, newFolders, false, workspaceIdentifier.configPath, uri => this.uriIdentityService.extUri.ignorePathCasing(uri));

		// Fire did change event
		this._onDidChangeWorkspaceFolders.fire(changes);
	}
}
