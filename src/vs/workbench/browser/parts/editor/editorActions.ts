/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { mixin } from 'vs/base/common/objects';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { EditorInput, TextEditorOptions, EditorOptions, IEditorIdentifier, ActiveEditorMoveArguments, ActiveEditorMovePositioning, EditorCommands, ConfirmResult, IEditorCommandsContext } from 'vs/workbench/common/editor';
import { QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { Position, IEditor, Direction, IResourceInput, IEditorInput, POSITIONS } from 'vs/platform/editor/common/editor';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroupService, GroupArrangement } from 'vs/workbench/services/group/common/groupService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { CLOSE_EDITOR_COMMAND_ID, NAVIGATE_IN_GROUP_ONE_PREFIX, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, NAVIGATE_IN_GROUP_THREE_PREFIX, NAVIGATE_IN_GROUP_TWO_PREFIX } from 'vs/workbench/browser/parts/editor/editorCommands';

export class SplitEditorAction extends Action {

	public static readonly ID = 'workbench.action.splitEditor';
	public static readonly LABEL = nls.localize('splitEditor', "Split Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label, 'split-editor-action');
	}

	public run(context?: IEditorCommandsContext): TPromise<any> {
		let editorToSplit: IEditor;
		if (context) {
			const stacks = this.editorGroupService.getStacksModel();
			editorToSplit = this.editorService.getVisibleEditors()[stacks.positionOfGroup(stacks.getGroup(context.groupId))];
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
			options = TextEditorOptions.fromEditor(codeEditor);
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

export class JoinTwoGroupsAction extends Action {

	public static readonly ID = 'workbench.action.joinTwoGroups';
	public static readonly LABEL = nls.localize('joinTwoGroups', "Join Editors of Two Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {

		const editorStacksModel = this.editorGroupService.getStacksModel();

		// Return if has no other group to join to
		if (editorStacksModel.groups.length < 2) {
			return TPromise.as(true);
		}

		let fromPosition: number;
		let toPosition: number;

		// Joining group is from context, or the active group
		if (context) {
			fromPosition = editorStacksModel.positionOfGroup(context.group);
		} else {
			fromPosition = editorStacksModel.positionOfGroup(editorStacksModel.activeGroup);
		}

		// Target group is next group if joining from position one, otherwise it is the previous group
		if (fromPosition === Position.ONE) {
			toPosition = fromPosition + 1;
		} else {
			toPosition = fromPosition - 1;
		}

		const fromGroup = editorStacksModel.groupAt(fromPosition);
		const toGroup = editorStacksModel.groupAt(toPosition);

		const activeEditor = fromGroup.activeEditor;
		const fromGroupEditors = fromGroup.getEditors();

		// Insert the editors to the start if moving to the next group, otherwise insert to the end
		// If an editor exists in both groups, its index is respected as in the joining group
		const movingToNextGroup = fromPosition < toPosition;
		let index = movingToNextGroup ? 0 : toGroup.count;

		// Inactive and preserve focus options are used to prevent unnecessary switchings of active editor or group
		fromGroupEditors.forEach(e => {
			const inactive = e !== activeEditor;
			this.editorGroupService.moveEditor(e, fromPosition, toPosition, { index, inactive, preserveFocus: inactive });
			index = movingToNextGroup ? index + 1 : toGroup.count;
		});

		// Focus may be lost when the joining group is closed, regain focus on the target group
		this.editorGroupService.focusGroup(toGroup);

		return TPromise.as(true);
	}
}

export class NavigateBetweenGroupsAction extends Action {

	public static readonly ID = 'workbench.action.navigateEditorGroups';
	public static readonly LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

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

	public static readonly ID = 'workbench.action.focusActiveEditorGroup';
	public static readonly LABEL = nls.localize('focusActiveEditorGroup', "Focus Active Editor Group");

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

	public static readonly ID = 'workbench.action.focusFirstEditorGroup';
	public static readonly LABEL = nls.localize('focusFirstEditorGroup', "Focus First Editor Group");

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
		if (history.length > 0) {
			const input = history[0];
			if (input instanceof EditorInput) {
				return this.editorService.openEditor(input, null, Position.ONE);
			}

			return this.editorService.openEditor(input as IResourceInput, Position.ONE);
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
				options = TextEditorOptions.fromEditor(codeEditor, { pinned: true });
			} else {
				options = EditorOptions.create({ pinned: true });
			}

			return this.editorService.openEditor(referenceEditor.input, options, this.getTargetEditorSide());
		}

		// Otherwise try to find a history entry to open to the target editor side
		else if (referenceEditor) {
			const history = this.historyService.getHistory();
			for (let input of history) {
				if (input instanceof EditorInput) {
					if (input.supportsSplitEditor()) {
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

	public static readonly ID = 'workbench.action.focusSecondEditorGroup';
	public static readonly LABEL = nls.localize('focusSecondEditorGroup', "Focus Second Editor Group");

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

	public static readonly ID = 'workbench.action.focusThirdEditorGroup';
	public static readonly LABEL = nls.localize('focusThirdEditorGroup', "Focus Third Editor Group");

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

	public static readonly ID = 'workbench.action.focusPreviousGroup';
	public static readonly LABEL = nls.localize('focusPreviousGroup', "Focus Previous Group");

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

		const stacks = this.editorGroupService.getStacksModel();
		const groupCount = stacks.groups.length;

		// Nothing to do if the only group
		if (groupCount === 1) {
			return TPromise.as(true);
		}

		// Nevigate to the previous group or to the last group if the first group is active
		const newPositionIndex = (activeEditor.position + groupCount - 1) % groupCount;
		this.editorGroupService.focusGroup(<Position>newPositionIndex);

		return TPromise.as(true);
	}
}

export class FocusNextGroup extends Action {

	public static readonly ID = 'workbench.action.focusNextGroup';
	public static readonly LABEL = nls.localize('focusNextGroup', "Focus Next Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {

		const activeEditor = this.editorService.getActiveEditor();

		if (!activeEditor) {
			return TPromise.as(true);
		}

		const stacks = this.editorGroupService.getStacksModel();
		const groupCount = stacks.groups.length;

		// Nowhere to switch if the only group
		if (groupCount === 1) {
			return TPromise.as(true);
		}

		// Nevigate to the next group or to the first group if the last group is active
		const newPositionIndex = (activeEditor.position + 1) % groupCount;
		this.editorGroupService.focusGroup(<Position>newPositionIndex);

		return TPromise.as(true);
	}
}

export class OpenToSideAction extends Action {

	public static readonly OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static readonly OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

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

	public static readonly ID = 'workbench.action.closeActiveEditor';
	public static readonly LABEL = nls.localize('closeEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, 'close-editor-action');
	}

	public run(context?: IEditorCommandsContext): TPromise<any> {
		return this.commandService.executeCommand(CLOSE_EDITOR_COMMAND_ID, void 0, context);
	}
}

export class CloseOneEditorAction extends Action {

	public static readonly ID = 'workbench.action.closeActiveEditor';
	public static readonly LABEL = nls.localize('closeOneEditor', "Close");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label, 'close-editor-action');
	}

	public run(context?: IEditorCommandsContext): TPromise<any> {
		const model = this.editorGroupService.getStacksModel();

		const group = context ? model.getGroup(context.groupId) : null;
		const position = group ? model.positionOfGroup(group) : null;

		// Close Active Editor
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
			}
		}

		// Close Specific Editor
		const editor = group && context && typeof context.editorIndex === 'number' ? group.getEditor(context.editorIndex) : null;
		if (editor) {
			return this.editorService.closeEditor(position, editor);
		}

		// Close First Editor at Position
		const visibleEditors = this.editorService.getVisibleEditors();
		if (visibleEditors[position]) {
			return this.editorService.closeEditor(position, visibleEditors[position].input);
		}

		return TPromise.as(false);
	}
}

export class RevertAndCloseEditorAction extends Action {

