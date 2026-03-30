/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { BUILT_IN_MODELS, BUILT_IN_PROVIDERS } from './modelProviderMap.js';
import {
	AuthMethod,
	IModelDefinition,
	IMultiAgentProviderService,
	IProviderAccount,
	IProviderAccountError,
	IProviderDefinition,
	IProviderQuotaSummary,
	IQuotaStatus,
} from './multiAgentProviderService.js';

const STORAGE_KEY_PROVIDERS = 'multiAgent.providers';
const STORAGE_KEY_ACCOUNTS = 'multiAgent.accounts';
const SECRET_KEY_PREFIX = 'multiAgent.credential.';

export class MultiAgentProviderServiceImpl extends Disposable implements IMultiAgentProviderService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, IProviderDefinition>();
	private readonly _accounts = new Map<string, IProviderAccount>();

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _onDidChangeAccounts = this._register(new Emitter<string | undefined>());
	readonly onDidChangeAccounts: Event<string | undefined> = this._onDidChangeAccounts.event;

	private readonly _onDidChangeHealth = this._register(new Emitter<string>());
	readonly onDidChangeHealth: Event<string> = this._onDidChangeHealth.event;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ISecretStorageService private readonly _secretStorageService: ISecretStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._loadBuiltInProviders();
		this._loadPersistedState();
	}

	// --- Provider CRUD ---

	getProviders(): readonly IProviderDefinition[] {
		return Array.from(this._providers.values());
	}

	getProvider(providerId: string): IProviderDefinition | undefined {
		return this._providers.get(providerId);
	}

	registerProvider(provider: IProviderDefinition): void {
		this._providers.set(provider.id, provider);
		this._persistProviders();
		this._onDidChangeProviders.fire();
		this._logService.info(`[MultiAgent] Provider registered: ${provider.id}`);
	}

	removeProvider(providerId: string): void {
		// Remove all accounts for this provider (collect first, then delete)
		const toRemove = [...this._accounts.values()]
			.filter(a => a.providerId === providerId)
			.map(a => a.id);
		for (const id of toRemove) {
			this._accounts.delete(id);
		}
		this._providers.delete(providerId);
		this._persistProviders();
		this._persistAccounts();
		this._onDidChangeProviders.fire();
		this._onDidChangeAccounts.fire(providerId);
	}

	// --- Account management ---

	getAccounts(providerId?: string): readonly IProviderAccount[] {
		const accounts = Array.from(this._accounts.values());
		if (providerId) {
			return accounts.filter(a => a.providerId === providerId);
		}
		return accounts;
	}

	getAccount(accountId: string): IProviderAccount | undefined {
		return this._accounts.get(accountId);
	}

	async addAccount(providerId: string, label: string, authType: AuthMethod, priority?: number): Promise<IProviderAccount> {
		const provider = this._providers.get(providerId);
		if (!provider) {
			throw new Error(`Provider not found: ${providerId}`);
		}
		if (!provider.authMethods.includes(authType)) {
			throw new Error(`Provider ${providerId} does not support auth method: ${authType}`);
		}

		const existingAccounts = this.getAccounts(providerId);
		const account: IProviderAccount = {
			id: generateUuid(),
			providerId,
			label,
			authType,
			isActive: true,
			priority: priority ?? existingAccounts.length,
		};

		this._accounts.set(account.id, account);
		this._persistAccounts();
		this._onDidChangeAccounts.fire(providerId);
		this._logService.info(`[MultiAgent] Account added: ${account.label} for provider ${providerId}`);
		return account;
	}

	async updateAccount(accountId: string, updates: Partial<Pick<IProviderAccount, 'label' | 'isActive' | 'priority'>>): Promise<void> {
		const existing = this._accounts.get(accountId);
		if (!existing) {
			throw new Error(`Account not found: ${accountId}`);
		}

		const updated: IProviderAccount = { ...existing, ...updates };
		this._accounts.set(accountId, updated);
		this._persistAccounts();
		this._onDidChangeAccounts.fire(existing.providerId);
	}

	async removeAccount(accountId: string): Promise<void> {
		const account = this._accounts.get(accountId);
		if (!account) {
			return;
		}

		this._accounts.delete(accountId);
		await this._secretStorageService.delete(`${SECRET_KEY_PREFIX}${accountId}`);
		this._persistAccounts();
		this._onDidChangeAccounts.fire(account.providerId);
		this._logService.info(`[MultiAgent] Account removed: ${account.label}`);
	}

	// --- Credential management ---

	async setAccountCredential(accountId: string, credential: string): Promise<void> {
		const account = this._accounts.get(accountId);
		if (!account) {
			throw new Error(`Account not found: ${accountId}`);
		}
		await this._secretStorageService.set(`${SECRET_KEY_PREFIX}${accountId}`, credential);
	}

	async getAccountCredential(accountId: string): Promise<string | undefined> {
		return this._secretStorageService.get(`${SECRET_KEY_PREFIX}${accountId}`);
	}

	// --- Model-provider mapping ---

	getModels(): readonly IModelDefinition[] {
		return BUILT_IN_MODELS;
	}

	getModel(modelId: string): IModelDefinition | undefined {
		return BUILT_IN_MODELS.find(m => m.id === modelId);
	}

	getCompatibleProviders(modelId: string): readonly IProviderDefinition[] {
		const model = this.getModel(modelId);
		if (!model) {
			return [];
		}
		return model.compatibleProviders
			.map(pid => this._providers.get(pid))
			.filter((p): p is IProviderDefinition => p !== undefined);
	}

	getCompatibleModels(providerId: string): readonly IModelDefinition[] {
		const provider = this._providers.get(providerId);
		if (!provider) {
			return [];
		}
		return BUILT_IN_MODELS.filter(m =>
			m.compatibleProviders.includes(providerId)
		);
	}

	// --- Health & quota ---

	updateAccountQuota(accountId: string, quota: Partial<IQuotaStatus>): void {
		const existing = this._accounts.get(accountId);
		if (!existing) {
			return;
		}

		const updated: IProviderAccount = {
			...existing,
			quotaRemaining: quota.remaining ?? existing.quotaRemaining,
			quotaLimit: quota.limit ?? existing.quotaLimit,
			quotaResetAt: quota.resetAt ?? existing.quotaResetAt,
		};
		this._accounts.set(accountId, updated);
		this._onDidChangeHealth.fire(accountId);
	}

	markAccountDegraded(accountId: string, error: IProviderAccountError): void {
		const existing = this._accounts.get(accountId);
		if (!existing) {
			return;
		}

		const updated: IProviderAccount = {
			...existing,
			lastError: error,
			quotaRemaining: error.code === 429 ? 0 : existing.quotaRemaining,
		};
		this._accounts.set(accountId, updated);
		this._onDidChangeHealth.fire(accountId);
		this._logService.warn(`[MultiAgent] Account degraded: ${existing.label} — ${error.message}`);
	}

	resetAccountHealth(accountId: string): void {
		const existing = this._accounts.get(accountId);
		if (!existing) {
			return;
		}

		const updated: IProviderAccount = {
			...existing,
			lastError: undefined,
			quotaRemaining: existing.quotaLimit,
		};
		this._accounts.set(accountId, updated);
		this._onDidChangeHealth.fire(accountId);
	}

	getQuotaSummary(providerId: string): IProviderQuotaSummary {
		const provider = this._providers.get(providerId);
		const accounts = this.getAccounts(providerId);

		const activeAccounts = accounts.filter(a => a.isActive);
		const exhaustedAccounts = accounts.filter(a => a.quotaRemaining === 0 || a.lastError?.code === 429);

		let aggregatePercent = 100;
		if (accounts.length > 0) {
			const totalUsed = accounts.reduce((sum, a) => {
				if (a.quotaLimit && a.quotaRemaining !== undefined) {
					return sum + ((a.quotaLimit - a.quotaRemaining) / a.quotaLimit) * 100;
				}
				return sum;
			}, 0);
			aggregatePercent = accounts.length > 0 ? 100 - (totalUsed / accounts.length) : 100;
		}

		const nextResetAt = accounts.reduce((earliest, a) => {
			if (a.quotaResetAt && (earliest === 0 || a.quotaResetAt < earliest)) {
				return a.quotaResetAt;
			}
			return earliest;
		}, 0);

		return {
			providerId,
			providerName: provider?.name ?? providerId,
			totalAccounts: accounts.length,
			activeAccounts: activeAccounts.length,
			exhaustedAccounts: exhaustedAccounts.length,
			aggregateQuotaPercent: Math.round(aggregatePercent),
			nextResetAt,
		};
	}

	getAllQuotaSummaries(): readonly IProviderQuotaSummary[] {
		return this.getProviders().map(p => this.getQuotaSummary(p.id));
	}

	// --- Persistence ---

	private _loadBuiltInProviders(): void {
		for (const provider of BUILT_IN_PROVIDERS) {
			this._providers.set(provider.id, provider);
		}
	}

	private _loadPersistedState(): void {
		// Load custom providers
		const providersJson = this._storageService.get(STORAGE_KEY_PROVIDERS, StorageScope.APPLICATION);
		if (providersJson) {
			try {
				const customProviders: IProviderDefinition[] = JSON.parse(providersJson);
				for (const provider of customProviders) {
					if (!this._providers.has(provider.id)) {
						this._providers.set(provider.id, provider);
					}
				}
			} catch {
				this._logService.warn('[MultiAgent] Failed to parse persisted providers');
			}
		}

		// Load accounts
		const accountsJson = this._storageService.get(STORAGE_KEY_ACCOUNTS, StorageScope.APPLICATION);
		if (accountsJson) {
			try {
				const accounts: IProviderAccount[] = JSON.parse(accountsJson);
				for (const account of accounts) {
					this._accounts.set(account.id, account);
				}
			} catch {
				this._logService.warn('[MultiAgent] Failed to parse persisted accounts');
			}
		}
	}

	private _persistProviders(): void {
		// Only persist custom (non-built-in) providers
		const builtInIds = new Set(BUILT_IN_PROVIDERS.map(p => p.id));
		const customProviders = this.getProviders().filter(p => !builtInIds.has(p.id));
		this._storageService.store(
			STORAGE_KEY_PROVIDERS,
			JSON.stringify(customProviders),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}

	private _persistAccounts(): void {
		// Persist all accounts (without credentials — those are in SecretStorage)
		const accounts = Array.from(this._accounts.values()).map(a => ({
			...a,
			// Strip transient health data from persistence — it gets stale
			lastError: undefined,
		}));
		this._storageService.store(
			STORAGE_KEY_ACCOUNTS,
			JSON.stringify(accounts),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}
}
