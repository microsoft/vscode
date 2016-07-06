/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Action} from 'vs/base/common/actions';
import {EditorInput, getUntitledOrFileResource, TextEditorOptions, EditorOptions, IEditorIdentifier, IEditorContext} from 'vs/workbench/common/editor';
import {QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction} from 'vs/workbench/browser/quickopen';
import {IWorkbenchEditorService, GroupArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, IEditor, Direction, IResourceInput, IEditorInput} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';

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
		if (editorToSplit instanceof BaseTextEditor) {
			options = new TextEditorOptions();
			(<TextEditorOptions>options).viewState(editorToSplit.getControl().saveViewState());
		} else {
			options = new EditorOptions();
		}
		options.pinned = true;

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
				if (editorToSplit.position === Position.CENTER) {
					targetPosition = Position.RIGHT;
				}

				// Push the center group to the right to make room for the splitted input
				else if (editorToSplit.position === Position.LEFT) {
					options.preserveFocus = true;

					return this.editorService.openEditor(editorToSplit.input, options, Position.RIGHT).then(() => {
						this.editorGroupService.moveGroup(Position.RIGHT, Position.CENTER);
						this.editorGroupService.focusGroup(Position.CENTER);
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
		let activeEditor = this.editorService.getActiveEditor();
		if (!activeEditor) {
			return TPromise.as(false);
		}

		// Cycle to the left and use module to start at 0 again
		let visibleEditors = this.editorService.getVisibleEditors();
		let editorCount = visibleEditors.length;
		let newIndex = (activeEditor.position + 1) % editorCount;

		this.editorGroupService.focusGroup(<Position>newIndex);

		return TPromise.as(true);
	}
}

export class FocusFirstGroupAction extends Action {

	public static ID = 'workbench.action.focusFirstEditorGroup';
	public static LABEL = nls.localize('focusFirstEditorGroup', "Focus Left Editor Group");

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

		// Find left editor and focus it
		let editors = this.editorService.getVisibleEditors();
		for (var editor of editors) {
			if (editor.position === Position.LEFT) {
				this.editorGroupService.focusGroup(Position.LEFT);

				return TPromise.as(true);
			}
		}

		// Since no editor is currently opened, try to open last history entry to the target side
		let history = this.historyService.getHistory();
		for (var input of history) {

			// For now only support to open resources from history to the side
			if (!!getUntitledOrFileResource(input)) {
				return this.editorService.openEditor(input, null, Position.LEFT);
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
		let editors = this.editorService.getVisibleEditors();
		let referenceEditor: IEditor;
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];

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
			if (referenceEditor instanceof BaseTextEditor) {
				options = new TextEditorOptions();
				options.pinned = true;
				(<TextEditorOptions>options).viewState(referenceEditor.getControl().saveViewState());
			} else {
				options = EditorOptions.create({ pinned: true });
			}

			return this.editorService.openEditor(referenceEditor.input, options, this.getTargetEditorSide());
		}

		// Otherwise try to find a history entry to open to the target editor side
		else if (referenceEditor) {
			let history = this.historyService.getHistory();
			for (var input of history) {

				// For now only support to open files from history to the side
				if (!!getUntitledOrFileResource(input)) {
					return this.editorService.openEditor(input, { pinned: true }, this.getTargetEditorSide());
				}
			}
		}

		return TPromise.as(true);
	}
}

export class FocusSecondGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusSecondEditorGroup';
	public static LABEL = nls.localize('focusSecondEditorGroup', "Focus Center Editor Group");

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
		return Position.LEFT;
	}

	protected getTargetEditorSide(): Position {
		return Position.CENTER;
	}
}