	public static readonly ID = 'workbench.action.revertAndCloseActiveEditor';
	public static readonly LABEL = nls.localize('revertAndCloseActiveEditor', "Revert and Close Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && activeEditor.input) {
			const input = activeEditor.input;
			const position = activeEditor.position;

			// first try a normal revert where the contents of the editor are restored
			return activeEditor.input.revert().then(() => this.editorService.closeEditor(position, input), error => {
				// if that fails, since we are about to close the editor, we accept that
				// the editor cannot be reverted and instead do a soft revert that just
				// enables us to close the editor. With this, a user can always close a
				// dirty editor even when reverting fails.
				return activeEditor.input.revert({ soft: true }).then(() => this.editorService.closeEditor(position, input));
			});
		}

		return TPromise.as(false);
	}
}

export class CloseLeftEditorsInGroupAction extends Action {

	public static readonly ID = 'workbench.action.closeEditorsToTheLeft';
	public static readonly LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private groupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		const editor = getTarget(this.editorService, this.groupService, context);
		if (editor) {
			return this.editorService.closeEditors(editor.position, { except: editor.input, direction: Direction.LEFT });
		}

		return TPromise.as(false);
	}
}

export class CloseAllEditorsAction extends Action {

	public static readonly ID = 'workbench.action.closeAllEditors';
	public static readonly LABEL = nls.localize('closeAllEditors', "Close All Editors");

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
			return this.editorService.closeEditors();
		}

		// Otherwise ask for combined confirmation
		return this.textFileService.confirmSave().then(confirm => {
			if (confirm === ConfirmResult.CANCEL) {
				return void 0;
			}

			let saveOrRevertPromise: TPromise<boolean>;
			if (confirm === ConfirmResult.DONT_SAVE) {
				saveOrRevertPromise = this.textFileService.revertAll(null, { soft: true }).then(() => true);
			} else {
				saveOrRevertPromise = this.textFileService.saveAll(true).then(res => res.results.every(r => r.success));
			}

			return saveOrRevertPromise.then(success => {
				if (success) {
					return this.editorService.closeEditors();
				}

				return void 0;
			});
		});
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	public static readonly ID = 'workbench.action.closeEditorsInOtherGroups';
	public static readonly LABEL = nls.localize('closeEditorsInOtherGroups', "Close Editors in Other Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		let position = context ? this.editorGroupService.getStacksModel().positionOfGroup(context.group) : null;
		if (typeof position !== 'number') {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				position = activeEditor.position;
			}
		}

		if (typeof position === 'number') {
			return this.editorService.closeEditors(POSITIONS.filter(p => p !== position));
		}

		return TPromise.as(false);
	}
}

