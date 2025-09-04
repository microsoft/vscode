/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';

/**
 * PostHog Helper utility that provides a consistent interface to window.posthog
 * Inspired by the RAO frontend implementation to ensure we always use the live PostHog instance
 */
export class PostHogHelper {
	constructor(private readonly logService: ILogService) {}

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

	/**
	 * Check if PostHog is available
	 */
	isAvailable(): boolean {
		return !!this.getPostHogInstance();
	}

	/**
	 * Check if tracking is currently enabled (not opted out)
	 */
	isTrackingEnabled(): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		try {
			return !posthog.has_opted_out_capturing();
		} catch (error) {
			this.logService.error('[PostHogHelper] Failed to check opt-out status:', error);
			return false;
		}
	}

	/**
	 * Enable PostHog tracking (opt in to capturing)
	 */
	enableTracking(): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

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
					capture_pageview: false,
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
			
			// Start session recording with multiple methods
			try {
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
			
			// Send a test event to wake up PostHog
			try {
				posthog.capture('$posthog_helper_reactivated', {
					timestamp: new Date().toISOString(),
					source: 'posthog_helper'
				});
			} catch (testError) {
				// Ignore test event errors
			}
			
			return true;
		} catch (error) {
			this.logService.error('[PostHogHelper] Failed to enable tracking:', error);
			return false;
		}
	}

	/**
	 * Disable PostHog tracking (opt out of capturing)
	 */
	disableTracking(): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		try {
			// Multiple methods to ensure PostHog is truly disabled
			posthog.opt_out_capturing();
			
			// Override capture method
			if (!posthog._originalCapture) {
				posthog._originalCapture = posthog.capture;
			}
			posthog.capture = function(...args: any[]) {
				// Do nothing - capture is blocked
			};
			
			// Disable session recording
			if (posthog.sessionRecording) {
				posthog.stopSessionRecording();
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
			
			// Force disable via direct config modification
			try {
				if (posthog.config) {
					posthog.config.disable_session_recording = true;
					posthog.config.autocapture = false;
				}
			} catch (configError) {
				// Ignore config errors
			}
			
			return true;
		} catch (error) {
			this.logService.error('[PostHogHelper] Failed to disable tracking:', error);
			return false;
		}
	}

	/**
	 * Update tracking based on security mode
	 * @param securityMode - Either "secure" or "improve"
	 */
	updateTrackingForSecurityMode(securityMode: string): boolean {
		if (securityMode === 'secure') {
			return this.disableTracking();
		} else {
			return this.enableTracking();
		}
	}

	/**
	 * Start session recording
	 */
	startSessionRecording(): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		try {
			if (posthog.sessionRecording) {
				posthog.startSessionRecording();
				return true;
			} else {
				return false;
			}
		} catch (error) {
			return false;
		}
	}

	/**
	 * Stop session recording
	 */
	stopSessionRecording(): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		try {
			if (posthog.sessionRecording) {
				posthog.stopSessionRecording();
				return true;
			} else {
				return false;
			}
		} catch (error) {
			return false;
		}
	}

	/**
	 * Track an event
	 */
	trackEvent(eventName: string, properties?: Record<string, any>): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		if (!this.isTrackingEnabled()) {
			return false;
		}

		try {
			posthog.capture(eventName, {
				...properties,
				timestamp: new Date().toISOString()
			});
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Identify a user
	 */
	identifyUser(userId: string, properties?: Record<string, any>): boolean {
		const posthog = this.getPostHogInstance();
		if (!posthog) {
			return false;
		}

		if (!this.isTrackingEnabled()) {
			return false;
		}

		try {
			posthog.identify(userId, properties);
			return true;
		} catch (error) {
			return false;
		}
	}

}
