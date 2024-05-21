/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorGroupsService, GroupsOrder, IEditorGroup, preferredSideBySideGroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, ACTIVE_GROUP_TYPE, SIDE_GROUP, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';

/**
 * A way to address editor groups through a column based system
 * where `0` is the first column. Will fallback to `SIDE_GROUP`
 * in case the column is invalid.
 */
export type EditorGroupColumn = number;

export function columnToEditorGroup(editorGroupService: IEditorGroupsService, configurationService: IConfigurationService, column = ACTIVE_GROUP): GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE {
	if (column === ACTIVE_GROUP || column === SIDE_GROUP) {
		return column; // return early for when column is well known
	}

	let groupInColumn = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)[column];

	// If a column is asked for that does not exist, we create up to 9 columns in accordance
	// to what `ViewColumn` provides and otherwise fallback to `SIDE_GROUP`.

	if (!groupInColumn && column < 9) {
		for (let i = 0; i <= column; i++) {
			const editorGroups = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE);
			if (!editorGroups[i]) {
				editorGroupService.addGroup(editorGroups[i - 1], preferredSideBySideGroupDirection(configurationService));
			}
		}

		groupInColumn = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)[column];
	}

	return groupInColumn?.id ?? SIDE_GROUP; // finally open to the side when group not found
}

export function editorGroupToColumn(editorGroupService: IEditorGroupsService, editorGroup: IEditorGroup | GroupIdentifier): EditorGroupColumn {
	const group = (typeof editorGroup === 'number') ? editorGroupService.getGroup(editorGroup) : editorGroup;

	return editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).indexOf(group ?? editorGroupService.activeGroup);
}
