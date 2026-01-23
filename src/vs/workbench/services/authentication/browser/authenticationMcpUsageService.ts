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

export interface IAuthenticationMcpUsage {
	mcpServerId: string;
	mcpServerName: string;
	lastUsed: number;
	scopes?: string[];
}

export const IAuthenticationMcpUsageService = createDecorator<IAuthenticationMcpUsageService>('IAuthenticationMcpUsageService');
export interface IAuthenticationMcpUsageService {
	readonly _serviceBrand: undefined;
	/**
	 * Initializes the cache of MCP servers that use authentication. Ideally used in a contribution that can be run eventually after the workspace is loaded.
	 */
	initializeUsageCache(): Promise<void>;
	/**
	 * Checks if an MCP server uses authentication
	 * @param mcpServerId The id of the MCP server to check
	 */
	hasUsedAuth(mcpServerId: string): Promise<boolean>;
	/**
	 * Reads the usages for an account
	 * @param providerId The id of the authentication provider to get usages for
	 * @param accountName The name of the account to get usages for
	 */
	readAccountUsages(providerId: string, accountName: string,): IAuthenticationMcpUsage[];
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
	 * @param mcpServerId The id of the MCP server to add a usage for
	 * @param mcpServerName The name of the MCP server to add a usage for
	 */
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, mcpServerId: string, mcpServerName: string): void;
}

export class AuthenticationMcpUsageService extends Disposable implements IAuthenticationMcpUsageService {
	_serviceBrand: undefined;

	private _queue = new Queue();
	private _mcpServersUsingAuth = new Set<string>();

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IProductService productService: IProductService,
	) {
		super();

		// If an MCP server is listed in `trustedMcpAuthAccess` we should consider it as using auth
		const trustedMcpAuthAccess = productService.trustedMcpAuthAccess;
		if (Array.isArray(trustedMcpAuthAccess)) {
			for (const mcpServerId of trustedMcpAuthAccess) {
				this._mcpServersUsingAuth.add(mcpServerId);
			}
		} else if (trustedMcpAuthAccess) {
			for (const mcpServers of Object.values(trustedMcpAuthAccess)) {
				for (const mcpServerId of mcpServers) {
					this._mcpServersUsingAuth.add(mcpServerId);
				}
			}
		}

		this._register(this._authenticationService.onDidRegisterAuthenticationProvider(
			provider => this._queue.queue(
				() => this._addToCache(provider.id)
			)
		));
	}

	async initializeUsageCache(): Promise<void> {
		await this._queue.queue(() => Promise.all(this._authenticationService.getProviderIds().map(providerId => this._addToCache(providerId))));
	}

	async hasUsedAuth(mcpServerId: string): Promise<boolean> {
		await this._queue.whenIdle();
		return this._mcpServersUsingAuth.has(mcpServerId);
	}

	readAccountUsages(providerId: string, accountName: string): IAuthenticationMcpUsage[] {
		const accountKey = `${providerId}-${accountName}-mcpserver-usages`;
		const storedUsages = this._storageService.get(accountKey, StorageScope.APPLICATION);
		let usages: IAuthenticationMcpUsage[] = [];
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
		const accountKey = `${providerId}-${accountName}-mcpserver-usages`;
		this._storageService.remove(accountKey, StorageScope.APPLICATION);
	}

	addAccountUsage(providerId: string, accountName: string, scopes: string[], mcpServerId: string, mcpServerName: string): void {
		const accountKey = `${providerId}-${accountName}-mcpserver-usages`;
		const usages = this.readAccountUsages(providerId, accountName);

		const existingUsageIndex = usages.findIndex(usage => usage.mcpServerId === mcpServerId);
		if (existingUsageIndex > -1) {
			usages.splice(existingUsageIndex, 1, {
				mcpServerId,
				mcpServerName,
				scopes,
				lastUsed: Date.now()
			});
		} else {
			usages.push({
				mcpServerId,
				mcpServerName,
				scopes,
				lastUsed: Date.now()
			});
		}

		this._storageService.store(accountKey, JSON.stringify(usages), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._mcpServersUsingAuth.add(mcpServerId);
	}

	private async _addToCache(providerId: string) {
		try {
			const accounts = await this._authenticationService.getAccounts(providerId);
			for (const account of accounts) {
				const usage = this.readAccountUsages(providerId, account.label);
				for (const u of usage) {
					this._mcpServersUsingAuth.add(u.mcpServerId);
				}
			}
		} catch (e) {
			this._logService.error(e);
		}
	}
}

registerSingleton(IAuthenticationMcpUsageService, AuthenticationMcpUsageService, InstantiationType.Delayed);
