/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IMultiAgentProviderService = createDecorator<IMultiAgentProviderService>('IMultiAgentProviderService');

// --- Provider types ---

export type AuthMethod = 'apiKey' | 'oauth';
export type ApiFormat = 'openai' | 'anthropic' | 'google';

export interface IProviderDefinition {
	readonly id: string;
	readonly name: string;
	readonly baseUrl: string;
	readonly supportedModels: readonly string[];
	readonly authMethods: readonly AuthMethod[];
	readonly apiFormat: ApiFormat;
}

export interface IProviderAccount {
	readonly id: string;
	readonly providerId: string;
	readonly label: string;
	readonly authType: AuthMethod;
	readonly isActive: boolean;
	readonly priority: number;
	readonly quotaRemaining?: number;
	readonly quotaLimit?: number;
	readonly quotaResetAt?: number;
	readonly lastError?: IProviderAccountError;
	readonly costPer1MTokens?: number;
}

export interface IProviderAccountError {
	readonly code: number;
	readonly message: string;
	readonly retryAt?: number;
}

// --- Model types ---

export interface IModelDefinition {
	readonly id: string;
	readonly family: string;
	readonly displayName: string;
	readonly capabilities: readonly ModelCapability[];
	readonly compatibleProviders: readonly string[];
	readonly maxContextTokens: number;
}

export type ModelCapability = 'vision' | 'code' | 'reasoning' | 'tools' | 'image-gen';

// --- Quota/Usage types ---

export interface IQuotaStatus {
	readonly accountId: string;
	readonly remaining: number;
	readonly limit: number;
	readonly resetAt: number;
	readonly percentUsed: number;
	readonly isExhausted: boolean;
}

export interface ITokenUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly estimatedCost: number;
	readonly timestamp: number;
}

export interface IProviderQuotaSummary {
	readonly providerId: string;
	readonly providerName: string;
	readonly totalAccounts: number;
	readonly activeAccounts: number;
	readonly exhaustedAccounts: number;
	readonly aggregateQuotaPercent: number;
	readonly nextResetAt: number;
}

// --- Service interface ---

export interface IMultiAgentProviderService {
	readonly _serviceBrand: undefined;

	// Provider CRUD
	getProviders(): readonly IProviderDefinition[];
	getProvider(providerId: string): IProviderDefinition | undefined;
	registerProvider(provider: IProviderDefinition): void;
	removeProvider(providerId: string): void;

	// Account management
	getAccounts(providerId?: string): readonly IProviderAccount[];
	getAccount(accountId: string): IProviderAccount | undefined;
	addAccount(providerId: string, label: string, authType: AuthMethod, priority?: number): Promise<IProviderAccount>;
	updateAccount(accountId: string, updates: Partial<Pick<IProviderAccount, 'label' | 'isActive' | 'priority'>>): Promise<void>;
	removeAccount(accountId: string): Promise<void>;

	// Credential management (stored via SecretStorage)
	setAccountCredential(accountId: string, credential: string): Promise<void>;
	getAccountCredential(accountId: string): Promise<string | undefined>;

	// Model-provider mapping
	getModels(): readonly IModelDefinition[];
	getModel(modelId: string): IModelDefinition | undefined;
	getCompatibleProviders(modelId: string): readonly IProviderDefinition[];
	getCompatibleModels(providerId: string): readonly IModelDefinition[];

	// Health & quota
	updateAccountQuota(accountId: string, quota: Partial<IQuotaStatus>): void;
	markAccountDegraded(accountId: string, error: IProviderAccountError): void;
	resetAccountHealth(accountId: string): void;
	getQuotaSummary(providerId: string): IProviderQuotaSummary;
	getAllQuotaSummaries(): readonly IProviderQuotaSummary[];

	// Events
	readonly onDidChangeProviders: Event<void>;
	readonly onDidChangeAccounts: Event<string | undefined>;
	readonly onDidChangeHealth: Event<string>;
}
