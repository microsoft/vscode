/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { mixin } from 'vs/base/common/objects';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { EditorInput, hasResource, TextEditorOptions, EditorOptions, IEditorIdentifier, IEditorContext, ActiveEditorMoveArguments, ActiveEditorMovePositioning, EditorCommands, ConfirmResult } from 'vs/workbench/common/editor';
import { QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { Position, IEditor, Direction, IResourceInput, IEditorInput, POSITIONS } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroupService, GroupArrangement } from 'vs/workbench/services/group/common/groupService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export class SplitEditorAction extends Action {

	public static ID = 'workbench.action.splitEditor';
	public static LABEL = nls.localize('splitEditor', "Split Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label, 'split-editor-action');
	}

	public run(context?: IEditorContext): TPromise<any> {
		let editorToSplit: IEditor;
		if (context) {
			editorToSplit = this.editorService.getVisibleEditors()[this.editorGroupService.getStacksModel().positionOfGroup(context.group)];
		} else {
			editorToSplit = this.editorService.getActiveEditor();
		}

		// Can only split with target editor
		if (!editorToSplit) {
			return TPromise.as(true);
		}

		// Return if the editor to split does not support split editing
		if (editorToSplit.input instanceof EditorInput && !(<EditorInput>editorToSplit.input).supportsSplitEditor()) {
			return TPromise.as(true);
		}

		// Options
		let options: EditorOptions;
		const codeEditor = getCodeEditor(editorToSplit);
		if (codeEditor) {
			options = new TextEditorOptions();
			(<TextEditorOptions>options).fromEditor(codeEditor);
		} else {
			options = new EditorOptions();
		}
		options.pinned = true;

		// Count editors
		const visibleEditors = this.editorService.getVisibleEditors();
		const editorCount = visibleEditors.length;
		let targetPosition: Position;

		switch (editorCount) {

			// Open split editor to the right/bottom of left/top one
			case 1:
				targetPosition = Position.TWO;
				break;

			// Special case two editors opened
			case 2:

				// Continue splitting to the right/bottom
				if (editorToSplit.position === Position.TWO) {
					targetPosition = Position.THREE;
				}

				// Push the second group to the right/bottom to make room for the splitted input
				else if (editorToSplit.position === Position.ONE) {
					options.preserveFocus = true;

					return this.editorService.openEditor(editorToSplit.input, options, Position.THREE).then(() => {
						this.editorGroupService.moveGroup(Position.THREE, Position.TWO);
						this.editorGroupService.focusGroup(Position.TWO);
					});
				}
		}

		// Only split if we have a target position to split to
		if (typeof targetPosition === 'number') {
			return this.editorService.openEditor(editorToSplit.input, options, targetPosition);
		}

		return TPromise.as(true);
	}
}

export class NavigateBetweenGroupsAction extends Action {

	public static ID = 'workbench.action.navigateEditorGroups';
	public static LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Can cycle split with active editor
		const activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(false);
		}

		// Cycle to the left/top and use module to start at 0 again
		const visibleEditors = this.editorService.getVisibleEditors();
		const editorCount = visibleEditors.length;
		const newIndex = (activeEditor.position + 1) % editorCount;

		this.editorGroupService.focusGroup(<Position>newIndex);

		return TPromise.as(true);
	}
}

export class FocusActiveGroupAction extends Action {

	public static ID = 'workbench.action.focusActiveEditorGroup';
	public static LABEL = nls.localize('focusActiveEditorGroup', "Focus Active Editor Group");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			activeEditor.focus();
		}

		return TPromise.as(true);
	}
}

export class FocusFirstGroupAction extends Action {

	public static ID = 'workbench.action.focusFirstEditorGroup';
	public static LABEL = nls.localize('focusFirstEditorGroup', "Focus First Editor Group");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Find left/top editor and focus it
		const editors = this.editorService.getVisibleEditors();
		for (let editor of editors) {
			if (editor.position === Position.ONE) {
				this.editorGroupService.focusGroup(Position.ONE);

				return TPromise.as(true);
			}
		}

		// Since no editor is currently opened, try to open last history entry to the target side
		const history = this.historyService.getHistory();
		for (let input of history) {

			// For now only support to open files from history to the side
			if (input instanceof EditorInput) {
				if (hasResource(input, { filter: ['file', 'untitled'] })) {
					return this.editorService.openEditor(input, null, Position.ONE);
				}
			} else {
				return this.editorService.openEditor(input as IResourceInput, Position.ONE);
			}
		}

