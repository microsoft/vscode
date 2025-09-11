/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AuthenticationSessionAccount, IAuthenticationService, IAuthenticationExtensionsService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../common/authentication.js';
import {
	IAuthenticationQueryService,
	IProviderQuery,
	IAccountQuery,
	IAccountExtensionQuery,
	IAccountMcpServerQuery,
	IAccountExtensionsQuery,
	IAccountMcpServersQuery,
	IAccountEntitiesQuery,
	IProviderExtensionQuery,
	IProviderMcpServerQuery,
	IExtensionQuery,
	IMcpServerQuery,
	IActiveEntities,
	IAuthenticationUsageStats,
	IBaseQuery
} from '../common/authenticationQuery.js';
import { IAuthenticationUsageService } from './authenticationUsageService.js';
import { IAuthenticationMcpUsageService } from './authenticationMcpUsageService.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { IAuthenticationMcpAccessService } from './authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from './authenticationMcpService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

/**
 * Base implementation for query interfaces
 */
abstract class BaseQuery implements IBaseQuery {
	constructor(
		public readonly providerId: string,
		protected readonly queryService: AuthenticationQueryService
	) { }
}

/**
 * Implementation of account-extension query operations
 */
class AccountExtensionQuery extends BaseQuery implements IAccountExtensionQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		public readonly extensionId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	isAccessAllowed(): boolean | undefined {
		return this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, this.extensionId);
	}

	setAccessAllowed(allowed: boolean, extensionName?: string): void {
		this.queryService.authenticationAccessService.updateAllowedExtensions(
			this.providerId,
			this.accountName,
			[{ id: this.extensionId, name: extensionName || this.extensionId, allowed }]
		);
	}

	addUsage(scopes: readonly string[], extensionName: string): void {
		this.queryService.authenticationUsageService.addAccountUsage(
			this.providerId,
			this.accountName,
			scopes,
			this.extensionId,
			extensionName
		);
	}

	getUsage(): {
		readonly extensionId: string;
		readonly extensionName: string;
		readonly scopes: readonly string[];
		readonly lastUsed: number;
	}[] {
		const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
		return allUsages
			.filter(usage => usage.extensionId === ExtensionIdentifier.toKey(this.extensionId))
			.map(usage => ({
				extensionId: usage.extensionId,
				extensionName: usage.extensionName,
				scopes: usage.scopes || [],
				lastUsed: usage.lastUsed
			}));
	}

	removeUsage(): void {
		// Get current usages, filter out this extension, and store the rest
		const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
		const filteredUsages = allUsages.filter(usage => usage.extensionId !== this.extensionId);

		// Clear all usages and re-add the filtered ones
		this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
		for (const usage of filteredUsages) {
			this.queryService.authenticationUsageService.addAccountUsage(
				this.providerId,
				this.accountName,
				usage.scopes || [],
				usage.extensionId,
				usage.extensionName
			);
		}
	}

	setAsPreferred(): void {
		this.queryService.authenticationExtensionsService.updateAccountPreference(
			this.extensionId,
			this.providerId,
			{ label: this.accountName, id: this.accountName }
		);
	}

	isPreferred(): boolean {
		const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
		return preferredAccount === this.accountName;
	}

	isTrusted(): boolean {
		const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
		const extension = allowedExtensions.find(ext => ext.id === this.extensionId);
		return extension?.trusted === true;
	}
}

/**
 * Implementation of account-MCP server query operations
 */
