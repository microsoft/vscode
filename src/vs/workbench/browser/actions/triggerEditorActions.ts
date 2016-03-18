/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import {Action, IAction} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {Registry} from 'vs/platform/platform';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, getUntitledOrFileResource, TextEditorOptions} from 'vs/workbench/common/editor';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {IWorkbenchEditorService, EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, IEditor} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

let SPLIT_EDITOR_ACTION_ID = 'workbench.action.splitEditor';
let SPLIT_EDITOR_ACTION_LABEL = nls.localize('splitEditor', "Split Editor");
export class SplitEditorAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Can only split with active editor
		let activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(true);
		}

		// Return if the editor to split does not support split editing
		if (!(<BaseEditor>activeEditor).supportsSplitEditor()) {
			return TPromise.as(true);
		}

		// Count editors
		let visibleEditors = this.editorService.getVisibleEditors();
		let editorCount = visibleEditors.length;
		let targetPosition: Position;

		switch (editorCount) {

			// Open split editor to the right of left one
			case 1:
				targetPosition = Position.CENTER;
				break;

			// Special case two editors opened
			case 2:

				// Continue splitting to the right
				if (activeEditor.position === Position.CENTER) {
					targetPosition = Position.RIGHT;
				}

				// Replace the center editor with the contents of the left editor and push center to the right
				else if (activeEditor.position === Position.LEFT && !!getUntitledOrFileResource(activeEditor.input)) {
					let centerInput = visibleEditors[Position.CENTER].input;

					let options = new TextEditorOptions();
					options.preserveFocus = true;

					return this.editorService.openEditor(activeEditor.input, options, Position.CENTER).then(() => {
						return this.editorService.openEditor(centerInput, options, Position.RIGHT).then(() => {
							return this.editorService.focusEditor(Position.CENTER);
						});
					});
				}
		}

		// Only split if the input is resource editor input
		if (!types.isUndefinedOrNull(targetPosition) && !!getUntitledOrFileResource(activeEditor.input)) {
			return this.editorService.openEditor(activeEditor.input, null, targetPosition);
		}

		return TPromise.as(true);
	}
}

let CYCLE_EDITOR_ACTION_ID = 'workbench.action.cycleEditor';
let CYCLE_EDITOR_ACTION_LABEL = nls.localize('cycleEditor', "Cycle Between Opened Editors");
export class CycleEditorAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Can cycle split with active editor
		let activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(false);
		}

		// Cycle to the left and use module to start at 0 again
		let visibleEditors = this.editorService.getVisibleEditors();
		let editorCount = visibleEditors.length;
		let newIndex = (activeEditor.position + 1) % editorCount;

		return this.editorService.focusEditor(<Position>newIndex);
	}
}

let FOCUS_FIRST_EDITOR_ACTION_ID = 'workbench.action.focusFirstEditor';
let FOCUS_FIRST_EDITOR_ACTION_LABEL = nls.localize('focusFirstEditor', "Focus into Left Hand Editor");
export class FocusFirstEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Find left editor and focus it
		let editors = this.editorService.getVisibleEditors();
		for (var editor of editors) {
			if (editor.position === Position.LEFT) {
				return this.editorService.focusEditor(editor);
			}
		}

		// Since no editor is currently opened, try to open last history entry to the target side
		let history = this.quickOpenService.getEditorHistory();
		for (var input of history) {

			// For now only support to open resources from history to the side
			if (!!getUntitledOrFileResource(input)) {
				return this.editorService.openEditor(input, null, Position.LEFT).then(() => {

					// Automatically clean up stale history entries when the input can not be opened
					if (!input.matches(this.editorService.getActiveEditorInput())) {
						this.quickOpenService.removeEditorHistoryEntry(input);
					}
				});
			}
		}

		return TPromise.as(true);
	}
}

