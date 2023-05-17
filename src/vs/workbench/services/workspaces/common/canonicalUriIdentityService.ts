/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICanonicalUriIdentityService, ICanonicalUriIdentityProvider } from 'vs/platform/workspace/common/canonicalUriIdentity';

export class CanonicalUriIdentityService implements ICanonicalUriIdentityService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ICanonicalUriIdentityProvider>();

	registerCanonicalUriIdentityProvider(provider: ICanonicalUriIdentityProvider): IDisposable {
		this._providers.set(provider.scheme, provider);
		return {
			dispose: () => this._providers.delete(provider.scheme)
		};
	}

	async provideCanonicalUriIdentity(uri: URI, token: CancellationToken): Promise<URI | undefined> {
		const provider = this._providers.get(uri.scheme);
		if (provider) {
			return provider.provideCanonicalUriIdentity(uri, token);
		}
		return undefined;
	}
}

registerSingleton(ICanonicalUriIdentityService, CanonicalUriIdentityService, InstantiationType.Delayed);