		return TPromise.as(true);
	}
}

export abstract class BaseFocusSideGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	protected abstract getReferenceEditorSide(): Position;

	protected abstract getTargetEditorSide(): Position;

	public run(): TPromise<any> {

		// Require at least the reference editor to be visible
		const editors = this.editorService.getVisibleEditors();
		let referenceEditor: IEditor;
		for (let i = 0; i < editors.length; i++) {
			const editor = editors[i];

			// Target editor exists so focus it
			if (editor.position === this.getTargetEditorSide()) {
				this.editorGroupService.focusGroup(editor.position);

				return TPromise.as(true);
			}

			// Remember reference editor
			if (editor.position === this.getReferenceEditorSide()) {
				referenceEditor = editor;
			}
		}

		// Require the reference editor to be visible and supporting split editor
		if (referenceEditor && (<EditorInput>referenceEditor.input).supportsSplitEditor()) {

			// Options
			let options: EditorOptions;
			const codeEditor = getCodeEditor(referenceEditor);
			if (codeEditor) {
				options = new TextEditorOptions();
				options.pinned = true;
				(<TextEditorOptions>options).fromEditor(codeEditor);
			} else {
				options = EditorOptions.create({ pinned: true });
			}

			return this.editorService.openEditor(referenceEditor.input, options, this.getTargetEditorSide());
		}

		// Otherwise try to find a history entry to open to the target editor side
		else if (referenceEditor) {
			const history = this.historyService.getHistory();
			for (let input of history) {

				// For now only support to open files from history to the side
				if (input instanceof EditorInput) {
					if (hasResource(input, { filter: ['file', 'untitled'] })) {
						return this.editorService.openEditor(input, { pinned: true }, this.getTargetEditorSide());
					}
				} else {
					return this.editorService.openEditor({ resource: (input as IResourceInput).resource, options: { pinned: true } }, this.getTargetEditorSide());
				}
			}
		}

		return TPromise.as(true);
	}
}

export class FocusSecondGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusSecondEditorGroup';
	public static LABEL = nls.localize('focusSecondEditorGroup', "Focus Second Editor Group");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, editorService, editorGroupService, historyService);
	}

	protected getReferenceEditorSide(): Position {
		return Position.ONE;
	}

	protected getTargetEditorSide(): Position {
		return Position.TWO;
	}
}

export class FocusThirdGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusThirdEditorGroup';
	public static LABEL = nls.localize('focusThirdEditorGroup', "Focus Third Editor Group");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IHistoryService historyService: IHistoryService
	) {
		super(id, label, editorService, editorGroupService, historyService);
	}

	protected getReferenceEditorSide(): Position {
		return Position.TWO;
	}

	protected getTargetEditorSide(): Position {
		return Position.THREE;
	}
}

export class FocusPreviousGroup extends Action {

	public static ID = 'workbench.action.focusPreviousGroup';
	public static LABEL = nls.localize('focusPreviousGroup', "Focus Previous Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Require an active editor
		const activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(true);
		}


		// Find the next position to the left/top
		let nextPosition: Position = Position.ONE;
		if (activeEditor.position === Position.THREE) {
			nextPosition = Position.TWO;
		} else if (activeEditor.position === Position.ONE) {
			// Get the last active position
			const lastPosition = this.editorGroupService.getStacksModel().groups.length - 1;
			nextPosition = lastPosition;
		}

		// Focus next position if provided
		this.editorGroupService.focusGroup(nextPosition);

		return TPromise.as(true);
	}
}

export class FocusNextGroup extends Action {

	public static ID = 'workbench.action.focusNextGroup';
	public static LABEL = nls.localize('focusNextGroup', "Focus Next Group");

