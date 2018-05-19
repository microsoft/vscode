/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TextCompareEditorVisibleContext, EditorInput, IEditorIdentifier, IEditorCommandsContext, ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext, CloseDirection, IEditor, IEditorInput } from 'vs/workbench/common/editor';
import { INextEditorService } from 'vs/workbench/services/editor/common/nextEditorService';
import { Position } from 'vs/platform/editor/common/editor';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { EditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { distinct } from 'vs/base/common/arrays';
import { INextEditorGroupsService, INextEditorGroup } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export const ActiveEditorMovePositioning = {
	FIRST: 'first',
	LAST: 'last',
	LEFT: 'left',
	RIGHT: 'right',
	CENTER: 'center',
	POSITION: 'position',
};

export const ActiveEditorMovePositioningBy = {
	TAB: 'tab',
	GROUP: 'group'
};

export interface ActiveEditorMoveArguments {
	to?: string;
	by?: string;
	value?: number;
}

export const EditorCommands = {
	MoveActiveEditor: 'moveActiveEditor'
};

export const CLOSE_SAVED_EDITORS_COMMAND_ID = 'workbench.action.closeUnmodifiedEditors';
export const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeEditorsInGroup';
export const CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID = 'workbench.action.closeEditorsToTheRight';
export const CLOSE_EDITOR_COMMAND_ID = 'workbench.action.closeActiveEditor';
export const CLOSE_EDITOR_GROUP_COMMAND_ID = 'workbench.action.closeActiveEditorGroup';
export const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeOtherEditors';
export const KEEP_EDITOR_COMMAND_ID = 'workbench.action.keepEditor';
export const SHOW_EDITORS_IN_GROUP = 'workbench.action.showEditorsInGroup';
export const TOGGLE_DIFF_INLINE_MODE = 'toggle.diff.editorMode';

export const NAVIGATE_ALL_EDITORS_GROUP_PREFIX = 'edt ';
export const NAVIGATE_IN_ACTIVE_GROUP_PREFIX = 'edt active ';

export function setup(): void {
	registerActiveEditorMoveCommand();
	registerDiffEditorCommands();
	registerOpenEditorAtIndexCommands();
	registerEditorCommands();
}

const isActiveEditorMoveArg = function (arg: ActiveEditorMoveArguments): boolean {
	if (!types.isObject(arg)) {
		return false;
	}

	const activeEditorMoveArg: ActiveEditorMoveArguments = arg;

	if (!types.isString(activeEditorMoveArg.to)) {
		return false;
	}

	if (!types.isUndefined(activeEditorMoveArg.by) && !types.isString(activeEditorMoveArg.by)) {
		return false;
	}

	if (!types.isUndefined(activeEditorMoveArg.value) && !types.isNumber(activeEditorMoveArg.value)) {
		return false;
	}

	return true;
};

function registerActiveEditorMoveCommand(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: EditorCommands.MoveActiveEditor,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: EditorContextKeys.editorTextFocus,
		primary: null,
		handler: (accessor, args: any) => moveActiveEditor(args, accessor),
		description: {
			description: nls.localize('editorCommand.activeEditorMove.description', "Move the active editor by tabs or groups"),
			args: [
				{
					name: nls.localize('editorCommand.activeEditorMove.arg.name', "Active editor move argument"),
					description: nls.localize('editorCommand.activeEditorMove.arg.description', "Argument Properties:\n\t* 'to': String value providing where to move.\n\t* 'by': String value providing the unit for move. By tab or by group.\n\t* 'value': Number value providing how many positions or an absolute position to move."),
					constraint: isActiveEditorMoveArg
				}
			]
		}
	});
}