export abstract class BaseFocusSideEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	protected abstract getReferenceEditorSide(): Position;

	protected abstract getTargetEditorSide(): Position;

	public run(): TPromise<any> {

		// Require at least the reference editor to be visible
		let editors = this.editorService.getVisibleEditors();
		let referenceEditor: IEditor;
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];

			// Target editor exists so focus it
			if (editor.position === this.getTargetEditorSide()) {
				return this.editorService.focusEditor(editor);
			}

			// Remember reference editor
			if (editor.position === this.getReferenceEditorSide()) {
				referenceEditor = editor;
			}
		}

		// Require the reference editor to be visible and supporting split editor
		if (referenceEditor && (<BaseEditor>referenceEditor).supportsSplitEditor()) {
			return this.editorService.openEditor(referenceEditor.input, null, this.getTargetEditorSide());
		}

		// Otherwise try to find a history entry to open to the target editor side
		else if (referenceEditor) {
			let history = this.quickOpenService.getEditorHistory();
			for (var input of history) {

				// For now only support to open files from history to the side
				if (!!getUntitledOrFileResource(input)) {
					return this.editorService.openEditor(input, null, this.getTargetEditorSide()).then(() => {

						// Automatically clean up stale history entries when the input can not be opened
						if (!input.matches(this.editorService.getActiveEditorInput())) {
							this.quickOpenService.removeEditorHistoryEntry(input);
						}
					});
				}
			}
		}

		return TPromise.as(true);
	}
}

let FOCUS_SECOND_EDITOR_ACTION_ID = 'workbench.action.focusSecondEditor';
let FOCUS_SECOND_EDITOR_ACTION_LABEL = nls.localize('focusSecondEditor', "Focus into Side Editor");
export class FocusSecondEditorAction extends BaseFocusSideEditorAction {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(id, label, editorService, quickOpenService);
	}

	protected getReferenceEditorSide(): Position {
		return Position.LEFT;
	}

	protected getTargetEditorSide(): Position {
		return Position.CENTER;
	}
}

let FOCUS_THIRD_EDITOR_ACTION_ID = 'workbench.action.focusThirdEditor';
let FOCUS_THIRD_EDITOR_ACTION_LABEL = nls.localize('focusThirdEditor', "Focus into Right Hand Editor");
export class FocusThirdEditorAction extends BaseFocusSideEditorAction {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(id, label, editorService, quickOpenService);
	}

	protected getReferenceEditorSide(): Position {
		return Position.CENTER;
	}

	protected getTargetEditorSide(): Position {
		return Position.RIGHT;
	}
}

let NAVIGATE_LEFT_EDITOR_ACTION_ID = 'workbench.action.focusLeftEditor';
let NAVIGATE_LEFT_EDITOR_ACTION_LABEL = nls.localize('focusLeftEditor', "Focus into Next Editor on the Left");
export class NavigateToLeftEditorAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Require an active editor
		let activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(true);
		}


		// Find the next position to the left
		let nextPosition: Position = Position.LEFT;
		if (activeEditor.position === Position.RIGHT) {
			nextPosition = Position.CENTER;
		}

		// Focus next position if provided
		let visibleEditors = this.editorService.getVisibleEditors();
		return this.editorService.focusEditor(visibleEditors[nextPosition]);
	}
}

let NAVIGATE_RIGHT_EDITOR_ACTION_ID = 'workbench.action.focusRightEditor';
let NAVIGATE_RIGHT_EDITOR_ACTION_LABEL = nls.localize('focusRigthEditor', "Focus into Next Editor on the Right");
export class NavigateToRightEditorAction extends Action {
	private navigateActions: Action[];

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label);

		this.navigateActions = [];
		this.navigateActions[Position.LEFT] = instantiationService.createInstance(FocusFirstEditorAction, FOCUS_FIRST_EDITOR_ACTION_ID, FOCUS_FIRST_EDITOR_ACTION_LABEL);
		this.navigateActions[Position.CENTER] = instantiationService.createInstance(FocusSecondEditorAction, FOCUS_SECOND_EDITOR_ACTION_ID, FOCUS_SECOND_EDITOR_ACTION_LABEL);
		this.navigateActions[Position.RIGHT] = instantiationService.createInstance(FocusThirdEditorAction, FOCUS_THIRD_EDITOR_ACTION_ID, FOCUS_THIRD_EDITOR_ACTION_LABEL);
	}

	public run(event?: any): TPromise<any> {

		// Find the next position to the right to use
		let nextPosition: Position;
		let activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			nextPosition = Position.LEFT;
		} else if (activeEditor.position === Position.LEFT) {
			nextPosition = Position.CENTER;
		} else if (activeEditor.position === Position.CENTER) {
			nextPosition = Position.RIGHT;
		}

		// Run the action for the target next position
		if (!types.isUndefinedOrNull(nextPosition) && this.navigateActions[nextPosition]) {
			return this.navigateActions[nextPosition].run(event);
		}

		return TPromise.as(true);
	}
}