class AccountMcpServerQuery extends BaseQuery implements IAccountMcpServerQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		public readonly mcpServerId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	isAccessAllowed(): boolean | undefined {
		return this.queryService.authenticationMcpAccessService.isAccessAllowed(this.providerId, this.accountName, this.mcpServerId);
	}

	setAccessAllowed(allowed: boolean, mcpServerName?: string): void {
		this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(
			this.providerId,
			this.accountName,
			[{ id: this.mcpServerId, name: mcpServerName || this.mcpServerId, allowed }]
		);
	}

	addUsage(scopes: readonly string[], mcpServerName: string): void {
		this.queryService.authenticationMcpUsageService.addAccountUsage(
			this.providerId,
			this.accountName,
			scopes,
			this.mcpServerId,
			mcpServerName
		);
	}

	getUsage(): {
		readonly mcpServerId: string;
		readonly mcpServerName: string;
		readonly scopes: readonly string[];
		readonly lastUsed: number;
	}[] {
		const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
		return allUsages
			.filter(usage => usage.mcpServerId === this.mcpServerId)
			.map(usage => ({
				mcpServerId: usage.mcpServerId,
				mcpServerName: usage.mcpServerName,
				scopes: usage.scopes || [],
				lastUsed: usage.lastUsed
			}));
	}

	removeUsage(): void {
		// Get current usages, filter out this MCP server, and store the rest
		const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
		const filteredUsages = allUsages.filter(usage => usage.mcpServerId !== this.mcpServerId);

		// Clear all usages and re-add the filtered ones
		this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
		for (const usage of filteredUsages) {
			this.queryService.authenticationMcpUsageService.addAccountUsage(
				this.providerId,
				this.accountName,
				usage.scopes || [],
				usage.mcpServerId,
				usage.mcpServerName
			);
		}
	}

	setAsPreferred(): void {
		this.queryService.authenticationMcpService.updateAccountPreference(
			this.mcpServerId,
			this.providerId,
			{ label: this.accountName, id: this.accountName }
		);
	}

	isPreferred(): boolean {
		const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
		return preferredAccount === this.accountName;
	}

	isTrusted(): boolean {
		const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
		const mcpServer = allowedMcpServers.find(server => server.id === this.mcpServerId);
		return mcpServer?.trusted === true;
	}
}

/**
 * Implementation of account-extensions query operations
 */
class AccountExtensionsQuery extends BaseQuery implements IAccountExtensionsQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	getAllowedExtensions(): { id: string; name: string; allowed?: boolean; lastUsed?: number; trusted?: boolean }[] {
		const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
		const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);

		return allowedExtensions
			.filter(ext => ext.allowed !== false)
			.map(ext => {
				// Find the most recent usage for this extension
				const extensionUsages = usages.filter(usage => usage.extensionId === ext.id);
				const lastUsed = extensionUsages.length > 0 ? Math.max(...extensionUsages.map(u => u.lastUsed)) : undefined;

				// Check if trusted through the extension query
				const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, ext.id, this.queryService);
				const trusted = extensionQuery.isTrusted();

				return {
					id: ext.id,
					name: ext.name,
					allowed: ext.allowed,
					lastUsed,
					trusted
				};
			});
	}

	allowAccess(extensionIds: string[]): void {
		const extensionsToAllow = extensionIds.map(id => ({ id, name: id, allowed: true }));
		this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToAllow);
	}

	removeAccess(extensionIds: string[]): void {
		const extensionsToRemove = extensionIds.map(id => ({ id, name: id, allowed: false }));
		this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToRemove);
	}

	forEach(callback: (extensionQuery: IAccountExtensionQuery) => void): void {
		const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
		const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);

		// Combine extensions from both usage and access data
		const extensionIds = new Set<string>();
		usages.forEach(usage => extensionIds.add(usage.extensionId));
		allowedExtensions.forEach(ext => extensionIds.add(ext.id));

		for (const extensionId of extensionIds) {
			const extensionQuery = new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
			callback(extensionQuery);
		}
	}
}

/**
 * Implementation of account-MCP servers query operations
 */
class AccountMcpServersQuery extends BaseQuery implements IAccountMcpServersQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	getAllowedMcpServers(): { id: string; name: string; allowed?: boolean; lastUsed?: number; trusted?: boolean }[] {
		return this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName)
			.filter(server => server.allowed !== false);
	}

	allowAccess(mcpServerIds: string[]): void {
		const mcpServersToAllow = mcpServerIds.map(id => ({ id, name: id, allowed: true }));
		this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToAllow);
	}

	removeAccess(mcpServerIds: string[]): void {
		const mcpServersToRemove = mcpServerIds.map(id => ({ id, name: id, allowed: false }));
		this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToRemove);
	}

	forEach(callback: (mcpServerQuery: IAccountMcpServerQuery) => void): void {
		const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
		const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);

		// Combine MCP servers from both usage and access data
		const mcpServerIds = new Set<string>();
		usages.forEach(usage => mcpServerIds.add(usage.mcpServerId));
		allowedMcpServers.forEach(server => mcpServerIds.add(server.id));

		for (const mcpServerId of mcpServerIds) {
			const mcpServerQuery = new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
			callback(mcpServerQuery);
		}
	}
}

