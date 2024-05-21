/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostAiEmbeddingVectorShape, IMainContext, MainContext, MainThreadAiEmbeddingVectorShape } from 'vs/workbench/api/common/extHost.protocol';
import type { CancellationToken, EmbeddingVectorProvider } from 'vscode';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostAiEmbeddingVector implements ExtHostAiEmbeddingVectorShape {
	private _AiEmbeddingVectorProviders: Map<number, EmbeddingVectorProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadAiEmbeddingVectorShape;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAiEmbeddingVector);
	}

	async $provideAiEmbeddingVector(handle: number, strings: string[], token: CancellationToken): Promise<number[][]> {
		if (this._AiEmbeddingVectorProviders.size === 0) {
			throw new Error('No embedding vector providers registered');
		}

		const provider = this._AiEmbeddingVectorProviders.get(handle);
		if (!provider) {
			throw new Error('Embedding vector provider not found');
		}

		const result = await provider.provideEmbeddingVector(strings, token);
		if (!result) {
			throw new Error('Embedding vector provider returned undefined');
		}
		return result;
	}

	registerEmbeddingVectorProvider(extension: IExtensionDescription, model: string, provider: EmbeddingVectorProvider): Disposable {
		const handle = this._nextHandle;
		this._nextHandle++;
		this._AiEmbeddingVectorProviders.set(handle, provider);
		this._proxy.$registerAiEmbeddingVectorProvider(model, handle);
		return new Disposable(() => {
			this._proxy.$unregisterAiEmbeddingVectorProvider(handle);
			this._AiEmbeddingVectorProviders.delete(handle);
		});
	}
}
