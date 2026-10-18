/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DEFAULT_COLOR_CONFIG_VALUE, getColorRegistry, registerColor } from '../../common/colorRegistry.js';

suite('Color Registry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shares the default color schema across registered colors', () => {
		const registry = getColorRegistry();
		const firstId = registerColor('test.sharedDefaultColor.first', null, 'First color');
		const secondId = registerColor('test.sharedDefaultColor.second', null, 'Second color', true, 'Deprecated color');
		try {
			const properties = registry.getColorSchema().properties;
			const first = properties?.[firstId].oneOf;
			const second = properties?.[secondId].oneOf;
			assert.ok(first && second);
			assert.strictEqual(first[1], second[1]);
			assert.deepStrictEqual(first[1], { type: 'string', const: DEFAULT_COLOR_CONFIG_VALUE, description: 'Use the default color.' });
			assert.notStrictEqual(first[0], second[0]);
			assert.strictEqual(second[0].deprecationMessage, 'Deprecated color');
		} finally {
			registry.deregisterColor(firstId);
			registry.deregisterColor(secondId);
		}
	});
});
