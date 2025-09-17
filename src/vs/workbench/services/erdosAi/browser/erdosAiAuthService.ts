/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IApiKeyManager } from '../../../services/erdosAiAuth/common/apiKeyManager.js';
import { IBackendClient } from '../../../services/erdosAiBackend/common/backendClient.js';
import { IErdosAiAuthService } from '../common/erdosAiAuthService.js';
import { IOAuthCallbackService, IOAuthResult } from '../../../services/erdosAiIntegration/common/oauthCallbackService.js';

export class ErdosAiAuthService extends Disposable implements IErdosAiAuthService {
	readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IApiKeyManager private readonly apiKeyManager: IApiKeyManager,
		@IBackendClient private readonly backendClient: IBackendClient,
		@IOAuthCallbackService private readonly oauthCallbackService: IOAuthCallbackService
	) {
		super();
		
		// Listen for OAuth completion and trigger backend environment re-detection
		this._register(this.oauthCallbackService.onAuthenticationComplete(async (result: IOAuthResult) => {
			if (result.api_key) {
				this.logService.info('OAuth authentication completed, re-detecting backend environment');
				try {
					const config = await this.backendClient.detectEnvironment();
					const envName = config.environment === 'local' ? 'Local Development' : 'Production';
					this.logService.info(`Backend environment re-detected after OAuth: ${envName} (${config.url})`);
				} catch (error) {
					this.logService.warn('Failed to re-detect backend environment after OAuth completion:', error);
				}
			}
		}));
	}

	async saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.saveApiKey(provider, key);
	}

	async deleteApiKey(provider: string): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.deleteApiKey(provider);
	}

	async getApiKeyStatus(): Promise<boolean> {
		return await this.apiKeyManager.getApiKeyStatus();
	}

	async startOAuthFlow(provider: string = "rao"): Promise<string> {
		return await this.apiKeyManager.startOAuthFlow(provider);
	}

	async getUserProfile(): Promise<any> {
		try {
			const cachedProfile = await this.apiKeyManager.getUserProfile();
			if (cachedProfile) {
				return cachedProfile;
			}

			const profile = await this.backendClient.getUserProfile();
			
			await this.apiKeyManager.saveUserProfile(profile);
			
			return profile;
		} catch (error) {
			this.logService.error('Failed to get user profile:', error);
			
			const hasKey = await this.apiKeyManager.getApiKeyStatus();
			if (!hasKey) {
				throw new Error('No API key configured');
			}
			
			throw error;
		}
	}

	async getSubscriptionStatus(): Promise<any> {
		try {
			return await this.backendClient.getSubscriptionStatus();
		} catch (error) {
			this.logService.error('Failed to get subscription status:', error);
			throw error;
		}
	}

	async isUserAuthenticated(): Promise<boolean> {
		return await this.apiKeyManager.isUserAuthenticated();
	}

	async signOut(): Promise<void> {
		await this.apiKeyManager.signOut();
	}

	getAIModel(): string {
		return this.configurationService.getValue<string>('erdosAi.selectedModel')!;
	}

	async saveBYOKKey(provider: 'anthropic' | 'openai', key: string): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.saveBYOKKey(provider, key);
	}

	async getBYOKKey(provider: 'anthropic' | 'openai'): Promise<string | null> {
		return await this.apiKeyManager.getBYOKKey(provider);
	}

	async deleteBYOKKey(provider: 'anthropic' | 'openai'): Promise<{ success: boolean; message: string }> {
		return await this.apiKeyManager.deleteBYOKKey(provider);
	}

	async hasBYOKKey(provider: 'anthropic' | 'openai'): Promise<boolean> {
		return await this.apiKeyManager.hasBYOKKey(provider);
	}
}
