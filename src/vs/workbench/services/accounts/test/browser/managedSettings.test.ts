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

	test('carries strictKnownMarketplaces as a boolean managed setting', () => {
		assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: true }), {
			managedSettings: { strictKnownMarketplaces: true },
		});
		assert.deepStrictEqual(adaptManagedSettings({ strictKnownMarketplaces: false }), {
			managedSettings: { strictKnownMarketplaces: false },
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
			strictKnownMarketplaces: true,
		}), {
			managedSettings: {
				strictKnownMarketplaces: true,
				enabledPlugins: '{"p@m":true}',
				extraKnownMarketplaces: '{"a":"a/b#r"}',
			},
		});
	});

	test('resilience: unknown scalar keys flatten into the bag alongside structured keys', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			strictKnownMarketplaces: false,
			joshsFakeSetting: true,
		} as IManagedSettingsResponse), {
			managedSettings: {
				strictKnownMarketplaces: false,
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

	test('current contract: enabledPlugins values pass through without boolean coercion', () => {
		// adaptManagedSettings validates the SHAPE (must be an object) but NOT value
		// types — a non-boolean value survives as-is. Downstream, discovery treats any
		// non-`false` value as enabled while the policy gate treats any non-`true`
		// value as blocked, so off-spec values are interpreted inconsistently. This
		// test pins the current behaviour.
		const result = adaptManagedSettings({
			enabledPlugins: { 'p@m': 'yes' } as unknown as Record<string, boolean>,
		});
		assert.deepStrictEqual(result.enabledPlugins, { 'p@m': 'yes' });
	});

	test('current contract: an explicit empty enabledPlugins object is preserved (distinct from omitted)', () => {
		// `{}` is a valid object, so it is preserved rather than coerced to undefined.
		// The omitted case (see "empty response") yields undefined instead.
		assert.deepStrictEqual(adaptManagedSettings({ enabledPlugins: {} }).enabledPlugins, {});
	});

	test('warns and skips a github source missing its repo', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: { 'gh': { source: { source: 'github' } } },
		} as unknown as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(result.extraKnownMarketplaces, []);
		assert.strictEqual(warnings.length, 1);
		assert.ok(warnings[0].includes('"repo"'), warnings[0]);
	});

	test('warns and skips a git source missing its url', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: { 'g': { source: { source: 'git' } } },
		} as unknown as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(result.extraKnownMarketplaces, []);
		assert.strictEqual(warnings.length, 1);
		assert.ok(warnings[0].includes('"url"'), warnings[0]);
	});

	test('does not invoke onWarn for a fully valid response', () => {
		const warnings: string[] = [];
		adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: { 'a': { source: { source: 'github', repo: 'a/b' } } },
			strictKnownMarketplaces: true,
		}, msg => warnings.push(msg));
		assert.strictEqual(warnings.length, 0);
	});
});