export class MoveGroupLeftAction extends Action {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupLeft';
	public static readonly LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
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

	public static readonly ID = 'workbench.action.moveActiveEditorGroupRight';
	public static readonly LABEL = nls.localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
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

	public static readonly ID = 'workbench.action.minimizeOtherEditors';
	public static readonly LABEL = nls.localize('minimizeOtherEditorGroups', "Minimize Other Editor Groups");

	constructor(id: string, label: string, @IEditorGroupService private editorGroupService: IEditorGroupService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

export class EvenGroupWidthsAction extends Action {

	public static readonly ID = 'workbench.action.evenEditorWidths';
	public static readonly LABEL = nls.localize('evenEditorGroups', "Even Editor Group Widths");

	constructor(id: string, label: string, @IEditorGroupService private editorGroupService: IEditorGroupService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupArrangement.EVEN);

		return TPromise.as(false);
	}
}

export class MaximizeGroupAction extends Action {

	public static readonly ID = 'workbench.action.maximizeEditor';
	public static readonly LABEL = nls.localize('maximizeEditor', "Maximize Editor Group and Hide Sidebar");

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

function getTarget(editorService: IWorkbenchEditorService, editorGroupService: IEditorGroupService, context?: IEditorIdentifier): { input: IEditorInput, position: Position } {
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

	public static readonly ID = 'workbench.action.nextEditor';
	public static readonly LABEL = nls.localize('openNextEditor', "Open Next Editor");

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

	public static readonly ID = 'workbench.action.previousEditor';
	public static readonly LABEL = nls.localize('openPreviousEditor', "Open Previous Editor");

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

	public static readonly ID = 'workbench.action.nextEditorInGroup';
	public static readonly LABEL = nls.localize('nextEditorInGroup', "Open Next Editor in Group");

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

	public static readonly ID = 'workbench.action.previousEditorInGroup';
	public static readonly LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous Editor in Group");

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

export class OpenLastEditorInGroup extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.lastEditorInGroup';
	public static readonly LABEL = nls.localize('lastEditorInGroup', "Open Last Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		return this.editorGroupService.getStacksModel().last();
	}
}

export class NavigateForwardAction extends Action {

	public static readonly ID = 'workbench.action.navigateForward';
	public static readonly LABEL = nls.localize('navigateNext', "Go Forward");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.forward();

		return TPromise.as(null);
	}
}

export class NavigateBackwardsAction extends Action {

	public static readonly ID = 'workbench.action.navigateBack';
	public static readonly LABEL = nls.localize('navigatePrevious', "Go Back");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.back();

		return TPromise.as(null);
	}
}

export class NavigateLastAction extends Action {

	public static readonly ID = 'workbench.action.navigateLast';
	public static readonly LABEL = nls.localize('navigateLast', "Go Last");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.last();

		return TPromise.as(null);
	}
}

export class ReopenClosedEditorAction extends Action {

	public static readonly ID = 'workbench.action.reopenClosedEditor';
	public static readonly LABEL = nls.localize('reopenClosedEditor', "Reopen Closed Editor");

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

export class ClearRecentFilesAction extends Action {

