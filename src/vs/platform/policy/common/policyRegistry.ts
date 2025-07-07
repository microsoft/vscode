/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Central registry for policy definitions to avoid duplication across the codebase.
 * This provides a single source of truth for policy keys and their metadata.
 */

export interface PolicyMetadata {
	readonly name: string;
	readonly minimumVersion: string;
	readonly previewFeature?: boolean;
	readonly defaultValue?: any;
	readonly description?: string;
}

/**
 * Registry of all known policy keys and their metadata.
 * This ensures consistency across account policies and configuration policies.
 */
export const PolicyKeys = {
	/**
	 * Policy for enabling/disabling ChatMCP functionality.
	 * Used by both account policy service and chat configuration.
	 */
	ChatMCP: {
		name: 'ChatMCP',
		minimumVersion: '1.99',
		description: 'Controls whether Model Context Protocol integration is enabled for chat'
	} as const
} as const;

export type PolicyKey = keyof typeof PolicyKeys;

/**
 * Get policy metadata for a given policy key.
 * @param key The policy key
 * @returns The policy metadata or undefined if key doesn't exist
 */
export function getPolicyMetadata(key: PolicyKey): PolicyMetadata {
	return PolicyKeys[key];
}

/**
 * Check if a string is a valid policy key.
 * @param key The string to check
 * @returns True if it's a valid policy key
 */
export function isValidPolicyKey(key: string): key is PolicyKey {
	return key in PolicyKeys;
}