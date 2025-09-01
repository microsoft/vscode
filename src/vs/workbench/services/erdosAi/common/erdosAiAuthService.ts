/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosAiAuthService = createDecorator<IErdosAiAuthService>('erdosAiAuthService');

export interface IErdosAiAuthService {
	readonly _serviceBrand: undefined;

	saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }>;
	deleteApiKey(provider: string): Promise<{ success: boolean; message: string }>;
	getApiKeyStatus(): Promise<boolean>;
	startOAuthFlow(provider?: string): Promise<string>;
	getUserProfile(): Promise<any>;
	getSubscriptionStatus(): Promise<any>;
	isUserAuthenticated(): Promise<boolean>;
	signOut(): Promise<void>;
	getAIProvider(): string;
	getAIModel(): string;
}