	private navigateActions: Action[];

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label);

		this.navigateActions = [];
		this.navigateActions[Position.ONE] = instantiationService.createInstance(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL);
		this.navigateActions[Position.TWO] = instantiationService.createInstance(FocusSecondGroupAction, FocusSecondGroupAction.ID, FocusSecondGroupAction.LABEL);
		this.navigateActions[Position.THREE] = instantiationService.createInstance(FocusThirdGroupAction, FocusThirdGroupAction.ID, FocusThirdGroupAction.LABEL);
	}

	public run(event?: any): TPromise<any> {

		// Find the next position to the right/bottom to use
		let nextPosition: Position;
		const activeEditor = this.editorService.getActiveEditor();

		const lastPosition = POSITIONS[POSITIONS.length - 1];
		if (!activeEditor || activeEditor.position === lastPosition) {
			nextPosition = Position.ONE;
		} else if (activeEditor.position === Position.ONE) {
			nextPosition = Position.TWO;
		} else if (activeEditor.position === Position.TWO) {
			nextPosition = Position.THREE;
		}

		// Run the action for the target next position
		if (typeof nextPosition === 'number' && this.navigateActions[nextPosition]) {
			return this.navigateActions[nextPosition].run(event);
		}

		return TPromise.as(true);
	}
}

export class OpenToSideAction extends Action {

	public static OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(OpenToSideAction.OPEN_TO_SIDE_ID, OpenToSideAction.OPEN_TO_SIDE_LABEL);

		this.updateEnablement();
		this.updateClass();
	}

	public updateClass(): void {
		const editorGroupLayoutVertical = (this.editorGroupService.getGroupOrientation() !== 'horizontal');

		this.class = editorGroupLayoutVertical ? 'quick-open-sidebyside-vertical' : 'quick-open-sidebyside-horizontal';
	}

	private updateEnablement(): void {
		const activeEditor = this.editorService.getActiveEditor();
		this.enabled = (!activeEditor || activeEditor.position !== Position.THREE);
	}

	public run(context: any): TPromise<any> {
		let entry = toEditorQuickOpenEntry(context);
		if (entry) {
			const input = entry.getInput();
			if (input instanceof EditorInput) {
				return this.editorService.openEditor(input, entry.getOptions(), true);
			}

			const resourceInput = input as IResourceInput;
			resourceInput.options = mixin(resourceInput.options, entry.getOptions());

			return this.editorService.openEditor(resourceInput, true);
		}

		return TPromise.as(false);
	}
}

export function toEditorQuickOpenEntry(element: any): IEditorQuickOpenEntry {

	// QuickOpenEntryGroup
	if (element instanceof QuickOpenEntryGroup) {
		const group = <QuickOpenEntryGroup>element;
		if (group.getEntry()) {
			element = group.getEntry();
		}
	}

	// EditorQuickOpenEntry or EditorQuickOpenEntryGroup both implement IEditorQuickOpenEntry
	if (element instanceof EditorQuickOpenEntry || element instanceof EditorQuickOpenEntryGroup) {
		return element;
	}

	return null;
}

export class CloseEditorAction extends Action {

	public static ID = 'workbench.action.closeActiveEditor';
	public static LABEL = nls.localize('closeEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label, 'close-editor-action');
	}

	public run(context?: IEditorContext): TPromise<any> {
		const position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;

		// Close Active Editor
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
			}
		}

		let input = context ? context.editor : null;
		if (!input) {

			// Get Top Editor at Position
			const visibleEditors = this.editorService.getVisibleEditors();
			if (visibleEditors[position]) {
				input = visibleEditors[position].input;
			}
		}

		if (input) {
			return this.editorService.closeEditor(position, input);
		}

		return TPromise.as(false);
	}
}

export class CloseLeftEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsToTheLeft';
	public static LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		const editor = getTarget(this.editorService, this.groupService, context);
		if (editor) {
			return this.editorService.closeEditors(editor.position, editor.input, Direction.LEFT);
		}

		return TPromise.as(false);
	}
}

export class CloseRightEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsToTheRight';
	public static LABEL = nls.localize('closeEditorsToTheRight', "Close Editors to the Right");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		const editor = getTarget(this.editorService, this.groupService, context);
		if (editor) {
			return this.editorService.closeEditors(editor.position, editor.input, Direction.RIGHT);
		}

		return TPromise.as(false);
	}
}

export class CloseAllEditorsAction extends Action {

	public static ID = 'workbench.action.closeAllEditors';
	public static LABEL = nls.localize('closeAllEditors', "Close All Editors");

