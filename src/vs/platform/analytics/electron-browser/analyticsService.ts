/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnalyticsService } from '../common/analytics.js';
import { IProductService } from '../../product/common/productService.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';

export class AnalyticsService implements IAnalyticsService {
	readonly _serviceBrand: undefined;

	private _initialized = false;
	private _enabled = true; // Default to enabled, will be set based on security mode

	constructor(
		@IProductService private readonly productService: IProductService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {}

	async initialize(): Promise<void> {
		if (this._initialized) {
			return;
		}

					try {
			// Wait for PostHog to be available on window object
			// PostHog is loaded via script tag in HTML
			await this.waitForPostHog();
			const posthog = this.getPostHogInstance();

			// Get configuration from product.json or environment
			const config = this.getPostHogConfig();
			
			if (config.apiKey && posthog) {
									// Initialize PostHog with configuration
				posthog.init(config.apiKey, {
					api_host: config.apiHost,
					debug: false, // Disable debug logging to reduce console noise
					disable_session_recording: false,
					capture_pageview: false, // We'll handle this manually
					capture_pageleave: false,
					loaded: (loadedPosthog: any) => {
						// Set user properties - use safe platform detection
						const platform = this.getPlatform();
						const arch = this.getArchitecture();
						
						// PostHog loaded callback
						
						loadedPosthog.register({
							app_version: this.productService.version,
							app_name: this.productService.nameLong,
							platform: platform,
							arch: arch,
							is_dev: !this.environmentService.isBuilt
						});
						
						// Apply current enabled state to PostHog - always use fresh instance
						const currentPosthog = this.getPostHogInstance();
						if (currentPosthog) {
							if (this._enabled) {
								currentPosthog.opt_in_capturing();
							} else {
								currentPosthog.opt_out_capturing();
							}
						}
					}
				});

				this._initialized = true;
			} else {
				this.logService.warn('PostHog analytics disabled: API key not configured');
			}
		} catch (error) {
			this.logService.error('Failed to initialize PostHog analytics:', error);
		}
	}

	track(event: string, properties?: Record<string, any>): void {
		if (!this.isEnabled()) {
			return;
		}

		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return;
		}

		try {
			posthog.capture(event, {
				...properties,
				timestamp: new Date().toISOString()
			});
		} catch (error) {
			this.logService.error('Failed to track event:', error);
		}
	}

	identify(userId: string, properties?: Record<string, any>): void {
		if (!this.isEnabled()) {
			return;
		}

		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return;
		}

