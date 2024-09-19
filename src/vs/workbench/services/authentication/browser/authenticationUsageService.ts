/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
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

export class AuthenticationUsageService extends Disposable implements IAuthenticationUsageService {
	_serviceBrand: undefined;

	private _queue = new Queue();
	private _extensionsUsingAuth = new Set<string>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IProductService productService: IProductService,
	) {
		super();

		// If an extension is listed in `trustedExtensionAuthAccess` we should consider it as using auth
		const trustedExtensionAuthAccess = productService.trustedExtensionAuthAccess;
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

		this._authenticationService.onDidRegisterAuthenticationProvider(
			provider => this._queue.queue(
				() => this._addExtensionsToCache(provider.id)
			)
		);
	}

	async initializeExtensionUsageCache(): Promise<void> {
		await this._queue.queue(() => Promise.all(this._authenticationService.getProviderIds().map(providerId => this._addExtensionsToCache(providerId))));
	}

	async extensionUsesAuth(extensionId: string): Promise<boolean> {
		await this._queue.whenIdle();
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

	private async _addExtensionsToCache(providerId: string) {
		try {
			const accounts = await this._authenticationService.getAccounts(providerId);
			for (const account of accounts) {
				const usage = this.readAccountUsages(providerId, account.label);
				for (const u of usage) {
					this._extensionsUsingAuth.add(u.extensionId);
				}
			}
		} catch (e) {
			this._logService.error(e);
		}
	}
}

registerSingleton(IAuthenticationUsageService, AuthenticationUsageService, InstantiationType.Delayed);