function moveActiveEditor(args: ActiveEditorMoveArguments = {}, accessor: ServicesAccessor): void {
	args.to = args.to || ActiveEditorMovePositioning.RIGHT;
	args.by = args.by || ActiveEditorMovePositioningBy.TAB;
	args.value = types.isUndefined(args.value) ? 1 : args.value;

	const activeEditor = accessor.get(INextEditorService).activeControl;
	if (activeEditor) {
		switch (args.by) {
			case ActiveEditorMovePositioningBy.TAB:
				return moveActiveTab(args, activeEditor, accessor);
			case ActiveEditorMovePositioningBy.GROUP:
				return moveActiveEditorToGroup(args, activeEditor, accessor);
		}
	}
}

function moveActiveTab(args: ActiveEditorMoveArguments, activeEditor: IEditor, accessor: ServicesAccessor): void {
	const group = activeEditor.group;
	let index = group.getIndexOfEditor(activeEditor.input);
	switch (args.to) {
		case ActiveEditorMovePositioning.FIRST:
			index = 0;
			break;
		case ActiveEditorMovePositioning.LAST:
			index = group.count - 1;
			break;
		case ActiveEditorMovePositioning.LEFT:
			index = index - args.value;
			break;
		case ActiveEditorMovePositioning.RIGHT:
			index = index + args.value;
			break;
		case ActiveEditorMovePositioning.CENTER:
			index = Math.round(group.count / 2) - 1;
			break;
		case ActiveEditorMovePositioning.POSITION:
			index = args.value - 1;
			break;
	}

	index = index < 0 ? 0 : index >= group.count ? group.count - 1 : index;
	group.moveEditor(activeEditor.input, group, { index });
}

function moveActiveEditorToGroup(args: ActiveEditorMoveArguments, activeEditor: IEditor, accessor: ServicesAccessor): void {
	let newPosition = activeEditor.group.id;
	switch (args.to) {
		case ActiveEditorMovePositioning.LEFT:
			newPosition = newPosition - 1;
			break;
		case ActiveEditorMovePositioning.RIGHT:
			newPosition = newPosition + 1;
			break;
		case ActiveEditorMovePositioning.FIRST:
			newPosition = Position.ONE;
			break;
		case ActiveEditorMovePositioning.LAST:
			newPosition = Position.THREE;
			break;
		case ActiveEditorMovePositioning.CENTER:
			newPosition = Position.TWO;
			break;
		case ActiveEditorMovePositioning.POSITION:
			newPosition = args.value - 1;
			break;
	}

	// TODO@grid this position non-sense does not make any sense
	const editorGroupService = accessor.get(INextEditorGroupsService);
	const destinationGroup = editorGroupService.getGroup(newPosition) || editorGroupService.activeGroup;
	const sourceGroup = activeEditor.group;
	sourceGroup.moveEditor(activeEditor.input, destinationGroup);
}

function registerDiffEditorCommands(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.nextChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisibleContext,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, true)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.previousChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisibleContext,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, false)
	});

	function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
		const editorService = accessor.get(INextEditorService);
		const candidates = [editorService.activeControl, ...editorService.visibleControls].filter(e => e instanceof TextDiffEditor);

		if (candidates.length > 0) {
			next ? (<TextDiffEditor>candidates[0]).getDiffNavigator().next() : (<TextDiffEditor>candidates[0]).getDiffNavigator().previous();
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TOGGLE_DIFF_INLINE_MODE,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor, resource, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);

			const { control } = resolveCommandsContext(editorGroupService, context);
			if (control instanceof TextDiffEditor) {
				const widget = control.getControl();
				const isInlineMode = !widget.renderSideBySide;
				widget.updateOptions(<IDiffEditorOptions>{
					renderSideBySide: isInlineMode
				});
			}
		}
	});
}

