/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IOAuthCallbackService } from '../../erdosAiIntegration/common/oauthCallbackService.js';
import { IApiKeyManager, UserProfile } from '../common/apiKeyManager.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class ApiKeyManager extends Disposable implements IApiKeyManager {
	readonly _serviceBrand: undefined;
	private inMemoryKey: string | null = null;
	private inMemoryProfile: UserProfile | null = null;
	
	private static readonly RAO_API_KEY_SECRET = 'rao_api_key';
	private static readonly RAO_USER_PROFILE_SECRET = 'rao_user_profile';
	private static readonly BYOK_ANTHROPIC_KEY_SECRET = 'erdosai_byok_anthropic_key';
	private static readonly BYOK_OPENAI_KEY_SECRET = 'erdosai_byok_openai_key';

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IOAuthCallbackService private readonly oauthCallbackService: IOAuthCallbackService
	) {
		super();
		this.oauthCallbackService.onAuthenticationComplete(async (result) => {
			if (result.api_key) {
				await this.saveApiKey("rao", result.api_key);
				
				this.logService.info('OAuth authentication completed and API key saved');
			} else if (result.error) {
				this.logService.error('OAuth authentication failed:', result.error, result.error_description);
			}
		});
		
		this.initializeFromStorage();
	}

	private async initializeFromStorage(): Promise<void> {
		try {
			const persistentKey = await this.secretStorageService.get(ApiKeyManager.RAO_API_KEY_SECRET);
			if (persistentKey && persistentKey.length > 0) {
				this.setInMemoryKey(persistentKey);
			}
		} catch (error) {
			this.logService.warn('Failed to initialize API key from storage:', error);
		}
	}

	async saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }> {
		if (provider === "rao" || provider === "openai") {
			try {
				await this.secretStorageService.set(ApiKeyManager.RAO_API_KEY_SECRET, key);
				
				this.setInMemoryKey(key);
				
				this.logService.info('Successfully saved Rao API key to secure storage');
				return { success: true, message: "Saved Rao API key" };
			} catch (error) {
				this.logService.error('Failed to save API key to secure storage:', error);
				throw new Error(`Failed to save API key: ${error}`);
			}
		}
		throw new Error(`Unsupported provider: ${provider}`);
	}

	private async getApiKey(provider: string = "rao"): Promise<string | null> {
		if (this.inMemoryKey) {
			return this.inMemoryKey;
		}

		try {
			const persistentKey = await this.secretStorageService.get(ApiKeyManager.RAO_API_KEY_SECRET);
			if (persistentKey && persistentKey.length > 0) {
				this.setInMemoryKey(persistentKey);
				return persistentKey;
			}
		} catch (error) {
			this.logService.warn('Failed to read API key from secure storage:', error);
		}

		return null;
	}

	async deleteApiKey(provider: string): Promise<{ success: boolean; message: string }> {
		if (provider === "rao" || provider === "openai") {
			try {
				await this.secretStorageService.delete(ApiKeyManager.RAO_API_KEY_SECRET);
				
				this.inMemoryKey = null;
				
				this.logService.info('Successfully deleted Rao API key from secure storage');
				return { success: true, message: "Deleted Rao API key" };
			} catch (error) {
				this.logService.error('Failed to delete API key from secure storage:', error);
				throw new Error(`Failed to delete API key: ${error}`);
			}
		}
		throw new Error(`Unsupported provider: ${provider}`);
	}

	private setInMemoryKey(key: string): void {
		this.inMemoryKey = key;
		
		try {
			this.configurationService.updateValue('erdosAi.selectedModel', 'claude-sonnet-4-20250514', ConfigurationTarget.USER);
		} catch (error) {
			this.logService.warn('Failed to set default model:', error);
		}
	}

	async getApiKeyStatus(): Promise<boolean> {
		const key = await this.getApiKey("rao");
		return key !== null;
	}

	async startOAuthFlow(provider: string = "rao"): Promise<string> {
		this.logService.info('Starting OAuth flow via main process service');
		
		await this.oauthCallbackService.startOAuthFlow("");
		
		return "oauth-delegated-to-main-process";
	}

	async generateBackendAuth(provider: string = "rao"): Promise<{ api_key: string } | null> {
		const apiKey = await this.getApiKey(provider);
		
		if (!apiKey) {
			this.logService.warn('No API key found for backend authentication');
			return null;
		}

		return {
			api_key: apiKey
		};
	}

	async saveUserProfile(profile: UserProfile): Promise<void> {
		try {
			this.inMemoryProfile = profile;
			
			await this.secretStorageService.set(ApiKeyManager.RAO_USER_PROFILE_SECRET, JSON.stringify(profile));
			
			this.logService.info('User profile saved successfully');
		} catch (error) {
			this.logService.error('Failed to save user profile:', error);
			throw error;
		}
	}

	async getUserProfile(): Promise<UserProfile | null> {
		try {
			if (this.inMemoryProfile) {
				return this.inMemoryProfile;
			}

			const storedProfile = await this.secretStorageService.get(ApiKeyManager.RAO_USER_PROFILE_SECRET);
			if (storedProfile) {
				try {
					const profile = JSON.parse(storedProfile) as UserProfile;
					this.inMemoryProfile = profile;
					return profile;
				} catch (parseError) {
					this.logService.error('Failed to parse stored user profile:', parseError);
					await this.secretStorageService.delete(ApiKeyManager.RAO_USER_PROFILE_SECRET);
				}
			}

			return null;
		} catch (error) {
			this.logService.error('Failed to get user profile:', error);
			return null;
		}
	}

	private async deleteUserProfile(): Promise<void> {
		try {
			this.inMemoryProfile = null;
			
			await this.secretStorageService.delete(ApiKeyManager.RAO_USER_PROFILE_SECRET);
			
			this.logService.info('User profile deleted successfully');
		} catch (error) {
			this.logService.error('Failed to delete user profile:', error);
			throw error;
		}
	}

	async isUserAuthenticated(): Promise<boolean> {
		const hasApiKey = await this.getApiKeyStatus();
		const hasProfile = await this.getUserProfile();
		return hasApiKey && hasProfile !== null;
	}

	async signOut(): Promise<void> {
		await Promise.all([
			this.deleteApiKey("rao"),
			this.deleteUserProfile()
		]);
		this.logService.info('User signed out successfully');
	}

	// BYOK (Bring Your Own Key) methods
	async saveBYOKKey(provider: 'anthropic' | 'openai' | 'aws', key: string): Promise<{ success: boolean; message: string }> {
		try {
			if (!key || key.trim().length === 0) {
				return { success: false, message: 'API key cannot be empty' };
			}

			let secretKey: string;
			if (provider === 'anthropic') {
				secretKey = ApiKeyManager.BYOK_ANTHROPIC_KEY_SECRET;
			} else if (provider === 'openai') {
				secretKey = ApiKeyManager.BYOK_OPENAI_KEY_SECRET;
			} else if (provider === 'aws') {
				secretKey = 'erdosai_byok_aws_credentials';
			} else {
				throw new Error(`Unsupported provider: ${provider}`);
			}

			await this.secretStorageService.set(secretKey, key.trim());
			
			this.logService.info(`BYOK ${provider} API key saved successfully`);
			return { success: true, message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key saved successfully` };
		} catch (error) {
			this.logService.error(`Failed to save BYOK ${provider} API key:`, error);
			return { success: false, message: `Failed to save ${provider} API key: ${error.message}` };
		}
	}

	async getBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<string | null> {
		try {
			let secretKey: string;
			if (provider === 'anthropic') {
				secretKey = ApiKeyManager.BYOK_ANTHROPIC_KEY_SECRET;
			} else if (provider === 'openai') {
				secretKey = ApiKeyManager.BYOK_OPENAI_KEY_SECRET;
			} else if (provider === 'aws') {
				secretKey = 'erdosai_byok_aws_credentials';
			} else {
				throw new Error(`Unsupported provider: ${provider}`);
			}

			const key = await this.secretStorageService.get(secretKey);
			
			if (key && key.length > 0) {
				return key;
			} else {
				return null;
			}
		} catch (error) {
			this.logService.warn(`Failed to read BYOK ${provider} API key from secure storage:`, error);
			return null;
		}
	}

	async deleteBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<{ success: boolean; message: string }> {
		try {
			let secretKey: string;
			if (provider === 'anthropic') {
				secretKey = ApiKeyManager.BYOK_ANTHROPIC_KEY_SECRET;
			} else if (provider === 'openai') {
				secretKey = ApiKeyManager.BYOK_OPENAI_KEY_SECRET;
			} else if (provider === 'aws') {
				secretKey = 'erdosai_byok_aws_credentials';
			} else {
				throw new Error(`Unsupported provider: ${provider}`);
			}

			await this.secretStorageService.delete(secretKey);
			
			this.logService.info(`BYOK ${provider} API key deleted successfully`);
			return { success: true, message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key deleted successfully` };
		} catch (error) {
			this.logService.error(`Failed to delete BYOK ${provider} API key:`, error);
			return { success: false, message: `Failed to delete ${provider} API key: ${error.message}` };
		}
	}

	async hasBYOKKey(provider: 'anthropic' | 'openai' | 'aws'): Promise<boolean> {
		const key = await this.getBYOKKey(provider);
		return key !== null && key.length > 0;
	}
}
