/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, unifiedWorkspacePickerConfigurationMigration } from '../../browser/unifiedWorkspacePickerConfiguration.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';

suite('UnifiedWorkspacePickerConfiguration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates application values without overwriting the new setting', async () => {
		const copiedValue = await unifiedWorkspacePickerConfigurationMigration.migrateFn(true, () => undefined);
		const preservedValue = await unifiedWorkspacePickerConfigurationMigration.migrateFn(false, key => key === UNIFIED_WORKSPACE_PICKER_SETTING ? true : undefined);

		assert.deepStrictEqual({
			key: unifiedWorkspacePickerConfigurationMigration.key,
			includeApplication: unifiedWorkspacePickerConfigurationMigration.includeApplication,
			copiedValue,
			preservedValue,
		}, {
			key: LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING,
			includeApplication: true,
			copiedValue: [
				[LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, { value: undefined }],
				[UNIFIED_WORKSPACE_PICKER_SETTING, { value: true }],
			],
			preservedValue: [
				[LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, { value: undefined }],
			],
		});
	});
});
