/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Disposable } from 'vscode';
import { toDisposable } from './util';
import { RemoteSourceProvider } from './api/git-base';
import { IRemoteSourceProviderRegistry } from './remoteProvider';

export class Model implements IRemoteSourceProviderRegistry {

	private remoteSourceProviders = new Set<RemoteSourceProvider>();

	private _onDidAddRemoteSourceProvider = new EventEmitter<RemoteSourceProvider>();
	readonly onDidAddRemoteSourceProvider = this._onDidAddRemoteSourceProvider.event;

	private _onDidRemoveRemoteSourceProvider = new EventEmitter<RemoteSourceProvider>();
	readonly onDidRemoveRemoteSourceProvider = this._onDidRemoveRemoteSourceProvider.event;

	registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable {
		this.remoteSourceProviders.add(provider);
		this._onDidAddRemoteSourceProvider.fire(provider);

		return toDisposable(() => {
			this.remoteSourceProviders.delete(provider);
			this._onDidRemoveRemoteSourceProvider.fire(provider);
		});
	}

	getRemoteProviders(): RemoteSourceProvider[] {
		return [...this.remoteSourceProviders.values()];
	}
}
