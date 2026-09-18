/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IEmbeddingsProvider {
	provideEmbeddings(input: string[], token: CancellationToken): Promise<{ values: number[] }[]>;
}

export const IEmbeddingsService = createDecorator<IEmbeddingsService>('embeddingsService');

export interface IEmbeddingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly allProviders: Iterable<string>;
	registerProvider(id: string, provider: IEmbeddingsProvider): IDisposable;
	computeEmbeddings(id: string, input: string[], token: CancellationToken): Promise<{ values: number[] }[]>;
}

export class EmbeddingsService extends Disposable implements IEmbeddingsService {
	declare readonly _serviceBrand: undefined;
	private readonly providers = new Map<string, IEmbeddingsProvider>();
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	get allProviders(): Iterable<string> {
		return this.providers.keys();
	}

	registerProvider(id: string, provider: IEmbeddingsProvider): IDisposable {
		this.providers.set(id, provider);
		this._onDidChange.fire();
		return toDisposable(() => {
			if (this.providers.get(id) === provider) {
				this.providers.delete(id);
				this._onDidChange.fire();
			}
		});
	}

	computeEmbeddings(id: string, input: string[], token: CancellationToken): Promise<{ values: number[] }[]> {
		if (token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		const provider = this.providers.get(id);
		return provider
			? provider.provideEmbeddings(input, token)
			: Promise.reject(new Error(`No embeddings provider registered with id: ${id}`));
	}

	override dispose(): void {
		this.providers.clear();
		super.dispose();
	}
}

registerSingleton(IEmbeddingsService, EmbeddingsService, InstantiationType.Delayed);
