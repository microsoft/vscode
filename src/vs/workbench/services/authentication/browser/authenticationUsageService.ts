/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

export interface IAccountUsage {
	extensionId: string;
	extensionName: string;
	lastUsed: number;
}

export const IAuthenticationUsageService = createDecorator<IAuthenticationUsageService>('IAuthenticationUsageService');
export interface IAuthenticationUsageService {
	readonly _serviceBrand: undefined;
	readAccountUsages(providerId: string, accountName: string,): IAccountUsage[];
	removeAccountUsage(providerId: string, accountName: string): void;
	addAccountUsage(providerId: string, accountName: string, extensionId: string, extensionName: string): void;
}

export class AuthenticationUsageService implements IAuthenticationUsageService {
	_serviceBrand: undefined;

	constructor(@IStorageService private readonly _storageService: IStorageService) { }

	readAccountUsages(providerId: string, accountName: string): IAccountUsage[] {
		const accountKey = `${providerId}-${accountName}-usages`;
		const storedUsages = this._storageService.get(accountKey, StorageScope.APPLICATION);
		let usages: IAccountUsage[] = [];
		if (storedUsages) {
			try {
				usages = JSON.parse(storedUsages);
			} catch (e) {
				// ignore
			}
		}

		return usages;
	}
	removeAccountUsage(providerId: string, accountName: string): void {
		const accountKey = `${providerId}-${accountName}-usages`;
		this._storageService.remove(accountKey, StorageScope.APPLICATION);
	}
	addAccountUsage(providerId: string, accountName: string, extensionId: string, extensionName: string): void {
		const accountKey = `${providerId}-${accountName}-usages`;
		const usages = this.readAccountUsages(providerId, accountName);

		const existingUsageIndex = usages.findIndex(usage => usage.extensionId === extensionId);
		if (existingUsageIndex > -1) {
			usages.splice(existingUsageIndex, 1, {
				extensionId,
				extensionName,
				lastUsed: Date.now()
			});
		} else {
			usages.push({
				extensionId,
				extensionName,
				lastUsed: Date.now()
			});
		}

		this._storageService.store(accountKey, JSON.stringify(usages), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerSingleton(IAuthenticationUsageService, AuthenticationUsageService, InstantiationType.Delayed);
