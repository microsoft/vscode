/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptManagedSettings, IManagedSettingsResponse } from '../../browser/managedSettings.js';

suite('adaptManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty response yields empty managed settings and undefined legacy fields', () => {
		assert.deepStrictEqual(adaptManagedSettings({}), {
			managedSettings: {},
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
		});
	});

	test('normalizes permissions managed settings into dot-path policy data', () => {
		assert.deepStrictEqual(adaptManagedSettings({
			permissions: { disableBypassPermissionsMode: 'disable' },
		}).managedSettings, {
			'permissions.disableBypassPermissionsMode': 'disable',
		});
	});

	test('passes enabledPlugins through untouched (plugin-ID keys, boolean values)', () => {
		const response: IManagedSettingsResponse = {
			enabledPlugins: {
				'assign-issue-to-copilot@agent-skills': true,
				'my-plugin@acme': false,
			},
		};
		assert.deepStrictEqual(adaptManagedSettings(response).enabledPlugins, {
			'assign-issue-to-copilot@agent-skills': true,
			'my-plugin@acme': false,
		});
	});

	test('passes strictKnownMarketplaces boolean through untouched', () => {
		assert.strictEqual(adaptManagedSettings({ strictKnownMarketplaces: true }).strictKnownMarketplaces, true);
		assert.strictEqual(adaptManagedSettings({ strictKnownMarketplaces: false }).strictKnownMarketplaces, false);
	});

	test('preserves marketplace name + github source shape', () => {
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'github/agent-skills' } },
				'b': { source: { source: 'github', repo: 'acme/things', ref: 'main' } },
			},
		});
		assert.deepStrictEqual(result.extraKnownMarketplaces, [
			{ name: 'a', source: { source: 'github', repo: 'github/agent-skills' } },
			{ name: 'b', source: { source: 'github', repo: 'acme/things', ref: 'main' } },
		]);
	});

	test('preserves marketplace name + git source shape', () => {
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'git', url: 'https://example.com/repo.git' } },
				'b': { source: { source: 'git', url: 'ssh://git@host/path.git', ref: 'v1' } },
			},
		});
		assert.deepStrictEqual(result.extraKnownMarketplaces, [
			{ name: 'a', source: { source: 'git', url: 'https://example.com/repo.git' } },
			{ name: 'b', source: { source: 'git', url: 'ssh://git@host/path.git', ref: 'v1' } },
		]);
	});

	test('handles mixed github + git sources, dedups by marketplace name', () => {
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b' } },
				'b': { source: { source: 'git', url: 'https://example.com/r.git' } },
			},
		});
		assert.deepStrictEqual(result.extraKnownMarketplaces, [
			{ name: 'a', source: { source: 'github', repo: 'a/b' } },
			{ name: 'b', source: { source: 'git', url: 'https://example.com/r.git' } },
		]);
	});

	test('handles full populated response (all three fields together)', () => {
		const result = adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: {
				'a': { source: { source: 'github', repo: 'a/b', ref: 'r' } },
			},
			strictKnownMarketplaces: true,
		});
		assert.deepStrictEqual(result, {
			managedSettings: {
				'enabledPlugins.p@m': true,
				'extraKnownMarketplaces.a.source.source': 'github',
				'extraKnownMarketplaces.a.source.repo': 'a/b',
				'extraKnownMarketplaces.a.source.ref': 'r',
				strictKnownMarketplaces: true,
			},
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: [
				{ name: 'a', source: { source: 'github', repo: 'a/b', ref: 'r' } },
			],
			strictKnownMarketplaces: true,
		});
	});

	test('resilience: unknown top-level keys are preserved only in normalized managed settings', () => {
		const result = adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			strictKnownMarketplaces: false,
			joshsFakeSetting: true,
		} as IManagedSettingsResponse);
		assert.deepStrictEqual(result, {
			managedSettings: {
				'enabledPlugins.p@m': true,
				strictKnownMarketplaces: false,
				joshsFakeSetting: true,
			},
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: false,
		});
	});

	test('resilience: malformed extraKnownMarketplaces entry is skipped, valid entries still processed', () => {
		const warnings: string[] = [];
		const result = adaptManagedSettings({
			extraKnownMarketplaces: {
				'good': { source: { source: 'github', repo: 'a/b' } },
				'bad-no-source': {} as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
				'bad-unknown-type': { source: { source: 'ftp', url: 'ftp://x' } } as IManagedSettingsResponse['extraKnownMarketplaces'] extends Record<string, infer V> ? V : never,
			},
		} as IManagedSettingsResponse, msg => warnings.push(msg));
		assert.deepStrictEqual(result.extraKnownMarketplaces, [
			{ name: 'good', source: { source: 'github', repo: 'a/b' } },
		]);
		assert.strictEqual(warnings.length, 2);
	});

	test('resilience: extraKnownMarketplaces as a string array (wrong format) yields empty array, no throw', () => {
		const result = adaptManagedSettings({
			extraKnownMarketplaces: ['https://plugins.acme.com'] as unknown as IManagedSettingsResponse['extraKnownMarketplaces'],
		} as IManagedSettingsResponse);
		// Array is not an object-record — treated as missing, so yields undefined
		assert.strictEqual(result.extraKnownMarketplaces, undefined);
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