/**
 * Implementation of account-entities query operations for type-agnostic operations
 */
class AccountEntitiesQuery extends BaseQuery implements IAccountEntitiesQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	hasAnyUsage(): boolean {
		// Check extension usage
		const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
		if (extensionUsages.length > 0) {
			return true;
		}

		// Check MCP server usage
		const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
		if (mcpUsages.length > 0) {
			return true;
		}

		// Check extension access
		const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
		if (allowedExtensions.some(ext => ext.allowed !== false)) {
			return true;
		}

		// Check MCP server access
		const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
		if (allowedMcpServers.some(server => server.allowed !== false)) {
			return true;
		}

		return false;
	}

	getEntityCount(): { extensions: number; mcpServers: number; total: number } {
		// Use the same logic as getAllEntities to count all entities with usage or access
		const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
		const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName).filter(ext => ext.allowed);
		const extensionIds = new Set<string>();
		extensionUsages.forEach(usage => extensionIds.add(usage.extensionId));
		allowedExtensions.forEach(ext => extensionIds.add(ext.id));

		const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
		const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter(server => server.allowed);
		const mcpServerIds = new Set<string>();
		mcpUsages.forEach(usage => mcpServerIds.add(usage.mcpServerId));
		allowedMcpServers.forEach(server => mcpServerIds.add(server.id));

		const extensionCount = extensionIds.size;
		const mcpServerCount = mcpServerIds.size;

		return {
			extensions: extensionCount,
			mcpServers: mcpServerCount,
			total: extensionCount + mcpServerCount
		};
	}

	removeAllAccess(): void {
		// Remove all extension access
		const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
		const extensions = extensionsQuery.getAllowedExtensions();
		const extensionIds = extensions.map(ext => ext.id);
		if (extensionIds.length > 0) {
			extensionsQuery.removeAccess(extensionIds);
		}

		// Remove all MCP server access
		const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
		const mcpServers = mcpServersQuery.getAllowedMcpServers();
		const mcpServerIds = mcpServers.map(server => server.id);
		if (mcpServerIds.length > 0) {
			mcpServersQuery.removeAccess(mcpServerIds);
		}
	}

	forEach(callback: (entityId: string, entityType: 'extension' | 'mcpServer') => void): void {
		// Iterate over extensions
		const extensionsQuery = new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
		extensionsQuery.forEach(extensionQuery => {
			callback(extensionQuery.extensionId, 'extension');
		});

		// Iterate over MCP servers
		const mcpServersQuery = new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
		mcpServersQuery.forEach(mcpServerQuery => {
			callback(mcpServerQuery.mcpServerId, 'mcpServer');
		});
	}
}

/**
 * Implementation of account query operations
 */
class AccountQuery extends BaseQuery implements IAccountQuery {
	constructor(
		providerId: string,
		public readonly accountName: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	extension(extensionId: string): IAccountExtensionQuery {
		return new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
	}

	mcpServer(mcpServerId: string): IAccountMcpServerQuery {
		return new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
	}

	extensions(): IAccountExtensionsQuery {
		return new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
	}

	mcpServers(): IAccountMcpServersQuery {
		return new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
	}

	entities(): IAccountEntitiesQuery {
		return new AccountEntitiesQuery(this.providerId, this.accountName, this.queryService);
	}

	remove(): void {
		// Remove all extension access and usage data
		this.queryService.authenticationAccessService.removeAllowedExtensions(this.providerId, this.accountName);
		this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);

		// Remove all MCP server access and usage data
		this.queryService.authenticationMcpAccessService.removeAllowedMcpServers(this.providerId, this.accountName);
		this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
	}
}

