/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface UserProfile {
	id?: string;
	email?: string;
	name?: string;
	username?: string;
	subscription_status?: string;
	monthly_query_count?: number;
	trial_queries_used?: number;
	trial_start_date?: string;
	current_period_start?: string;
	current_period_end?: string;
	usage_based_billing_enabled?: boolean;
	created_at?: string;
}

export const IApiKeyManager = createDecorator<IApiKeyManager>('apiKeyManager');

export interface IApiKeyManager {
	readonly _serviceBrand: undefined;

	saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }>;
	deleteApiKey(provider: string): Promise<{ success: boolean; message: string }>;
	getApiKeyStatus(): Promise<boolean>;
	startOAuthFlow(provider?: string): Promise<string>;
	generateBackendAuth(provider?: string): Promise<{ api_key: string } | null>;
	saveUserProfile(profile: UserProfile): Promise<void>;
	getUserProfile(): Promise<UserProfile | null>;
	isUserAuthenticated(): Promise<boolean>;
	signOut(): Promise<void>;

	// BYOK (Bring Your Own Key) methods
	saveBYOKKey(provider: 'anthropic' | 'openai' | 'aws', key: string): Promise<{ success: boolean; message: string }>;
	getBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<string | null>;
	deleteBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<{ success: boolean; message: string }>;
	hasBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<boolean>;
}
