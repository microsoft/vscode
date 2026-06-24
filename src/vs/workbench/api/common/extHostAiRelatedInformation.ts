/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostAiRelatedInformationShape, IMainContext, MainContext, MainThreadAiRelatedInformationShape } from './extHost.protocol.js';
import type { CancellationToken, RelatedInformationProvider, RelatedInformationType, RelatedInformationResult } from 'vscode';
import { Disposable } from './extHostTypes.js';

export class ExtHostRelatedInformation implements ExtHostAiRelatedInformationShape {
	private _relatedInformationProviders: Map<number, RelatedInformationProvider> = new Map();
	private _nextHandle = 0;

	private readonly _proxy: MainThreadAiRelatedInformationShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAiRelatedInformation);
	}

	async $provideAiRelatedInformation(handle: number, query: string, token: CancellationToken): Promise<RelatedInformationResult[]> {
		if (this._relatedInformationProviders.size === 0) {
			throw new Error('No related information providers registered');
		}

		const provider = this._relatedInformationProviders.get(handle);
		if (!provider) {
			throw new Error('related information provider not found');
		}

		const result = await provider.provideRelatedInformation(query, token) ?? [];
		return result;
	}

	getRelatedInformation(extension: IExtensionDescription, query: string, types: RelatedInformationType[]): Promise<RelatedInformationResult[]> {
		return this._proxy.$getAiRelatedInformation(query, types);
	}

	registerRelatedInformationProvider(extension: IExtensionDescription, type: RelatedInformationType, provider: RelatedInformationProvider): Disposable {
		const handle = this._nextHandle;
		this._nextHandle++;
		this._relatedInformationProviders.set(handle, provider);
		this._proxy.$registerAiRelatedInformationProvider(handle, type);
		return new Disposable(() => {
			this._proxy.$unregisterAiRelatedInformationProvider(handle);
			this._relatedInformationProviders.delete(handle);
		});
	}
}
