/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveElement } from '../../../../base/browser/dom.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { URI } from '../../../../base/common/uri.js';
import { isEditorCommandsContext, isEditorIdentifier } from '../../../common/editor.js';
import { isEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
export function resolveCommandsContext(commandArgs, editorService, editorGroupsService, listService) {
    const commandContext = getCommandsContext(commandArgs, editorService, editorGroupsService, listService);
    const preserveFocus = commandContext.length ? commandContext[0].preserveFocus || false : false;
    const resolvedContext = { groupedEditors: [], preserveFocus };
    for (const editorContext of commandContext) {
        const groupAndEditor = getEditorAndGroupFromContext(editorContext, editorGroupsService);
        if (!groupAndEditor) {
            continue;
        }
        const { group, editor } = groupAndEditor;
        // Find group context if already added
        let groupContext = undefined;
        for (const targetGroupContext of resolvedContext.groupedEditors) {
            if (targetGroupContext.group.id === group.id) {
                groupContext = targetGroupContext;
                break;
            }
        }
        // Otherwise add new group context
        if (!groupContext) {
            groupContext = { group, editors: [] };
            resolvedContext.groupedEditors.push(groupContext);
        }
        // Add editor to group context
        if (editor) {
            groupContext.editors.push(editor);
        }
    }
    return resolvedContext;
}
function getCommandsContext(commandArgs, editorService, editorGroupsService, listService) {
    // Figure out if command is executed from a list
    const list = listService.lastFocusedList;
    let isListAction = list instanceof List && list.getHTMLElement() === getActiveElement();
    // Get editor context for which the command was triggered
    let editorContext = getEditorContextFromCommandArgs(commandArgs, isListAction, editorService, editorGroupsService, listService);
    // If the editor context can not be determind use the active editor
    if (!editorContext) {
        const activeGroup = editorGroupsService.activeGroup;
        const activeEditor = activeGroup.activeEditor;
        editorContext = { groupId: activeGroup.id, editorIndex: activeEditor ? activeGroup.getIndexOfEditor(activeEditor) : undefined };
        isListAction = false;
    }
    const multiEditorContext = getMultiSelectContext(editorContext, isListAction, editorService, editorGroupsService, listService);
    // Make sure the command context is the first one in the list
    return moveCurrentEditorContextToFront(editorContext, multiEditorContext);
}
function moveCurrentEditorContextToFront(editorContext, multiEditorContext) {
    if (multiEditorContext.length <= 1) {
        return multiEditorContext;
    }
    const editorContextIndex = multiEditorContext.findIndex(context => context.groupId === editorContext.groupId &&
        context.editorIndex === editorContext.editorIndex);
    if (editorContextIndex !== -1) {
        multiEditorContext.splice(editorContextIndex, 1);
        multiEditorContext.unshift(editorContext);
    }
    else if (editorContext.editorIndex === undefined) {
        multiEditorContext.unshift(editorContext);
    }
    else {
        throw new Error('Editor context not found in multi editor context');
    }
    return multiEditorContext;
}
function getEditorContextFromCommandArgs(commandArgs, isListAction, editorService, editorGroupsService, listService) {
    // We only know how to extraxt the command context from URI and IEditorCommandsContext arguments
    const filteredArgs = commandArgs.filter(arg => isEditorCommandsContext(arg) || URI.isUri(arg));
    // If the command arguments contain an editor context, use it
    for (const arg of filteredArgs) {
        if (isEditorCommandsContext(arg)) {
            return arg;
        }
    }
    // Otherwise, try to find the editor group by the URI of the resource
    for (const uri of filteredArgs) {
        const editorIdentifiers = editorService.findEditors(uri);
        if (editorIdentifiers.length) {
            const editorIdentifier = editorIdentifiers[0];
            const group = editorGroupsService.getGroup(editorIdentifier.groupId);
            return { groupId: editorIdentifier.groupId, editorIndex: group?.getIndexOfEditor(editorIdentifier.editor) };
        }
    }
    // If there is no context in the arguments, try to find the context from the focused list
    // if the action was executed from a list
    if (isListAction) {
        const list = listService.lastFocusedList;
        for (const focusedElement of list.getFocusedElements()) {
            if (isGroupOrEditor(focusedElement)) {
                return groupOrEditorToEditorContext(focusedElement, undefined, editorGroupsService);
            }
        }
    }
    return undefined;
}
function getMultiSelectContext(editorContext, isListAction, editorService, editorGroupsService, listService) {
    // If the action was executed from a list, return all selected editors
    if (isListAction) {
        const list = listService.lastFocusedList;
        const selection = list.getSelectedElements().filter(isGroupOrEditor);
        if (selection.length > 1) {
            return selection.map(e => groupOrEditorToEditorContext(e, editorContext.preserveFocus, editorGroupsService));
        }
        if (selection.length === 0) {
            // TODO@benibenj workaround for https://github.com/microsoft/vscode/issues/224050
            // Explainer: the `isListAction` flag can be a false positive in certain cases because
            // it will be `true` if the active element is a `List` even if it is part of the editor
            // area. The workaround here is to fallback to `isListAction: false` if the list is not
            // having any editor or group selected.
            return getMultiSelectContext(editorContext, false, editorService, editorGroupsService, listService);
        }
    }
    // Check editors selected in the group (tabs)
    else {
        const group = editorGroupsService.getGroup(editorContext.groupId);
        const editor = editorContext.editorIndex !== undefined ? group?.getEditorByIndex(editorContext.editorIndex) : group?.activeEditor;
        // If the editor is selected, return all selected editors otherwise only use the editors context
        if (group && editor && group.isSelected(editor)) {
            return group.selectedEditors.map(editor => groupOrEditorToEditorContext({ editor, groupId: group.id }, editorContext.preserveFocus, editorGroupsService));
        }
    }
    // Otherwise go with passed in context
    return [editorContext];
}
function groupOrEditorToEditorContext(element, preserveFocus, editorGroupsService) {
    if (isEditorGroup(element)) {
        return { groupId: element.id, editorIndex: undefined, preserveFocus };
    }
    const group = editorGroupsService.getGroup(element.groupId);
    return { groupId: element.groupId, editorIndex: group ? group.getIndexOfEditor(element.editor) : -1, preserveFocus };
}
function isGroupOrEditor(element) {
    return isEditorGroup(element) || isEditorIdentifier(element);
}
function getEditorAndGroupFromContext(commandContext, editorGroupsService) {
    const group = editorGroupsService.getGroup(commandContext.groupId);
    if (!group) {
        return undefined;
    }
    if (commandContext.editorIndex === undefined) {
        return { group, editor: undefined };
    }
    const editor = group.getEditorByIndex(commandContext.editorIndex);
    return { group, editor };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBMEIsdUJBQXVCLEVBQXFCLGtCQUFrQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFbkksT0FBTyxFQUFzQyxhQUFhLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQVczSCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsV0FBc0IsRUFBRSxhQUE2QixFQUFFLG1CQUF5QyxFQUFFLFdBQXlCO0lBQ2pLLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEcsTUFBTSxhQUFhLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUMvRixNQUFNLGVBQWUsR0FBbUMsRUFBRSxjQUFjLEVBQUUsRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDO0lBRTlGLEtBQUssTUFBTSxhQUFhLElBQUksY0FBYyxFQUFFLENBQUM7UUFDNUMsTUFBTSxjQUFjLEdBQUcsNEJBQTRCLENBQUMsYUFBYSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLGNBQWMsRUFBRSxD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