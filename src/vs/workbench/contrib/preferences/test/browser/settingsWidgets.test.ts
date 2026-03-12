/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getEnumItemDescriptionAndIcon } from '../../browser/settingsWidgets.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('SettingsWidgets', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts an icon-only markdown enum description', () => {
		const result = getEnumItemDescriptionAndIcon('$(terminal-bash)', true);

		assert.strictEqual(result.icon?.id, 'terminal-bash');
		assert.strictEqual(result.description, undefined);
	});

	test('extracts a leading icon and keeps the remaining markdown description', () => {
		const result = getEnumItemDescriptionAndIcon('$(zap) **Fast** option', true);

		assert.strictEqual(result.icon?.id, 'zap');
		assert.strictEqual(result.description, '**Fast** option');
	});

	test('ignores icon markup in non-markdown enum descriptions', () => {
		const result = getEnumItemDescriptionAndIcon('$(zap)', false);

		assert.strictEqual(result.icon, undefined);
		assert.strictEqual(result.description, '$(zap)');
	});
});