	constructor(
		id: string,
		label: string,
		@ITextFileService private textFileService: ITextFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label, 'action-close-all-files');
	}

	public run(): TPromise<any> {

		// Just close all if there are no or one dirty editor
		if (this.textFileService.getDirty().length < 2) {
			return this.editorService.closeAllEditors();
		}

		// Otherwise ask for combined confirmation
		const confirm = this.textFileService.confirmSave();
		if (confirm === ConfirmResult.CANCEL) {
			return undefined;
		}

		let saveOrRevertPromise: TPromise<boolean>;
		if (confirm === ConfirmResult.DONT_SAVE) {
			saveOrRevertPromise = this.textFileService.revertAll(null, { soft: true }).then(() => true);
		} else {
			saveOrRevertPromise = this.textFileService.saveAll(true).then(res => res.results.every(r => r.success));
		}

		return saveOrRevertPromise.then(success => {
			if (success) {
				return this.editorService.closeAllEditors();
			}
			return undefined;
		});
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	public static ID = 'workbench.action.closeEditorsInOtherGroups';
	public static LABEL = nls.localize('closeEditorsInOtherGroups', "Close Editors in Other Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			return this.editorService.closeAllEditors(position);
		}

		return TPromise.as(false);
	}
}

export class CloseOtherEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeOtherEditors';
	public static LABEL = nls.localize('closeOtherEditorsInGroup', "Close Other Editors");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		let input = context ? context.editor : null;

		// If position or input are not passed in take the position and input of the active editor.
		const active = this.editorService.getActiveEditor();
		if (active) {
			position = typeof position === 'number' ? position : active.position;
			input = input ? input : <EditorInput>active.input;
		}

		if (typeof position === 'number' && input) {
			return this.editorService.closeEditors(position, input);
		}

		return TPromise.as(false);
	}
}

export class CloseEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsInGroup';
	public static LABEL = nls.localize('closeEditorsInGroup', "Close All Editors in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			return this.editorService.closeEditors(position);
		}

		return TPromise.as(false);
	}
}

export class MoveGroupLeftAction extends Action {

	public static ID = 'workbench.action.moveActiveEditorGroupLeft';
	public static LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor && (activeEditor.position === Position.TWO || activeEditor.position === Position.THREE)) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			const newPosition = (position === Position.TWO) ? Position.ONE : Position.TWO;

			// Move group
			this.editorGroupService.moveGroup(position, newPosition);
		}

		return TPromise.as(false);
	}
}

export class MoveGroupRightAction extends Action {

	public static ID = 'workbench.action.moveActiveEditorGroupRight';
	public static LABEL = nls.localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			const editors = this.editorService.getVisibleEditors();

			if ((editors.length === 2 && activeEditor.position === Position.ONE) || (editors.length === 3 && activeEditor.position !== Position.THREE)) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			const newPosition = (position === Position.ONE) ? Position.TWO : Position.THREE;

			// Move group
			this.editorGroupService.moveGroup(position, newPosition);
		}

		return TPromise.as(false);
	}
}

export class MinimizeOtherGroupsAction extends Action {

	public static ID = 'workbench.action.minimizeOtherEditors';
	public static LABEL = nls.localize('minimizeOtherEditorGroups', "Minimize Other Editor Groups");

	constructor(id: string, label: string, @IEditorGroupService private editorGroupService: IEditorGroupService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

export class EvenGroupWidthsAction extends Action {

	public static ID = 'workbench.action.evenEditorWidths';
	public static LABEL = nls.localize('evenEditorGroups', "Even Editor Group Widths");

	constructor(id: string, label: string, @IEditorGroupService private editorGroupService: IEditorGroupService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupArrangement.EVEN);

		return TPromise.as(false);
	}
}

export class MaximizeGroupAction extends Action {

	public static ID = 'workbench.action.maximizeEditor';
	public static LABEL = nls.localize('maximizeEditor', "Maximize Editor Group and Hide Sidebar");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (this.editorService.getActiveEditor()) {
			this.editorGroupService.arrangeGroups(GroupArrangement.MINIMIZE_OTHERS);
			return this.partService.setSideBarHidden(true);
		}

		return TPromise.as(false);
	}
}

export class KeepEditorAction extends Action {

	public static ID = 'workbench.action.keepEditor';
	public static LABEL = nls.localize('keepEditor', "Keep Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		const target = getTarget(this.editorService, this.editorGroupService, context);
		if (target) {
			this.editorGroupService.pinEditor(target.position, target.input);
		}

		return TPromise.as(true);
	}
}

