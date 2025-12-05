/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Daily usage statistics for an extension
 */
export interface IDailyUsageStat {
	/** Date in YYYY-MM-DD format */
	date: string;
	/** Number of activations on this day */
	activations: number;
	/** Number of command executions on this day */
	commands: number;
}

/**
 * Usage record for a single extension
 */
export interface IExtensionUsageRecord {
	/** Extension identifier (e.g., "ms-python.python") */
	extensionId: string;
	/** Total number of activations */
	activationCount: number;
	/** Total number of command executions */
	commandExecutions: number;
	/** Unix timestamp of last activation */
	lastActivated: number;
	/** Unix timestamp of last command execution */
	lastCommandExecuted: number;
	/** Unix timestamp when tracking started for this extension */
	firstSeen: number;
	/** Daily statistics (last N days based on retention setting) */
	dailyStats: IDailyUsageStat[];
}

/**
 * Stored format for usage analytics data
 */
export interface IExtensionUsageAnalyticsData {
	version: number;
	records: { [extensionId: string]: IExtensionUsageRecord };
}

/**
 * Usage frequency indicator
 */
export const enum UsageFrequency {
	/** 10+ times in last 7 days */
	Frequent = 'frequent',
	/** 1-9 times in last 7 days */
	Occasional = 'occasional',
	/** 0 times in last 30 days */
	Rare = 'rare'
}

/**
 * Sorting options for usage analytics view
 */
export const enum UsageAnalyticsSortBy {
	UsageCount = 'usageCount',
	LastUsed = 'lastUsed',
	Name = 'name'
}

/**
 * Filter options for usage analytics view
 */
export const enum UsageAnalyticsFilter {
	All = 'all',
	FrequentlyUsed = 'frequently',
	OccasionallyUsed = 'occasionally',
	RarelyUsed = 'rarely'
}

export const IExtensionUsageAnalyticsService = createDecorator<IExtensionUsageAnalyticsService>('extensionUsageAnalyticsService');

export interface IExtensionUsageAnalyticsService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when usage data changes
	 */
	readonly onDidChangeUsageData: Event<void>;

	/**
	 * Track an extension activation event
	 * @param extensionId The extension identifier
	 */
	trackActivation(extensionId: string): void;

	/**
	 * Track a command execution from an extension
	 * @param extensionId The extension identifier
	 * @param commandId The command identifier
	 */
	trackCommand(extensionId: string, commandId: string): void;

	/**
	 * Get all usage records
	 */
	getUsageRecords(): IExtensionUsageRecord[];

	/**
	 * Get usage record for a specific extension
	 * @param extensionId The extension identifier
	 */
	getUsageRecord(extensionId: string): IExtensionUsageRecord | undefined;

	/**
	 * Get the usage frequency indicator for an extension
	 * @param extensionId The extension identifier
	 */
	getUsageFrequency(extensionId: string): UsageFrequency;

	/**
	 * Get usage count for the last N days
	 * @param extensionId The extension identifier
	 * @param days Number of days to look back
	 */
	getUsageCountForDays(extensionId: string, days: number): number;

	/**
	 * Clear all usage data
	 */
	clearAllData(): Promise<void>;

	/**
	 * Check if tracking is enabled
	 */
	isEnabled(): boolean;
}


