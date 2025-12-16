/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WindowIdleValue } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { TRUSTED_DOMAINS_STORAGE_KEY, readStaticTrustedDomains } from './trustedDomains.js';
import { isURLDomainTrusted } from '../common/trustedDomains.js';
import { Event, Emitter } from '../../../../base/common/event.js';

export const ITrustedDomainService = createDecorator<ITrustedDomainService>('ITrustedDomainService');

export interface ITrustedDomainService {
	_serviceBrand: undefined;
	readonly onDidChangeTrustedDomains: Event<void>;
	isValid(resource: URI): boolean;
}

export class TrustedDomainService extends Disposable implements ITrustedDomainService {
	_serviceBrand: undefined;

	private _staticTrustedDomainsResult!: WindowIdleValue<string[]>;

	private _onDidChangeTrustedDomains: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeTrustedDomains: Event<void> = this._onDidChangeTrustedDomains.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		const initStaticDomainsResult = () => {
			return new WindowIdleValue(mainWindow, () => {
				const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
				return [
					...defaultTrustedDomains,
					...trustedDomains
				];
			});
		};
		this._staticTrustedDomainsResult = initStaticDomainsResult();
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, TRUSTED_DOMAINS_STORAGE_KEY, this._store)(() => {
			this._staticTrustedDomainsResult?.dispose();
			this._staticTrustedDomainsResult = initStaticDomainsResult();
			this._onDidChangeTrustedDomains.fire();
		}));
	}

	isValid(resource: URI): boolean {
		const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
		const allTrustedDomains = [...defaultTrustedDomains, ...trustedDomains];

		return isURLDomainTrusted(resource, allTrustedDomains);
	}
}
