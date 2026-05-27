/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationStatus, type SessionCustomization } from '../../../common/state/protocol/state.js';
import { projectSessionCustomizations } from '../../../node/claude/customizations/claudeSessionCustomizationsProjector.js';

function client(uri: string, enabled = true): ISyncedCustomization {
	return {
		customization: {
			customization: { uri, displayName: uri },
			enabled,
			status: CustomizationStatus.Loaded,
		},
	};
}

function discoveredBundle(uri: string): SessionCustomization {
	return {
		customization: { uri, displayName: 'VS Code Synced Data' },
		enabled: true,
		status: CustomizationStatus.Loaded,
	};
}

suite('projectSessionCustomizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns only client-pushed entries when no discovery bundle', () => {
		const result = projectSessionCustomizations([client('https://a')], new Map(), undefined);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].customization.uri.toString(), 'https://a');
		assert.strictEqual(result[0].enabled, true);
	});

	test('overlays enablement map on client-pushed entries', () => {
		const result = projectSessionCustomizations(
			[client('https://a'), client('https://b')],
			new Map([['https://a', false]]),
			undefined,
		);
		assert.strictEqual(result.find(c => c.customization.uri.toString() === 'https://a')?.enabled, false);
		assert.strictEqual(result.find(c => c.customization.uri.toString() === 'https://b')?.enabled, true);
	});

	test('appends the discovery bundle verbatim', () => {
		const bundleUri = URI.file('/tmp/host-discovery/x').toString();
		const result = projectSessionCustomizations(
			[client('https://a')],
			new Map(),
			discoveredBundle(bundleUri),
		);
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[1].customization.uri.toString(), bundleUri);
		assert.strictEqual(result[1].enabled, true);
	});

	test('discovery bundle enablement is not overlaid from the map', () => {
		const bundleUri = URI.file('/tmp/host-discovery/x').toString();
		const result = projectSessionCustomizations(
			[],
			new Map([[bundleUri, false]]),
			discoveredBundle(bundleUri),
		);
		assert.strictEqual(result[0].enabled, true);
	});
});