function getTarget(editorService: IWorkbenchEditorService, editorGroupService: IEditorGroupService, context?: IEditorContext): { input: IEditorInput, position: Position } {
	if (context) {
		return { input: context.editor, position: editorGroupService.getStacksModel().positionOfGroup(context.group) };
	}

	const activeEditor = editorService.getActiveEditor();
	if (activeEditor) {
		return { input: activeEditor.input, position: activeEditor.position };
	}

	return null;
}

export abstract class BaseNavigateEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		protected editorGroupService: IEditorGroupService,
		protected editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const model = this.editorGroupService.getStacksModel();
		const result = this.navigate();
		if (result) {
			return this.editorService.openEditor(result.editor, null, model.positionOfGroup(result.group));
		}

		return TPromise.as(false);
	}

	protected abstract navigate(): IEditorIdentifier;
}

export class OpenNextEditor extends BaseNavigateEditorAction {

	public static ID = 'workbench.action.nextEditor';
	public static LABEL = nls.localize('openNextEditor', "Open Next Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorGroupService.getStacksModel().next(true /* jump groups */);
	}
}

export class OpenPreviousEditor extends BaseNavigateEditorAction {

	public static ID = 'workbench.action.previousEditor';
	public static LABEL = nls.localize('openPreviousEditor', "Open Previous Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorGroupService.getStacksModel().previous(true /* jump groups */);
	}
}

export class OpenNextEditorInGroup extends BaseNavigateEditorAction {

	public static ID = 'workbench.action.nextEditorInGroup';
	public static LABEL = nls.localize('nextEditorInGroup', "Open Next Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorGroupService.getStacksModel().next(false /* do NOT jump groups */);
	}
}

export class OpenPreviousEditorInGroup extends BaseNavigateEditorAction {

	public static ID = 'workbench.action.previousEditorInGroup';
	public static LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorGroupService.getStacksModel().previous(false /* do NOT jump groups */);
	}
}

export class NavigateForwardAction extends Action {

	public static ID = 'workbench.action.navigateForward';
	public static LABEL = nls.localize('navigateNext', "Go Forward");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.forward();

		return TPromise.as(null);
	}
}

export class NavigateBackwardsAction extends Action {

	public static ID = 'workbench.action.navigateBack';
	public static LABEL = nls.localize('navigatePrevious', "Go Back");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.back();

		return TPromise.as(null);
	}
}

export class ReopenClosedEditorAction extends Action {

	public static ID = 'workbench.action.reopenClosedEditor';
	public static LABEL = nls.localize('reopenClosedEditor', "Reopen Closed Editor");

	constructor(
		id: string,
		label: string,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.reopenLastClosedEditor();

		return TPromise.as(false);
	}
}

export const NAVIGATE_IN_GROUP_ONE_PREFIX = 'edt one ';

export class ShowEditorsInGroupOneAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInFirstGroup';
	public static LABEL = nls.localize('showEditorsInFirstGroup', "Show Editors in First Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_ONE_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export const NAVIGATE_IN_GROUP_TWO_PREFIX = 'edt two ';

export class ShowEditorsInGroupTwoAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInSecondGroup';
	public static LABEL = nls.localize('showEditorsInSecondGroup', "Show Editors in Second Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_TWO_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export const NAVIGATE_IN_GROUP_THREE_PREFIX = 'edt three ';

export class ShowEditorsInGroupThreeAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInThirdGroup';
	public static LABEL = nls.localize('showEditorsInThirdGroup', "Show Editors in Third Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_THREE_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export class ShowEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.showEditorsInGroup';
	public static LABEL = nls.localize('showEditorsInGroup', "Show Editors in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(context?: IEditorContext): TPromise<any> {
		const stacks = this.editorGroupService.getStacksModel();
		const groupCount = stacks.groups.length;
		if (groupCount <= 1 || !context) {
			return this.quickOpenService.show(NAVIGATE_ALL_EDITORS_GROUP_PREFIX);
		}

		switch (stacks.positionOfGroup(context.group)) {
			case Position.TWO:
				return this.quickOpenService.show(NAVIGATE_IN_GROUP_TWO_PREFIX);
			case Position.THREE:
				return this.quickOpenService.show(NAVIGATE_IN_GROUP_THREE_PREFIX);
		}

		return this.quickOpenService.show(NAVIGATE_IN_GROUP_ONE_PREFIX);
	}
}

export const NAVIGATE_ALL_EDITORS_GROUP_PREFIX = 'edt ';

export class ShowAllEditorsAction extends QuickOpenAction {

	public static ID = 'workbench.action.showAllEditors';
	public static LABEL = nls.localize('showAllEditors', "Show All Editors");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, quickOpenService);
	}
}

export class BaseQuickOpenEditorInGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		const stacks = this.editorGroupService.getStacksModel();
		if (stacks.activeGroup) {
			const activePosition = stacks.positionOfGroup(stacks.activeGroup);
			let prefix = NAVIGATE_IN_GROUP_ONE_PREFIX;

			if (activePosition === Position.TWO) {
				prefix = NAVIGATE_IN_GROUP_TWO_PREFIX;
			} else if (activePosition === Position.THREE) {
				prefix = NAVIGATE_IN_GROUP_THREE_PREFIX;
			}

			this.quickOpenService.show(prefix, { quickNavigateConfiguration: { keybindings: keys } });
		}

		return TPromise.as(true);
	}
}

export class OpenPreviousRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	public static ID = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
	public static LABEL = nls.localize('openPreviousRecentlyUsedEditorInGroup', "Open Previous Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(id, label, quickOpenService, keybindingService, editorGroupService);
	}
}

export class OpenNextRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	public static ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	public static LABEL = nls.localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super(id, label, quickOpenService, keybindingService, editorGroupService);
	}
}

export class OpenPreviousEditorFromHistoryAction extends Action {

	public static ID = 'workbench.action.openPreviousEditorFromHistory';
	public static LABEL = nls.localize('navigateEditorHistoryByInput', "Open Previous Editor from History");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(null, { quickNavigateConfiguration: { keybindings: keys } });

		return TPromise.as(true);
	}
}

export class ClearEditorHistoryAction extends Action {

	public static ID = 'workbench.action.clearEditorHistory';
	public static LABEL = nls.localize('clearEditorHistory', "Clear Editor History");

	constructor(
		id: string,
		label: string,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Editor history
		this.historyService.clear();

		return TPromise.as(true);
	}
}

export class FocusLastEditorInStackAction extends Action {

	public static ID = 'workbench.action.openLastEditorInGroup';
	public static LABEL = nls.localize('focusLastEditorInStack', "Open Last Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const active = this.editorService.getActiveEditor();
		if (active) {
			const group = this.editorGroupService.getStacksModel().groupAt(active.position);
			const editor = group.getEditor(group.count - 1);

			if (editor) {
				return this.editorService.openEditor(editor);
			}
		}

		return TPromise.as(true);
	}
}

export class MoveEditorLeftInGroupAction extends Action {

	public static ID = 'workbench.action.moveEditorLeftInGroup';
	public static LABEL = nls.localize('moveEditorLeft', "Move Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = {
			to: ActiveEditorMovePositioning.LEFT
		};
		this.commandService.executeCommand(EditorCommands.MoveActiveEditor, args);

		return TPromise.as(true);
	}
}

export class MoveEditorRightInGroupAction extends Action {

	public static ID = 'workbench.action.moveEditorRightInGroup';
	public static LABEL = nls.localize('moveEditorRight', "Move Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = {
			to: ActiveEditorMovePositioning.RIGHT
		};
		this.commandService.executeCommand(EditorCommands.MoveActiveEditor, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToPreviousGroupAction extends Action {

	public static ID = 'workbench.action.moveEditorToPreviousGroup';
	public static LABEL = nls.localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && activeEditor.position !== Position.ONE) {
			this.editorGroupService.moveEditor(activeEditor.input, activeEditor.position, activeEditor.position - 1);
		}

		return TPromise.as(true);
	}
}

export class MoveEditorToNextGroupAction extends Action {

	public static ID = 'workbench.action.moveEditorToNextGroup';
	public static LABEL = nls.localize('moveEditorToNextGroup', "Move Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && activeEditor.position !== Position.THREE) {
			this.editorGroupService.moveEditor(activeEditor.input, activeEditor.position, activeEditor.position + 1);
		}

		return TPromise.as(true);
	}
}
