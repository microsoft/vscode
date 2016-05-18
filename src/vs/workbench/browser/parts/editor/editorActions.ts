/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import {Action} from 'vs/base/common/actions';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, getUntitledOrFileResource, TextEditorOptions, EditorOptions} from 'vs/workbench/common/editor';
import {QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction} from 'vs/workbench/browser/quickopen';
import {IWorkbenchEditorService, GroupArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, IEditor, Direction} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IEditorIdentifier} from 'vs/workbench/common/editor/editorStacksModel';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';

export class SplitEditorAction extends Action {

	public static ID = 'workbench.action.splitEditor';
	public static LABEL = nls.localize('splitEditor', "Split Editor");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label, 'split-editor-action');
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
							this.editorService.focusGroup(Position.CENTER);
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

export class NavigateBetweenGroupsAction extends Action {

	public static ID = 'workbench.action.navigateEditorGroups';
	public static LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

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

		this.editorService.focusGroup(<Position>newIndex);

		return TPromise.as(true);
	}
}

export class FocusFirstGroupAction extends Action {

	public static ID = 'workbench.action.focusFirstEditor';
	public static LABEL = nls.localize('focusFirstEditorGroup', "Focus Left Editor Group");

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
				this.editorService.focusGroup(Position.LEFT);

				return TPromise.as(true);
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

export abstract class BaseFocusSideGroupAction extends Action {

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
				this.editorService.focusGroup(editor.position);

				return TPromise.as(true);
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

export class FocusSecondGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusSecondEditor';
	public static LABEL = nls.localize('focusSecondEditorGroup', "Focus Center Editor Group");

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

export class FocusThirdGroupAction extends BaseFocusSideGroupAction {

	public static ID = 'workbench.action.focusThirdEditor';
	public static LABEL = nls.localize('focusThirdEditorGroup', "Focus Right Editor Group");

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

export class FocusPreviousGroup extends Action {

	public static ID = 'workbench.action.focusPreviousGroup';
	public static LABEL = nls.localize('focusPreviousGroup', "Focus Previous Group");

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
		this.editorService.focusGroup(nextPosition);

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
		if (!types.isUndefinedOrNull(nextPosition) && this.navigateActions[nextPosition]) {
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
				typedInputPromise = this.editorService.inputToType(input);
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

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label, 'close-editor-action');
	}

	public run(position: Position): TPromise<any> {

		// Close Active Editor
		if (typeof position !== 'number') {
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
			}
		}

		// Close Editor at Position
		let visibleEditors = this.editorService.getVisibleEditors();
		if (visibleEditors[position]) {
			return this.editorService.closeEditor(position, visibleEditors[position].input);
		}

		return TPromise.as(false);
	}
}

export class CloseEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsInGroup';
	public static LABEL = nls.localize('closeEditorsInGroup', "Close All Editors in Group");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(position: Position): TPromise<any> {
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

export class CloseLeftEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsToTheLeft';
	public static LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditors(activeEditor.position, activeEditor.input, Direction.LEFT);
		}

		return TPromise.as(false);
	}
}

export class CloseRightEditorsInGroupAction extends Action {

	public static ID = 'workbench.action.closeEditorsToTheRight';
	public static LABEL = nls.localize('closeEditorsToTheRight', "Close Editors to the Right");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditors(activeEditor.position, activeEditor.input, Direction.RIGHT);
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

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(position: Position): TPromise<any> {
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

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const active = this.editorService.getActiveEditor();
		if (active) {
			return this.editorService.closeEditors(active.position, active.input);
		}

		return TPromise.as(false);
	}
}

export class CloseAllEditorsInGroupAction extends Action {

	public static ID = 'workbench.files.action.closeAllEditorsInGroup';
	public static LABEL = nls.localize('closeAllEditorsInGroup', "Close All Editors in Group");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label, 'action-close-all-files');
	}

	public run(position: Position): TPromise<any> {
		if (typeof position !== 'number') {
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			return this.editorService.closeEditors(position);
		}
	}
}

export class MoveGroupLeftAction extends Action {

	public static ID = 'workbench.action.moveActiveEditorLeft';
	public static LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(position: Position): TPromise<any> {
		if (typeof position !== 'number') {
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor && (activeEditor.position === Position.CENTER || activeEditor.position === Position.RIGHT)) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			let newPosition = (position === Position.CENTER) ? Position.LEFT : Position.CENTER;

			// Move group
			this.editorService.moveGroup(position, newPosition);
		}

		return TPromise.as(false);
	}
}

