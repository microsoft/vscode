/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ApiFormat, IMultiAgentProviderService, IProviderAccount, IProviderQuotaSummary, ITokenUsage } from './multiAgentProviderService.js';
import { IProviderRotationService, IRotationEvent, IUsageEntry, IUsageStats, UsagePeriod } from './providerRotationService.js';

const MAX_USAGE_HISTORY = 1000;

interface UsageRecord {
	readonly accountId: string;
	readonly agentId?: string;
	readonly providerId: string;
	readonly usage: ITokenUsage;
}

export class ProviderRotationServiceImpl extends Disposable implements IProviderRotationService {
	declare readonly _serviceBrand: undefined;

	/** Account IDs temporarily exhausted, mapped to their retry-after timestamp */
	private readonly _exhaustedAccounts = new Map<string, number>();
	/** Round-robin counter for round-robin strategy */
	private _roundRobinIndex = 0;
	/** Usage history for stats aggregation */
	private readonly _usageHistory: UsageRecord[] = [];

	private readonly _onDidRotate = this._register(new Emitter<IRotationEvent>());
	readonly onDidRotate: Event<IRotationEvent> = this._onDidRotate.event;

	private readonly _onDidUpdateQuota = this._register(new Emitter<string>());
	readonly onDidUpdateQuota: Event<string> = this._onDidUpdateQuota.event;

	constructor(
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	getNextAccount(modelId: string, providerIds: readonly string[]): IProviderAccount | undefined {
		const now = Date.now();

		// Clean up expired exhaustion entries
		for (const [id, retryAt] of this._exhaustedAccounts) {
			if (retryAt <= now) {
				this._exhaustedAccounts.delete(id);
				this._providerService.resetAccountHealth(id);
			}
		}

		// Try providers in order (priority-based fallback)
		for (const providerId of providerIds) {
			const provider = this._providerService.getProvider(providerId);
			if (!provider) {
				continue;
			}

			// Verify model compatibility
			const model = this._providerService.getModel(modelId);
			if (!model || !model.compatibleProviders.includes(providerId)) {
				continue;
			}

			// Get active accounts sorted by configured strategy
			const accounts = this._providerService.getAccounts(providerId)
				.filter(a => a.isActive)
				.filter(a => !this._exhaustedAccounts.has(a.id));

			if (accounts.length > 0) {
				return this._selectByStrategy(accounts);
			}
		}

		this._logService.warn(`[Rotation] All accounts exhausted for model: ${modelId}`);
		return undefined;
	}

	markAccountExhausted(accountId: string, retryAfterMs?: number): void {
		const retryAt = Date.now() + (retryAfterMs ?? 60_000); // default 1 minute
		this._exhaustedAccounts.set(accountId, retryAt);

		const account = this._providerService.getAccount(accountId);
		if (account) {
			this._providerService.markAccountDegraded(accountId, {
				code: 429,
				message: 'Rate limit exceeded',
				retryAt,
			});
		}

		this._onDidUpdateQuota.fire(accountId);
		this._logService.info(`[Rotation] Account exhausted: ${accountId}, retry at ${new Date(retryAt).toISOString()}`);

		// Try to find next account and fire rotation event
		if (account) {
			const providerIds = [account.providerId];
			// Check all providers that support models this account's provider supports
			const models = this._providerService.getCompatibleModels(account.providerId);
			if (models.length > 0) {
				const nextAccount = this.getNextAccount(models[0].id, providerIds);
				if (nextAccount) {
					this._onDidRotate.fire({
						fromAccountId: accountId,
						toAccountId: nextAccount.id,
						reason: 'Rate limit (429)',
						modelId: models[0].id,
					});
				}
			}
		}
	}

	reportUsage(accountId: string, usage: ITokenUsage, agentId?: string): void {
		const account = this._providerService.getAccount(accountId);
		if (!account) {
			return;
		}

		// Update quota on the account
		if (account.quotaRemaining !== undefined) {
			this._providerService.updateAccountQuota(accountId, {
				remaining: Math.max(0, account.quotaRemaining - usage.totalTokens),
			});
		}

		// Record usage for stats (capped to prevent memory leak)
		this._usageHistory.push({
			accountId,
			agentId,
			providerId: account.providerId,
			usage,
		});
		if (this._usageHistory.length > MAX_USAGE_HISTORY) {
			this._usageHistory.splice(0, this._usageHistory.length - MAX_USAGE_HISTORY);
		}

		this._onDidUpdateQuota.fire(accountId);
	}

	getApiFormat(providerId: string): ApiFormat | undefined {
		return this._providerService.getProvider(providerId)?.apiFormat;
	}

	getUsageStats(filter?: { agentId?: string; providerId?: string; period?: UsagePeriod }): IUsageStats {
		let records = this._usageHistory;

		// Filter by time period
		if (filter?.period) {
			const cutoff = Date.now() - this._periodToMs(filter.period);
			records = records.filter(r => r.usage.timestamp >= cutoff);
		}

		// Filter by provider
		if (filter?.providerId) {
			records = records.filter(r => r.providerId === filter.providerId);
		}

		// Filter by agent
		if (filter?.agentId) {
			records = records.filter(r => r.agentId === filter.agentId);
		}

		// Aggregate
		const byProvider: Record<string, IUsageEntry> = {};
		const byAgent: Record<string, IUsageEntry> = {};
		let totalTokens = 0;
		let totalCost = 0;

		for (const record of records) {
			totalTokens += record.usage.totalTokens;
			totalCost += record.usage.estimatedCost;

			// By provider
			const pEntry = byProvider[record.providerId] ?? { tokens: 0, cost: 0, requests: 0 };
			byProvider[record.providerId] = {
				tokens: pEntry.tokens + record.usage.totalTokens,
				cost: pEntry.cost + record.usage.estimatedCost,
				requests: pEntry.requests + 1,
			};

			// By agent
			if (record.agentId) {
				const aEntry = byAgent[record.agentId] ?? { tokens: 0, cost: 0, requests: 0 };
				byAgent[record.agentId] = {
					tokens: aEntry.tokens + record.usage.totalTokens,
					cost: aEntry.cost + record.usage.estimatedCost,
					requests: aEntry.requests + 1,
				};
			}
		}

		return {
			totalTokens,
			totalCost,
			requestCount: records.length,
			byProvider,
			byAgent,
		};
	}

	getAllQuotaSummaries(): readonly IProviderQuotaSummary[] {
		return this._providerService.getAllQuotaSummaries();
	}

	/** Select account based on configured rotation strategy */
	private _selectByStrategy(accounts: readonly IProviderAccount[]): IProviderAccount {
		const strategy = this._configService.getValue<string>('multiAgent.rotationStrategy') ?? 'priority';

		switch (strategy) {
			case 'round-robin': {
				const idx = this._roundRobinIndex % accounts.length;
				this._roundRobinIndex++;
				return accounts[idx];
			}
			case 'cost-optimized': {
				// Pick cheapest account with remaining quota
				const sorted = [...accounts].sort((a, b) => (a.costPer1MTokens ?? 0) - (b.costPer1MTokens ?? 0));
				return sorted[0];
			}
			case 'priority':
			default: {
				// Sort by priority (lower = higher priority)
				const sorted = [...accounts].sort((a, b) => a.priority - b.priority);
				return sorted[0];
			}
		}
	}

	private _periodToMs(period: UsagePeriod): number {
		switch (period) {
			case 'hour': return 3_600_000;
			case 'day': return 86_400_000;
			case 'week': return 604_800_000;
		}
	}
}
