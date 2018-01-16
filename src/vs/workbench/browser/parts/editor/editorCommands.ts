/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ActiveEditorMoveArguments, ActiveEditorMovePositioning, ActiveEditorMovePositioningBy, EditorCommands, TextCompareEditorVisible, EditorInput, IEditorIdentifier } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditor, Position, POSITIONS, Direction, IEditorInput } from 'vs/platform/editor/common/editor';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { EditorStacksModel } from 'vs/workbench/common/editor/editorStacksModel';
import { KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IListService } from 'vs/platform/list/browser/listService';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { distinct } from 'vs/base/common/arrays';

export const CLOSE_UNMODIFIED_EDITORS_COMMAND_ID = 'workbench.action.closeUnmodifiedEditors';
export const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeEditorsInGroup';
export const CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID = 'workbench.action.closeEditorsToTheRight';
export const CLOSE_EDITOR_COMMAND_ID = 'workbench.action.closeActiveEditor';
export const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeOtherEditors';
export const KEEP_EDITOR_COMMAND_ID = 'workbench.action.keepEditor';
export const SHOW_EDITORS_IN_GROUP = 'workbench.action.showEditorsInGroup';
export const TOGGLE_DIFF_INLINE_MODE = 'toggle.diff.editorMode';

export const NAVIGATE_IN_GROUP_ONE_PREFIX = 'edt one ';
export const NAVIGATE_IN_GROUP_TWO_PREFIX = 'edt two ';
export const NAVIGATE_IN_GROUP_THREE_PREFIX = 'edt three ';
export const NAVIGATE_ALL_EDITORS_GROUP_PREFIX = 'edt ';

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
		when: EditorContextKeys.textFocus,
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
	const showTabs = accessor.get(IEditorGroupService).getTabOptions().showTabs;
	args.to = args.to || ActiveEditorMovePositioning.RIGHT;
	args.by = showTabs ? args.by || ActiveEditorMovePositioningBy.TAB : ActiveEditorMovePositioningBy.GROUP;
	args.value = types.isUndefined(args.value) ? 1 : args.value;

	const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor();
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
	const editorGroupsService: IEditorGroupService = accessor.get(IEditorGroupService);
	const editorGroup = editorGroupsService.getStacksModel().groupAt(activeEditor.position);
	let index = editorGroup.indexOf(activeEditor.input);
	switch (args.to) {
		case ActiveEditorMovePositioning.FIRST:
			index = 0;
			break;
		case ActiveEditorMovePositioning.LAST:
			index = editorGroup.count - 1;
			break;
		case ActiveEditorMovePositioning.LEFT:
			index = index - args.value;
			break;
		case ActiveEditorMovePositioning.RIGHT:
			index = index + args.value;
			break;
		case ActiveEditorMovePositioning.CENTER:
			index = Math.round(editorGroup.count / 2) - 1;
			break;
		case ActiveEditorMovePositioning.POSITION:
			index = args.value - 1;
			break;
	}

	index = index < 0 ? 0 : index >= editorGroup.count ? editorGroup.count - 1 : index;
	editorGroupsService.moveEditor(activeEditor.input, editorGroup, editorGroup, { index });
}

function moveActiveEditorToGroup(args: ActiveEditorMoveArguments, activeEditor: IEditor, accessor: ServicesAccessor): void {
	let newPosition = activeEditor.position;
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

	newPosition = POSITIONS.indexOf(newPosition) !== -1 ? newPosition : activeEditor.position;
	accessor.get(IEditorGroupService).moveEditor(activeEditor.input, activeEditor.position, newPosition);
}

