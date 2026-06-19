/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptManagedSettings, IManagedSettingsResponse } from '../../browser/managedSettings.js';

suite('adaptManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty response yields an empty managed settings bag', () => {
		assert.deepStrictEqual(adaptManagedSettings({}), {
			managedSettings: {},
		});
	});

	test('normalizes permissions into a dot-path managed setting', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}), {
			managedSettings: {
				'permissions.disableBypassPermissionsMode': 'disable',
			},
		});
	});

	test('carries enabledPlugins as a canonical JSON string under a single key', () => {
		const response: IManagedSettingsResponse = {
			enabledPlugins: {
				'assign-issue-to-copilot@agent-skills': true,
				'my-plugin@acme': false,
			},
		};
		assert.deepStrictEqual(adaptManagedSettings(response), {
			managedSettings: {
				enabledPlugins: '{"assign-issue-to-copilot@agent-skills":true,"my-plugin@acme":false}',
			},
		});
	});

	test('carries strictKnownMarketplaces as a canonical JSON string under a single key', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			strictKnownMarketplaces: [{ source: 'github', repo: 'rwoll/markdown-review' }],
		}), {
			managedSettings: {
				strictKnownMarketplaces: '[{"source":"github","repo":"rwoll/markdown-review"}]',
			},
		});
	});

	test('carries an empty strictKnownMarketplaces array (lockdown) as a JSON string', () => {
		assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: [] }), {
			managedSettings: { strictKnownMarketplaces: '[]' },
		});
	});

	test('encodes github marketplaces as a { name: shorthand } JSON dict', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'github/agent-skills' } },
				'b': { source: { source: 'github', repo: 'acme/things', ref: 'main' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"github/agent-skills","b":"acme/things#main"}',
			},
		});
	});

	test('encodes git marketplaces as a { name: url } JSON dict', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'git', url: 'https://example.com/repo.git' } },
				'b': { source: { source: 'git', url: 'ssh://git@host/path.git', ref: 'v1' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"https://example.com/repo.git","b":"ssh://git@host/path.git#v1"}',
			},
		});
	});

	test('encodes mixed github + git marketplaces, dedups by name', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b' } },
				'b': { source: { source: 'git', url: 'https://example.com/r.git' } },
			},
		}), {
			managedSettings: {
				extraKnownMarketplaces: '{"a":"a/b","b":"https://example.com/r.git"}',
			},
		});
	});

	test('handles a full populated response (all three structured settings together)', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b', ref: 'r' } },
			},
			strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }],
		}), {
			managedSettings: {
				strictKnownMarketplaces: '[{"source":"github","repo":"a/b"}]',
				enabledPlugins: '{"p@m":true}',
				extraKnownMarketplaces: '{"a":"a/b#r"}',
			},
		});
	});

	test('resilience: unknown scalar keys flatten into the bag alongside structured keys', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			strictKnownMarketplaces: [],
			joshsFakeSetting: true,
		} as IManagedSettingsResponse), {
			managedSettings: {
				strictKnownMarketplaces: '[]',
				joshsFakeSetting: true,
				enabledPlugins: '{"p@m":true}',
			},
		});
	});

	test('resilience: malformed marketplace entries are skipped, valid entries still processed', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'good': { source: { source: 'github', repo: 'a/b' } },
				'bad-no-source': {} as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
				'bad-unknown-type': { source: { source: 'ftp', url: 'ftp://x' } } as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
			},
		} as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(result, {
			managedSettings: {
				extraKnownMarketplaces: '{"good":"a/b"}',
			},
		});
		assert.strictEqual(warnings.length, 2);
	});

	test('resilience: a marketplace string array (wrong format) is treated as missing, no throw', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			extraKnownMarketplaces: ['https://plugins.acme.com'] as unknown as IManagedSettingsResponse['extraKnownMarketplaces'],
		} as IManagedSettingsResponse), {
			managedSettings: {},
		});
	});
});
