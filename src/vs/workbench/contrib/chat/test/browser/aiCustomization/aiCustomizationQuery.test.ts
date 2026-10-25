/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationDiscoveryQuery, getCustomizationDiscoveryQuerySuggestions } from '../../../browser/aiCustomization/aiCustomizationQuery.js';

suite('CustomizationDiscoveryQuery', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses free text and filters', () => {
		const query = CustomizationDiscoveryQuery.parse('  deploy tools  @installed @type:mcp  ');

		assert.deepStrictEqual({
			text: query.text,
			installed: query.installed,
			types: [...query.types],
			serialized: query.toString(),
		}, {
			text: 'deploy tools',
			installed: true,
			types: ['mcp'],
			serialized: 'deploy tools @type:mcp @installed',
		});
	});

	test('canonicalizes aliases, casing, duplicates, and token order', () => {
		const query = CustomizationDiscoveryQuery.parse('@TYPE:PLUGINS @Installed @type:Skills @type:MCPs @type:plugin');

		assert.deepStrictEqual({
			types: [...query.types],
			serialized: query.toString(),
			stable: CustomizationDiscoveryQuery.parse(query.toString()).toString(),
		}, {
			types: ['plugin', 'skill', 'mcp'],
			serialized: '@type:skill @type:mcp @type:plugin @installed',
			stable: '@type:skill @type:mcp @type:plugin @installed',
		});
	});

	test('preserves unknown, malformed, quoted, and punctuated tokens as search text', () => {
		const query = CustomizationDiscoveryQuery.parse('find @type:agent @type: "@installed" @installed, @other:value @type:skill');

		assert.deepStrictEqual({
			text: query.text,
			installed: query.installed,
			types: [...query.types],
			serialized: query.toString(),
		}, {
			text: 'find @type:agent @type: "@installed" @installed, @other:value',
			installed: false,
			types: ['skill'],
			serialized: 'find @type:agent @type: "@installed" @installed, @other:value @type:skill',
		});
	});

	test('multiple selected types represent an OR set', () => {
		const query = CustomizationDiscoveryQuery.parse('@type:skill @type:plugin');

		assert.deepStrictEqual({
			hasSkill: query.types.has('skill'),
			hasMcp: query.types.has('mcp'),
			hasPlugin: query.types.has('plugin'),
			count: query.types.size,
		}, {
			hasSkill: true,
			hasMcp: false,
			hasPlugin: true,
			count: 2,
		});
	});

	test('checks equality and emptiness using normalized state', () => {
		const empty = CustomizationDiscoveryQuery.parse(' \t ');
		const first = CustomizationDiscoveryQuery.parse('query @TYPE:MCP @installed');
		const reordered = CustomizationDiscoveryQuery.parse('@INSTALLED @type:mcps query');

		assert.deepStrictEqual({
			empty: empty.isEmpty(),
			filteredEmpty: CustomizationDiscoveryQuery.parse('@installed').isEmpty(),
			equal: first.equals(reordered),
			notEqual: first.equals(reordered.withType('mcp', false)),
		}, {
			empty: true,
			filteredEmpty: false,
			equal: true,
			notEqual: false,
		});
	});

	test('quick-filter helpers round trip through canonical serialization without mutation', () => {
		const initial = CustomizationDiscoveryQuery.parse('docker');
		const filtered = initial
			.withInstalled(true)
			.withType('mcp', true)
			.withType('plugin', true);
		const restored = CustomizationDiscoveryQuery.parse(filtered.toString())
			.withInstalled(false)
			.withType('mcp', false)
			.withType('plugin', false);

		assert.deepStrictEqual({
			initial: initial.toString(),
			filtered: filtered.toString(),
			roundTripEqual: filtered.equals(CustomizationDiscoveryQuery.parse(filtered.toString())),
			restored: restored.toString(),
			restoredEqualsInitial: restored.equals(initial),
		}, {
			initial: 'docker',
			filtered: 'docker @type:mcp @type:plugin @installed',
			roundTripEqual: true,
			restored: 'docker',
			restoredEqualsInitial: true,
		});
	});

	test('provides SuggestEnabledInput-compatible values', () => {
		assert.deepStrictEqual(
			getCustomizationDiscoveryQuerySuggestions('@installed @type:skills '),
			['@type:mcp ', '@type:plugin '],
		);
	});
});
