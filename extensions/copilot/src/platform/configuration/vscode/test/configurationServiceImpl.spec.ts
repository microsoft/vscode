/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, vi } from 'vitest';

const { mockConfigStore } = vi.hoisted(() => ({
	mockConfigStore: { user: {} as Record<string, unknown>, defaults: {} as Record<string, unknown> },
}));

vi.mock('vscode', () => {
	function makeConfig(prefix: string) {
		const fullKey = (k: string) => prefix ? `${prefix}.${k}` : k;
		return {
			get<T>(k: string): T | undefined {
				const fk = fullKey(k);
				if (fk in mockConfigStore.user) {
					return mockConfigStore.user[fk] as T;
				}
				if (fk in mockConfigStore.defaults) {
					return mockConfigStore.defaults[fk] as T;
				}
				return undefined;
			},
			inspect<T>(k: string) {
				const fk = fullKey(k);
				return {
					key: fk,
					defaultValue: mockConfigStore.defaults[fk] as T | undefined,
					globalValue: (fk in mockConfigStore.user ? mockConfigStore.user[fk] : undefined) as T | undefined,
				};
			},
		};
	}
	return {
		workspace: {
			getConfiguration: (prefix: string) => makeConfig(prefix),
			onDidChangeConfiguration: () => ({ dispose() { } }),
		},
	};
});

import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { ConfigKey } from '../../common/configurationService';
import { ConfigurationServiceImpl } from '../configurationServiceImpl';

const fakeTokenStore: ICopilotTokenStore = {
	copilotToken: undefined,
	onDidStoreUpdate: () => ({ dispose() { } }),
} as any;

describe('ConfigurationServiceImpl - migrated chat.advanced setting fallback', () => {
	test('reads the user-set OLD key when only the OLD key is configured', () => {
		const oldKey = `github.copilot.${ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration.oldId}`;
		const newKey = ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration.fullyQualifiedId;

		const userValue = {
			modelName: 'dd_5minichat_edits_xtab_300_small',
			promptingStrategy: 'xtab275',
			includeTagsInCurrentFile: false,
		};

		mockConfigStore.user = { [oldKey]: userValue };
		// The new key is registered with `type: ["object", "null"]` and `default: null`,
		// so an unconfigured user reads `null` for the new key, allowing the
		// `?? config.get(oldKey)` fallback to take over.
		mockConfigStore.defaults = { [newKey]: null };

		const svc = new ConfigurationServiceImpl(fakeTokenStore);
		const value = svc.getConfig(ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration);

		expect(value).toEqual(userValue);
	});
});
