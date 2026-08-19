/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getEffectiveAuthProvider } from '../../electron-browser/extensionGalleryAccess.js';

suite('ExtensionGalleryAccess', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getEffectiveAuthProvider', () => {

		test('resolves microsoft only when configured and Entra auth is enabled', () => {
			const cases = ([
				['microsoft', true],
				['microsoft', false],
				['github', true],
				['github', false],
				[undefined, true],
				[undefined, false],
				['Microsoft', true], // case-sensitive: not the 'microsoft' literal
			] as const).map(([provider, entraEnabled]) => getEffectiveAuthProvider(provider, entraEnabled));

			assert.deepStrictEqual(cases, ['microsoft', 'github', 'github', 'github', 'github', 'github', 'github']);
		});
	});
});
