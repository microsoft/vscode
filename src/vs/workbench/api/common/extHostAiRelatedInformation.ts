/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostAiRelatedInformationShape, IMainContext, MainContext, MainThreadAiRelatedInformationShape } from 'vs/workbench/api/common/extHost.protocol';
import type { CancellationToken, RelatedInformationProvider, RelatedInformationResult, RelatedInformationType } from 'vscode';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';

export class ExtHostRelatedInformation implements ExtHostAiRelatedInformationShape {
	private _relatedInformationProviders: Map<number, RelatedInformationProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadAiRelatedInformationShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAiRelatedInformation);
	}

	async $provideAiRelatedInformation(handle: number, query: string, types: RelatedInformationType[], token: CancellationToken): Promise<RelatedInformationResult[]> {
		if (this._relatedInformationProviders.size === 0) {
			throw new Error('No semantic similarity providers registered');
		}

		const provider = this._relatedInformationProviders.get(handle);
		if (!provider) {
			throw new Error('Semantic similarity provider not found');
		}

		// TODO: should this return undefined or an empty array?
		const result = await provider.provideRelatedInformation(query, types, token) ?? [];
		return result;
	}

	getRelatedInformation(extension: IExtensionDescription, query: string, types: RelatedInformationType[]): Promise<RelatedInformationResult[]> {
		return this._proxy.$getAiRelatedInformation(query, types);
	}

	registerRelatedInformationProvider(extension: IExtensionDescription, types: RelatedInformationType[], provider: RelatedInformationProvider): Disposable {
		const handle = this._nextHandle;
		this._nextHandle++;
		this._relatedInformationProviders.set(handle, provider);
		this._proxy.$registerAiRelatedInformationProvider(handle, types);
		return new Disposable(() => {
			this._proxy.$unregisterAiRelatedInformationProvider(handle);
			this._relatedInformationProviders.delete(handle);
		});
	}
}
