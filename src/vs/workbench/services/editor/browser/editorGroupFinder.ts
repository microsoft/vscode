/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorActivation } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier, IEditorInputWithOptions, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { IEditorGroup, GroupsOrder, preferredSideBySideGroupDirection, IEditorGroupsService, isEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP_TYPE, SIDE_GROUP, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';

export type PreferredGroup = IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE;

export function isPreferredGroup(obj: unknown): obj is PreferredGroup {
	const candidate = obj as PreferredGroup | undefined;

	return typeof obj === 'number' || isEditorGroup(candidate);
}

/**
 * Finds the target `IEditorGroup` given the instructions provided
 * that is best for the editor and matches the preferred group if
 * posisble.
 */
export function findGroup(accessor: ServicesAccessor, editor: IEditorInputWithOptions, preferredGroup: PreferredGroup | undefined): [IEditorGroup, EditorActivation | undefined];
export function findGroup(accessor: ServicesAccessor, editor: IUntypedEditorInput, preferredGroup: PreferredGroup | undefined): [IEditorGroup, EditorActivation | undefined];
export function findGroup(accessor: ServicesAccessor, editor: IEditorInputWithOptions | IUntypedEditorInput, preferredGroup: PreferredGroup | undefined): [IEditorGroup, EditorActivation | undefined] {
	const editorGroupService = accessor.get(IEditorGroupsService);
	const configurationService = accessor.get(IConfigurationService);

	const group = doFindGroup(editor, preferredGroup, editorGroupService, configurationService);

	// Resolve editor activation strategy
	let activation: EditorActivation | undefined = undefined;
	if (
		editorGroupService.activeGroup !== group && 	// only if target group is not already active
		editor.options && !editor.options.inactive &&		// never for inactive editors
		editor.options.preserveFocus &&						// only if preserveFocus
		typeof editor.options.activation !== 'number' &&	// only if activation is not already defined (either true or false)
		preferredGroup !== SIDE_GROUP						// never for the SIDE_GROUP
	) {
		// If the resolved group is not the active one, we typically
		// want the group to become active. There are a few cases
		// where we stay away from encorcing this, e.g. if the caller
		// is already providing `activation`.
		//
		// Specifically for historic reasons we do not activate a
		// group is it is opened as `SIDE_GROUP` with `preserveFocus:true`.
		// repeated Alt-clicking of files in the explorer always open
		// into the same side group and not cause a group to be created each time.
		activation = EditorActivation.ACTIVATE;
	}

	return [group, activation];
}

function doFindGroup(editor: IEditorInputWithOptions | IUntypedEditorInput, preferredGroup: PreferredGroup | undefined, editorGroupService: IEditorGroupsService, configurationService: IConfigurationService): IEditorGroup {
	let group: IEditorGroup | undefined;

	// Group: Instance of Group
	if (preferredGroup && typeof preferredGroup !== 'number') {
		group = preferredGroup;
	}

	// Group: Side by Side
	else if (preferredGroup === SIDE_GROUP) {
		group = doFindSideBySideGroup(editorGroupService, configurationService);
	}

	// Group: Specific Group
	else if (typeof preferredGroup === 'number' && preferredGroup >= 0) {
		group = editorGroupService.getGroup(preferredGroup);
	}

	// Group: Unspecified without a specific index to open
	else if (!editor.options || typeof editor.options.index !== 'number') {
		const groupsByLastActive = editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);

		// Respect option to reveal an editor if it is already visible in any group
		if (editor.options?.revealIfVisible) {
			for (const lastActiveGroup of groupsByLastActive) {
				if (lastActiveGroup.isActive(editor)) {
					group = lastActiveGroup;
					break;
				}
			}
		}

		// Respect option to reveal an editor if it is open (not necessarily visible)
		// Still prefer to reveal an editor in a group where the editor is active though.
		if (!group) {
			if (editor.options?.revealIfOpened || configurationService.getValue<boolean>('workbench.editor.revealIfOpen')) {
				let groupWithInputActive: IEditorGroup | undefined = undefined;
				let groupWithInputOpened: IEditorGroup | undefined = undefined;

				for (const group of groupsByLastActive) {
					if (group.contains(editor)) {
						if (!groupWithInputOpened) {
							groupWithInputOpened = group;
						}

						if (!groupWithInputActive && group.isActive(editor)) {
							groupWithInputActive = group;
						}
					}

					if (groupWithInputOpened && groupWithInputActive) {
						break; // we found all groups we wanted
					}
				}

				// Prefer a target group where the input is visible
				group = groupWithInputActive || groupWithInputOpened;
			}
		}
	}

	// Fallback to active group if target not valid
	if (!group) {
		group = editorGroupService.activeGroup;
	}

	return group;
}

function doFindSideBySideGroup(editorGroupService: IEditorGroupsService, configurationService: IConfigurationService): IEditorGroup {
	const direction = preferredSideBySideGroupDirection(configurationService);

	let neighbourGroup = editorGroupService.findGroup({ direction });
	if (!neighbourGroup) {
		neighbourGroup = editorGroupService.addGroup(editorGroupService.activeGroup, direction);
	}

	return neighbourGroup;
}
