/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from '../../../../base/browser/dom.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { ObjectTree } from '../../../../base/browser/ui/tree/objectTree.js';
import { AsyncDataTree } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { DataTree } from '../../../../base/browser/ui/tree/dataTree.js';
import { URI } from '../../../../base/common/uri.js';
import { IListService, WorkbenchListWidget } from '../../../../platform/list/browser/listService.js';
import { IEditorCommandsContext, isEditorCommandsContext, IEditorIdentifier, isEditorIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, isEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export interface IResolvedEditorCommandsContext {
	readonly groupedEditors: {
		readonly group: IEditorGroup;
		readonly editors: EditorInput[];
	}[];
	readonly preserveFocus: boolean;
}

export function resolveCommandsContext(commandArgs: unknown[], editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IResolvedEditorCommandsContext {
	const commandContext = getCommandsContext(commandArgs, editorService, editorGroupsService, listService);
	const preserveFocus = commandContext.length ? commandContext[0].preserveFocus || false : false;
	const resolvedContext: IResolvedEditorCommandsContext = { groupedEditors: [], preserveFocus };

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

function getCommandsContext(commandArgs: unknown[], editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IEditorCommandsContext[] {

	// Figure out if command is executed from a list or tree widget
	const list = listService.lastFocusedList;
	let isWidgetAction = list !== undefined && list.getHTMLElement() === getActiveElement();

	// Get editor context for which the command was triggered
	let editorContext = getEditorContextFromCommandArgs(commandArgs, isWidgetAction, editorService, editorGroupsService, listService);

	// If the editor context can not be determind use the active editor
	if (!editorContext) {
		const activeGroup = editorGroupsService.activeGroup;
		const activeEditor = activeGroup.activeEditor;
		editorContext = { groupId: activeGroup.id, editorIndex: activeEditor ? activeGroup.getIndexOfEditor(activeEditor) : undefined };
		isWidgetAction = false;
	}

	const multiEditorContext = getMultiSelectContext(editorContext, isWidgetAction, editorService, editorGroupsService, listService);

	// Make sure the command context is the first one in the list
	return moveCurrentEditorContextToFront(editorContext, multiEditorContext);
}

function moveCurrentEditorContextToFront(editorContext: IEditorCommandsContext, multiEditorContext: IEditorCommandsContext[]): IEditorCommandsContext[] {
	if (multiEditorContext.length <= 1) {
		return multiEditorContext;
	}

	const editorContextIndex = multiEditorContext.findIndex(context =>
		context.groupId === editorContext.groupId &&
		context.editorIndex === editorContext.editorIndex
	);

	if (editorContextIndex !== -1) {
		multiEditorContext.splice(editorContextIndex, 1);
		multiEditorContext.unshift(editorContext);
	} else if (editorContext.editorIndex === undefined) {
		multiEditorContext.unshift(editorContext);
	} else {
		throw new Error('Editor context not found in multi editor context');
	}

	return multiEditorContext;
}


/**
 * Get focused elements from a list or tree widget. Handles both
 * `List` (which provides `getFocusedElements()`) and tree widgets
 * (which provide `getFocus()`).
 */
function getWidgetFocusedElements(widget: WorkbenchListWidget): unknown[] {
	if (widget instanceof List) {
		return widget.getFocusedElements();
	}
	if (widget instanceof ObjectTree || widget instanceof AsyncDataTree || widget instanceof DataTree) {
		return widget.getFocus();
	}
	return [];
}

/**
 * Get selected elements from a list or tree widget. Handles both
 * `List` (which provides `getSelectedElements()`) and tree widgets
 * (which provide `getSelection()`).
 */
function getWidgetSelectedElements(widget: WorkbenchListWidget): unknown[] {
	if (widget instanceof List) {
		return widget.getSelectedElements();
	}
	if (widget instanceof ObjectTree || widget instanceof AsyncDataTree || widget instanceof DataTree) {
		return widget.getSelection();
	}
	return [];
}

function getEditorContextFromCommandArgs(commandArgs: unknown[], isWidgetAction: boolean, editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IEditorCommandsContext | undefined {

	// We only know how to extraxt the command context from URI and IEditorCommandsContext arguments
	const filteredArgs = commandArgs.filter(arg => isEditorCommandsContext(arg) || URI.isUri(arg));

	// If the command arguments contain an editor context, use it
	for (const arg of filteredArgs) {
		if (isEditorCommandsContext(arg)) {
			return arg;
		}
	}

	// Otherwise, try to find the editor group by the URI of the resource
	for (const uri of filteredArgs as URI[]) {
		const editorIdentifiers = editorService.findEditors(uri);
		if (editorIdentifiers.length) {
			const editorIdentifier = editorIdentifiers[0];
			const group = editorGroupsService.getGroup(editorIdentifier.groupId);
			return { groupId: editorIdentifier.groupId, editorIndex: group?.getIndexOfEditor(editorIdentifier.editor) };
		}
	}

	// If there is no context in the arguments, try to find the context from the focused list
	// if the action was executed from a list
	if (isWidgetAction) {
		const list = listService.lastFocusedList;
		if (list) {
			for (const focusedElement of getWidgetFocusedElements(list)) {
				if (isGroupOrEditor(focusedElement)) {
					return groupOrEditorToEditorContext(focusedElement, undefined, editorGroupsService);
				}
			}
		}
	}

	return undefined;
}

function getMultiSelectContext(editorContext: IEditorCommandsContext, isWidgetAction: boolean, editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IEditorCommandsContext[] {

	// If the action was executed from a list, return all selected editors
	if (isWidgetAction) {
		const list = listService.lastFocusedList;
		if (list) {
			const selection = getWidgetSelectedElements(list).filter(isGroupOrEditor);

			if (selection.length > 1) {
				return selection.map(e => groupOrEditorToEditorContext(e, editorContext.preserveFocus, editorGroupsService));
			}

			if (selection.length === 0) {
				// Workaround: the `isWidgetAction` flag can be a false positive in certain
				// cases because it will be `true` if the active element is a list or tree
				// widget even if it is part of the editor area (e.g. notebooks). The
				// workaround here is to fallback to `isWidgetAction: false` if the widget
				// does not have any editor or group selected.
				return getMultiSelectContext(editorContext, false, editorService, editorGroupsService, listService);
			}
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

function groupOrEditorToEditorContext(element: IEditorIdentifier | IEditorGroup, preserveFocus: boolean | undefined, editorGroupsService: IEditorGroupsService): IEditorCommandsContext {
	if (isEditorGroup(element)) {
		return { groupId: element.id, editorIndex: undefined, preserveFocus };
	}

	const group = editorGroupsService.getGroup(element.groupId);
	return { groupId: element.groupId, editorIndex: group ? group.getIndexOfEditor(element.editor) : -1, preserveFocus };
}

function isGroupOrEditor(element: unknown): element is IEditorIdentifier | IEditorGroup {
	return isEditorGroup(element) || isEditorIdentifier(element);
}

function getEditorAndGroupFromContext(commandContext: IEditorCommandsContext, editorGroupsService: IEditorGroupsService): { group: IEditorGroup; editor: EditorInput | undefined } | undefined {
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
