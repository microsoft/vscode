/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorGroupsService, IEditorGroup, GroupsOrder } from 'vs/workbench/services/group/common/editorGroupsService';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

// TODO@api this was previously a hardcoded list of editor positions (ONE, TWO, THREE)
// that with the introduction of grid editor feature is now unbounded. This should be
// revisited when the grid functionality is exposed to extensions,

export type EditorViewColumn = number;

export function viewColumnToEditorGroup(editorGroupService: IEditorGroupsService, position?: EditorViewColumn): GroupIdentifier {
	if (typeof position !== 'number') {
		return ACTIVE_GROUP; // prefer active group when position is undefined
	}

	const groups = editorGroupService.getGroups(GroupsOrder.CREATION_TIME);

	let candidate = groups[position];
	if (candidate) {
		return candidate.id; // found direct match
	}

	let firstGroup = groups[0];
	if (groups.length === 1 && firstGroup.count === 0) {
		return firstGroup.id; // first editor should always open in first group
	}

	return SIDE_GROUP; // open to the side if group not found
}

export function editorGroupToViewColumn(editorGroupService: IEditorGroupsService, editorGroup: IEditorGroup | GroupIdentifier): EditorViewColumn {
	const group = typeof editorGroup === 'number' ? editorGroupService.getGroup(editorGroup) : editorGroup;

	return editorGroupService.getGroups(GroupsOrder.CREATION_TIME).indexOf(group);
}