export class OpenToSideAction extends Action {

	public static OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(OpenToSideAction.OPEN_TO_SIDE_ID, OpenToSideAction.OPEN_TO_SIDE_LABEL);

		this.class = 'quick-open-sidebyside';

		this.updateEnablement();
	}

	private updateEnablement(): void {
		let activeEditor = this.editorService.getActiveEditor();
		this.enabled = (!activeEditor || activeEditor.position !== Position.RIGHT);
	}

	public run(context: any): TPromise<any> {
		let entry = toEditorQuickOpenEntry(context);
		if (entry) {
			let typedInputPromise: TPromise<EditorInput>;
			let input = entry.getInput();
			if (input instanceof EditorInput) {
				typedInputPromise = TPromise.as(input);
			} else {
				typedInputPromise = this.editorService.inputToType(input);
			}

			return typedInputPromise.then(typedInput => this.editorService.openEditor(typedInput, entry.getOptions(), true));
		}

		return TPromise.as(false);
	}
}

class QuickOpenActionContributor extends ActionBarContributor {
	private openToSideActionInstance: OpenToSideAction;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(context: any): boolean {
		let entry = this.getEntry(context);

		return !!entry;
	}

	public getActions(context: any): IAction[] {
		let actions: Action[] = [];

		let entry = this.getEntry(context);
		if (entry) {
			if (!this.openToSideActionInstance) {
				this.openToSideActionInstance = this.instantiationService.createInstance(OpenToSideAction);
			}

			actions.push(this.openToSideActionInstance);
		}

		return actions;
	}

	private getEntry(context: any): IEditorQuickOpenEntry {
		if (!context || !context.element) {
			return null;
		}

		return toEditorQuickOpenEntry(context.element);
	}
}

function toEditorQuickOpenEntry(element: any): IEditorQuickOpenEntry {

	// QuickOpenEntryGroup
	if (element instanceof QuickOpenEntryGroup) {
		let group = <QuickOpenEntryGroup>element;
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

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditor(activeEditor);
		}

		return TPromise.as(false);
	}
}

let CLOSE_ALL_EDITORS_ACTION_ID = 'workbench.action.closeAllEditors';
let CLOSE_ALL_EDITORS_ACTION_LABEL = nls.localize('closeAllEditors', "Close All Editors");
export class CloseAllEditorsAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.editorService.closeEditors();
	}
}

let CLOSE_OTHER_EDITORS_ACTION_ID = 'workbench.action.closeOtherEditors';
let CLOSE_OTHER_EDITORS_ACTION_LABEL = nls.localize('closeOtherEditors', "Close Other Editors");
export class CloseOtherEditorsAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.editorService.closeEditors(true);
	}
}

let MOVE_EDITOR_LEFT_ACTION_ID = 'workbench.action.moveActiveEditorLeft';
let MOVE_EDITOR_LEFT_ACTION_LABEL = nls.localize('moveActiveEditorLeft', "Move Active Editor Left");
export class MoveEditorLeftAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && (activeEditor.position === Position.CENTER || activeEditor.position === Position.RIGHT)) {
			let newPosition = (activeEditor.position === Position.CENTER) ? Position.LEFT : Position.CENTER;

			// Move editor
			this.editorService.moveEditor(activeEditor.position, newPosition);
		}

		return TPromise.as(false);
	}
}

