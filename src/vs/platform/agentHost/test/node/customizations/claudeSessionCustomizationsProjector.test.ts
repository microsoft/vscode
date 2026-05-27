/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationLoadStatus, CustomizationType, customizationId, type Customization } from '../../../common/state/sessionState.js';
import { projectSessionCustomizations } from '../../../node/claude/customizations/claudeSessionCustomizationsProjector.js';

function client(uri: string, enabled = true): ISyncedCustomization {
	return {
		customization: {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: uri,
			enabled,
			load: { kind: CustomizationLoadStatus.Loaded },
		},
	};
}

function discoveredBundle(uri: string): Customization {
	return {
		type: CustomizationType.Plugin,
		id: customizationId(uri),
		uri,
		name: 'VS Code Synced Data',
		enabled: true,
		load: { kind: CustomizationLoadStatus.Loaded },
	};
}

suite('projectSessionCustomizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns only client-pushed entries when no discovery bundle', () => {
		const result = projectSessionCustomizations([client('https://a')], new Map(), undefined);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].uri.toString(), 'https://a');
		assert.strictEqual(result[0].enabled, true);
	});

	test('overlays enablement map (keyed by id) on client-pushed entries', () => {
		const result = projectSessionCustomizations(
			[client('https://a'), client('https://b')],
			new Map([[customizationId('https://a'), false]]),
			undefined,
		);
		assert.strictEqual(result.find(c => c.uri.toString() === 'https://a')?.enabled, false);
		assert.strictEqual(result.find(c => c.uri.toString() === 'https://b')?.enabled, true);
	});

	test('appends the discovery bundle verbatim', () => {
		const bundleUri = URI.file('/tmp/host-discovery/x').toString();
		const result = projectSessionCustomizations(
			[client('https://a')],
			new Map(),
			discoveredBundle(bundleUri),
		);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[1].uri.toString(), bundleUri);
		assert.strictEqual(result[1].enabled, true);
	});

	test('discovery bundle enablement is not overlaid from the map', () => {
		const bundleUri = URI.file('/tmp/host-discovery/x').toString();
		const result = projectSessionCustomizations(
			[],
			new Map([[customizationId(bundleUri), false]]),
			discoveredBundle(bundleUri),
		);
		assert.strictEqual(result[0].enabled, true);
	});
});