export class MoveGroupRightAction extends Action {

	public static ID = 'workbench.action.moveActiveEditorRight';
	public static LABEL = nls.localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(position: Position): TPromise<any> {
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
			this.editorService.moveGroup(position, newPosition);
		}

		return TPromise.as(false);
	}
}

export class MinimizeOtherGroupsAction extends Action {

	public static ID = 'workbench.action.minimizeOtherEditors';
	public static LABEL = nls.localize('minimizeOtherEditorGroups', "Minimize Other Editor Groups");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorService.arrangeGroups(GroupArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

export class EvenGroupWidthsAction extends Action {

	public static ID = 'workbench.action.evenEditorWidths';
	public static LABEL = nls.localize('evenEditorGroups', "Even Editor Group Widths");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorService.arrangeGroups(GroupArrangement.EVEN_WIDTH);

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
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (this.editorService.getActiveEditor()) {
			this.editorService.arrangeGroups(GroupArrangement.MINIMIZE_OTHERS);
			this.partService.setSideBarHidden(true);
		}

		return TPromise.as(false);
	}
}

export class PinEditorAction extends Action {

	public static ID = 'workbench.action.pinEditor';
	public static LABEL = nls.localize('pinEditor', "Pin Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			this.editorService.pinEditor(editor.position, editor.input);
		}

		return TPromise.as(true);
	}
}

export class UnpinEditorAction extends Action {

	public static ID = 'workbench.action.unpinEditor';
	public static LABEL = nls.localize('unpinEditor', "Unpin Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			this.editorService.unpinEditor(editor.position, editor.input);
		}

		return TPromise.as(true);
	}
}

export abstract class BaseNavigateEditorAction extends Action {

	constructor(id: string, label: string, protected editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const model = this.editorService.getStacksModel();
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

	constructor(id: string, label: string, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorService.getStacksModel().next();
	}
}

export class OpenPreviousEditor extends BaseNavigateEditorAction {

	public static ID = 'workbench.action.previousEditor';
	public static LABEL = nls.localize('openPreviousEditor', "Open Previous Editor");

	constructor(id: string, label: string, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorService.getStacksModel().previous();
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
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const stacks = this.editorService.getStacksModel();

		// Find an editor that was closed and is currently not opened in the group
		let lastClosedEditor = stacks.popLastClosedEditor();
		while (lastClosedEditor && stacks.activeGroup && stacks.activeGroup.indexOf(lastClosedEditor) >= 0) {
			lastClosedEditor = stacks.popLastClosedEditor();
		}

		if (lastClosedEditor) {
			this.editorService.openEditor(lastClosedEditor, EditorOptions.create({ pinned: true }));
		}

		return TPromise.as(false);
	}
}

export const NAVIGATE_IN_GROUP_PREFIX = '~';

export class ShowEditorsInGroupAction extends QuickOpenAction {

	public static ID = 'workbench.action.showEditorsInGroup';
	public static LABEL = nls.localize('showEditorsInGroup', "Show Editors in Group");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_PREFIX, quickOpenService);
	}
}

export class OpenPreviousEditorInGroupAction extends Action {

	public static ID = 'workbench.action.openPreviousEditorInGroup';
	public static LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous in Editor Group");

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

		this.quickOpenService.show(NAVIGATE_IN_GROUP_PREFIX, {
			keybindings: keys
		});

		return TPromise.as(true);
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

export class OpenPreviousEditorAction extends Action {

	public static ID = 'workbench.action.openPreviousEditor';
	public static LABEL = nls.localize('navigateEditorHistoryByInput', "Navigate History");

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

		this.quickOpenService.show(null, {
			keybindings: keys
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

export class ShowAllEditorsAction extends Action {

	public static ID = 'workbench.action.showAllEditors';
	public static LABEL = nls.localize('showAllEditors', "Show All Editors");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const stacks = this.editorService.getStacksModel();
		const entrys: IEditorPickOpenEntry[] = [];

		stacks.groups.forEach(group => {
			group.getEditors().forEach((editor, index) => {
				entrys.push({
					label: editor.getName(),
					description: editor.getDescription(),
					identifier: { editor: editor, group: group },
					separator: index === 0 ? { border: true, label: group.label } : void 0
				});
			});
		});

		return this.quickOpenService.pick(entrys, { matchOnDescription: true }).then(pick => {
			if (pick) {
				return this.editorService.openEditor(pick.identifier.editor, null, stacks.positionOfGroup(pick.identifier.group));
			}
		});
	}
}