/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkerBasedDocumentDiffProvider } from 'vs/editor/browser/widget/diffEditor/workerBasedDocumentDiffProvider';
import { IDocumentDiffProvider } from 'vs/editor/common/diff/documentDiffProvider';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IDiffProviderFactoryService = createDecorator<IDiffProviderFactoryService>('diffProviderFactoryService');

export interface IDocumentDiffProviderOptions {
	readonly diffAlgorithm?: 'legacy' | 'advanced';
}

export interface IDiffProviderFactoryService {
	readonly _serviceBrand: undefined;
	createDiffProvider(options: IDocumentDiffProviderOptions): IDocumentDiffProvider;
}

export class DiffProviderFactoryService implements IDiffProviderFactoryService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createDiffProvider(options: IDocumentDiffProviderOptions): IDocumentDiffProvider {
		return this.instantiationService.createInstance(WorkerBasedDocumentDiffProvider, options);
	}
}

registerSingleton(IDiffProviderFactoryService, DiffProviderFactoryService, InstantiationType.Delayed);
