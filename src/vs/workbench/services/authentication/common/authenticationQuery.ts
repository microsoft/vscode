/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AuthenticationSessionAccount } from './authentication.js';

/**
 * Statistics about authentication usage
 */
export interface IAuthenticationUsageStats {
	readonly totalSessions: number;
	readonly totalAccounts: number;
	readonly recentActivity: {
		readonly accountName: string;
		readonly lastUsed: number;
		readonly usageCount: number;
	}[];
}

/**
 * Information about entities using authentication within a provider
 */
export interface IActiveEntities {
	readonly extensions: string[];
	readonly mcpServers: string[];
}

/**
 * Base query interface with common properties
 */
export interface IBaseQuery {
	readonly providerId: string;
}

/**
 * Query interface for operations on a specific account within a provider
 */
export interface IAccountQuery extends IBaseQuery {
	readonly accountName: string;

	/**
	 * Get operations for a specific extension on this account
	 * @param extensionId The extension id
	 * @returns An account-extension query interface
	 */
	extension(extensionId: string): IAccountExtensionQuery;

	/**
	 * Get operations for a specific MCP server on this account
	 * @param mcpServerId The MCP server id
	 * @returns An account-MCP server query interface
	 */
	mcpServer(mcpServerId: string): IAccountMcpServerQuery;

	/**
	 * Get operations for all extensions on this account
	 * @returns An account-extensions query interface
	 */
	extensions(): IAccountExtensionsQuery;

	/**
	 * Get operations for all MCP servers on this account
	 * @returns An account-MCP servers query interface
	 */
	mcpServers(): IAccountMcpServersQuery;

	/**
	 * Get operations for all entities (extensions and MCP servers) on this account
	 * @returns An account-entities query interface for type-agnostic operations
	 */
	entities(): IAccountEntitiesQuery;

	/**
	 * Remove all authentication data for this account
	 */
	remove(): void;
}

/**
 * Query interface for operations on a specific extension within a specific account
 */
export interface IAccountExtensionQuery extends IBaseQuery {
	readonly accountName: string;
	readonly extensionId: string;

	/**
	 * Check if this extension is allowed to access this account
	 * @returns True if allowed, false if denied, undefined if not yet decided
	 */
	isAccessAllowed(): boolean | undefined;

	/**
	 * Set access permission for this extension on this account
	 * @param allowed True to allow, false to deny access
	 * @param extensionName Optional extension name for display purposes
	 */
	setAccessAllowed(allowed: boolean, extensionName?: string): void;

	/**
	 * Add usage record for this extension on this account
	 * @param scopes The scopes that were used
	 * @param extensionName The extension name for display purposes
	 */
	addUsage(scopes: readonly string[], extensionName: string): void;

	/**
	 * Get usage history for this extension on this account
	 * @returns Array of usage records
	 */
	getUsage(): {
		readonly extensionId: string;
		readonly extensionName: string;
		readonly scopes: readonly string[];
		readonly lastUsed: number;
	}[];

	/**
	 * Remove all usage data for this extension on this account
	 */
	removeUsage(): void;

	/**
	 * Set this account as the preferred account for this extension
	 */
	setAsPreferred(): void;

	/**
	 * Check if this account is the preferred account for this extension
	 */
	isPreferred(): boolean;

	/**
	 * Check if this extension is trusted (defined in product.json)
	 * @returns True if the extension is trusted, false otherwise
	 */
	isTrusted(): boolean;
}

/**
 * Query interface for operations on a specific MCP server within a specific account
 */
export interface IAccountMcpServerQuery extends IBaseQuery {
	readonly accountName: string;
	readonly mcpServerId: string;

	/**
	 * Check if this MCP server is allowed to access this account
	 * @returns True if allowed, false if denied, undefined if not yet decided
	 */
	isAccessAllowed(): boolean | undefined;

	/**
	 * Set access permission for this MCP server on this account
	 * @param allowed True to allow, false to deny access
	 * @param mcpServerName Optional MCP server name for display purposes
	 */
	setAccessAllowed(allowed: boolean, mcpServerName?: string): void;

	/**
	 * Add usage record for this MCP server on this account
	 * @param scopes The scopes that were used
	 * @param mcpServerName The MCP server name for display purposes
	 */
	addUsage(scopes: readonly string[], mcpServerName: string): void;

	/**
	 * Get usage history for this MCP server on this account
	 * @returns Array of usage records
	 */
	getUsage(): {
		readonly mcpServerId: string;
		readonly mcpServerName: string;
		readonly scopes: readonly string[];
		readonly lastUsed: number;
	}[];

	/**
	 * Remove all usage data for this MCP server on this account
	 */
	removeUsage(): void;

	/**
	 * Set this account as the preferred account for this MCP server
	 */
	setAsPreferred(): void;

	/**
	 * Check if this account is the preferred account for this MCP server
	 */
	isPreferred(): boolean;

