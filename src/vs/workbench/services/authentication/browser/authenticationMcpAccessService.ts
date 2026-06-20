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

/**
 * Compares two MCP server URLs for the purpose of access binding. They are compared by their canonical
 * WHATWG URL form, so cosmetic differences in the origin (host case, default port, encoding) and a root
 * trailing slash ("foo.com" vs "foo.com/") don't force a spurious re-consent — while a trailing slash on
 * a path ("foo.com/a" vs "foo.com/a/") is preserved as a meaningful difference between endpoints.
 */
export function urlsEqual(a: string | undefined, b: string | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (a === undefined || b === undefined) {
		return false;
	}
	try {
		return new URL(a).toString() === new URL(b).toString();
	} catch {
		return false;
	}
}

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
	/**
	 * The MCP server URL the grant was made for. A token is only released to a server whose current
	 * URL matches this, so changing the URL while keeping the same id requires the user to re-consent.
	 * Undefined for stdio servers, which have no URL.
	 */
	url?: string;
}

export const IAuthenticationMcpAccessService = createDecorator<IAuthenticationMcpAccessService>('IAuthenticationMcpAccessService');
export interface IAuthenticationMcpAccessService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeMcpSessionAccess: Event<{ providerId: string; accountName: string }>;

	/**
	 * Inspect the stored access decision for an MCP server, keyed by id alone. Used by management and
	 * inspection surfaces (e.g. the "Manage Trusted MCP Servers" UI) that operate on a server id without
	 * a live URL. For the security-critical token-release gate use {@link isAccessAllowedForUrl} instead.
	 * @param providerId The id of the authentication provider
	 * @param accountName The account name that access is checked for
	 * @param mcpServerId The id of the MCP server requesting access
	 * @returns Returns true or false if the user has opted to permanently grant or disallow access, and undefined
	 * if they haven't made a choice yet
	 */
	isAccessAllowed(providerId: string, accountName: string, mcpServerId: string): boolean | undefined;
	/**
	 * Gate for releasing a token to an HTTP MCP server. Access is only allowed if {@link mcpServerUrl}
	 * matches the URL stored when access was granted, so re-pointing a server at a new endpoint (while
	 * keeping the same id) requires the user to re-consent. `product.json`-trusted servers bypass the
	 * URL check. Only HTTP servers authenticate, so the URL is always known and therefore required.
	 * @param providerId The id of the authentication provider
	 * @param accountName The account name that access is checked for
	 * @param mcpServerId The id of the MCP server requesting access
	 * @param mcpServerUrl The MCP server's current URL
	 * @returns Returns true or false if the user has opted to permanently grant or disallow access, and undefined
	 * if they haven't made a choice yet (or the URL no longer matches the granted one)
	 */
	isAccessAllowedForUrl(providerId: string, accountName: string, mcpServerId: string, mcpServerUrl: string): boolean | undefined;
	readAllowedMcpServers(providerId: string, accountName: string): AllowedMcpServer[];
	updateAllowedMcpServers(providerId: string, accountName: string, mcpServers: AllowedMcpServer[]): void;
	removeAllowedMcpServers(providerId: string, accountName: string): void;
}

// TODO@TylerLeonhardt: Should this class only keep track of allowed things and throw away disallowed ones?
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
		return this._isAccessAllowed(providerId, accountName, mcpServerId, undefined);
	}

	isAccessAllowedForUrl(providerId: string, accountName: string, mcpServerId: string, mcpServerUrl: string): boolean | undefined {
		return this._isAccessAllowed(providerId, accountName, mcpServerId, mcpServerUrl);
	}

	private _isAccessAllowed(providerId: string, accountName: string, mcpServerId: string, mcpServerUrl: string | undefined): boolean | undefined {
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
		// A grant is bound to the URL it was made for: if the server now has a different URL, the user
		// must re-consent before a token is released to it.
		if (mcpServerUrl !== undefined && !urlsEqual(mcpServerData.url, mcpServerUrl)) {
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

		// Add trusted MCP servers from product.json if they're not already in the list
		const trustedMcpServerAuthAccess = this._productService.trustedMcpAuthAccess;
		const trustedMcpServerIds =
			// Case 1: trustedMcpServerAuthAccess is an array
			Array.isArray(trustedMcpServerAuthAccess)
				? trustedMcpServerAuthAccess
				// Case 2: trustedMcpServerAuthAccess is an object
				: typeof trustedMcpServerAuthAccess === 'object'
					? trustedMcpServerAuthAccess[providerId] ?? []
					: [];

		for (const mcpServerId of trustedMcpServerIds) {
			const existingServer = trustedMCPServers.find(server => server.id === mcpServerId);
			if (!existingServer) {
				// Add new trusted server (name will be set by caller if they have server info)
				trustedMCPServers.push({
					id: mcpServerId,
					name: mcpServerId, // Default to ID, caller can update with proper name
					allowed: true,
					trusted: true
				});
			} else {
				// Update existing server to be trusted
				existingServer.allowed = true;
				existingServer.trusted = true;
			}
		}

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
				// Update name if provided and not already set to a proper name
				if (mcpServer.name && mcpServer.name !== mcpServer.id && allowList[index].name !== mcpServer.name) {
					allowList[index].name = mcpServer.name;
				}
				// Only overwrite the URL when one is provided, so management toggles (which omit it) keep the binding.
				if (mcpServer.url !== undefined) {
					allowList[index].url = mcpServer.url;
				}
			}
		}

		// Filter out trusted servers before storing - they should only come from product.json, not user storage
		const userManagedServers = allowList.filter(server => !server.trusted);
		this._storageService.store(`mcpserver-${providerId}-${accountName}`, JSON.stringify(userManagedServers), StorageScope.APPLICATION, StorageTarget.USER);
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}

	removeAllowedMcpServers(providerId: string, accountName: string): void {
		this._storageService.remove(`mcpserver-${providerId}-${accountName}`, StorageScope.APPLICATION);
		this._onDidChangeMcpSessionAccess.fire({ providerId, accountName });
	}
}

registerSingleton(IAuthenticationMcpAccessService, AuthenticationMcpAccessService, InstantiationType.Delayed);