let MOVE_EDITOR_RIGHT_ACTION_ID = 'workbench.action.moveActiveEditorRight';
let MOVE_EDITOR_RIGHT_ACTION_LABEL = nls.localize('moveActiveEditorRight', "Move Active Editor Right");
export class MoveEditorRightAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let editors = this.editorService.getVisibleEditors();
		let activeEditor = this.editorService.getActiveEditor();
		if ((editors.length === 2 && activeEditor.position === Position.LEFT) || (editors.length === 3 && activeEditor.position !== Position.RIGHT)) {
			let newPosition = (activeEditor.position === Position.LEFT) ? Position.CENTER : Position.RIGHT;

			// Move editor
			this.editorService.moveEditor(activeEditor.position, newPosition);
		}

		return TPromise.as(false);
	}
}

let MINIMIZE_EDITORS_ACTION_ID = 'workbench.action.minimizeOtherEditors';
let MINIMIZE_EDITORS_ACTION_LABEL = nls.localize('minimizeOtherEditors', "Minimize Other Editors");
export class MinimizeOtherEditorsAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorService.arrangeEditors(EditorArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

let EVEN_EDITOR_WIDTHS_ACTION_ID = 'workbench.action.evenEditorWidths';
let EVEN_EDITOR_WIDTHS_ACTION_LABEL = nls.localize('evenEditorWidths', "Even Editor Widths");
export class EvenEditorWidthsAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorService.arrangeEditors(EditorArrangement.EVEN_WIDTH);

		return TPromise.as(false);
	}
}

let MAXIMIZE_EDITOR_ACTION_ID = 'workbench.action.maximizeEditor';
let MAXIMIZE_EDITOR_ACTION_LABEL = nls.localize('maximizeEditor', "Maximize Active Editor and Hide Sidebar");
export class MaximizeEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (this.editorService.getActiveEditor()) {
			this.editorService.arrangeEditors(EditorArrangement.MINIMIZE_OTHERS);
			this.partService.setSideBarHidden(true);
		}

		return TPromise.as(false);
	}
}

// Contribute to Quick Open
let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionContributor);

// Contribute to Workbench Actions
const category = nls.localize('view', "View");
let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorsAction, CLOSE_ALL_EDITORS_ACTION_ID, CLOSE_ALL_EDITORS_ACTION_LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseOtherEditorsAction, CLOSE_OTHER_EDITORS_ACTION_ID, CLOSE_OTHER_EDITORS_ACTION_LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorAction, SPLIT_EDITOR_ACTION_ID, SPLIT_EDITOR_ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CycleEditorAction, CYCLE_EDITOR_ACTION_ID, CYCLE_EDITOR_ACTION_LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK,
	// on mac this keybinding is reserved to cycle between windows
	mac: { primary: null }
}), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFirstEditorAction, FOCUS_FIRST_EDITOR_ACTION_ID, FOCUS_FIRST_EDITOR_ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_1 }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSecondEditorAction, FOCUS_SECOND_EDITOR_ACTION_ID, FOCUS_SECOND_EDITOR_ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_2 }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusThirdEditorAction, FOCUS_THIRD_EDITOR_ACTION_ID, FOCUS_THIRD_EDITOR_ACTION_LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_3 }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EvenEditorWidthsAction, EVEN_EDITOR_WIDTHS_ACTION_ID, EVEN_EDITOR_WIDTHS_ACTION_LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MaximizeEditorAction, MAXIMIZE_EDITOR_ACTION_ID, MAXIMIZE_EDITOR_ACTION_LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MinimizeOtherEditorsAction, MINIMIZE_EDITORS_ACTION_ID, MINIMIZE_EDITORS_ACTION_LABEL), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorLeftAction, MOVE_EDITOR_LEFT_ACTION_ID, MOVE_EDITOR_LEFT_ACTION_LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.LeftArrow) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorRightAction, MOVE_EDITOR_RIGHT_ACTION_ID, MOVE_EDITOR_RIGHT_ACTION_LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.RightArrow) }), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateToLeftEditorAction, NAVIGATE_LEFT_EDITOR_ACTION_ID, NAVIGATE_LEFT_EDITOR_ACTION_LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow }
}), category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateToRightEditorAction, NAVIGATE_RIGHT_EDITOR_ACTION_ID, NAVIGATE_RIGHT_EDITOR_ACTION_LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow },
}), category);