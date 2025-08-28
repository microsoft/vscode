/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the AGPL v3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService, ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ISecretStorageService } from '../../../../../platform/secrets/common/secrets.js';
import { IOAuthCallbackService } from '../services/oauthCallbackService.js';

interface UserProfile {
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

/**
 * 
 * 1. In-memory storage  for immediate use
 * 2. Persistent storage via secure user state system (.rs.writeUserState/.rs.readUserState)
 * 
 * This implementation uses Erdos's equivalent secure storage systems:
 * 1. In-memory: private field for immediate access
 * Note: Environment variable fallback not available in browser environment
 */
export class ApiKeyManager {
	private inMemoryKey: string | null = null;
	private inMemoryProfile: UserProfile | null = null;
	
	private static readonly RAO_API_KEY_SECRET = 'rao_api_key';
	private static readonly RAO_USER_PROFILE_SECRET = 'rao_user_profile';

	constructor(
		private readonly secretStorageService: ISecretStorageService,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
		private readonly oauthCallbackService: IOAuthCallbackService
	) {
		this.oauthCallbackService.onAuthenticationComplete(async (result) => {
			if (result.api_key) {
				await this.saveApiKey("rao", result.api_key);
				
				// OAuth response processed and API key stored securely
				this.logService.info('OAuth authentication completed and API key saved');
			} else if (result.error) {
				this.logService.error('OAuth authentication failed:', result.error, result.error_description);
			}
		});
		
		// Initialize by loading any existing API key from storage
		this.initializeFromStorage();
	}

	/**
	 * Initialize the API key manager by loading any existing API key from persistent storage
	 */
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

	/**
	 * @param provider Provider name ("rao" or "openai" for compatibility)
	 * @param key API key value
	 * @returns Result with success status and message
	 */
	async saveApiKey(provider: string, key: string): Promise<{ success: boolean; message: string }> {
		if (provider === "rao" || provider === "openai") { // Accept both for compatibility
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

	/**
	 * @param provider Provider name (defaults to "rao")
	 * @returns API key or null if not found
	 */
	async getApiKey(provider: string = "rao"): Promise<string | null> {
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

		// Note: Environment variable fallback not available in browser environment
		// Browser-based configuration should use the settings UI instead

		return null;
	}

	/**
	 * @param provider Provider name ("rao" or "openai" for compatibility)
	 * @returns Result with success status and message
	 */
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

	/**
	 * @param key API key value
	 */
	private setInMemoryKey(key: string): void {
		this.inMemoryKey = key;
		
		try {
			this.configurationService.updateValue('erdosAi.selectedModel', 'claude-sonnet-4-20250514', ConfigurationTarget.USER);
		} catch (error) {
			this.logService.warn('Failed to set default model:', error);
		}
	}

	/**
	 * Check if API key is configured (for UI status)
	 * @returns True if API key is available
	 */
	async getApiKeyStatus(): Promise<boolean> {
		const key = await this.getApiKey("rao");
		return key !== null;
	}

	/**
	 * Delegates to the main process OAuth service
	 * @param provider Provider name (defaults to "rao")
	 * @returns OAuth URL for browser redirect
	 */
	async startOAuthFlow(provider: string = "rao"): Promise<string> {
		this.logService.info('Starting OAuth flow via main process service');
		
		// Delegate to the main process OAuth service which handles everything
		// Pass empty string since main process will build the URL itself
		await this.oauthCallbackService.startOAuthFlow("");
		
		return "oauth-delegated-to-main-process";
	}





	/**
	 * @param provider Provider name (defaults to "rao")
	 * @returns Authentication object for backend requests
	 */
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

	/**
	 * @param profile User profile information
	 */
	async saveUserProfile(profile: UserProfile): Promise<void> {
		try {
			// Store in memory for immediate access
			this.inMemoryProfile = profile;
			
			await this.secretStorageService.set(ApiKeyManager.RAO_USER_PROFILE_SECRET, JSON.stringify(profile));
			
			this.logService.info('User profile saved successfully');
		} catch (error) {
			this.logService.error('Failed to save user profile:', error);
			throw error;
		}
	}

	/**
	 * @returns User profile or null if not found
	 */
	async getUserProfile(): Promise<UserProfile | null> {
		try {
			// 1. Check in-memory first (for immediate access after setting)
			if (this.inMemoryProfile) {
				return this.inMemoryProfile;
			}

			// 2. Check persistent storage
			const storedProfile = await this.secretStorageService.get(ApiKeyManager.RAO_USER_PROFILE_SECRET);
			if (storedProfile) {
				try {
					const profile = JSON.parse(storedProfile) as UserProfile;
					// Load into memory for performance
					this.inMemoryProfile = profile;
					return profile;
				} catch (parseError) {
					this.logService.error('Failed to parse stored user profile:', parseError);
					// Clear corrupted data
					await this.secretStorageService.delete(ApiKeyManager.RAO_USER_PROFILE_SECRET);
				}
			}

			return null;
		} catch (error) {
			this.logService.error('Failed to get user profile:', error);
			return null;
		}
	}

	/**
	 */
	async deleteUserProfile(): Promise<void> {
		try {
			// Clear in-memory profile
			this.inMemoryProfile = null;
			
			// Clear persistent storage
			await this.secretStorageService.delete(ApiKeyManager.RAO_USER_PROFILE_SECRET);
			
			this.logService.info('User profile deleted successfully');
		} catch (error) {
			this.logService.error('Failed to delete user profile:', error);
			throw error;
		}
	}

	/**
	 * Check if user is authenticated (has profile information)
	 * @returns True if user has profile information
	 */
	async isUserAuthenticated(): Promise<boolean> {
		const hasApiKey = await this.getApiKeyStatus();
		const hasProfile = await this.getUserProfile();
		return hasApiKey && hasProfile !== null;
	}

	/**
	 */
	async signOut(): Promise<void> {
		await Promise.all([
			this.deleteApiKey("rao"),
			this.deleteUserProfile()
		]);
		this.logService.info('User signed out successfully');
	}
}
