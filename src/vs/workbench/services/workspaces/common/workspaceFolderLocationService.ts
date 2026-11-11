/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable, Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFolderLocation, IResolvedFolderLocation, IWorkspaceFolderLocationProvider, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';

interface IRegisteredProvider {
	readonly provider: IWorkspaceFolderLocationProvider;
	readonly builtIn: boolean;
}

export class WorkspaceFolderLocationService extends Disposable implements IWorkspaceFolderLocationService {

	declare readonly _serviceBrand: undefined;

	private readonly providers: IRegisteredProvider[] = [];

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private _currentLocation: IResolvedFolderLocation | undefined;
	get currentLocation(): IResolvedFolderLocation | undefined { return this._currentLocation; }

	private readonly _onDidChangeCurrentLocation = this._register(new Emitter<void>());
	readonly onDidChangeCurrentLocation = this._onDidChangeCurrentLocation.event;

	setCurrentLocation(location: IResolvedFolderLocation | undefined): void {
		this._currentLocation = location;
		this._onDidChangeCurrentLocation.fire();
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
			} catch {
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
			} catch {
				// a failing provider must not hide the others
			}
		}
		return undefined;
	}
}

registerSingleton(IWorkspaceFolderLocationService, WorkspaceFolderLocationService, InstantiationType.Delayed);
