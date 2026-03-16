/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { migrateThemeSettingsId } from '../../common/workbenchThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('WorkbenchThemeService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('migrateThemeSettingsId', () => {

		test('migrates Default-prefixed theme IDs', () => {
			assert.deepStrictEqual(
				['Default Dark Modern', 'Default Light Modern', 'Default Dark+', 'Default Light+'].map(migrateThemeSettingsId),
				['Dark Modern', 'Light Modern', 'Dark+', 'Light+']
			);
		});

		test('migrates Experimental theme IDs to VS Code themes', () => {
			assert.deepStrictEqual(
				['Experimental Dark', 'Experimental Light'].map(migrateThemeSettingsId),
				['VS Code Dark', 'VS Code Light']
			);
		});

		test('returns unknown IDs unchanged', () => {
			assert.deepStrictEqual(
				['Dark Modern', 'VS Code Dark', 'Some Custom Theme', ''].map(migrateThemeSettingsId),
				['Dark Modern', 'VS Code Dark', 'Some Custom Theme', '']
			);
		});
	});
});
