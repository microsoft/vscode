/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAnalyticsService = createDecorator<IAnalyticsService>('analyticsService');

export interface IAnalyticsService {
	readonly _serviceBrand: undefined;

	/**
	 * Initialize the analytics service
	 */
	initialize(): Promise<void>;

	/**
	 * Track a custom event
	 */
	track(event: string, properties?: Record<string, any>): void;

	/**
	 * Identify a user
	 */
	identify(userId: string, properties?: Record<string, any>): void;

	/**
	 * Start session recording
	 */
	startSessionRecording(): void;

	/**
	 * Stop session recording
	 */
	stopSessionRecording(): void;

	/**
	 * Check if analytics is enabled
	 */
	isEnabled(): boolean;

	/**
	 * Enable analytics
	 */
	enable(): void;

	/**
	 * Disable analytics
	 */
	disable(): void;

	/**
	 * Set analytics enabled state
	 */
	setEnabled(enabled: boolean): void;
}
