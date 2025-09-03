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

	private _posthog: any;
	private _initialized = false;

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
			this._posthog = (window as any).posthog;

			// Get configuration from product.json or environment
			const config = this.getPostHogConfig();
			
			if (config.apiKey && this._posthog) {
				this._posthog.init(config.apiKey, {
					api_host: config.apiHost,
					debug: this.environmentService.isBuilt ? false : true,
					disable_session_recording: false,
					capture_pageview: false, // We'll handle this manually
					capture_pageleave: false,
					loaded: (posthog: any) => {
						// Set user properties - use safe platform detection
						const platform = this.getPlatform();
						const arch = this.getArchitecture();
						
						posthog.register({
							app_version: this.productService.version,
							app_name: this.productService.nameLong,
							platform: platform,
							arch: arch,
							is_dev: !this.environmentService.isBuilt
						});
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

		try {
			this._posthog.capture(event, {
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

		try {
			this._posthog.identify(userId, properties);
		} catch (error) {
			this.logService.error('Failed to identify user:', error);
		}
	}

	startSessionRecording(): void {
		if (!this.isEnabled()) {
			return;
		}

		try {
			this._posthog.startSessionRecording();
		} catch (error) {
			this.logService.error('Failed to start session recording:', error);
		}
	}

	stopSessionRecording(): void {
		if (!this.isEnabled()) {
			return;
		}

		try {
			this._posthog.stopSessionRecording();
		} catch (error) {
			this.logService.error('Failed to stop session recording:', error);
		}
	}

	isEnabled(): boolean {
		return this._initialized && !!this._posthog;
	}

	private async waitForPostHog(timeout: number = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();
			
			const checkPostHog = () => {
				if ((window as any).posthog) {
					resolve();
					return;
				}
				
				if (Date.now() - startTime > timeout) {
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
