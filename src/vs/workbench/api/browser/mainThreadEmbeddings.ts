/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableMap, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostContext, ExtHostEmbeddingsShape, MainContext, MainThreadEmbeddingsShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';


interface IEmbeddingsProvider {
	provideEmbeddings(input: string[], token: CancellationToken): Promise<{ values: number[] }[]>;
}

const IEmbeddingsService = createDecorator<IEmbeddingsService>('embeddingsService');

interface IEmbeddingsService {

	_serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	allProviders: Iterable<string>;

	registerProvider(id: string, provider: IEmbeddingsProvider): IDisposable;

	computeEmbeddings(id: string, input: string[], token: CancellationToken): Promise<{ values: number[] }[]>;
}

class EmbeddingsService implements IEmbeddingsService {
	_serviceBrand: undefined;

	private providers: Map<string, IEmbeddingsProvider>;

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor() {
		this.providers = new Map<string, IEmbeddingsProvider>();
	}

	get allProviders(): Iterable<string> {
		return this.providers.keys();
	}

	registerProvider(id: string, provider: IEmbeddingsProvider): IDisposable {
		this.providers.set(id, provider);
		this._onDidChange.fire();
		return {
			dispose: () => {
				this.providers.delete(id);
				this._onDidChange.fire();
			}
		};
	}

	computeEmbeddings(id: string, input: string[], token: CancellationToken): Promise<{ values: number[] }[]> {
		const provider = this.providers.get(id);
		if (provider) {
			return provider.provideEmbeddings(input, token);
		} else {
			return Promise.reject(new Error(`No embeddings provider registered with id: ${id}`));
		}
	}
}


registerSingleton(IEmbeddingsService, EmbeddingsService, InstantiationType.Delayed);

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

		this._store.add(embeddingsService.onDidChange((() => {
			this._proxy.$acceptEmbeddingModels(Array.from(embeddingsService.allProviders));
		})));
	}

	dispose(): void {
		this._store.dispose();
	}

	$registerEmbeddingProvider(handle: number, identifier: string): void {
		const registration = this.embeddingsService.registerProvider(identifier, {
			provideEmbeddings: (input: string[], token: CancellationToken): Promise<{ values: number[] }[]> => {
				return this._proxy.$provideEmbeddings(handle, input, token);
			}
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
