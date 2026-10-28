/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICanonicalUriService, ICanonicalUriProvider } from '../../../../platform/workspace/common/canonicalUri.js';

/** Created at startup so Workspace Trust and extension hosts share one provider registry. */
export class CanonicalUriService extends Disposable implements ICanonicalUriService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRegisterCanonicalUriProvider = this._register(new Emitter<string>());
	readonly onDidRegisterCanonicalUriProvider = this._onDidRegisterCanonicalUriProvider.event;

	private readonly _providers = new Map<string, ICanonicalUriProvider>();

	registerCanonicalUriProvider(provider: ICanonicalUriProvider): IDisposable {
		this._providers.set(provider.scheme, provider);
		this._onDidRegisterCanonicalUriProvider.fire(provider.scheme);
		return {
			dispose: () => {
				if (this._providers.get(provider.scheme) === provider) {
					this._providers.delete(provider.scheme);
				}
			}
		};
	}

	async provideCanonicalUri(uri: URI, targetScheme: string, token: CancellationToken): Promise<URI | undefined> {
		const provider = this._providers.get(uri.scheme);
		if (provider) {
			const canonicalUri = await provider.provideCanonicalUri(uri, targetScheme, token);
			return this._providers.get(uri.scheme) === provider ? canonicalUri : undefined;
		}
		return undefined;
	}
}
