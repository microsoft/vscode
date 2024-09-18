/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAuthenticationService } from '../common/authentication.js';

export interface IAccountUsage {
	extensionId: string;
	extensionName: string;
	lastUsed: number;
}

export const IAuthenticationUsageService = createDecorator<IAuthenticationUsageService>('IAuthenticationUsageService');
export interface IAuthenticationUsageService {
	readonly _serviceBrand: undefined;
	/**
	 * Initializes the cache of extensions that use authentication. Ideally used in a contribution that can be run eventually after the workspace is loaded.
	 */
	initializeExtensionUsageCache(): Promise<void>;
	/**
	 * Checks if an extension uses authentication
	 * @param extensionId The id of the extension to check
	 */
	extensionUsesAuth(extensionId: string): Promise<boolean>;
	/**
	 * Reads the usages for an account
	 * @param providerId The id of the authentication provider to get usages for
	 * @param accountName The name of the account to get usages for
	 */
	readAccountUsages(providerId: string, accountName: string,): IAccountUsage[];
	/**
	 *
	 * @param providerId The id of the authentication provider to get usages for
	 * @param accountName The name of the account to get usages for
	 */
	removeAccountUsage(providerId: string, accountName: string): void;
	/**
	 * Adds a usage for an account
	 * @param providerId The id of the authentication provider to get usages for
	 * @param accountName The name of the account to get usages for
	 * @param extensionId The id of the extension to add a usage for
	 * @param extensionName The name of the extension to add a usage for
	 */
	addAccountUsage(providerId: string, accountName: string, extensionId: string, extensionName: string): void;
}

export class AuthenticationUsageService implements IAuthenticationUsageService {
	_serviceBrand: undefined;

	private _initializedPromise: Promise<void> | undefined;
	private _extensionsUsingAuth = new Set<string>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
	) { }

	initializeExtensionUsageCache(): Promise<void> {
		return this._initExtensionsUsingAuth();
	}

	async extensionUsesAuth(extensionId: string): Promise<boolean> {
		await this._initExtensionsUsingAuth();
		return this._extensionsUsingAuth.has(extensionId);
	}

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
		this._extensionsUsingAuth.add(extensionId);
	}

	private _initExtensionsUsingAuth() {
		if (this._initializedPromise) {
			return this._initializedPromise;
		}

		// If an extension is listed in `trustedExtensionAuthAccess` we should consider it as using auth
		const trustedExtensionAuthAccess = this._productService.trustedExtensionAuthAccess;
		if (Array.isArray(trustedExtensionAuthAccess)) {
			for (const extensionId of trustedExtensionAuthAccess) {
				this._extensionsUsingAuth.add(extensionId);
			}
		} else if (trustedExtensionAuthAccess) {
			for (const extensions of Object.values(trustedExtensionAuthAccess)) {
				for (const extensionId of extensions) {
					this._extensionsUsingAuth.add(extensionId);
				}
			}
		}

		this._initializedPromise = (async () => {
			for (const providerId of this._authenticationService.getProviderIds()) {
				try {
					const accounts = await this._authenticationService.getAccounts(providerId);
					for (const account of accounts) {
						const usage = this.readAccountUsages(providerId, account.label);
						for (const u of usage) {
							this._extensionsUsingAuth.add(u.extensionId);
						}
					}
				} catch (e) {
					// ignore
				}
			}
		})();
		return this._initializedPromise;
	}
}

registerSingleton(IAuthenticationUsageService, AuthenticationUsageService, InstantiationType.Delayed);
