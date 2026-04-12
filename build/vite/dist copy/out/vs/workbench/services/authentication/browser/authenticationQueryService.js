/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService, IAuthenticationExtensionsService, INTERNAL_AUTH_PROVIDER_PREFIX } from '../common/authentication.js';
import { IAuthenticationQueryService } from '../common/authenticationQuery.js';
import { IAuthenticationUsageService } from './authenticationUsageService.js';
import { IAuthenticationMcpUsageService } from './authenticationMcpUsageService.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { IAuthenticationMcpAccessService } from './authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from './authenticationMcpService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
/**
 * Base implementation for query interfaces
 */
class BaseQuery {
    constructor(providerId, queryService) {
        this.providerId = providerId;
        this.queryService = queryService;
    }
}
/**
 * Implementation of account-extension query operations
 */
class AccountExtensionQuery extends BaseQuery {
    constructor(providerId, accountName, extensionId, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
        this.extensionId = extensionId;
    }
    isAccessAllowed() {
        return this.queryService.authenticationAccessService.isAccessAllowed(this.providerId, this.accountName, this.extensionId);
    }
    setAccessAllowed(allowed, extensionName) {
        this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, [{ id: this.extensionId, name: extensionName || this.extensionId, allowed }]);
    }
    addUsage(scopes, extensionName) {
        this.queryService.authenticationUsageService.addAccountUsage(this.providerId, this.accountName, scopes, this.extensionId, extensionName);
    }
    getUsage() {
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
    removeUsage() {
        // Get current usages, filter out this extension, and store the rest
        const allUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
        const filteredUsages = allUsages.filter(usage => usage.extensionId !== this.extensionId);
        // Clear all usages and re-add the filtered ones
        this.queryService.authenticationUsageService.removeAccountUsage(this.providerId, this.accountName);
        for (const usage of filteredUsages) {
            this.queryService.authenticationUsageService.addAccountUsage(this.providerId, this.accountName, usage.scopes || [], usage.extensionId, usage.extensionName);
        }
    }
    setAsPreferred() {
        this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, { label: this.accountName, id: this.accountName });
    }
    isPreferred() {
        const preferredAccount = this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
        return preferredAccount === this.accountName;
    }
    isTrusted() {
        const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
        const extension = allowedExtensions.find(ext => ext.id === this.extensionId);
        return extension?.trusted === true;
    }
}
/**
 * Implementation of account-MCP server query operations
 */
class AccountMcpServerQuery extends BaseQuery {
    constructor(providerId, accountName, mcpServerId, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
        this.mcpServerId = mcpServerId;
    }
    isAccessAllowed() {
        return this.queryService.authenticationMcpAccessService.isAccessAllowed(this.providerId, this.accountName, this.mcpServerId);
    }
    setAccessAllowed(allowed, mcpServerName) {
        this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, [{ id: this.mcpServerId, name: mcpServerName || this.mcpServerId, allowed }]);
    }
    addUsage(scopes, mcpServerName) {
        this.queryService.authenticationMcpUsageService.addAccountUsage(this.providerId, this.accountName, scopes, this.mcpServerId, mcpServerName);
    }
    getUsage() {
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
    removeUsage() {
        // Get current usages, filter out this MCP server, and store the rest
        const allUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
        const filteredUsages = allUsages.filter(usage => usage.mcpServerId !== this.mcpServerId);
        // Clear all usages and re-add the filtered ones
        this.queryService.authenticationMcpUsageService.removeAccountUsage(this.providerId, this.accountName);
        for (const usage of filteredUsages) {
            this.queryService.authenticationMcpUsageService.addAccountUsage(this.providerId, this.accountName, usage.scopes || [], usage.mcpServerId, usage.mcpServerName);
        }
    }
    setAsPreferred() {
        this.queryService.authenticationMcpService.updateAccountPreference(this.mcpServerId, this.providerId, { label: this.accountName, id: this.accountName });
    }
    isPreferred() {
        const preferredAccount = this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
        return preferredAccount === this.accountName;
    }
    isTrusted() {
        const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
        const mcpServer = allowedMcpServers.find(server => server.id === this.mcpServerId);
        return mcpServer?.trusted === true;
    }
}
/**
 * Implementation of account-extensions query operations
 */
