/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorGroupsService, GroupsOrder, IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, ACTIVE_GROUP_TYPE, SIDE_GROUP, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';

/**
 * A way to address editor groups through a column based system
 * where `0` is the first column. Will fallback to `SIDE_GROUP`
 * in case the column does not exist yet.
 */
export type EditorGroupColumn = number;

export function columnToEditorGroup(editorGroupService: IEditorGroupsService, column?: EditorGroupColumn): GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE {
	if (
		typeof column !== 'number' ||
		column === ACTIVE_GROUP ||
		(editorGroupService.count === 1 && editorGroupService.activeGroup.isEmpty)
	) {
		return ACTIVE_GROUP; // prefer active group when position is undefined or passed in as such or when no editor is opened
	}

	if (column === SIDE_GROUP) {
		return SIDE_GROUP; // return early for when column is to the side
	}

	const groupInColumn = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)[column];
	if (groupInColumn) {
		return groupInColumn.id; // return group when a direct match is found in column
	}

	return SIDE_GROUP; // finally open to the side when group not found
}

export function editorGroupToColumn(editorGroupService: IEditorGroupsService, editorGroup: IEditorGroup | GroupIdentifier): EditorGroupColumn {
	const group = (typeof editorGroup === 'number') ? editorGroupService.getGroup(editorGroup) : editorGroup;

	return editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).indexOf(group ?? editorGroupService.activeGroup);
}