function registerDiffEditorCommands(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.nextChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisible,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, true)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.compareEditor.previousChange',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: TextCompareEditorVisible,
		primary: null,
		handler: accessor => navigateInDiffEditor(accessor, false)
	});

	function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
		let editorService = accessor.get(IWorkbenchEditorService);
		const candidates = [editorService.getActiveEditor(), ...editorService.getVisibleEditors()].filter(e => e instanceof TextDiffEditor);

		if (candidates.length > 0) {
			next ? (<TextDiffEditor>candidates[0]).getDiffNavigator().next() : (<TextDiffEditor>candidates[0]).getDiffNavigator().previous();
		}
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TOGGLE_DIFF_INLINE_MODE,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor) => {
			const editorService = accessor.get(IWorkbenchEditorService);

			const editor = editorService.getActiveEditor();
			if (editor instanceof TextDiffEditor) {
				const control = editor.getControl();
				const isInlineMode = !control.renderSideBySide;
				control.updateOptions(<IDiffEditorOptions>{
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
				const editorService = accessor.get(IWorkbenchEditorService);
				const editorGroupService = accessor.get(IEditorGroupService);

				const active = editorService.getActiveEditor();
				if (active) {
					const group = editorGroupService.getStacksModel().groupAt(active.position);
					const editor = group.getEditor(editorIndex);

					if (editor) {
						return editorService.openEditor(editor);
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
		id: CLOSE_UNMODIFIED_EDITORS_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_U),
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);
			const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService));
			const positions = contexts.map(context => positionAndInput(editorGroupService, editorService, context).position);

			return TPromise.join(distinct(positions.filter(p => typeof p === 'number'))
				.map(position => editorService.closeEditors(position, { unmodifiedOnly: true })));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_W),
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);
			const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService));
			const positions = contexts.map(context => positionAndInput(editorGroupService, editorService, context).position);
			const distinctPositions = distinct(positions.filter(p => typeof p === 'number'));

			if (distinctPositions.length) {
				return editorService.closeEditors(distinctPositions);
			}

			return TPromise.as(false);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITOR_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_W] },
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService));
			const groups = distinct(contexts.map(context => context.group));

			const editorsToClose = new Map<Position, IEditorInput[]>();

			if (groups.length === 0) {
				const activeEditor = editorService.getActiveEditor();
				if (activeEditor) {
					return editorService.closeEditor(activeEditor.position, activeEditor.input);
				}
			}

			groups.forEach(group => {
				const position = editorGroupService.getStacksModel().positionOfGroup(group);
				editorsToClose.set(position, contexts.map(c => {
					if (group === c.group) {
						let input = c ? c.editor : undefined;
						if (!input) {

							// Get Top Editor at Position
							const visibleEditors = editorService.getVisibleEditors();
							if (visibleEditors[position]) {
								input = visibleEditors[position].input;
							}
						}

						return input;
					}

					return undefined;
				}).filter(input => !!input));
			});

			return editorService.closeEditors({
				positionOne: editorsToClose.get(Position.ONE),
				positionTwo: editorsToClose.get(Position.TWO),
				positionThree: editorsToClose.get(Position.THREE)
			});
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_T },
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);
			const contexts = getMultiSelectedEditorContexts(editorContext, accessor.get(IListService));
			const groups = distinct(contexts.map(context => context.group));
			const editorsToClose = new Map<Position, IEditorInput[]>();

			groups.forEach(group => {
				const inputsToSkip = contexts.map(c => {
					if (!!c.editor && c.group === group) {
						return c.editor;
					}

					return undefined;
				}).filter(input => !!input);

				const toClose = group.getEditors().filter(input => inputsToSkip.indexOf(input) === -1);
				editorsToClose.set(editorGroupService.getStacksModel().positionOfGroup(group), toClose);
			});

			return editorService.closeEditors({
				positionOne: editorsToClose.get(Position.ONE),
				positionTwo: editorsToClose.get(Position.TWO),
				positionThree: editorsToClose.get(Position.THREE)
			});
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			const { position, input } = positionAndInput(editorGroupService, editorService, editorContext);

			if (typeof position === 'number' && input) {
				return editorService.closeEditors(position, { except: input, direction: Direction.RIGHT });
			}

			return TPromise.as(false);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: KEEP_EDITOR_COMMAND_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.Enter),
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);

			const { position, input } = positionAndInput(editorGroupService, editorService, editorContext);

			if (typeof position === 'number' && input) {
				return editorGroupService.pinEditor(position, input);
			}

			return TPromise.as(false);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: SHOW_EDITORS_IN_GROUP,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: void 0,
		handler: (accessor, resource: URI, editorContext: IEditorIdentifier) => {
			const editorGroupService = accessor.get(IEditorGroupService);
			const editorService = accessor.get(IWorkbenchEditorService);
			const quickOpenService = accessor.get(IQuickOpenService);

			const stacks = editorGroupService.getStacksModel();
			const groupCount = stacks.groups.length;
			if (groupCount <= 1) {
				return quickOpenService.show(NAVIGATE_ALL_EDITORS_GROUP_PREFIX);
			}

			const { position } = positionAndInput(editorGroupService, editorService, editorContext);

			switch (position) {
				case Position.TWO:
					return quickOpenService.show(NAVIGATE_IN_GROUP_TWO_PREFIX);
				case Position.THREE:
					return quickOpenService.show(NAVIGATE_IN_GROUP_THREE_PREFIX);
			}

			return quickOpenService.show(NAVIGATE_IN_GROUP_ONE_PREFIX);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.printStacksModel',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor) {
			console.log(`${accessor.get(IEditorGroupService).getStacksModel().toString()}\n\n`);
		},
		when: void 0,
		primary: void 0
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.validateStacksModel',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor) {
			(<EditorStacksModel>accessor.get(IEditorGroupService).getStacksModel()).validate();
		},
		when: void 0,
		primary: void 0
	});
}

function positionAndInput(editorGroupService: IEditorGroupService, editorService: IWorkbenchEditorService, editorContext?: IEditorIdentifier): { position: Position, input: IEditorInput } {
	let position = editorContext ? editorGroupService.getStacksModel().positionOfGroup(editorContext.group) : null;
	let input = editorContext ? editorContext.editor : null;

	// If position or input are not passed in take the position and input of the active editor.
	const active = editorService.getActiveEditor();
	if (active) {
		position = typeof position === 'number' ? position : active.position;
		input = input ? input : <EditorInput>active.input;
	}

	return { position, input };
}

export function getMultiSelectedEditorContexts(editorContext: IEditorIdentifier, listService: IListService): IEditorIdentifier[] {
	// TODO@Isidor this method is not nice since it assumes it is working on open editors view and maps elements on top of that
	const list = listService.lastFocusedList;
	// Mapping for open editors view
	const elementToContext = element => element && element.editorGroup && element.editorInput ? { group: element.editorGroup, editor: element.editorInput } : { group: element, editor: undefined };

	if (list instanceof List && list.isDOMFocused()) {
		const selection = list.getSelectedElements();
		const focus = list.getFocusedElements();
		// Only respect selection if it contains focused element
		if (focus.length && selection && selection.indexOf(focus[0]) >= 0) {
			return list.getSelectedElements().map(elementToContext);
		}

		if (focus) {
			return focus.map(elementToContext);
		}
	}

	return !!editorContext ? [editorContext] : [];
}