function registerOpenEditorAtIndexCommands(): void {

	// Keybindings to focus a specific index in the tab folder if tabs are enabled
	for (let i = 0; i < 9; i++) {
		const editorIndex = i;
		const visibleIndex = i + 1;

		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'workbench.action.openEditorAtIndex' + visibleIndex,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
			when: void 0,
			primary: KeyMod.Alt | toKeyCode(visibleIndex),
			mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
			handler: accessor => {
				const editorService = accessor.get(INextEditorService);

				const activeControl = editorService.activeControl;
				if (activeControl) {
					const editor = activeControl.group.getEditor(editorIndex);
					if (editor) {
						return editorService.openEditor(editor).then(() => void 0);
					}
				}

				return void 0;
			}
		});
	}

	function toKeyCode(index: number): KeyCode {
		switch (index) {
			case 0: return KeyCode.KEY_0;
			case 1: return KeyCode.KEY_1;
			case 2: return KeyCode.KEY_2;
			case 3: return KeyCode.KEY_3;
			case 4: return KeyCode.KEY_4;
			case 5: return KeyCode.KEY_5;
			case 6: return KeyCode.KEY_6;
			case 7: return KeyCode.KEY_7;
			case 8: return KeyCode.KEY_8;
			case 9: return KeyCode.KEY_9;
		}

		return void 0;
	}
}

function registerEditorCommands() {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_SAVED_EDITORS_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_U),
		handler: (accessor, resource: URI | object, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);
			const contexts = getMultiSelectedEditorContexts(context, accessor.get(IListService), editorGroupService);
			if (contexts.length === 0 && editorGroupService.activeGroup) {
				// If command is triggered from the command palette use the active group
				contexts.push({ groupId: editorGroupService.activeGroup.id });
			}

			return TPromise.join(distinct(contexts.map(c => c.groupId)).map(groupId =>
				editorGroupService.getGroup(groupId).closeEditors({ savedOnly: true })
			));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_W),
		handler: (accessor, resource: URI | object, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);
			const contexts = getMultiSelectedEditorContexts(context, accessor.get(IListService), editorGroupService);
			const distinctGroupIds = distinct(contexts.map(c => c.groupId));

			if (distinctGroupIds.length === 0) {
				distinctGroupIds.push(editorGroupService.activeGroup.id);
			}

			return TPromise.join(distinctGroupIds.map(groupId =>
				editorGroupService.getGroup(groupId).closeAllEditors()
			));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITOR_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] },
		handler: (accessor, resource: URI | object, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);
			const contexts = getMultiSelectedEditorContexts(context, accessor.get(IListService), editorGroupService);
			const activeGroup = editorGroupService.activeGroup;
			if (contexts.length === 0 && activeGroup && activeGroup.activeEditor) {
				contexts.push({ groupId: activeGroup.id, editorIndex: activeGroup.getIndexOfEditor(activeGroup.activeEditor) });
			}
			const groupIds = distinct(contexts.map(context => context.groupId));
			return TPromise.join(groupIds.map(groupId => {
				const group = editorGroupService.getGroup(groupId);
				const editors = contexts.filter(c => c.groupId === groupId).map(c => group.getEditor(c.editorIndex));
				return group.closeEditors(editors);
			}));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITOR_GROUP_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ContextKeyExpr.and(ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext),
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] },
		handler: (accessor, resource: URI | object, context: IEditorCommandsContext) => {
			const nextEditorGroupService = accessor.get(INextEditorGroupsService);

			// TODO@grid handle more cases from the related CLOSE_EDITOR_COMMAND_ID and also revisit command ID
			nextEditorGroupService.removeGroup(nextEditorGroupService.activeGroup);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_T },
		handler: (accessor, resource: URI | object, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);
			const contexts = getMultiSelectedEditorContexts(context, accessor.get(IListService), editorGroupService);

			if (contexts.length === 0) {
				// Cover the case when run from command palette
				const activeGroup = editorGroupService.activeGroup;
				if (activeGroup && activeGroup.activeEditor) {
					contexts.push({ groupId: activeGroup.id, editorIndex: activeGroup.getIndexOfEditor(activeGroup.activeEditor) });
				}
			}

			const groupIds = distinct(contexts.map(context => context.groupId));

			return TPromise.join(groupIds.map(groupId => {
				const group = editorGroupService.getGroup(groupId);
				const editors = contexts.filter(c => c.groupId === groupId).map(c => group.getEditor(c.editorIndex));
				const editorsToClose = group.editors.filter(e => editors.indexOf(e) === -1);
				return group.closeEditors(editorsToClose);
			}));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor, resource: URI, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);

			const { group, editor } = resolveCommandsContext(editorGroupService, context);
			if (group && editor) {
				return group.closeEditors({ direction: CloseDirection.RIGHT, except: editor });
			}

			return TPromise.as(false);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: KEEP_EDITOR_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.Enter),
		handler: (accessor, resource: URI, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);

			const { group, editor } = resolveCommandsContext(editorGroupService, context);
			if (group && editor) {
				return group.pinEditor(editor);
			}

			return TPromise.as(false);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: SHOW_EDITORS_IN_GROUP,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor, resource: URI, context: IEditorCommandsContext) => {
			const editorGroupService = accessor.get(INextEditorGroupsService);
			const quickOpenService = accessor.get(IQuickOpenService);

			if (editorGroupService.count <= 1) {
				return quickOpenService.show(NAVIGATE_ALL_EDITORS_GROUP_PREFIX);
			}

			if (context && typeof context.groupId === 'number') {
				editorGroupService.activateGroup(editorGroupService.getGroup(context.groupId)); // we need the group to be active
			}

			return quickOpenService.show(NAVIGATE_IN_ACTIVE_GROUP_PREFIX);
		}
	});
}