export class FocusThirdGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusThirdEditorGroup';
	public static LABEL = nls.localize('focusThirdEditorGroup', "Focus Right Editor Group");

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
		return Position.CENTER;
	}

	protected getTargetEditorSide(): Position {
		return Position.RIGHT;
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
		this.navigateActions[Position.LEFT] = instantiationService.createInstance(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL);
		this.navigateActions[Position.CENTER] = instantiationService.createInstance(FocusSecondGroupAction, FocusSecondGroupAction.ID, FocusSecondGroupAction.LABEL);
		this.navigateActions[Position.RIGHT] = instantiationService.createInstance(FocusThirdGroupAction, FocusThirdGroupAction.ID, FocusThirdGroupAction.LABEL);
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
		if (typeof nextPosition === 'number' && this.navigateActions[nextPosition]) {
			return this.navigateActions[nextPosition].run(event);
		}

		return TPromise.as(true);
	}
}

export class OpenToSideAction extends Action {

	public static OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor( @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
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
				typedInputPromise = this.editorService.createInput(<IResourceInput>input);
			}

			return typedInputPromise.then(typedInput => this.editorService.openEditor(typedInput, entry.getOptions(), true));
		}

		return TPromise.as(false);
	}
}

export function toEditorQuickOpenEntry(element: any): IEditorQuickOpenEntry {

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

	public static ID = 'workbench.action.closeEditor';
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
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;

		// Close Active Editor
		if (typeof position !== 'number') {
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
			}
		}

		let input = context ? context.editor : null;
		if (!input) {

			// Get Top Editor at Position
			let visibleEditors = this.editorService.getVisibleEditors();
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
		let editor = getTarget(this.editorService, this.groupService, context);
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
		let editor = getTarget(this.editorService, this.groupService, context);
		if (editor) {
			return this.editorService.closeEditors(editor.position, editor.input, Direction.RIGHT);
		}

		return TPromise.as(false);
	}
}

export class CloseAllEditorsAction extends Action {

	public static ID = 'workbench.action.closeAllEditors';
	public static LABEL = nls.localize('closeAllEditors', "Close All Editors");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label, 'action-close-all-files');
	}

	public run(): TPromise<any> {
		return this.editorService.closeAllEditors();
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
			let activeEditor = this.editorService.getActiveEditor();
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
			let activeEditor = this.editorService.getActiveEditor();
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
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor && (activeEditor.position === Position.CENTER || activeEditor.position === Position.RIGHT)) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			let newPosition = (position === Position.CENTER) ? Position.LEFT : Position.CENTER;

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
			let activeEditor = this.editorService.getActiveEditor();
			let editors = this.editorService.getVisibleEditors();

			if ((editors.length === 2 && activeEditor.position === Position.LEFT) || (editors.length === 3 && activeEditor.position !== Position.RIGHT)) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			let newPosition = (position === Position.LEFT) ? Position.CENTER : Position.RIGHT;

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
		this.editorGroupService.arrangeGroups(GroupArrangement.EVEN_WIDTH);

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
			this.partService.setSideBarHidden(true);
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
		let target = getTarget(this.editorService, this.editorGroupService, context);
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
		return this.editorGroupService.getStacksModel().next();
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
		return this.editorGroupService.getStacksModel().previous();
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
		@IHistoryService private historyService: IHistoryService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const stacks = this.editorGroupService.getStacksModel();

		// Find an editor that was closed and is currently not opened in the group
		let lastClosedEditor = this.historyService.popLastClosedEditor();
		while (lastClosedEditor && stacks.activeGroup && stacks.activeGroup.indexOf(lastClosedEditor) >= 0) {
			lastClosedEditor = this.historyService.popLastClosedEditor();
		}

		if (lastClosedEditor) {
			this.editorService.openEditor(lastClosedEditor, { pinned: true });
		}

		return TPromise.as(false);
	}
}

export const NAVIGATE_IN_LEFT_GROUP_PREFIX = 'edt left ';

export class ShowEditorsInLeftGroupAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInLeftGroup';
	public static LABEL = nls.localize('showEditorsInLeftGroup', "Show Editors in Left Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_LEFT_GROUP_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export const NAVIGATE_IN_CENTER_GROUP_PREFIX = 'edt center ';

export class ShowEditorsInCenterGroupAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInCenterGroup';
	public static LABEL = nls.localize('showEditorsInCenterGroup', "Show Editors in Center Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_CENTER_GROUP_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export const NAVIGATE_IN_RIGHT_GROUP_PREFIX = 'edt right ';

export class ShowEditorsInRightGroupAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInRightGroup';
	public static LABEL = nls.localize('showEditorsInRightGroup', "Show Editors in Right Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_RIGHT_GROUP_PREFIX, quickOpenService);

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
			case Position.CENTER:
				return this.quickOpenService.show((groupCount === 2) ? NAVIGATE_IN_RIGHT_GROUP_PREFIX : NAVIGATE_IN_CENTER_GROUP_PREFIX);
			case Position.RIGHT:
				return this.quickOpenService.show(NAVIGATE_IN_RIGHT_GROUP_PREFIX);
		}

		return this.quickOpenService.show(NAVIGATE_IN_LEFT_GROUP_PREFIX);
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
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let keys = this.keybindingService.lookupKeybindings(this.id);

		const stacks = this.editorGroupService.getStacksModel();
		if (stacks.activeGroup) {
			const activePosition = stacks.positionOfGroup(stacks.activeGroup);
			const count = stacks.groups.length;
			let prefix = NAVIGATE_IN_LEFT_GROUP_PREFIX;

			if (activePosition === Position.CENTER && count === 3) {
				prefix = NAVIGATE_IN_CENTER_GROUP_PREFIX;
			} else if (activePosition === Position.RIGHT || (activePosition === Position.CENTER && count === 2)) {
				prefix = NAVIGATE_IN_RIGHT_GROUP_PREFIX;
			}

			this.quickOpenService.show(prefix, { quickNavigateConfiguration: { keybindings: keys } });
		}

		return TPromise.as(true);
	}
}

export class OpenPreviousRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	public static ID = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
	public static LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, quickOpenService, keybindingService, editorGroupService, editorService);
	}
}

export class OpenNextRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	public static ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	public static LABEL = nls.localize('openNextEditorInGroup', "Open Next Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, quickOpenService, keybindingService, editorGroupService, editorService);
	}
}

export class GlobalQuickOpenAction extends Action {

	public static ID = 'workbench.action.quickOpen';
	public static LABEL = nls.localize('quickOpen', "Go to File...");

	constructor(id: string, label: string, @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super(id, label);

		this.order = 100; // Allow other actions to position before or after
		this.class = 'quickopen';
	}

	public run(): TPromise<any> {
		this.quickOpenService.show(null);

		return TPromise.as(true);
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
		let keys = this.keybindingService.lookupKeybindings(this.id);

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
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
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

export class RemoveFromEditorHistoryAction extends Action {

	public static ID = 'workbench.action.removeFromEditorHistory';
	public static LABEL = nls.localize('removeFromEditorHistory', "Remove From Editor History");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IHistoryService private historyService: IHistoryService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {

		// Listen for next editor to open
		let unbind = this.editorGroupService.onEditorOpening(e => {
			unbind.dispose(); // listen once

			e.prevent();
			this.historyService.remove(e.editorInput);
		});

		// Bring up quick open
		this.quickOpenService.show().then(() => {
			unbind.dispose(); // make sure to unbind if quick open is closing
		});

		return TPromise.as(true);
	}
}

export class BaseQuickOpenNavigateAction extends Action {
	private navigateNext: boolean;

	constructor(
		id: string,
		label: string,
		navigateNext: boolean,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);

		this.navigateNext = navigateNext;
	}

	public run(event?: any): TPromise<any> {
		let keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.quickNavigate({
			keybindings: keys
		}, this.navigateNext);

		return TPromise.as(true);
	}
}

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigateNext';
	public static LABEL = nls.localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, quickOpenService, keybindingService);
	}
}

export class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	public static ID = 'workbench.action.quickOpenNavigatePrevious';
	public static LABEL = nls.localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, quickOpenService, keybindingService);
	}
}

interface IEditorPickOpenEntry extends IPickOpenEntry {
	identifier: IEditorIdentifier;
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