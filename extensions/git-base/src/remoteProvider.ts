/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event } from 'vscode';
import { RemoteSourceProvider } from './api/git-base';

export interface IRemoteSourceProviderRegistry {
	readonly onDidAddRemoteSourceProvider: Event<RemoteSourceProvider>;
	readonly onDidRemoveRemoteSourceProvider: Event<RemoteSourceProvider>;

	getRemoteProviders(): RemoteSourceProvider[];
	registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable;
}
