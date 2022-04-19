/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';

export const Extensions = {
	EmbedderApiContrib: 'workbench.web.embedder.api.contrib'
};

export interface IEmbedderApi {
}

type IEmbedderApiKey<T> = keyof T & string;

export interface IEmbedderApiDescriptor<T extends IEmbedderApi> {
	id: IEmbedderApiKey<T>;
	readonly descriptor: SyncDescriptor<T>;
}

export interface IEmbedderApiRegistry {
	/**
	 * Registers contribution for the Embedder API available to vscode-dev consumers
	 */
	register<T extends IEmbedderApi>(key: IEmbedderApiKey<T>, descriptor: SyncDescriptor<T>): void;

	/**
	 * Get Embedder API for vscode-dev consumers
	 */
	get<T extends IEmbedderApi>(key: IEmbedderApiKey<T>, instantiationService: IInstantiationService): T[IEmbedderApiKey<T>];
}

export class EmbedderApiRegistry implements IEmbedderApiRegistry {
	private _contributionApis = new Map<string, SyncDescriptor<IEmbedderApi>>();
	constructor() { }

	register<T extends IEmbedderApi>(key: IEmbedderApiKey<T>, descriptor: SyncDescriptor<T>) {
		if (!this._contributionApis.has(key)) {
			this._contributionApis.set(key, descriptor);
		}
	}

	get<T extends IEmbedderApi>(key: IEmbedderApiKey<T>, instantiationService: IInstantiationService): T[IEmbedderApiKey<T>] {
		if (this._contributionApis.has(key)) {
			const api = instantiationService.createInstance<T>(this._contributionApis.get(key)!.ctor);
			return (api as T)[key];
		}
		throw new Error(`Attempted to get API for ${key} before it was registered to EmbedderApiRegistry.`);
	}
}

Registry.add(Extensions.EmbedderApiContrib, new EmbedderApiRegistry());