/**
 * Implementation of provider-extension query operations
 */
class ProviderExtensionQuery extends BaseQuery implements IProviderExtensionQuery {
	constructor(
		providerId: string,
		public readonly extensionId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	getPreferredAccount(): string | undefined {
		return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
	}

	setPreferredAccount(account: AuthenticationSessionAccount): void {
		this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, account);
	}

	removeAccountPreference(): void {
		this.queryService.authenticationExtensionsService.removeAccountPreference(this.extensionId, this.providerId);
	}
}

/**
 * Implementation of provider-MCP server query operations
 */
class ProviderMcpServerQuery extends BaseQuery implements IProviderMcpServerQuery {
	constructor(
		providerId: string,
		public readonly mcpServerId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	async getLastUsedAccount(): Promise<string | undefined> {
		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
			let lastUsedAccount: string | undefined;
			let lastUsedTime = 0;

			for (const account of accounts) {
				const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
				const mcpServerUsages = usages.filter(usage => usage.mcpServerId === this.mcpServerId);

				for (const usage of mcpServerUsages) {
					if (usage.lastUsed > lastUsedTime) {
						lastUsedTime = usage.lastUsed;
						lastUsedAccount = account.label;
					}
				}
			}

			return lastUsedAccount;
		} catch {
			return undefined;
		}
	}

	getPreferredAccount(): string | undefined {
		return this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
	}

	setPreferredAccount(account: AuthenticationSessionAccount): void {
		this.queryService.authenticationMcpService.updateAccountPreference(this.mcpServerId, this.providerId, account);
	}

	removeAccountPreference(): void {
		this.queryService.authenticationMcpService.removeAccountPreference(this.mcpServerId, this.providerId);
	}

	async getUsedAccounts(): Promise<string[]> {
		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
			const usedAccounts: string[] = [];

			for (const account of accounts) {
				const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
				if (usages.some(usage => usage.mcpServerId === this.mcpServerId)) {
					usedAccounts.push(account.label);
				}
			}

			return usedAccounts;
		} catch {
			return [];
		}
	}
}

/**
 * Implementation of provider query operations
 */
class ProviderQuery extends BaseQuery implements IProviderQuery {
	constructor(
		providerId: string,
		queryService: AuthenticationQueryService
	) {
		super(providerId, queryService);
	}

	account(accountName: string): IAccountQuery {
		return new AccountQuery(this.providerId, accountName, this.queryService);
	}

	extension(extensionId: string): IProviderExtensionQuery {
		return new ProviderExtensionQuery(this.providerId, extensionId, this.queryService);
	}

	mcpServer(mcpServerId: string): IProviderMcpServerQuery {
		return new ProviderMcpServerQuery(this.providerId, mcpServerId, this.queryService);
	}

	async getActiveEntities(): Promise<IActiveEntities> {
		const extensions: string[] = [];
		const mcpServers: string[] = [];

		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);

			for (const account of accounts) {
				// Get extension usages
				const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
				for (const usage of extensionUsages) {
					if (!extensions.includes(usage.extensionId)) {
						extensions.push(usage.extensionId);
					}
				}

				// Get MCP server usages
				const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
				for (const usage of mcpUsages) {
					if (!mcpServers.includes(usage.mcpServerId)) {
						mcpServers.push(usage.mcpServerId);
					}
				}
			}
		} catch {
			// Return empty arrays if there's an error
		}

		return { extensions, mcpServers };
	}

	async getAccountNames(): Promise<string[]> {
		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
			return accounts.map(account => account.label);
		} catch {
			return [];
		}
	}

	async getUsageStats(): Promise<IAuthenticationUsageStats> {
		const recentActivity: { accountName: string; lastUsed: number; usageCount: number }[] = [];
		let totalSessions = 0;
		let totalAccounts = 0;

		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
			totalAccounts = accounts.length;

			for (const account of accounts) {
				const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, account.label);
				const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);

				const allUsages = [...extensionUsages, ...mcpUsages];
				const usageCount = allUsages.length;
				const lastUsed = Math.max(...allUsages.map(u => u.lastUsed), 0);

				if (usageCount > 0) {
					recentActivity.push({ accountName: account.label, lastUsed, usageCount });
				}
			}

			// Sort by most recent activity
			recentActivity.sort((a, b) => b.lastUsed - a.lastUsed);

			// Count total sessions (approximate)
			totalSessions = recentActivity.reduce((sum, activity) => sum + activity.usageCount, 0);
		} catch {
			// Return default stats if there's an error
		}

		return { totalSessions, totalAccounts, recentActivity };
	}

	async forEachAccount(callback: (accountQuery: IAccountQuery) => void): Promise<void> {
		try {
			const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
			for (const account of accounts) {
				const accountQuery = new AccountQuery(this.providerId, account.label, this.queryService);
				callback(accountQuery);
			}
		} catch {
			// Silently handle errors in enumeration
		}
	}
}

