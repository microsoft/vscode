/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { SessionIndexingPreference } from '../sessionIndexingPreference';

function createMockConfigService(opts: {
	localIndexEnabled?: boolean;
	cloudSyncEnabled?: boolean;
	cloudSyncPublicEnabled?: boolean;
	excludeRepositories?: string[];
} = {}) {
	const configs: Record<string, unknown> = {};
	// Map by fullyQualifiedId
	configs['github.copilot.chat.advanced.sessionSearch.localIndex.enabled'] = opts.localIndexEnabled ?? false;
	configs['github.copilot.chat.advanced.sessionSearch.cloudSync.enabled'] = opts.cloudSyncEnabled ?? false;
	configs['github.copilot.chat.sessionSearch.cloudSync.enabled'] = opts.cloudSyncPublicEnabled ?? false;
	configs['github.copilot.chat.advanced.sessionSearch.cloudSync.excludeRepositories'] = opts.excludeRepositories ?? [];

	// Track which keys are explicitly configured (set by the user)
	const configuredKeys = new Set<string>();
	if (opts.cloudSyncPublicEnabled !== undefined) {
		configuredKeys.add('github.copilot.chat.sessionSearch.cloudSync.enabled');
	}

	return {
		getConfig: (key: { fullyQualifiedId: string }) => configs[key.fullyQualifiedId],
		isConfigured: (key: { fullyQualifiedId: string }) => configuredKeys.has(key.fullyQualifiedId),
	} as unknown as import('../../../../platform/configuration/common/configurationService').IConfigurationService;
}

describe('SessionIndexingPreference', () => {
	it('getStorageLevel returns local when no cloud sync', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ localIndexEnabled: true }));
		expect(pref.getStorageLevel()).toBe('local');
	});

	it('getStorageLevel returns user when cloud sync enabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			localIndexEnabled: true,
			cloudSyncEnabled: true,
		}));
		expect(pref.getStorageLevel()).toBe('user');
	});

	it('getStorageLevel returns local for excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			localIndexEnabled: true,
			cloudSyncEnabled: true,
			excludeRepositories: ['my-org/private-repo'],
		}));
		expect(pref.getStorageLevel('my-org/private-repo')).toBe('local');
	});

	it('getStorageLevel returns user for non-excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			localIndexEnabled: true,
			cloudSyncEnabled: true,
			excludeRepositories: ['my-org/private-repo'],
		}));
		expect(pref.getStorageLevel('microsoft/vscode')).toBe('user');
	});

	it('hasCloudConsent returns false when cloud sync disabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ cloudSyncEnabled: false }));
		expect(pref.hasCloudConsent()).toBe(false);
	});

	it('hasCloudConsent returns true when cloud sync enabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ cloudSyncEnabled: true }));
		expect(pref.hasCloudConsent()).toBe(true);
	});

	it('hasCloudConsent returns false for excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			cloudSyncEnabled: true,
			excludeRepositories: ['my-org/*'],
		}));
		expect(pref.hasCloudConsent('my-org/secret-repo')).toBe(false);
	});

	it('hasCloudConsent supports glob patterns', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			cloudSyncEnabled: true,
			excludeRepositories: ['private-org/*'],
		}));
		expect(pref.hasCloudConsent('private-org/repo-a')).toBe(false);
		expect(pref.hasCloudConsent('private-org/repo-b')).toBe(false);
		expect(pref.hasCloudConsent('public-org/repo-a')).toBe(true);
	});

	it('hasCloudConsent uses new public key when explicitly configured', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			cloudSyncPublicEnabled: true,
		}));
		expect(pref.hasCloudConsent()).toBe(true);
	});

	it('hasCloudConsent new public key overrides old internal key', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			cloudSyncEnabled: true,
			cloudSyncPublicEnabled: false,
		}));
		expect(pref.hasCloudConsent()).toBe(false);
	});
});