	public static readonly ID = 'workbench.action.clearRecentFiles';
	public static readonly LABEL = nls.localize('clearRecentFiles', "Clear Recently Opened");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.windowsService.clearRecentlyOpened();

		return TPromise.as(false);
	}
}

export class ShowEditorsInGroupOneAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.showEditorsInFirstGroup';
	public static readonly LABEL = nls.localize('showEditorsInFirstGroup', "Show Editors in First Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_ONE_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export class ShowEditorsInGroupTwoAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.showEditorsInSecondGroup';
	public static readonly LABEL = nls.localize('showEditorsInSecondGroup', "Show Editors in Second Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_TWO_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export class ShowEditorsInGroupThreeAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.showEditorsInThirdGroup';
	public static readonly LABEL = nls.localize('showEditorsInThirdGroup', "Show Editors in Third Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_GROUP_THREE_PREFIX, quickOpenService);

		this.class = 'show-group-editors-action';
	}
}

export class ShowAllEditorsAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.showAllEditors';
	public static readonly LABEL = nls.localize('showAllEditors', "Show All Editors");

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

	public static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
	public static readonly LABEL = nls.localize('openPreviousRecentlyUsedEditorInGroup', "Open Previous Recently Used Editor in Group");

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

	public static readonly ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	public static readonly LABEL = nls.localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor in Group");

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

	public static readonly ID = 'workbench.action.openPreviousEditorFromHistory';
	public static readonly LABEL = nls.localize('navigateEditorHistoryByInput', "Open Previous Editor from History");

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

export class OpenNextRecentlyUsedEditorAction extends Action {

	public static readonly ID = 'workbench.action.openNextRecentlyUsedEditor';
	public static readonly LABEL = nls.localize('openNextRecentlyUsedEditor', "Open Next Recently Used Editor");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.forward(true);

		return TPromise.as(null);
	}
}

export class OpenPreviousRecentlyUsedEditorAction extends Action {

	public static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditor';
	public static readonly LABEL = nls.localize('openPreviousRecentlyUsedEditor', "Open Previous Recently Used Editor");

	constructor(id: string, label: string, @IHistoryService private historyService: IHistoryService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.historyService.back(true);

		return TPromise.as(null);
	}
}

export class ClearEditorHistoryAction extends Action {

	public static readonly ID = 'workbench.action.clearEditorHistory';
	public static readonly LABEL = nls.localize('clearEditorHistory', "Clear Editor History");

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

	public static readonly ID = 'workbench.action.openLastEditorInGroup';
	public static readonly LABEL = nls.localize('focusLastEditorInStack', "Open Last Editor in Group");

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

	public static readonly ID = 'workbench.action.moveEditorLeftInGroup';
	public static readonly LABEL = nls.localize('moveEditorLeft', "Move Editor Left");

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

	public static readonly ID = 'workbench.action.moveEditorRightInGroup';
	public static readonly LABEL = nls.localize('moveEditorRight', "Move Editor Right");

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

	public static readonly ID = 'workbench.action.moveEditorToPreviousGroup';
	public static readonly LABEL = nls.localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

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

	public static readonly ID = 'workbench.action.moveEditorToNextGroup';
	public static readonly LABEL = nls.localize('moveEditorToNextGroup', "Move Editor into Next Group");

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

export abstract class MoveEditorToSpecificGroup extends Action {

	constructor(
		id: string,
		label: string,
		private position: Position,
		private editorGroupService: IEditorGroupService,
		private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor && activeEditor.position !== this.position) {
			this.editorGroupService.moveEditor(activeEditor.input, activeEditor.position, this.position);
		}

		return TPromise.as(true);
	}
}

export class MoveEditorToFirstGroupAction extends MoveEditorToSpecificGroup {

	public static readonly ID = 'workbench.action.moveEditorToFirstGroup';
	public static readonly LABEL = nls.localize('moveEditorToFirstGroup', "Move Editor into First Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, Position.ONE, editorGroupService, editorService);
	}
}

export class MoveEditorToSecondGroupAction extends MoveEditorToSpecificGroup {

	public static readonly ID = 'workbench.action.moveEditorToSecondGroup';
	public static readonly LABEL = nls.localize('moveEditorToSecondGroup', "Move Editor into Second Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, Position.TWO, editorGroupService, editorService);
	}
}

export class MoveEditorToThirdGroupAction extends MoveEditorToSpecificGroup {

	public static readonly ID = 'workbench.action.moveEditorToThirdGroup';
	public static readonly LABEL = nls.localize('moveEditorToThirdGroup', "Move Editor into Third Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, Position.THREE, editorGroupService, editorService);
	}
}
