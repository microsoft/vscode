/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { ExtHostContext, ExtHostEmbeddingsShape, MainContext, MainThreadEmbeddingsShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IEmbeddingsService } from '../../services/embeddings/common/embeddingsService.js';

@extHostNamedCustomer(MainContext.MainThreadEmbeddings)
export class MainThreadEmbeddings implements MainThreadEmbeddingsShape {

	private readonly _store = new DisposableStore();
	private readonly _providers = this._store.add(new DisposableMap<number>);
	private readonly _proxy: ExtHostEmbeddingsShape;

	constructor(
		context: IExtHostContext,
		@IEmbeddingsService private readonly embeddingsService: IEmbeddingsService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostEmbeddings);
		this._store.add(embeddingsService.onDidChange(() => {
			this._proxy.$acceptEmbeddingModels(Array.from(embeddingsService.allProviders));
		}));
	}

	dispose(): void {
		this._store.dispose();
	}

	$registerEmbeddingProvider(handle: number, identifier: string): void {
		const registration = this.embeddingsService.registerProvider(identifier, {
			provideEmbeddings: (input: string[], token: CancellationToken): Promise<{ values: number[] }[]> =>
				this._proxy.$provideEmbeddings(handle, input, token),
		});
		this._providers.set(handle, registration);
	}

	$unregisterEmbeddingProvider(handle: number): void {
		this._providers.deleteAndDispose(handle);
	}

	$computeEmbeddings(embeddingsModel: string, input: string[], token: CancellationToken): Promise<{ values: number[] }[]> {
		return this.embeddingsService.computeEmbeddings(embeddingsModel, input, token);
	}
}
