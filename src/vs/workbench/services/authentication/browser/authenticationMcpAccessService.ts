/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export interface AllowedMcpServer {
	id: string;
	name: string;
	/**
	 * If true or undefined, the extension is allowed to use the account
	 * If false, the extension is not allowed to use the account
	 * TODO: undefined shouldn't be a valid value, but it is for now
	 */
	allowed?: boolean;
	lastUsed?: number;
	// If true, this comes from the product.json
	trusted?: boolean;
}

export const IAuthenticationMcpAccessService = createDecorator<IAuthenticationMcpAccessService>('IAuthenticationMcpAccessService');
export interface IAuthenticationMcpAccessService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeMcpSessionAccess: Event<{ providerId: string; accountName: string }>;

	/**
	 * Check MCP server access to an account
	 * @param providerId The id of the authentication provider
	 * @param accountName The account name that access is checked for
	 * @param mcpServerId The id of the MCP server requesting access
	 * @returns Returns true or false if the user has opted to permanently grant or disallow access, and undefined
	 * if they haven't made a choice yet
	 */
	isAccessAllowed(providerId: string, accountName: string, mcpServerId: string): boolean | undefined;
	readAllowedMcpServers(providerId: string, accountName: string): AllowedMcpServer[];
	updateAllowedMcpServers(providerId: string, accountName: string, mcpServers: AllowedMcpServer[]): void;
	removeAllowedMcpServers(providerId: string, accountName: string): void;
}

export class AuthenticationMcpAccessService extends Disposable implements IAuthenticationMcpAccessService {
	_serviceBrand: undefined;

	private _onDidChangeMcpSessionAccess: Emitter<{ providerId: string; accountName: string }> = this._register(new Emitter<{ providerId: string; accountName: string }>());
	readonly onDidChangeMcpSessionAccess: Event<{ providerId: string; accountName: string }> = this._onDidChangeMcpSessionAccess.event;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IProductService private readonly _productService: IProductService
	) {
		super();
	}

	isAccessAllowed(providerId: string, accountName: string, mcpServerId: string): boolean | undefined {
		const trustedMCPServerAuthAccess = this._productService.trustedMcpAuthAccess;
		if (Array.isArray(trustedMCPServerAuthAccess)) {
			if (trustedMCPServerAuthAccess.includes(mcpServerId)) {
				return true;
			}
		} else if (trustedMCPServerAuthAccess?.[providerId]?.includes(mcpServerId)) {
			return true;
		}

		const allowList = this.readAllowedMcpServers(providerId, accountName);
		const mcpServerData = allowList.find(mcpServer => mcpServer.id === mcpServerId);
		if (!mcpServerData) {
			return undefined;
		}
		// This property didn't exist on this data previously, inclusion in the list at all indicates allowance
		return mcpServerData.allowed !== undefined
			? mcpServerData.allowed
			: true;
	}

	readAllowedMcpServers(providerId: string, accountName: string): AllowedMcpServer[] {
		let trustedMCPServers: AllowedMcpServer[] = [];
		try {
			const trustedMCPServerSrc = this._storageService.get(`mcpserver-${providerId}-${accountName}`, StorageScope.APPLICATION);
			if (trustedMCPServerSrc) {
				trustedMCPServers = JSON.parse(trustedMCPServerSrc);
			}
		} catch (err) { }

		return trustedMCPServers;
	}

	updateAllowedMcpServers(providerId: string, accountName: string, mcpServers: AllowedMcpServer[]): void {
		const allowList = this.readAllowedMcpServers(providerId, accountName);
		for (const mcpServer of mcpServers) {
			const index = allowList.findIndex(e => e.id === mcpServer.id);
			if (index === -1) {
				allowList.push(mcpServer);
			} else {
				allowList[index].allowed = mcpServer.allowed;
			}
		}
		this._storageService.store(`mcpserver-${providerId}-${accountName}`, JSON.stringify(allowList), StorageScope.APPLICATION, StorageTarget.USER);
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}

	removeAllowedMcpServers(providerId: string, accountName: string): void {
		this._storageService.remove(`mcpserver-${providerId}-${accountName}`, StorageScope.APPLICATION);
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}
}

registerSingleton(IAuthenticationMcpAccessService, AuthenticationMcpAccessService, InstantiationType.Delayed);
