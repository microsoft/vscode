/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ApiFormat, IProviderAccount, IProviderQuotaSummary, ITokenUsage } from './multiAgentProviderService.js';

export const IProviderRotationService = createDecorator<IProviderRotationService>('IProviderRotationService');

// --- Rotation event ---

export interface IRotationEvent {
	readonly fromAccountId: string;
	readonly toAccountId: string;
	readonly reason: string;
	readonly modelId: string;
}

// --- Usage stats ---

export interface IUsageStats {
	readonly totalTokens: number;
	readonly totalCost: number;
	readonly requestCount: number;
	readonly byProvider: Readonly<Record<string, IUsageEntry>>;
	readonly byAgent: Readonly<Record<string, IUsageEntry>>;
}

export interface IUsageEntry {
	readonly tokens: number;
	readonly cost: number;
	readonly requests: number;
}

export type UsagePeriod = 'hour' | 'day' | 'week';

// --- Service interface ---

export interface IProviderRotationService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the next available account for a model, trying providers in order.
	 * Returns undefined if all accounts are exhausted.
	 */
	getNextAccount(modelId: string, providerIds: readonly string[]): IProviderAccount | undefined;

	/**
	 * Mark an account as exhausted (e.g., 429 response). Will be skipped in rotation.
	 */
	markAccountExhausted(accountId: string, retryAfterMs?: number): void;

	/**
	 * Report token usage for an account after a request completes.
	 */
	reportUsage(accountId: string, usage: ITokenUsage, agentId?: string): void;

	/**
	 * Get the API format for a provider (for format translation).
	 */
	getApiFormat(providerId: string): ApiFormat | undefined;

	/**
	 * Get aggregated usage statistics.
	 */
	getUsageStats(filter?: { agentId?: string; providerId?: string; period?: UsagePeriod }): IUsageStats;

	/**
	 * Get all provider quota summaries (delegates to IMultiAgentProviderService).
	 */
	getAllQuotaSummaries(): readonly IProviderQuotaSummary[];

	// Events
	readonly onDidRotate: Event<IRotationEvent>;
	readonly onDidUpdateQuota: Event<string>;
}