class AccountExtensionsQuery extends BaseQuery {
    constructor(providerId, accountName, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
    }
    getAllowedExtensions() {
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
    allowAccess(extensionIds) {
        const extensionsToAllow = extensionIds.map(id => ({ id, name: id, allowed: true }));
        this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToAllow);
    }
    removeAccess(extensionIds) {
        const extensionsToRemove = extensionIds.map(id => ({ id, name: id, allowed: false }));
        this.queryService.authenticationAccessService.updateAllowedExtensions(this.providerId, this.accountName, extensionsToRemove);
    }
    forEach(callback) {
        const usages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
        const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName);
        // Combine extensions from both usage and access data
        const extensionIds = new Set();
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
class AccountMcpServersQuery extends BaseQuery {
    constructor(providerId, accountName, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
    }
    getAllowedMcpServers() {
        return this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName)
            .filter(server => server.allowed !== false);
    }
    allowAccess(mcpServerIds) {
        const mcpServersToAllow = mcpServerIds.map(id => ({ id, name: id, allowed: true }));
        this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToAllow);
    }
    removeAccess(mcpServerIds) {
        const mcpServersToRemove = mcpServerIds.map(id => ({ id, name: id, allowed: false }));
        this.queryService.authenticationMcpAccessService.updateAllowedMcpServers(this.providerId, this.accountName, mcpServersToRemove);
    }
    forEach(callback) {
        const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
        const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName);
        // Combine MCP servers from both usage and access data
        const mcpServerIds = new Set();
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
class AccountEntitiesQuery extends BaseQuery {
    constructor(providerId, accountName, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
    }
    hasAnyUsage() {
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
    getEntityCount() {
        // Use the same logic as getAllEntities to count all entities with usage or access
        const extensionUsages = this.queryService.authenticationUsageService.readAccountUsages(this.providerId, this.accountName);
        const allowedExtensions = this.queryService.authenticationAccessService.readAllowedExtensions(this.providerId, this.accountName).filter(ext => ext.allowed);
        const extensionIds = new Set();
        extensionUsages.forEach(usage => extensionIds.add(usage.extensionId));
        allowedExtensions.forEach(ext => extensionIds.add(ext.id));
        const mcpUsages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, this.accountName);
        const allowedMcpServers = this.queryService.authenticationMcpAccessService.readAllowedMcpServers(this.providerId, this.accountName).filter(server => server.allowed);
        const mcpServerIds = new Set();
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
    removeAllAccess() {
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
    forEach(callback) {
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
class AccountQuery extends BaseQuery {
    constructor(providerId, accountName, queryService) {
        super(providerId, queryService);
        this.accountName = accountName;
    }
    extension(extensionId) {
        return new AccountExtensionQuery(this.providerId, this.accountName, extensionId, this.queryService);
    }
    mcpServer(mcpServerId) {
        return new AccountMcpServerQuery(this.providerId, this.accountName, mcpServerId, this.queryService);
    }
    extensions() {
        return new AccountExtensionsQuery(this.providerId, this.accountName, this.queryService);
    }
    mcpServers() {
        return new AccountMcpServersQuery(this.providerId, this.accountName, this.queryService);
    }
    entities() {
        return new AccountEntitiesQuery(this.providerId, this.accountName, this.queryService);
    }
    remove() {
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
class ProviderExtensionQuery extends BaseQuery {
    constructor(providerId, extensionId, queryService) {
        super(providerId, queryService);
        this.extensionId = extensionId;
    }
    getPreferredAccount() {
        return this.queryService.authenticationExtensionsService.getAccountPreference(this.extensionId, this.providerId);
    }
    setPreferredAccount(account) {
        this.queryService.authenticationExtensionsService.updateAccountPreference(this.extensionId, this.providerId, account);
    }
    removeAccountPreference() {
        this.queryService.authenticationExtensionsService.removeAccountPreference(this.extensionId, this.providerId);
    }
}
/**
 * Implementation of provider-MCP server query operations
 */
class ProviderMcpServerQuery extends BaseQuery {
    constructor(providerId, mcpServerId, queryService) {
        super(providerId, queryService);
        this.mcpServerId = mcpServerId;
    }
    async getLastUsedAccount() {
        try {
            const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
            let lastUsedAccount;
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
        }
        catch {
            return undefined;
        }
    }
    getPreferredAccount() {
        return this.queryService.authenticationMcpService.getAccountPreference(this.mcpServerId, this.providerId);
    }
    setPreferredAccount(account) {
        this.queryService.authenticationMcpService.updateAccountPreference(this.mcpServerId, this.providerId, account);
    }
    removeAccountPreference() {
        this.queryService.authenticationMcpService.removeAccountPreference(this.mcpServerId, this.providerId);
    }
    async getUsedAccounts() {
        try {
            const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
            const usedAccounts = [];
            for (const account of accounts) {
                const usages = this.queryService.authenticationMcpUsageService.readAccountUsages(this.providerId, account.label);
                if (usages.some(usage => usage.mcpServerId === this.mcpServerId)) {
                    usedAccounts.push(account.label);
                }
            }
            return usedAccounts;
        }
        catch {
            return [];
        }
    }
}
/**
 * Implementation of provider query operations
 */
class ProviderQuery extends BaseQuery {
    constructor(providerId, queryService) {
        super(providerId, queryService);
    }
    account(accountName) {
        return new AccountQuery(this.providerId, accountName, this.queryService);
    }
    extension(extensionId) {
        return new ProviderExtensionQuery(this.providerId, extensionId, this.queryService);
    }
    mcpServer(mcpServerId) {
        return new ProviderMcpServerQuery(this.providerId, mcpServerId, this.queryService);
    }
    async getActiveEntities() {
        const extensions = [];
        const mcpServers = [];
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
        }
        catch {
            // Return empty arrays if there's an error
        }
        return { extensions, mcpServers };
    }
    async getAccountNames() {
        try {
            const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
            return accounts.map(account => account.label);
        }
        catch {
            return [];
        }
    }
    async getUsageStats() {
        const recentActivity = [];
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
        }
        catch {
            // Return default stats if there's an error
        }
        return { totalSessions, totalAccounts, recentActivity };
    }
    async forEachAccount(callback) {
        try {
            const accounts = await this.queryService.authenticationService.getAccounts(this.providerId);
            for (const account of accounts) {
                const accountQuery = new AccountQuery(this.providerId, account.label, this.queryService);
                callback(accountQuery);
            }
        }
        catch {
            // Silently handle errors in enumeration
        }
    }
}
/**
 * Implementation of extension query operations (cross-provider)
 */
class ExtensionQuery {
    constructor(extensionId, queryService) {
        this.extensionId = extensionId;
        this.queryService = queryService;
    }
    async getProvidersWithAccess(includeInternal) {
        const providersWithAccess = [];
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
            }
            catch {
                // Skip providers that error
            }
        }
        return providersWithAccess;
    }
    getAllAccountPreferences(includeInternal) {
        const preferences = new Map();
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
    provider(providerId) {
        return new ProviderExtensionQuery(providerId, this.extensionId, this.queryService);
    }
}
/**
 * Implementation of MCP server query operations (cross-provider)
 */
class McpServerQuery {
    constructor(mcpServerId, queryService) {
        this.mcpServerId = mcpServerId;
        this.queryService = queryService;
    }
    async getProvidersWithAccess(includeInternal) {
        const providersWithAccess = [];
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
            }
            catch {
                // Skip providers that error
            }
        }
        return providersWithAccess;
    }
    getAllAccountPreferences(includeInternal) {
        const preferences = new Map();
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
    provider(providerId) {
        return new ProviderMcpServerQuery(providerId, this.mcpServerId, this.queryService);
    }
}
/**
 * Main implementation of the authentication query service
 */
let AuthenticationQueryService = class AuthenticationQueryService extends Disposable {
    constructor(authenticationService, authenticationUsageService, authenticationMcpUsageService, authenticationAccessService, authenticationMcpAccessService, authenticationExtensionsService, authenticationMcpService, logService) {
        super();
        this.authenticationService = authenticationService;
        this.authenticationUsageService = authenticationUsageService;
        this.authenticationMcpUsageService = authenticationMcpUsageService;
        this.authenticationAccessService = authenticationAccessService;
        this.authenticationMcpAccessService = authenticationMcpAccessService;
        this.authenticationExtensionsService = authenticationExtensionsService;
        this.authenticationMcpService = authenticationMcpService;
        this.logService = logService;
        this._onDidChangePreferences = this._register(new Emitter());
        this.onDidChangePreferences = this._onDidChangePreferences.event;
        this._onDidChangeAccess = this._register(new Emitter());
        this.onDidChangeAccess = this._onDidChangeAccess.event;
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
    provider(providerId) {
        return new ProviderQuery(providerId, this);
    }
    extension(extensionId) {
        return new ExtensionQuery(extensionId, this);
    }
    mcpServer(mcpServerId) {
        return new McpServerQuery(mcpServerId, this);
    }
    getProviderIds(includeInternal) {
        return this.authenticationService.getProviderIds().filter(providerId => {
            // Filter out internal providers unless explicitly included
            return includeInternal || !providerId.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX);
        });
    }
    async clearAllData(confirmation, includeInternal = true) {
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
            }
            catch (error) {
                this.logService.error(`Error clearing data for provider ${providerId}:`, error);
            }
        }
        this.logService.info('All authentication data cleared');
    }
};
AuthenticationQueryService = __decorate([
    __param(0, IAuthenticationService),
    __param(1, IAuthenticationUsageService),
    __param(2, IAuthenticationMcpUsageService),
    __param(3, IAuthenticationAccessService),
    __param(4, IAuthenticationMcpAccessService),
    __param(5, IAuthenticationExtensionsService),
    __param(6, IAuthenticationMcpService),
    __param(7, ILogService)
], AuthenticationQueryService);
export { AuthenticationQueryService };
registerSingleton(IAuthenticationQueryService, AuthenticationQueryService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFnQyxzQkFBc0IsRUFBRSxnQ0FBZ0MsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3BLLE9BQU8sRUFDTiwyQkFBMkIsRUFlM0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxQyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN0RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMxRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUzRjs7R0FFRztBQUNILE1BQWUsU0FBUztJQUN2QixZQUNpQixVQUFrQixFQUNmLFlBQXdDO1FBRDNDLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDZixpQkFBWSxHQUFa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