/**
 * Implementation of extension query operations (cross-provider)
 */
class ExtensionQuery implements IExtensionQuery {
	constructor(
		public readonly extensionId: string,
		private readonly queryService: AuthenticationQueryService
	) { }

	async getProvidersWithAccess(includeInternal?: boolean): Promise<string[]> {
		const providersWithAccess: string[] = [];
		const providerIds = this.queryService.authenticationService.getProviderIds();

		for (const providerId of providerIds) {
			// Skip internal providers unless explicitly requested
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}

			try {
				const accounts = await this.queryService.authenticationService.getAccounts(providerId);
				const hasAccess = accounts.some(account => {
					const accessAllowed = this.queryService.authenticationAccessService.isAccessAllowed(providerId, account.label, this.extensionId);
					return accessAllowed === true;
				});

				if (hasAccess) {
					providersWithAccess.push(providerId);
				}
			} catch {
				// Skip providers that error
			}
		}

		return providersWithAccess;
	}

	getAllAccountPreferences(includeInternal?: boolean): Map<string, string> {
		const preferences = new Map<string, string>();
		const providerIds = this.queryService.authenticationService.getProviderIds();

		for (const providerId of providerIds) {
			// Skip internal providers unless explicitly requested
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}

			const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, providerId);
			if (preferredAccount) {
				preferences.set(providerId, preferredAccount);
			}
		}

		return preferences;
	}

	provider(providerId: string): IProviderExtensionQuery {
		return new ProviderExtensionQuery(providerId, this.extensionId, this.queryService);
	}
}

/**
 * Implementation of MCP server query operations (cross-provider)
 */
class McpServerQuery implements IMcpServerQuery {
	constructor(
		public readonly mcpServerId: string,
		private readonly queryService: AuthenticationQueryService
	) { }

	async getProvidersWithAccess(includeInternal?: boolean): Promise<string[]> {
		const providersWithAccess: string[] = [];
		const providerIds = this.queryService.authenticationService.getProviderIds();

		for (const providerId of providerIds) {
			// Skip internal providers unless explicitly requested
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}

			try {
				const accounts = await this.queryService.authenticationService.getAccounts(providerId);
				const hasAccess = accounts.some(account => {
					const accessAllowed = this.queryService.authenticationMcpAccessService.isAccessAllowed(providerId, account.label, this.mcpServerId);
					return accessAllowed === true;
				});

				if (hasAccess) {
					providersWithAccess.push(providerId);
				}
			} catch {
				// Skip providers that error
			}
		}

		return providersWithAccess;
	}

	getAllAccountPreferences(includeInternal?: boolean): Map<string, string> {
		const preferences = new Map<string, string>();
		const providerIds = this.queryService.authenticationService.getProviderIds();

		for (const providerId of providerIds) {
			// Skip internal providers unless explicitly requested
			if (!includeInternal && providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
				continue;
			}

			const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, providerId);
			if (preferredAccount) {
				preferences.set(providerId, preferredAccount);
			}
		}

		return preferences;
	}

	provider(providerId: string): IProviderMcpServerQuery {
		return new ProviderMcpServerQuery(providerId, this.mcpServerId, this.queryService);
	}
}

