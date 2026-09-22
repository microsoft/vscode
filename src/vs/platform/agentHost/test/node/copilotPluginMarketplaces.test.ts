/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotPluginMarketplaceSnapshot, installCopilotPlugin, refreshCopilotPluginMarketplaces, type ICopilotPluginMarketplaceRpc } from '../../node/copilot/copilotPluginMarketplaces.js';

suite('CopilotPluginMarketplaces', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists, refreshes, and installs through session-scoped RPCs', async () => {
		const calls: { method: string; value?: string }[] = [];
		const rpc: ICopilotPluginMarketplaceRpc = {
			list: async () => ({
				plugins: [
					{ name: 'formatter', marketplace: 'alpha', enabled: true },
					{ name: 'desired-only', marketplace: 'alpha', enabled: true, managed: true, installed: false },
				],
			}),
			install: async ({ source }) => {
				calls.push({ method: 'install', value: source });
				return {
					plugin: { name: 'reviewer', marketplace: 'alpha', enabled: true },
					skillsInstalled: 2,
					postInstallMessage: 'Configure the reviewer plugin.',
					deprecationWarning: 'Use marketplace sources.',
				};
			},
			reload: async () => {
				calls.push({ method: 'reload' });
			},
			marketplaces: {
				list: async () => ({
					marketplaces: [
						{ name: 'zeta', source: 'https://token:secret@example.test/plugins?token=secret-value' },
						{ name: 'offline', source: 'GitHub: company/offline', managed: true, available: false },
						{ name: 'alpha', source: 'GitHub: company/alpha', isDefault: true },
					],
				}),
				browse: async ({ name }) => {
					calls.push({ method: 'browse', value: name });
					if (name === 'zeta') {
						throw new Error('token=secret-value could not fetch catalog');
					}
					return {
						plugins: [
							{ name: 'reviewer', description: 'Review pull requests.' },
							{ name: 'formatter' },
						],
					};
				},
				refresh: async params => {
					calls.push({ method: 'refresh', value: params?.name });
					return { results: [] };
				},
			},
		};

		const snapshot = await getCopilotPluginMarketplaceSnapshot(rpc);
		const refreshed = await refreshCopilotPluginMarketplaces(rpc, 'alpha');
		const installed = await installCopilotPlugin(rpc, 'reviewer@alpha');

		assert.deepStrictEqual({
			snapshot,
			refreshed,
			installed,
			calls,
		}, {
			snapshot: {
				marketplaces: [
					{ name: 'alpha', source: 'GitHub: company/alpha', isDefault: true },
					{ name: 'offline', source: 'GitHub: company/offline', managed: true, available: false },
					{ name: 'zeta', source: 'https://[redacted]@example.test/plugins?[redacted]' },
				],
				plugins: [
					{ name: 'formatter', marketplace: 'alpha', installed: true, source: 'formatter@alpha' },
					{ name: 'reviewer', description: 'Review pull requests.', marketplace: 'alpha', installed: false, source: 'reviewer@alpha' },
				],
				failures: [{ marketplace: 'zeta', error: 'token=[redacted] could not fetch catalog' }],
			},
			refreshed: {
				marketplaces: [
					{ name: 'alpha', source: 'GitHub: company/alpha', isDefault: true },
					{ name: 'offline', source: 'GitHub: company/offline', managed: true, available: false },
					{ name: 'zeta', source: 'https://[redacted]@example.test/plugins?[redacted]' },
				],
				plugins: [
					{ name: 'formatter', marketplace: 'alpha', installed: true, source: 'formatter@alpha' },
					{ name: 'reviewer', description: 'Review pull requests.', marketplace: 'alpha', installed: false, source: 'reviewer@alpha' },
				],
				failures: [{ marketplace: 'zeta', error: 'token=[redacted] could not fetch catalog' }],
			},
			installed: {
				postInstallMessage: 'Configure the reviewer plugin.',
				deprecationWarning: 'Use marketplace sources.',
			},
			calls: [
				{ method: 'browse', value: 'alpha' },
				{ method: 'browse', value: 'zeta' },
				{ method: 'refresh', value: 'alpha' },
				{ method: 'browse', value: 'alpha' },
				{ method: 'browse', value: 'zeta' },
				{ method: 'install', value: 'reviewer@alpha' },
				{ method: 'reload' },
			],
		});
	});
});
