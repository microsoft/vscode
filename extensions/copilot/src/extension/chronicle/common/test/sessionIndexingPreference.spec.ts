/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { SessionIndexingPreference } from '../sessionIndexingPreference';

function createMockConfigService(opts: {
	sessionSyncEnabled?: boolean;
	excludeRepositories?: string[];
} = {}) {
	return {
		getNonExtensionConfig: (key: string) => {
			if (key === 'chat.sessionSync.enabled') {
				return opts.sessionSyncEnabled ?? false;
			}
			if (key === 'chat.sessionSync.excludeRepositories') {
				return opts.excludeRepositories ?? [];
			}
			return undefined;
		},
	} as unknown as import('../../../../platform/configuration/common/configurationService').IConfigurationService;
}

describe('SessionIndexingPreference', () => {
	it('getStorageLevel returns local when session sync disabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService());
		expect(pref.getStorageLevel()).toBe('local');
	});

	it('getStorageLevel returns user when session sync enabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ sessionSyncEnabled: true }));
		expect(pref.getStorageLevel()).toBe('user');
	});

	it('getStorageLevel returns local for excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			sessionSyncEnabled: true,
			excludeRepositories: ['my-org/private-repo'],
		}));
		expect(pref.getStorageLevel('my-org/private-repo')).toBe('local');
	});

	it('getStorageLevel returns user for non-excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			sessionSyncEnabled: true,
			excludeRepositories: ['my-org/private-repo'],
		}));
		expect(pref.getStorageLevel('microsoft/vscode')).toBe('user');
	});

	it('hasCloudConsent returns false when session sync disabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ sessionSyncEnabled: false }));
		expect(pref.hasCloudConsent()).toBe(false);
	});

	it('hasCloudConsent returns true when session sync enabled', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({ sessionSyncEnabled: true }));
		expect(pref.hasCloudConsent()).toBe(true);
	});

	it('hasCloudConsent returns false for excluded repo', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			sessionSyncEnabled: true,
			excludeRepositories: ['my-org/*'],
		}));
		expect(pref.hasCloudConsent('my-org/secret-repo')).toBe(false);
	});

	it('hasCloudConsent supports glob patterns', () => {
		const pref = new SessionIndexingPreference(createMockConfigService({
			sessionSyncEnabled: true,
			excludeRepositories: ['private-org/*'],
		}));
		expect(pref.hasCloudConsent('private-org/repo-a')).toBe(false);
		expect(pref.hasCloudConsent('private-org/repo-b')).toBe(false);
		expect(pref.hasCloudConsent('public-org/repo-a')).toBe(true);
	});
});
