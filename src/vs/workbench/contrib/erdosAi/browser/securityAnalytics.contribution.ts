/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAnalyticsService } from '../../../../platform/analytics/common/analytics.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { PostHogHelper } from '../../../../platform/analytics/common/postHogHelper.js';

/**
 * Contribution that manages PostHog analytics based on Erdos AI security mode
 */
export class SecurityAnalyticsContribution extends Disposable implements IWorkbenchContribution {

	private _lastSecurityMode: string = 'improve';
	private _postHogHelper: PostHogHelper;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAnalyticsService private readonly analyticsService: IAnalyticsService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._postHogHelper = new PostHogHelper(this.logService);

		// Set initial analytics state based on current security mode
		this.updateAnalyticsState();

			// Listen for security mode configuration changes
	this._register(this.configurationService.onDidChangeConfiguration(e => {
		// Check multiple possible ways the configuration might be affected
		const affectsSecurityMode = e.affectsConfiguration('erdosAi.securityMode') || 
									e.affectedKeys?.has('erdosAi.securityMode') ||
									e.affectedKeys?.has('erdosAi') ||
									JSON.stringify(e.affectedKeys).includes('securityMode');
		
		if (affectsSecurityMode) {
			this.updateAnalyticsState();
		}
	}));

		// Also add a polling mechanism as a fallback
		this.startPollingSecurityMode();
	}

	private updateAnalyticsState(): void {
		try {
			const securityMode = this.configurationService.getValue<string>('erdosAi.securityMode') || 'improve';
			const analyticsEnabled = securityMode !== 'secure';
			
			// Update last known security mode
			this._lastSecurityMode = securityMode;
			
			// Update both the analytics service AND PostHog directly
			try {
				// First update the analytics service
				this.analyticsService.setEnabled(analyticsEnabled);
				
				// Then also update PostHog directly as a backup
				this._postHogHelper.updateTrackingForSecurityMode(securityMode);
			} catch (serviceError) {
				this.logService.error(`[SecurityAnalytics] Failed to update analytics:`, serviceError);
				
				// Try PostHog direct update as fallback
				this._postHogHelper.updateTrackingForSecurityMode(securityMode);
			}
		} catch (error) {
			this.logService.error('[SecurityAnalytics] Failed to update analytics state:', error);
		}
	}

	private startPollingSecurityMode(): void {
		// Poll every 500ms to check for security mode changes as a fallback
		const pollInterval = setInterval(() => {
			try {
				const currentSecurityMode = this.configurationService.getValue<string>('erdosAi.securityMode') || 'improve';
				if (currentSecurityMode !== this._lastSecurityMode) {
					this.updateAnalyticsState();
				}
			} catch (error) {
				this.logService.error('[SecurityAnalytics] Error in polling:', error);
			}
		}, 500);

		// Clean up the interval when disposed
		this._register({
			dispose: () => {
				clearInterval(pollInterval);
			}
		});
	}
}
