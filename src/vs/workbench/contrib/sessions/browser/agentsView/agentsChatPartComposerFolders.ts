/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';

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
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(_workspaceContextService.onDidChangeWorkspaceFolders(() => this._onDidChangeFolders()));
		this._register(_folderLocationService.onDidChangeProviders(() => this.refresh()));
		// The location the folder is at, as the workspace resolved it, shows as one also before or without its provider's list
		this._register(_folderLocationService.onDidChangeCurrentLocation(() => this._update(this._locations.get())));
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
		return folder && { location: folder.uri, primary: folder.primaryUri ?? folder.uri };
	}

	/** How a composer shows `folderUri` when it is another location of the window's folder: by its name and branch. */
	getPresentation(folderUri: URI): IFolderLocation | undefined {
		return this._locations.get().find(location => extUriBiasedIgnorePathCase.isEqual(location.uri, folderUri));
	}

	/** Reads the locations of the window's folder again, such as a worktree an agent created since. */
	refresh(): void {
		this._refresh.clear();
		const folder = this._movableFolder();
		if (!folder) {
			this._update([]);
			return;
		}
		const source = new CancellationTokenSource();
		this._refresh.value = toDisposable(() => source.dispose(true));
		const primary = folder.primaryUri ?? folder.uri;
		this._folderLocationService.getLocations(primary, source.token).then(locations => {
			if (!source.token.isCancellationRequested) {
				this._update(locations);
			}
		}, onUnexpectedError);
	}

	private _update(provided: readonly IFolderLocation[]): void {
		const windowFolders = this._workspaceContextService.getWorkspace().folders;
		const folder = this._movableFolder();
		const current = this._folderLocationService.currentLocation;
		const locations = folder?.primaryUri && current && extUriBiasedIgnorePathCase.isEqual(current.uri, folder.uri)
			&& !provided.some(location => extUriBiasedIgnorePathCase.isEqual(location.uri, current.uri))
			? [current, ...provided]
			: provided;
		const folders: URI[] = windowFolders.map(windowFolder => windowFolder.uri);
		const add = (uri: URI) => {
			if (!folders.some(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, uri))) {
				folders.push(uri);
			}
		};
		// The primary location while the folder is at another, then its other locations
		if (folder?.primaryUri) {
			add(folder.primaryUri);
		}
		for (const location of locations) {
			add(location.uri);
		}
		this._locations.set(locations, undefined);
		this._folders.set(folders, undefined);
	}

	/** The window's only folder, when it can move between its locations: a local, desktop, single-folder window. */
	private _movableFolder() {
		if (isWeb || this._environmentService.remoteAuthority || this._workspaceContextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
			return undefined;
		}
		const folder = this._workspaceContextService.getWorkspace().folders[0];
		return folder?.uri.scheme === Schemas.file ? folder : undefined;
	}
}
