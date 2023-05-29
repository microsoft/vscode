/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostSemanticSimilarityShape, IMainContext, MainContext, MainThreadSemanticSimilarityShape } from 'vs/workbench/api/common/extHost.protocol';
import type { CancellationToken, SemanticSimilarityProvider } from 'vscode';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostSemanticSimilarity implements ExtHostSemanticSimilarityShape {
	private _semanticSimilarityProviders: Map<number, SemanticSimilarityProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadSemanticSimilarityShape;

	constructor(
		mainContext: IMainContext
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSemanticSimilarity);
	}

	async $provideSimilarityScore(handle: number, string1: string, comparisons: string[], token: CancellationToken): Promise<number[]> {
		if (this._semanticSimilarityProviders.size === 0) {
			throw new Error('No semantic similarity providers registered');
		}

		const provider = this._semanticSimilarityProviders.get(handle);
		if (!provider) {
			throw new Error('Semantic similarity provider not found');
		}

		const result = await provider.provideSimilarityScore(string1, comparisons, token);
		return result;
	}

	registerSemanticSimilarityProvider(extension: IExtensionDescription, provider: SemanticSimilarityProvider): Disposable {
		const handle = this._nextHandle;
		this._nextHandle++;
		this._semanticSimilarityProviders.set(handle, provider);
		this._proxy.$registerSemanticSimilarityProvider(handle);
		return new Disposable(() => {
			this._proxy.$unregisterSemanticSimilarityProvider(handle);
			this._semanticSimilarityProviders.delete(handle);
		});
	}
}
