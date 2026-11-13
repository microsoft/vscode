/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { toDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { FolderLocationChangeReason, IFolderLocation, IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';

interface IRegisteredProvider {
	readonly provider: IWorkspaceFolderLocationProvider;
	readonly builtIn: boolean;
}

export class WorkspaceFolderLocationService extends Disposable implements IWorkspaceFolderLocationService {

	declare readonly _serviceBrand: undefined;

	private readonly providers: IRegisteredProvider[] = [];

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private readonly locations = new ResourceMap<IResolvedFolderLocation>();

	private readonly _onDidChangeLocation = this._register(new Emitter<IFolderLocationChangeEvent>());
	readonly onDidChangeLocation = this._onDidChangeLocation.event;

	readonly onDidChangeCanSetLocation: Event<void>;

	constructor(
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService labelService: ILabelService
	) {
		super();

		this.onDidChangeCanSetLocation = Event.any<unknown>(contextService.onDidChangeWorkbenchState, contextService.onDidChangeWorkspaceFolders) as Event<void>;

		this._register(labelService.registerWorkspaceLabelDecorator({
			onDidChange: Event.map(this.onDidChangeLocation, e => e.folder.uri),
			getFolderLocationLabel: folder => this.getFolderLocationLabel(folder)
		}));
	}

	getLocation(folder: IWorkspaceFolder): IResolvedFolderLocation | undefined {
		return this.isAtAlternateLocation(folder) ? this.locations.get(folder.uri) : undefined;
	}

	canSetLocation(folder: IWorkspaceFolder): boolean {
		const workspace = this.contextService.getWorkspace();
		return this.contextService.getWorkbenchState() === WorkbenchState.FOLDER
			&& workspace.folders.length === 1
			&& this.uriIdentityService.extUri.isEqual(workspace.folders[0].uri, folder.uri)
			&& (workspace.uri ?? folder.uri).scheme === Schemas.file;
	}

	isAtAlternateLocation(folder: IWorkspaceFolder): boolean {
		const workspace = this.contextService.getWorkspace();
		const extUri = this.uriIdentityService.extUri;
		return !workspace.configuration && !!workspace.uri && workspace.folders.length === 1 && extUri.isEqual(workspace.folders[0].uri, folder.uri) && !extUri.isEqual(folder.uri, workspace.uri);
	}

	setLocation(folder: IWorkspaceFolder, location: IResolvedFolderLocation | undefined, reason: FolderLocationChangeReason = 'programmatic'): void {
		this.locations.clear(); // only single-folder workspaces are supported
		if (location) {
			this.locations.set(folder.uri, location);
		}
		this._onDidChangeLocation.fire({ folder, reason });
	}

	/**
	 * The label of the location of the folder with the given `uri`, which is either its current
	 * location or, as the label of the workspace is derived from it, the identity of its workspace.
	 */
	private getFolderLocationLabel(uri: URI): string | undefined {
		const workspace = this.contextService.getWorkspace();
		const primary = workspace.configuration ? undefined : workspace.uri;
		const extUri = this.uriIdentityService.extUri;
		const folder = workspace.folders.find(folder => extUri.isEqual(folder.uri, uri) || (primary && extUri.isEqual(primary, uri)));
		const location = folder && this.getLocation(folder);
		if (!location) {
			return undefined;
		}
		return location.description && location.description !== location.label ? `${location.label} · ${location.description}` : location.label;
	}

	registerProvider(provider: IWorkspaceFolderLocationProvider, options?: { readonly builtIn?: boolean }): IDisposable {
		const entry: IRegisteredProvider = { provider, builtIn: !!options?.builtIn };
		this.providers.push(entry);
		this._onDidChangeProviders.fire();
		return toDisposable(() => {
			const index = this.providers.indexOf(entry);
			if (index !== -1) {
				this.providers.splice(index, 1);
				this._onDidChangeProviders.fire();
			}
		});
	}

	async getLocations(primary: URI, token: CancellationToken): Promise<IFolderLocation[]> {
		const results = await Promise.all([...this.providers].map(async ({ provider }) => {
			try {
				return await provider.provideLocations(primary, token);
			} catch (error) {
				onUnexpectedError(error);
				return [];
			}
		}));

		const seen = new ResourceSet();
		const locations: IFolderLocation[] = [];
		for (const location of results.flat()) {
			if (!seen.has(location.uri)) {
				seen.add(location.uri);
				locations.push(location);
			}
		}
		return locations;
	}

	async resolveLocation(primary: URI, location: URI, token: CancellationToken): Promise<IResolvedFolderLocation | undefined> {
		for (const { provider, builtIn } of [...this.providers]) {
			try {
				const resolved = await provider.resolveLocation(primary, location, token);
				if (resolved) {
					return { ...resolved, providerId: provider.id, builtIn };
				}
			} catch (error) {
				// a failing provider must not hide the others
				onUnexpectedError(error);
			}
		}
		return undefined;
	}
}

registerSingleton(IWorkspaceFolderLocationService, WorkspaceFolderLocationService, InstantiationType.Delayed);
