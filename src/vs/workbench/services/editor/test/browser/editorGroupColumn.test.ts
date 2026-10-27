/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { columnToEditorGroup } from '../../common/editorGroupColumn.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../common/editorGroupsService.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../common/editorService.js';

suite('columnToEditorGroup', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createGroupsService(activePartViewColumnGroup: IEditorGroup | undefined, activeIsMain: boolean): IEditorGroupsService {
		const mainGroups = [upcastPartial<IEditorGroup>({ id: 1 }), upcastPartial<IEditorGroup>({ id: 2 })];
		const auxiliaryActiveGroup = upcastPartial<IEditorGroup>({ id: 10 });
		const mainPart = upcastPartial<IEditorPart>({ viewColumnGroup: undefined });
		const auxiliaryPart = upcastPartial<IEditorPart>({ viewColumnGroup: activePartViewColumnGroup });
		return upcastPartial<IEditorGroupsService>({
			mainPart,
			activeGroup: activeIsMain ? mainGroups[0] : auxiliaryActiveGroup,
			getPart: (group: IEditorGroup | number) => (typeof group === 'number' ? group : group.id) >= 10 ? auxiliaryPart : mainPart,
			getGroups: () => mainGroups,
		});
	}

	test('numbered columns open in the view column group of the active part, and in the main part otherwise', () => {
		const configurationService = new TestConfigurationService();
		const viewColumnGroup = upcastPartial<IEditorGroup>({ id: 11 });

		assert.deepStrictEqual({
			activeAuxiliaryPartWithGroup: [0, 1].map(column => columnToEditorGroup(createGroupsService(viewColumnGroup, false), configurationService, column)),
			activeAuxiliaryPartWithoutGroup: [0, 1].map(column => columnToEditorGroup(createGroupsService(undefined, false), configurationService, column)),
			activeMainPart: [0, 1].map(column => columnToEditorGroup(createGroupsService(viewColumnGroup, true), configurationService, column)),
			wellKnown: [ACTIVE_GROUP, SIDE_GROUP].map(column => columnToEditorGroup(createGroupsService(viewColumnGroup, false), configurationService, column)),
		}, {
			activeAuxiliaryPartWithGroup: [11, 11],
			activeAuxiliaryPartWithoutGroup: [1, 2],
			activeMainPart: [1, 2],
			wellKnown: [ACTIVE_GROUP, SIDE_GROUP],
		});
	});
});
