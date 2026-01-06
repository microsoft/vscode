/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from '../../../../base/browser/dom.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { URI } from '../../../../base/common/uri.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
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

function getEditorContextFromCommandArgs(commandArgs: unknown[], isListAction: boolean, editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IEditorCommandsContext | undefined {
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
	if (isListAction) {
		const list = listService.lastFocusedList as List<unknown>;
		for (const focusedElement of list.getFocusedElements()) {
			if (isGroupOrEditor(focusedElement)) {
				return groupOrEditorToEditorContext(focusedElement, undefined, editorGroupsService);
			}
		}
	}

	return undefined;
}

function getMultiSelectContext(editorContext: IEditorCommandsContext, isListAction: boolean, editorService: IEditorService, editorGroupsService: IEditorGroupsService, listService: IListService): IEditorCommandsContext[] {

	// If the action was executed from a list, return all selected editors
	if (isListAction) {
		const list = listService.lastFocusedList as List<unknown>;
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
