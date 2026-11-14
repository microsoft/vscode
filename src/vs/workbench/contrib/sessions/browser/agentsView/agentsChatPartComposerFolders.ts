/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAllowedFolderPresentation } from '../chat/sessionWorkspacePicker.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';

/**
 * The folders the chat part's new-session composers create their sessions in: the window's folders and, for the one local
 * folder of a window, the other locations of that folder, such as its primary checkout and its linked checkouts
 * (worktrees). Opening a session that works in another location moves the window's folder there (see
 * `IAgentsViewFolderLocationService`).
 */
export class AgentsChatPartComposerFolders extends Disposable {

	private readonly _locations = observableValue<readonly IFolderLocation[]>(this, []);
	private readonly _folders = observableValue<readonly URI[]>(this, []);
	readonly folders: IObservable<readonly URI[]> = this._folders;

	/** Cancels the read of the locations under way, as another starts or this is disposed. */
	private readonly _refresh = this._register(new MutableDisposable());

	private readonly _onDidMoveFolder = this._register(new Emitter<{ readonly from: URI; readonly to: URI }>());
	/** Fires as the window's folder moves from one of its locations to another, such as into a worktree. */
	readonly onDidMoveFolder = this._onDidMoveFolder.event;
	/** Where the window's movable folder was, and its primary location. */
	private _at: { readonly location: URI; readonly primary: URI } | undefined;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly _folderLocationService: IWorkspaceFolderLocationService,
	) {
		super();
		this._register(_folderLocationService.onDidChangeProviders(() => this.refresh()));
		// The location the folder is at, as the workspace resolved it, shows as one also before or without its provider's list
		this._register(_folderLocationService.onDidChangeLocation(() => this._update(this._locations.get())));
		// Also as the window's folders change: a folder that comes to move, or no longer can, such as as folders are added, offers its locations or not
		this._register(_folderLocationService.onDidChangeCanSetLocation(() => this._onDidChangeFolders()));
		this._at = this._location();
		this._update([]);
	}

	private _onDidChangeFolders(): void {
		const from = this._at;
		const to = this._at = this._location();
		const samePrimary = !!from && !!to && extUriBiasedIgnorePathCase.isEqual(from.primary, to.primary);
		// The folder it moved to is offered at once, with its known locations, as they are read again
		this._update(samePrimary ? this._locations.get() : []);
		this.refresh();
		if (from && to && samePrimary && !extUriBiasedIgnorePathCase.isEqual(from.location, to.location)) {
			this._onDidMoveFolder.fire({ from: from.location, to: to.location });
		}
	}

	private _location(): { readonly location: URI; readonly primary: URI } | undefined {
		const folder = this._movableFolder();
		const primary = this._workspaceContextService.getWorkspace().uri;
		return folder && primary && { location: folder.uri, primary };
	}

	/**
	 * How a composer shows `folderUri`: another location of the window's folder by its name and branch, and, for a window
	 * whose folder can move, whether it is the primary folder or a worktree of it and whether the window's folder is there now.
	 */
	getPresentation(folderUri: URI): IAllowedFolderPresentation | undefined {
		const location = this._locations.get().find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate.uri, folderUri));
		const folder = this._movableFolder();
		const workspace = this._workspaceContextService.getWorkspace();
		if (!folder || !workspace.uri) {
			return location;
		}
		// The primary folder, and any other folder of a window with several, show as folders; the other locations as worktrees.
		// The movable folder is the window's first.
		const isFolder = extUriBiasedIgnorePathCase.isEqual(folderUri, workspace.uri)
			|| workspace.folders.slice(1).some(windowFolder => extUriBiasedIgnorePathCase.isEqual(windowFolder.uri, folderUri));
		return {
			...location,
			kind: isFolder ? 'folder' : 'worktree',
			current: extUriBiasedIgnorePathCase.isEqual(folderUri, folder.uri),
		};
	}

	/** Reads the locations of the window's folder again, such as a worktree an agent created since. */
	refresh(): void {
		this._refresh.clear();
		const folder = this._movableFolder();
		if (!folder) {
			this._update([]);
			return;
		}
		const primary = this._workspaceContextService.getWorkspace().uri;
		if (!primary) {
			this._update([]);
			return;
		}
		const source = new CancellationTokenSource();
		this._refresh.value = toDisposable(() => source.dispose(true));
		this._folderLocationService.getLocations(primary, source.token).then(locations => {
			if (!source.token.isCancellationRequested) {
				this._update(locations);
			}
		}, onUnexpectedError);
	}

	private _update(provided: readonly IFolderLocation[]): void {
		const workspace = this._workspaceContextService.getWorkspace();
		const windowFolders = workspace.folders;
		const folder = this._movableFolder();
		const atAlternate = !!folder && this._folderLocationService.isAtAlternateLocation(folder);
		const current = folder && atAlternate ? this._folderLocationService.getLocation(folder) : undefined;
		const locations = current && !provided.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, current.uri))
			? [current, ...provided]
			: provided;
		const folders: URI[] = windowFolders.map(windowFolder => windowFolder.uri);
		const add = (uri: URI) => {
			if (!folders.some(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, uri))) {
				folders.push(uri);
			}
		};
		// The primary location while the folder is at another, then its other locations
		if (atAlternate && workspace.uri) {
			add(workspace.uri);
		}
		for (const location of locations) {
			add(location.uri);
		}
		this._locations.set(locations, undefined);
		this._folders.set(folders, undefined);
	}

	/** The window's folder, when it can move between its locations (see `IWorkspaceFolderLocationService.canSetLocation`). */
	private _movableFolder() {
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder && this._folderLocationService.canSetLocation(folder) ? folder : undefined;
	}
}
