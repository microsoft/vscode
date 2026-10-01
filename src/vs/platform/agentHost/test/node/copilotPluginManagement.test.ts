/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ICopilotPluginCommandApi } from '../../node/copilot/copilotCustomizationCommandDisplay.js';
import { manageCopilotPlugins } from '../../node/copilot/copilotPluginManagement.js';

function createPlugins() {
	const calls: string[] = [];
	let installed: Awaited<ReturnType<ICopilotPluginCommandApi['list']>>['plugins'] = [];
	const api: ICopilotPluginCommandApi = {
		list: async () => { calls.push('list'); return { plugins: installed }; },
		install: async ({ source }) => {
			calls.push(`install:${source}`);
			const plugin = { name: 'java-development', marketplace: 'awesome-copilot', enabled: true, version: '1' };
			installed = [plugin];
			return { plugin, skillsInstalled: 1, postInstallMessage: 'Setup instructions' };
		},
		uninstall: async ({ name, directSourceId }) => {
			calls.push(`uninstall:${name}:${directSourceId ?? ''}`);
			installed = [];
		},
		update: async ({ name }) => { calls.push(`update:${name}`); return { newVersion: '2', skillsInstalled: 1 }; },
		enable: async ({ names }) => { calls.push(`enable:${names.join(',')}`); installed = installed.map(plugin => ({ ...plugin, enabled: true })); },
		disable: async ({ names }) => { calls.push(`disable:${names.join(',')}`); installed = installed.map(plugin => ({ ...plugin, enabled: false })); },
		reload: async () => { calls.push('reload'); },
		marketplaces: {
			list: async () => ({
				marketplaces: [
					{ name: 'awesome-copilot', source: 'github/awesome-copilot', isDefault: true },
					{ name: 'unavailable', source: 'private/repo', available: false },
				]
			}),
			add: async ({ source }) => { calls.push(`add:${source}`); return { name: 'custom' }; },
			remove: async () => ({ removed: true }),
			browse: async ({ name }) => { calls.push(`browse:${name}`); return { plugins: [{ name: 'java-development', description: 'Java tools' }] }; },
			refresh: async () => ({ results: [] }),
		},
	};
	return { api, calls, setInstalled: (plugins: typeof installed) => { installed = plugins; } };
}

suite('Copilot plugin management', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('UI installation, disable and uninstall use the same qualified SDK identity', async () => {
		const { api, calls } = createPlugins();
		const install = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'install', target: 'java-development@awesome-copilot' });
		const disable = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'disable', target: install.plugins[0].spec });
		const uninstall = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'uninstall', target: disable.plugins[0].spec });
		assert.deepStrictEqual({
			identity: install.plugins[0].spec,
			messages: install.messages,
			enabled: disable.plugins[0].enabled,
			remaining: uninstall.plugins,
			calls,
		}, {
			identity: 'java-development@awesome-copilot',
			messages: ['Setup instructions'],
			enabled: false,
			remaining: [],
			calls: [
				'install:java-development@awesome-copilot', 'reload', 'list',
				'list', 'disable:java-development@awesome-copilot', 'reload', 'list',
				'uninstall:java-development@awesome-copilot:', 'reload', 'list',
			],
		});
	});

	test('browse skips unavailable marketplaces and does not reload', async () => {
		const { api, calls } = createPlugins();
		const result = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'browse' });
		assert.deepStrictEqual({ result, calls }, {
			result: {
				plugins: [],
				catalog: [{ name: 'java-development', marketplace: 'awesome-copilot', spec: 'java-development@awesome-copilot', description: 'Java tools' }],
				messages: [],
			},
			calls: ['browse:awesome-copilot', 'list'],
		});
	});

	test('managed, built-in, direct and live plugins expose only applicable actions', async () => {
		const { api, setInstalled } = createPlugins();
		setInstalled([
			{ name: 'managed', marketplace: 'catalog', enabled: false, managed: true },
			{ name: 'builtin', marketplace: '', enabled: true, source: 'builtin' },
			{ name: 'direct', marketplace: '', enabled: true, directSourceId: 'direct-id' },
			{ name: 'live', marketplace: 'catalog', enabled: true, installedFrom: '/live' },
			{ name: 'missing', marketplace: 'catalog', enabled: false, installed: false },
		]);
		const result = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'list' });
		assert.deepStrictEqual(result.plugins.map(plugin => [plugin.spec, plugin.canToggle, plugin.canUninstall]), [
			['managed@catalog', false, false],
			['builtin', false, false],
			['direct', false, true],
			['live@catalog', true, false],
			['missing@catalog', false, false],
		]);
	});

	test('invalid toggle targets fail explicitly rather than accepting SDK ignored names', async () => {
		const { api } = createPlugins();
		await assert.rejects(manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'disable', target: 'missing@catalog' }), /Select one installed marketplace plugin/);
	});

	test('duplicate direct sources can be removed by identity but cannot be updated by bare name', async () => {
		const { api, calls, setInstalled } = createPlugins();
		setInstalled([
			{ name: 'direct', marketplace: '', enabled: true, directSourceId: 'first' },
			{ name: 'direct', marketplace: '', enabled: true, directSourceId: 'second' },
		]);
		const result = await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'list' });
		await assert.rejects(manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'update', target: 'direct' }), /uniquely identified/);
		assert.deepStrictEqual({ actions: result.plugins.map(plugin => [plugin.canUninstall, plugin.canUpdate]), calls }, { actions: [[true, false], [true, false]], calls: ['list', 'list'] });
	});

	test('policy and mutation errors propagate without a success snapshot', async () => {
		const { api, calls } = createPlugins();
		api.install = async () => { throw new Error('Marketplace blocked by managed settings'); };
		await assert.rejects(manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'install', target: 'blocked@catalog' }), /blocked by managed settings/);
		assert.deepStrictEqual(calls, []);
	});

	test('registers a configured marketplace through the SDK before installing', async () => {
		const { api, calls } = createPlugins();
		await manageCopilotPlugins(api, { provider: 'copilotcli', operation: 'install', target: 'java-development@custom', marketplaceSource: 'owner/catalog' });
		assert.deepStrictEqual(calls, ['add:owner/catalog', 'install:java-development@custom', 'reload', 'list']);
	});
});