/**
 * Main implementation of the authentication query service
 */
export class AuthenticationQueryService extends Disposable implements IAuthenticationQueryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangePreferences = this._register(new Emitter<{
		readonly providerId: string;
		readonly entityType: 'extension' | 'mcpServer';
		readonly entityIds: string[];
	}>());
	readonly onDidChangePreferences = this._onDidChangePreferences.event;

	private readonly _onDidChangeAccess = this._register(new Emitter<{
		readonly providerId: string;
		readonly accountName: string;
	}>());
	readonly onDidChangeAccess = this._onDidChangeAccess.event;

	constructor(
		@IAuthenticationService public readonly authenticationService: IAuthenticationService,
		@IAuthenticationUsageService public readonly authenticationUsageService: IAuthenticationUsageService,
		@IAuthenticationMcpUsageService public readonly authenticationMcpUsageService: IAuthenticationMcpUsageService,
		@IAuthenticationAccessService public readonly authenticationAccessService: IAuthenticationAccessService,
		@IAuthenticationMcpAccessService public readonly authenticationMcpAccessService: IAuthenticationMcpAccessService,
		@IAuthenticationExtensionsService public readonly authenticationExtensionsService: IAuthenticationExtensionsService,
		@IAuthenticationMcpService public readonly authenticationMcpService: IAuthenticationMcpService,
		@ILogService public readonly logService: ILogService
	) {
		super();

		// Forward events from underlying services
		this._register(this.authenticationExtensionsService.onDidChangeAccountPreference(e => {
			this._onDidChangePreferences.fire({
				providerId: e.providerId,
				entityType: 'extension',
				entityIds: e.extensionIds
			});
		}));

		this._register(this.authenticationMcpService.onDidChangeAccountPreference(e => {
			this._onDidChangePreferences.fire({
				providerId: e.providerId,
				entityType: 'mcpServer',
				entityIds: e.mcpServerIds
			});
		}));

		this._register(this.authenticationAccessService.onDidChangeExtensionSessionAccess(e => {
			this._onDidChangeAccess.fire({
				providerId: e.providerId,
				accountName: e.accountName
			});
		}));

		this._register(this.authenticationMcpAccessService.onDidChangeMcpSessionAccess(e => {
			this._onDidChangeAccess.fire({
				providerId: e.providerId,
				accountName: e.accountName
			});
		}));
	}

	provider(providerId: string): IProviderQuery {
		return new ProviderQuery(providerId, this);
	}

	extension(extensionId: string): IExtensionQuery {
		return new ExtensionQuery(extensionId, this);
	}

	mcpServer(mcpServerId: string): IMcpServerQuery {
		return new McpServerQuery(mcpServerId, this);
	}

	getProviderIds(includeInternal?: boolean): string[] {
		return this.authenticationService.getProviderIds().filter(providerId => {
			// Filter out internal providers unless explicitly included
			return includeInternal || !providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX);
		});
	}

	async clearAllData(confirmation: 'CLEAR_ALL_AUTH_DATA', includeInternal: boolean = true): Promise<void> {
		if (confirmation !== 'CLEAR_ALL_AUTH_DATA') {
			throw new Error('Must provide confirmation string to clear all authentication data');
		}

		const providerIds = this.getProviderIds(includeInternal);

		for (const providerId of providerIds) {
			try {
				const accounts = await this.authenticationService.getAccounts(providerId);

				for (const account of accounts) {
					// Clear extension data
					this.authenticationAccessService.removeAllowedExtensions(providerId, account.label);
					this.authenticationUsageService.removeAccountUsage(providerId, account.label);

					// Clear MCP server data
					this.authenticationMcpAccessService.removeAllowedMcpServers(providerId, account.label);
					this.authenticationMcpUsageService.removeAccountUsage(providerId, account.label);
				}
			} catch (error) {
				this.logService.error(`Error clearing data for provider ${providerId}:`, error);
			}
		}

		this.logService.info('All authentication data cleared');
	}
}

registerSingleton(IAuthenticationQueryService, AuthenticationQueryService, InstantiationType.Delayed);
