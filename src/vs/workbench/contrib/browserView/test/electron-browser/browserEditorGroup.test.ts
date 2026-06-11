/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, SIDE_GROUP, USE_MODAL_EDITOR_SETTING } from '../../../../services/editor/common/editorService.js';
import { getBrowserEditorGroup } from '../../electron-browser/browserEditorGroup.js';

suite('BrowserView - getBrowserEditorGroup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// The helper only reads `mainPart.activeGroup`, so a minimal sentinel is enough.
	const mainActiveGroup = { id: 42 } as unknown as IEditorGroup;
	const editorGroupsService = { mainPart: { activeGroup: mainActiveGroup } } as unknown as IEditorGroupsService;

	test('redirects active/unspecified group to the main editor part when useModal is "all"', async () => {
		const configurationService: IConfigurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(USE_MODAL_EDITOR_SETTING, 'all');

		const results = [
			getBrowserEditorGroup(editorGroupsService, configurationService),
			getBrowserEditorGroup(editorGroupsService, configurationService, ACTIVE_GROUP),
			getBrowserEditorGroup(editorGroupsService, configurationService, SIDE_GROUP),
		];

		assert.deepStrictEqual(results, [mainActiveGroup, mainActiveGroup, SIDE_GROUP]);
	});

	test('leaves the preferred group untouched when useModal is not "all"', () => {
		const configurationService: IConfigurationService = new TestConfigurationService();

		const results = [
			getBrowserEditorGroup(editorGroupsService, configurationService),
			getBrowserEditorGroup(editorGroupsService, configurationService, ACTIVE_GROUP),
			getBrowserEditorGroup(editorGroupsService, configurationService, SIDE_GROUP),
		];

		assert.deepStrictEqual(results, [undefined, ACTIVE_GROUP, SIDE_GROUP]);
	});
});
