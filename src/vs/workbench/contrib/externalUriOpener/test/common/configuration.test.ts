/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { externalUriOpenersConfigurationNode, externalUriOpenersSettingId, registerBuiltInExternalUriOpener, updateContributedOpeners } from '../../common/configuration.js';

suite('External URI opener configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getListedOpeners(): ReadonlyArray<{ id: string; description: string | undefined }> {
		const schema = externalUriOpenersConfigurationNode.properties![externalUriOpenersSettingId].additionalProperties as { anyOf: Array<{ enum?: string[]; enumDescriptions?: string[] }> };
		const addition = schema.anyOf[schema.anyOf.length - 1];
		return (addition.enum ?? []).map((id, i) => ({ id, description: addition.enumDescriptions?.[i] }));
	}

	test('lists built-in openers before contributed ones, hides replaced ones and keeps them when contributed openers change', () => {
		const store = new DisposableStore();
		try {
			store.add(registerBuiltInExternalUriOpener('builtIn', 'Built-in', ['replaced']));
			updateContributedOpeners(['contributed', 'replaced'], ['ext.id', 'other.ext']);
			assert.deepStrictEqual(getListedOpeners(), [
				{ id: 'builtIn', description: 'Built-in' },
				{ id: 'contributed', description: 'ext.id' },
			]);

			updateContributedOpeners([], []);
			assert.deepStrictEqual(getListedOpeners(), [{ id: 'builtIn', description: 'Built-in' }]);
		} finally {
			store.dispose();
			updateContributedOpeners([], []);
		}
		assert.deepStrictEqual(getListedOpeners(), []);
	});
});
