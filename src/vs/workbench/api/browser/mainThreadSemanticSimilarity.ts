/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostSemanticSimilarityShape, MainContext, MainThreadSemanticSimilarityShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ISemanticSimilarityProvider, ISemanticSimilarityService } from 'vs/workbench/services/semanticSimilarity/common/semanticSimilarityService';

@extHostNamedCustomer(MainContext.MainThreadSemanticSimilarity)
export class MainThreadSemanticSimilarity extends Disposable implements MainThreadSemanticSimilarityShape {
	private readonly _proxy: ExtHostSemanticSimilarityShape;
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		context: IExtHostContext,
		@ISemanticSimilarityService private readonly _semanticSimilarityService: ISemanticSimilarityService
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostSemanticSimilarity);
	}

	$registerSemanticSimilarityProvider(handle: number): void {
		const provider: ISemanticSimilarityProvider = {
			provideSimilarityScore: (string1, comparisons, token) => {
				return this._proxy.$provideSimilarityScore(handle, string1, comparisons, token);
			},
		};
		this._registrations.set(handle, this._semanticSimilarityService.registerSemanticSimilarityProvider(provider));
	}

	$unregisterSemanticSimilarityProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}
}