	/**
	 * Check if this MCP server is trusted (defined in product.json)
	 * @returns True if the MCP server is trusted, false otherwise
	 */
	isTrusted(): boolean;
}

/**
 * Query interface for operations on all extensions within a specific account
 */
export interface IAccountExtensionsQuery extends IBaseQuery {
	readonly accountName: string;

	/**
	 * Get all extensions that have access to this account with their trusted state
	 * @returns Array of objects containing extension data including trusted state
	 */
	getAllowedExtensions(): { id: string; name: string; allowed?: boolean; lastUsed?: number; trusted?: boolean }[];

	/**
	 * Grant access to this account for all specified extensions
	 * @param extensionIds Array of extension IDs to grant access to
	 */
	allowAccess(extensionIds: string[]): void;

	/**
	 * Remove access to this account for all specified extensions
	 * @param extensionIds Array of extension IDs to remove access from
	 */
	removeAccess(extensionIds: string[]): void;

	/**
	 * Execute a callback for each extension that has used this account
	 * @param callback Function to execute for each extension
	 */
	forEach(callback: (extensionQuery: IAccountExtensionQuery) => void): void;
}

/**
 * Query interface for operations on all MCP servers within a specific account
 */
export interface IAccountMcpServersQuery extends IBaseQuery {
	readonly accountName: string;

	/**
	 * Get all MCP servers that have access to this account with their trusted state
	 * @returns Array of objects containing MCP server data including trusted state
	 */
	getAllowedMcpServers(): { id: string; name: string; allowed?: boolean; lastUsed?: number; trusted?: boolean }[];

	/**
	 * Grant access to this account for all specified MCP servers
	 * @param mcpServerIds Array of MCP server IDs to grant access to
	 */
	allowAccess(mcpServerIds: string[]): void;

	/**
	 * Remove access to this account for all specified MCP servers
	 * @param mcpServerIds Array of MCP server IDs to remove access from
	 */
	removeAccess(mcpServerIds: string[]): void;

	/**
	 * Execute a callback for each MCP server that has used this account
	 * @param callback Function to execute for each MCP server
	 */
	forEach(callback: (mcpServerQuery: IAccountMcpServerQuery) => void): void;
}

/**
 * Query interface for type-agnostic operations on all entities (extensions and MCP servers) within a specific account
 */
export interface IAccountEntitiesQuery extends IBaseQuery {
	readonly accountName: string;

	/**
	 * Check if this account has been used by any entity (extension or MCP server)
	 * @returns True if the account has been used, false otherwise
	 */
	hasAnyUsage(): boolean;

	/**
	 * Get the total count of entities that have used this account
	 * @returns Object with counts for extensions and MCP servers
	 */
	getEntityCount(): { extensions: number; mcpServers: number; total: number };

	/**
	 * Remove access to this account for all entities (extensions and MCP servers)
	 */
	removeAllAccess(): void;

	/**
	 * Execute a callback for each entity that has used this account
	 * @param callback Function to execute for each entity
	 */
	forEach(callback: (entityId: string, entityType: 'extension' | 'mcpServer') => void): void;
}

/**
 * Query interface for operations on a specific extension within a provider
 */
export interface IProviderExtensionQuery extends IBaseQuery {
	readonly extensionId: string;

	/**
	 * Get the preferred account for this extension within this provider
	 * @returns The account name, or undefined if no preference is set
	 */
	getPreferredAccount(): string | undefined;

	/**
	 * Set the preferred account for this extension within this provider
	 * @param account The account to set as preferred
	 */
	setPreferredAccount(account: AuthenticationSessionAccount): void;

	/**
	 * Remove the account preference for this extension within this provider
	 */
	removeAccountPreference(): void;
}

/**
 * Query interface for operations on a specific MCP server within a provider
 */
export interface IProviderMcpServerQuery extends IBaseQuery {
	readonly mcpServerId: string;

	/**
	 * Get the last used account for this MCP server within a provider
	 * @returns The account name, or undefined if no preference is set
	 */
	getLastUsedAccount(): Promise<string | undefined>;

	/**
	 * Get the preferred account for this MCP server within a provider
	 * @returns The account name, or undefined if no preference is set
	 */
	getPreferredAccount(): string | undefined;

	/**
	 * Set the preferred account for this MCP server within a provider
	 * @param account The account to set as preferred
	 */
	setPreferredAccount(account: AuthenticationSessionAccount): void;

	/**
	 * Remove the account preference for this MCP server within a provider
	 */
	removeAccountPreference(): void;

	/**
	 * Get all accounts that this MCP server has used within this provider
	 * @returns Array of account names
	 */
	getUsedAccounts(): Promise<string[]>;
}

/**
 * Query interface for provider-scoped operations
 */
export interface IProviderQuery extends IBaseQuery {
	/**
	 * Get operations for a specific account within this provider
	 * @param accountName The account name
	 * @returns An account query interface
	 */
	account(accountName: string): IAccountQuery;

