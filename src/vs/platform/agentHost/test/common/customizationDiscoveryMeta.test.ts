/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readCustomizationDiscoveryMeta, withCustomizationDiscoveryMeta } from '../../common/meta/customizationDiscoveryMeta.js';

suite('CustomizationDiscoveryMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates optional metadata without interpreting opaque identifiers', () => {
		const invalid = [undefined, null, [], 'plugin', { source: false }];
		const meta = withCustomizationDiscoveryMeta({ unrelated: true }, { source: 'plugin', defaultEnabled: false, sourceId: 'opaque#source', pluginId: 'opaque/plugin' });
		assert.deepStrictEqual({
			invalid: invalid.map(value => readCustomizationDiscoveryMeta({ _meta: { 'vscode.customizationDiscovery': value } })),
			valid: readCustomizationDiscoveryMeta({ _meta: meta }),
			unrelated: meta.unrelated,
			malformed: readCustomizationDiscoveryMeta({ _meta: { 'vscode.customizationDiscovery': { source: 'future', defaultEnabled: 'false', hookType: 42, sourceLabel: [], pluginId: {}, sourceId: false } } }),
		}, {
			invalid: invalid.map(() => undefined),
			valid: { source: 'plugin', defaultEnabled: false, sourceId: 'opaque#source', pluginId: 'opaque/plugin', sourceLabel: undefined, hookType: undefined },
			unrelated: true,
			malformed: { source: 'future', defaultEnabled: undefined, sourceId: undefined, pluginId: undefined, sourceLabel: undefined, hookType: undefined },
		});
	});
});