function resolveCommandsContext(editorGroupService: INextEditorGroupsService, context?: IEditorCommandsContext): { group: INextEditorGroup, editor: IEditorInput, control: IEditor } {

	// Resolve from context
	let group = context && typeof context.groupId === 'number' ? editorGroupService.getGroup(context.groupId) : undefined;
	let editor = group && typeof context.editorIndex === 'number' ? group.getEditor(context.editorIndex) : undefined;
	let control = group ? group.activeControl : undefined;

	// Fallback to active group as needed
	if (!group) {
		group = editorGroupService.activeGroup;
		editor = <EditorInput>group.activeEditor;
		control = group.activeControl;
	}

	return { group, editor, control };
}

export function getMultiSelectedEditorContexts(editorContext: IEditorCommandsContext, listService: IListService, editorGroupService: INextEditorGroupsService): IEditorCommandsContext[] {
	// First check for a focused list to return the selected items from
	const list = listService.lastFocusedList;
	if (list instanceof List && list.isDOMFocused()) {
		const elementToContext = (element: IEditorIdentifier | EditorGroup) =>
			element instanceof EditorGroup ? { groupId: element.id, editorIndex: undefined } : { groupId: element.groupId, editorIndex: editorGroupService.getGroup(element.groupId).getIndexOfEditor(element.editor) };
		const onlyEditorGroupAndEditor = (e: IEditorIdentifier | EditorGroup) => e instanceof EditorGroup || ('editor' in e && 'group' in e);

		const focusedElements: (IEditorIdentifier | EditorGroup)[] = list.getFocusedElements().filter(onlyEditorGroupAndEditor);
		// need to take into account when editor context is { group: group }
		const focus = editorContext ? editorContext : focusedElements.length ? focusedElements.map(elementToContext)[0] : undefined;

		if (focus) {
			const selection: (IEditorIdentifier | EditorGroup)[] = list.getSelectedElements().filter(onlyEditorGroupAndEditor);
			// Only respect selection if it contains focused element
			if (selection && selection.some(s => s instanceof EditorGroup ? s.id === focus.groupId : s.groupId === focus.groupId && editorGroupService.getGroup(s.groupId).getIndexOfEditor(s.editor) === focus.editorIndex)) {
				return selection.map(elementToContext);
			}

			return [focus];
		}
	}

	// Otherwise go with passed in context
	return !!editorContext ? [editorContext] : [];
}
