/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { isEditorInputWithOptions, isEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { preferredSideBySideGroupDirection, IEditorGroupsService } from './editorGroupsService.js';
import { AUX_WINDOW_GROUP, MODAL_GROUP, SIDE_GROUP } from './editorService.js';
export function findGroup(accessor, editor, preferredGroup) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const group = doFindGroup(editor, preferredGroup, editorGroupService, configurationService);
    if (group instanceof Promise) {
        return group.then(group => handleGroupResult(group, editor, preferredGroup, editorGroupService, configurationService));
    }
    return handleGroupResult(group, editor, preferredGroup, editorGroupService, configurationService);
}
function handleGroupResult(group, editor, preferredGroup, editorGroupService, configurationService) {
    const modalEditorPart = editorGroupService.activeModalEditorPart;
    const modalEditorMode = configurationService.getValue('workbench.editor.useModal');
    const editorInput = isEditorInputWithOptions(editor) ? editor.editor : isEditorInput(editor) ? editor : undefined;
    const requiresModal = editorInput instanceof EditorInput && editorInput.hasCapability(2048 /* EditorInputCapabilities.RequiresModal */);
    if (modalEditorPart && preferredGroup !== MODAL_GROUP && modalEditorMode !== 'all' && !requiresModal) {
        // Only allow to open in modal group if MODAL_GROUP is explicitly requested
        // or when the setting is configured to open all editors modal or when the
        // editor has the RequiresModal capability.
        return handleModalEditorPart(group, editor, modalEditorPart, editorGroupService, preferredGroup);
    }
    return handleGroupActivation(group, editor, preferredGroup, editorGroupService);
}
async function handleModalEditorPart(group, editor, modalEditorPart, editorGroupService, preferredGroup) {
    const options = editor.options;
    // If the resolved group is part of the modal, redirect
    // to the main window active group instead
    if (modalEditorPart.groups.some(modalGroup => modalGroup.id === group.id)) {
        group = editorGroupService.mainPart.activeGroup;
    }
    // Try to close the modal editor part unless preserveFocus is set
    if (!options?.preserveFocus) {
        await modalEditorPart.close();
    }
    return handleGroupActivation(group, editor, preferredGroup, editorGroupService);
}
function handleGroupActivation(group, editor, preferredGroup, editorGroupService) {
    // Resolve editor activation strategy
    let activation = undefined;
    if (editorGroupService.activeGroup !== group && // only if target group is not already active
        editor.options && !editor.options.inactive && // never for inactive editors
        editor.options.preserveFocus && // only if preserveFocus
        typeof editor.options.activation !== 'number' && // only if activation is not already defined (either true or false)
        preferredGroup !== SIDE_GROUP // never for the SIDE_GROUP
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
function doFindGroup(input, preferredGroup, editorGroupService, configurationService) {
    let group;
    const editor = isEditorInputWithOptions(input) ? input.editor : input;
    const options = input.options;
    // Group: Force modal if the editor has the RequiresModal capability
    if (isEditorInput(editor) && editor.hasCapability(2048 /* EditorInputCapabilities.RequiresModal */)) {
        group = editorGroupService.createModalEditorPart(options?.modal)
            .then(part => part.activeGroup);
    }
    // Group: Instance of Group
    else if (preferredGroup && typeof preferredGroup !== 'number') {
        group = preferredGroup;
    }
    // Group: Specific Group
    else if (typeof preferredGroup === 'number' && preferredGroup >= 0) {
        group = editorGroupService.getGroup(preferredGroup);
    }
    // Group: Side by Side
    else if (preferredGroup === SIDE_GROUP) {
        const direction = preferredSideBySideGroupDirection(configurationService);
        let candidateGroup = editorGroupService.findGroup({ direction });
        if (!candidateGroup || isGroupLockedForEditor(candidateGroup, editor)) {
            // Create new group either when the candidate group
            // is locked or was not found in the direction
            candidateGroup = editorGroupService.addGroup(editorGroupService.activeGroup, direction);
        }
        group = candidateGroup;
    }
    // Group: Aux Window
    else if (preferredGroup === AUX_WINDOW_GROUP) {
        group = editorGroupService.createAuxiliaryEditorPart(options?.auxiliary)
            .then(group => group.activeGroup);
    }
    // Group: Modal (gated behind a setting)
    else if (preferredGroup === MODAL_GROUP && configurationService.getValue('workbench.editor.useModal') !== 'off') {
        group = editorGroupService.createModalEditorPart(options?.modal)
            .then(part => part.activeGroup);
    }
    // Group: Unspecified without a specific index to open
    else if (!options || typeof options.index !== 'number') {
        const groupsByLastActive = editorGroupService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
        // Respect option to reveal an editor if it is already visible in any group
        if (options?.revealIfVisible) {
            for (const lastActiveGroup of groupsByLastActive) {
                if (isActive(lastActiveGroup, editor)) {
                    group = lastActiveGroup;
                    break;
                }
            }
        }
        // Respect option to reveal an editor if it is open (not necessarily visible)
        // Still prefer to reveal an editor in a group where the editor is active though.
        // We also try to reveal an editor if it has the `ForceReveal` or `Singleton`
        // capability which indicates that editor prefers to be revealed.
        if (!group) {
            if (options?.revealIfOpened || configurationService.getValue('workbench.editor.revealIfOpen') || (isEditorInput(editor) && (editor.hasCapability(1024 /* EditorInputCapabilities.ForceReveal */) || editor.hasCapability(8 /* EditorInputCapabilities.Singleton */)))) {
                let groupWithInputActive = undefined;
                let groupWithInputOpened = undefined;
                for (const group of groupsByLastActive) {
                    if (isOpened(group, editor)) {
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
    // Force modal editor part: redirect to the modal group when setting is 'on'
    if (!group && configurationService.getValue('workbench.editor.useModal') === 'all') {
        group = editorGroupService.createModalEditorPart(options?.modal)
            .then(part => part.activeGroup);
    }
    // Fallback to active group if target not valid but avoid
    // locked editor groups unless editor is already opened there
    if (!group) {
        let candidateGroup = editorGroupService.activeGroup;
        // Locked group: find the next non-locked group
        // going up the neigbours of the group or create
        // a new group otherwise
        if (isGroupLockedForEditor(candidateGroup, editor)) {
            for (const group of editorGroupService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
                if (isGroupLockedForEditor(group, editor)) {
                    continue;
                }
                candidateGroup = group;
                break;
            }
            if (isGroupLockedForEditor(candidateGroup, editor)) {
                // Group is still locked, so we have to create a new
                // group to the side of the candidate group
                group = editorGroupService.addGroup(candidateGroup, preferredSideBySideGroupDirection(configurationService));
            }
            else {
                group = candidateGroup;
            }
        }
        // Non-locked group: take as is
        else {
            group = candidateGroup;
        }
    }
    return group;
}
function isGroupLockedForEditor(group, editor) {
    if (!group.isLocked) {
        // only relevant for locked editor groups
        return false;
    }
    if (isOpened(group, editor)) {
        // special case: the locked group contains
        // the provided editor. in that case we do not want
        // to open the editor in any different group.
        return false;
    }
    // group is locked for this editor
    return true;
}
function isActive(group, editor) {
    if (!group.activeEditor) {
        return false;
    }
    return group.activeEditor.matches(editor);
}
function isOpened(group, editor) {
    for (const typedEditor of group.editors) {
        if (typedEditor.matches(editor)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yR3JvdXBGaW5kZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cEZpbmRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVoRixPQUFPLEVBQTBCLHdCQUF3QixFQUF1QixhQUFhLEVBQTJCLE1BQU0sMkJBQTJCLENBQUM7QUFDMUosT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBNkIsaUNBQWlDLEVBQUUsb0JBQW9CLEVBQW9CLE1BQU0sMEJBQTBCLENBQUM7QUFDaEosT0FBTyxFQUFFLGdCQUFnQixFQUF5QixXQUFXLEVBQW9DLFVBQVUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBZ0J4SSxNQUFNLFVBQVUsU0FBUyxDQUFDLFFBQTBCLEVBQUUsTUFBb0QsRUFBRSxjQUEwQztJQUNySixNQUFNLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUM5RCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUVqRSxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQzVGLElBQUksS0FBSyxZQUFZLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsY0FB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