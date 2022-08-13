/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICanonicalWorkspaceIdentityProvider, ICanonicalWorkspaceService } from 'vs/platform/workspace/common/canonicalWorkspace';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export class CanonicalWorkspaceService implements ICanonicalWorkspaceService {
	readonly _serviceBrand: undefined;

	private _canonicalWorkspaceIdentifierProviders = new Map<string, ICanonicalWorkspaceIdentityProvider>();

	constructor() { }

	registerCanonicalWorkspaceIdentityProvider(provider: ICanonicalWorkspaceIdentityProvider): void {
		this._canonicalWorkspaceIdentifierProviders.set(provider.scheme, provider);
	}

	async getCanonicalWorkspaceIdentifier(workspaceFolder: IWorkspaceFolder, cancellationTokenSource: CancellationTokenSource): Promise<string | null> {
		const { scheme } = workspaceFolder.uri;
		const provider = this._canonicalWorkspaceIdentifierProviders.get(scheme);
		if (!provider) {
			return null;
		}
		return provider.getCanonicalWorkspaceIdentifier(workspaceFolder, cancellationTokenSource.token);
	}
}

registerSingleton(ICanonicalWorkspaceService, CanonicalWorkspaceService);