		try {
			posthog.identify(userId, properties);
		} catch (error) {
			this.logService.error('Failed to identify user:', error);
		}
	}

	startSessionRecording(): void {
		if (!this.isEnabled()) {
			return;
		}

		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return;
		}

		try {
			posthog.startSessionRecording();
		} catch (error) {
			this.logService.error('Failed to start session recording:', error);
		}
	}

	stopSessionRecording(): void {
		if (!this.isEnabled()) {
			return;
		}

		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return;
		}

		try {
			posthog.stopSessionRecording();
		} catch (error) {
			this.logService.error('Failed to stop session recording:', error);
		}
	}

	isEnabled(): boolean {
		if (!this._initialized || !this._enabled) {
			return false;
		}
		
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}
		
		// Also check PostHog's internal opt-out status
		try {
			const hasOptedOut = posthog.has_opted_out_capturing();
			return !hasOptedOut;
		} catch (error) {
			this.logService.error('[PostHog] Failed to check opt-out status:', error);
			return false;
		}
	}

	enable(): void {
		this._enabled = true;
		
		const posthog = this.getPostHogInstance();
		if (posthog) {
			try {
				// Restore original capture method if it was overridden
				if (posthog._originalCapture) {
					posthog.capture = posthog._originalCapture;
					delete posthog._originalCapture;
				}
				
				// Standard opt-in
				posthog.opt_in_capturing();
				
				// Re-enable features via config
				if (posthog.set_config) {
					posthog.set_config({
						disable_session_recording: false,
						autocapture: true,
						capture_pageview: false, // We still handle this manually
						capture_pageleave: false
					});
				}
				
				// Force enable via direct config modification
				try {
					if (posthog.config) {
						posthog.config.disable_session_recording = false;
						posthog.config.autocapture = true;
					}
				} catch (configError) {
					// Ignore config errors
				}
				
				// Force restart session recording
				try {
					// Try multiple ways to start session recording
					if (posthog.sessionRecording) {
						posthog.startSessionRecording();
					} else if (posthog.start_session_recording) {
						posthog.start_session_recording();
					} else if (posthog._startSessionRecording) {
						posthog._startSessionRecording();
					}
				} catch (recordingError) {
					// Ignore recording errors
				}
				
				// Force trigger a test event to wake up PostHog
				try {
					posthog.capture('$posthog_reactivated', {
						timestamp: new Date().toISOString(),
						source: 'erdos_security_toggle'
					});
				} catch (testError) {
					// Ignore test event errors
				}
			} catch (error) {
				this.logService.error('[AnalyticsService] Failed to enable PostHog:', error);
			}
		}
	}

	disable(): void {
		this._enabled = false;
		
		const posthog = this.getPostHogInstance();
		if (posthog) {
			try {
				// Standard opt-out
				posthog.opt_out_capturing();
				
				// Disable session recording explicitly
				if (posthog.sessionRecording) {
					posthog.stopSessionRecording();
				}
				if (posthog.disable_session_recording) {
					posthog.disable_session_recording();
				}
				
				// Set config to disable features
				if (posthog.set_config) {
					posthog.set_config({
						disable_session_recording: true,
						autocapture: false,
						capture_pageview: false,
						capture_pageleave: false
					});
				}
				
				// Force disable session recording via config
				try {
					if (posthog.config) {
						posthog.config.disable_session_recording = true;
						posthog.config.autocapture = false;
					}
				} catch (configError) {
					// Ignore config errors
				}
				
				// Override capture method to do nothing
				const originalCapture = posthog.capture;
				posthog.capture = function(...args: any[]) {
					// Do nothing - capture is blocked
				};
				posthog._originalCapture = originalCapture; // Store for re-enabling
			} catch (error) {
				this.logService.error('[AnalyticsService] Failed to disable PostHog:', error);
			}
		}
	}

	setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	/**
	 * Get the current PostHog instance from window.posthog
	 * Always returns the live instance to avoid stale references
	 */
	private getPostHogInstance(): any {
		try {
			const posthog = (window as any).posthog;
			if (!posthog) {
				return null;
			}
			return posthog;
		} catch (error) {
			return null;
		}
	}


	private async waitForPostHog(timeout: number = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();
			
			const checkPostHog = () => {
				const posthog = this.getPostHogInstance();
				if (posthog) {
					// PostHog instance found
					resolve();
					return;
				}
				
				if (Date.now() - startTime > timeout) {
					this.logService.error('[PostHog] PostHog script failed to load within timeout');
					reject(new Error('PostHog script failed to load within timeout'));
					return;
				}
				
				setTimeout(checkPostHog, 100);
			};
			
			checkPostHog();
		});
	}

	private getPlatform(): string {
		// In Electron renderer process, we can't access process.platform directly
		// Use navigator.platform as fallback for renderer process
		if (typeof navigator !== 'undefined' && navigator.platform) {
			const platform = navigator.platform.toLowerCase();
			if (platform.includes('mac')) return 'darwin';
			if (platform.includes('win')) return 'win32';
			if (platform.includes('linux')) return 'linux';
		}
		
		// Try to get from environment service if available
		try {
			// Check if we can access process through environment service
			const env = this.environmentService as any;
			if (env.os) return env.os;
		} catch (e) {
			// Ignore errors
		}
		
		return 'unknown';
	}

	private getArchitecture(): string {
		// Use navigator.userAgent to detect architecture in renderer process
		if (typeof navigator !== 'undefined' && navigator.userAgent) {
			const userAgent = navigator.userAgent.toLowerCase();
			if (userAgent.includes('arm64') || userAgent.includes('aarch64')) return 'arm64';
			if (userAgent.includes('x64') || userAgent.includes('x86_64')) return 'x64';
			if (userAgent.includes('x86')) return 'x86';
		}
		return 'unknown';
	}

	private getPostHogConfig(): { apiKey: string; apiHost: string } {
		// In renderer process, we can't access process.env directly
		// Use product configuration instead
		const productConfig = (this.productService as any).posthog;
		if (productConfig) {
			const apiKey = this.environmentService.isBuilt ? productConfig.production?.apiKey : productConfig.development?.apiKey;
			const apiHost = productConfig.apiHost || 'https://us.i.posthog.com';
			
			if (apiKey) {
				return { apiKey, apiHost };
			}
		}

		// Use the provided API key for now
		return {
			apiKey: this.environmentService.isBuilt ? 'phc_b9DTWB8h678cfkt3DPgD6jYN57IIu0AzAD0tn20cSyo' : 'phc_b9DTWB8h678cfkt3DPgD6jYN57IIu0AzAD0tn20cSyo',
			apiHost: 'https://us.i.posthog.com'
		};
	}
}
