/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { RuntimeExtensionsInput } from '../../common/runtimeExtensionsInput.js';

suite('RuntimeExtensionsInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('requires modal presentation', () => {
		const input = store.add(RuntimeExtensionsInput.instance);

		assert.deepStrictEqual({
			readonly: input.hasCapability(EditorInputCapabilities.Readonly),
			singleton: input.hasCapability(EditorInputCapabilities.Singleton),
			requiresModal: input.hasCapability(EditorInputCapabilities.RequiresModal),
		}, {
			readonly: true,
			singleton: true,
			requiresModal: true,
		});
	});
});