	/**
	 * Get operations for a specific extension within this provider
	 * @param extensionId The extension id
	 * @returns A provider-extension query interface
	 */
	extension(extensionId: string): IProviderExtensionQuery;

	/**
	 * Get operations for a specific MCP server within this provider
	 * @param mcpServerId The MCP server id
	 * @returns A provider-MCP server query interface
	 */
	mcpServer(mcpServerId: string): IProviderMcpServerQuery;

	/**
	 * Get information about active entities (extensions and MCP servers) within this provider
	 * @returns Information about entities that have used authentication
	 */
	getActiveEntities(): Promise<IActiveEntities>;

	/**
	 * Get all account names for this provider
	 * @returns Array of account names
	 */
	getAccountNames(): Promise<string[]>;

	/**
	 * Get usage statistics for this provider
	 * @returns Usage statistics
	 */
	getUsageStats(): Promise<IAuthenticationUsageStats>;

	/**
	 * Execute a callback for each account in this provider
	 * @param callback Function to execute for each account
	 */
	forEachAccount(callback: (accountQuery: IAccountQuery) => void): Promise<void>;
}

/**
 * Query interface for extension-scoped operations (cross-provider)
 */
export interface IExtensionQuery {
	readonly extensionId: string;

	/**
	 * Get all providers where this extension has access
	 * @param includeInternal Whether to include internal providers (starting with INTERNAL_AUTH_PROVIDER_PREFIX)
	 * @returns Array of provider IDs
	 */
	getProvidersWithAccess(includeInternal?: boolean): Promise<string[]>;

	/**
	 * Get account preferences for this extension across all providers
	 * @param includeInternal Whether to include internal providers (starting with INTERNAL_AUTH_PROVIDER_PREFIX)
	 * @returns Map of provider ID to account name
	 */
	getAllAccountPreferences(includeInternal?: boolean): Map<string, string>;

	/**
	 * Get operations for this extension within a specific provider
	 * @param providerId The provider ID
	 * @returns A provider-extension query interface
	 */
	provider(providerId: string): IProviderExtensionQuery;
}

/**
 * Query interface for MCP server-scoped operations (cross-provider)
 */
export interface IMcpServerQuery {
	readonly mcpServerId: string;

	/**
	 * Get all providers where this MCP server has access
	 * @param includeInternal Whether to include internal providers (starting with INTERNAL_AUTH_PROVIDER_PREFIX)
	 * @returns Array of provider IDs
	 */
	getProvidersWithAccess(includeInternal?: boolean): Promise<string[]>;

	/**
	 * Get account preferences for this MCP server across all providers
	 * @param includeInternal Whether to include internal providers (starting with INTERNAL_AUTH_PROVIDER_PREFIX)
	 * @returns Map of provider ID to account name
	 */
	getAllAccountPreferences(includeInternal?: boolean): Map<string, string>;

	/**
	 * Get operations for this MCP server within a specific provider
	 * @param providerId The provider ID
	 * @returns A provider-MCP server query interface
	 */
	provider(providerId: string): IProviderMcpServerQuery;
}

/**
 * Main authentication query service interface
 */
export const IAuthenticationQueryService = createDecorator<IAuthenticationQueryService>('IAuthenticationQueryService');
export interface IAuthenticationQueryService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when authentication preferences change
	 */
	readonly onDidChangePreferences: Event<{
		readonly providerId: string;
		readonly entityType: 'extension' | 'mcpServer';
		readonly entityIds: string[];
	}>;

	/**
	 * Fires when authentication access permissions change
	 */
	readonly onDidChangeAccess: Event<{
		readonly providerId: string;
		readonly accountName: string;
	}>;

	/**
	 * Get operations for a specific authentication provider
	 * @param providerId The authentication provider id
	 * @returns A provider query interface
	 */
	provider(providerId: string): IProviderQuery;

	/**
	 * Get operations for a specific extension across all providers
	 * @param extensionId The extension id
	 * @returns An extension query interface
	 */
	extension(extensionId: string): IExtensionQuery;

	/**
	 * Get operations for a specific MCP server across all providers
	 * @param mcpServerId The MCP server id
	 * @returns An MCP server query interface
	 */
	mcpServer(mcpServerId: string): IMcpServerQuery;

	/**
	 * Get all available provider IDs
	 * @returns Array of provider IDs
	 */
	getProviderIds(): string[];

	/**
	 * Clear all authentication data (for testing/debugging purposes)
	 * @param confirmation Must be 'CLEAR_ALL_AUTH_DATA' to confirm
	 * @param includeInternal Whether to include internal providers (defaults to true for complete clearing)
	 */
	clearAllData(confirmation: 'CLEAR_ALL_AUTH_DATA', includeInternal?: boolean): Promise<void>;
}
