/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { adaptManagedSettings, IManagedSettingsResponse } from '../../browser/managedSettings.js';

suite('adaptManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty response yields all-undefined partial (no enterprise policy file present)', () => {
		assert.deepStrictEqual(adaptManagedSettings({}), {
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
			otelEnabled: undefined,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: undefined,
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
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: [
				{ name: 'a', source: { source: 'github', repo: 'a/b', ref: 'r' } },
			],
			strictKnownMarketplaces: true,
			otelEnabled: undefined,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: undefined,
		});
	});

	test('telemetry block: parses enabled/otlpEndpoint/captureContent, malformed sub-fields skipped with warnings', () => {
		// Valid sub-fields pass through as-is.
		assert.deepStrictEqual(adaptManagedSettings({
			telemetry: { enabled: true, otlpEndpoint: 'https://collector.example.com:4318', captureContent: false },
		}), {
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
			otelEnabled: true,
			otelOtlpEndpoint: 'https://collector.example.com:4318',
			otelCaptureContent: false,
		});

		// Partial telemetry block: only some fields specified, rest stay undefined.
		assert.deepStrictEqual(adaptManagedSettings({ telemetry: { enabled: false } }), {
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
			otelEnabled: false,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: undefined,
		});

		// Wrong sub-field types are dropped individually with a warning, sibling fields still parse.
		const warnings: string[] = [];
		const malformed = adaptManagedSettings({
			telemetry: {
				enabled: 'yes' as unknown as boolean,
				otlpEndpoint: 42 as unknown as string,
				captureContent: true,
			},
		}, msg => warnings.push(msg));
		assert.deepStrictEqual(malformed, {
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
			otelEnabled: undefined,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: true,
		});
		assert.strictEqual(warnings.length, 2);

		// Wrong telemetry container shape (array/string) is skipped entirely with one warning.
		const arrWarnings: string[] = [];
		assert.deepStrictEqual(adaptManagedSettings({
			telemetry: ['enabled'] as unknown as { enabled?: boolean },
		}, msg => arrWarnings.push(msg)), {
			enabledPlugins: undefined,
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: undefined,
			otelEnabled: undefined,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: undefined,
		});
		assert.strictEqual(arrWarnings.length, 1);
	});

	test('resilience: unknown top-level keys are silently ignored', () => {
		const result = adaptManagedSettings({
			enabledPlugins: { 'p@m': true },
			strictKnownMarketplaces: false,
			joshsFakeSetting: true,
		} as IManagedSettingsResponse);
		assert.deepStrictEqual(result, {
			enabledPlugins: { 'p@m': true },
			extraKnownMarketplaces: undefined,
			strictKnownMarketplaces: false,
			otelEnabled: undefined,
			otelOtlpEndpoint: undefined,
			otelCaptureContent: undefined,
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
});
