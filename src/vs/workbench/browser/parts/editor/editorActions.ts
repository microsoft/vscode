/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { mixin } from 'vs/base/common/objects';
import { IEditorInput, EditorInput, IEditorIdentifier, ConfirmResult, IEditorCommandsContext, CloseDirection } from 'vs/workbench/common/editor';
import { QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { CLOSE_EDITOR_COMMAND_ID, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, MOVE_ACTIVE_EDITOR_COMMAND_ID, NAVIGATE_IN_ACTIVE_GROUP_PREFIX, ActiveEditorMoveArguments, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, mergeAllGroups } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorGroupsService, IEditorGroup, GroupsArrangement, EditorsOrder, GroupLocation, GroupDirection, preferredSideBySideGroupDirection, IFindGroupScope, GroupOrientation, EditorGroupLayout, GroupsOrder } from 'vs/workbench/services/group/common/editorGroupsService';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class ExecuteCommandAction extends Action {

	constructor(
		id: string,
		label: string,
		private commandId: string,
		private commandService: ICommandService,
		private commandArgs?: any
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.commandService.executeCommand(this.commandId, this.commandArgs);
	}
}

export class BaseSplitEditorAction extends Action {
	private toDispose: IDisposable[] = [];
	private direction: GroupDirection;

	constructor(
		id: string,
		label: string,
		protected editorGroupService: IEditorGroupsService,
		protected configurationService: IConfigurationService
	) {
		super(id, label);

		this.direction = this.getDirection();

		this.registerListeners();
	}

	protected getDirection(): GroupDirection {
		return preferredSideBySideGroupDirection(this.configurationService);
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
				this.direction = preferredSideBySideGroupDirection(this.configurationService);
			}
		}));
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		splitEditor(this.editorGroupService, this.direction, context);

		return TPromise.as(true);
	}

	public dispose(): void {
		super.dispose();

		this.toDispose = dispose(this.toDispose);
	}
}

export class SplitEditorAction extends BaseSplitEditorAction {

	public static readonly ID = 'workbench.action.splitEditor';
	public static readonly LABEL = nls.localize('splitEditor', "Split Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, editorGroupService, configurationService);
	}
}

export class SplitEditorOrthogonalAction extends BaseSplitEditorAction {

	public static readonly ID = 'workbench.action.splitEditorOrthogonal';
	public static readonly LABEL = nls.localize('splitEditorOrthogonal', "Split Editor Orthogonal");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, editorGroupService, configurationService);
	}

	protected getDirection(): GroupDirection {
		const direction = preferredSideBySideGroupDirection(this.configurationService);

		return direction === GroupDirection.RIGHT ? GroupDirection.DOWN : GroupDirection.RIGHT;
	}
}

export class SplitEditorLeftAction extends ExecuteCommandAction {

	public static readonly ID = SPLIT_EDITOR_LEFT;
	public static readonly LABEL = nls.localize('splitEditorGroupLeft', "Split Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_LEFT, commandService);
	}
}

export class SplitEditorRightAction extends ExecuteCommandAction {

	public static readonly ID = SPLIT_EDITOR_RIGHT;
	public static readonly LABEL = nls.localize('splitEditorGroupRight', "Split Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_RIGHT, commandService);
	}
}

export class SplitEditorUpAction extends ExecuteCommandAction {

	public static readonly ID = SPLIT_EDITOR_UP;
	public static readonly LABEL = nls.localize('splitEditorGroupUp', "Split Editor Up");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_UP, commandService);
	}
}

export class SplitEditorDownAction extends ExecuteCommandAction {

	public static readonly ID = SPLIT_EDITOR_DOWN;
	public static readonly LABEL = nls.localize('splitEditorGroupDown', "Split Editor Down");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_DOWN, commandService);
	}
}

export class JoinTwoGroupsAction extends Action {

	public static readonly ID = 'workbench.action.joinTwoGroups';
	public static readonly LABEL = nls.localize('joinTwoGroups', "Join Editor Group with Next Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		let sourceGroup: IEditorGroup;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		const targetGroupDirections = [GroupDirection.RIGHT, GroupDirection.DOWN, GroupDirection.LEFT, GroupDirection.UP];
		for (let i = 0; i < targetGroupDirections.length; i++) {
			const targetGroup = this.editorGroupService.findGroup({ direction: targetGroupDirections[i] }, sourceGroup);
			if (targetGroup && sourceGroup !== targetGroup) {
				this.editorGroupService.mergeGroup(sourceGroup, targetGroup);

				return TPromise.as(true);
			}
		}

		return TPromise.as(true);
	}
}

export class JoinAllGroupsAction extends Action {

	public static readonly ID = 'workbench.action.joinAllGroups';
	public static readonly LABEL = nls.localize('joinAllGroups', "Join All Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		mergeAllGroups(this.editorGroupService);

		return TPromise.as(true);
	}
}

export class NavigateBetweenGroupsAction extends Action {

	public static readonly ID = 'workbench.action.navigateEditorGroups';
	public static readonly LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, this.editorGroupService.activeGroup, true);
		nextGroup.focus();

		return TPromise.as(true);
	}
}

export class FocusActiveGroupAction extends Action {

	public static readonly ID = 'workbench.action.focusActiveEditorGroup';
	public static readonly LABEL = nls.localize('focusActiveEditorGroup', "Focus Active Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.activeGroup.focus();

		return TPromise.as(true);
	}
}

export abstract class BaseFocusGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private scope: IFindGroupScope,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const group = this.editorGroupService.findGroup(this.scope, this.editorGroupService.activeGroup, true);
		if (group) {
			group.focus();
		}

		return TPromise.as(true);
	}
}

export class FocusFirstGroupAction extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusFirstEditorGroup';
	public static readonly LABEL = nls.localize('focusFirstEditorGroup', "Focus First Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.FIRST }, editorGroupService);
	}
}

export class FocusLastGroupAction extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusLastEditorGroup';
	public static readonly LABEL = nls.localize('focusLastEditorGroup', "Focus Last Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.LAST }, editorGroupService);
	}
}

export class FocusNextGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusNextGroup';
	public static readonly LABEL = nls.localize('focusNextGroup', "Focus Next Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.NEXT }, editorGroupService);
	}
}

export class FocusPreviousGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusPreviousGroup';
	public static readonly LABEL = nls.localize('focusPreviousGroup', "Focus Previous Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.PREVIOUS }, editorGroupService);
	}
}

export class FocusLeftGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusLeftGroup';
	public static readonly LABEL = nls.localize('focusLeftGroup', "Focus Left Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.LEFT }, editorGroupService);
	}
}

export class FocusRightGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusRightGroup';
	public static readonly LABEL = nls.localize('focusRightGroup', "Focus Right Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.RIGHT }, editorGroupService);
	}
}

export class FocusAboveGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusAboveGroup';
	public static readonly LABEL = nls.localize('focusAboveGroup', "Focus Above Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.UP }, editorGroupService);
	}
}

export class FocusBelowGroup extends BaseFocusGroupAction {

	public static readonly ID = 'workbench.action.focusBelowGroup';
	public static readonly LABEL = nls.localize('focusBelowGroup', "Focus Below Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.DOWN }, editorGroupService);
	}
}

export class OpenToSideFromQuickOpenAction extends Action {

	public static readonly OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static readonly OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor(
		@IEditorService private editorService: IEditorService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(OpenToSideFromQuickOpenAction.OPEN_TO_SIDE_ID, OpenToSideFromQuickOpenAction.OPEN_TO_SIDE_LABEL);

		this.updateClass();
	}

	public updateClass(): void {
		const preferredDirection = preferredSideBySideGroupDirection(this.configurationService);

		this.class = (preferredDirection === GroupDirection.RIGHT) ? 'quick-open-sidebyside-vertical' : 'quick-open-sidebyside-horizontal';
	}

	public run(context: any): TPromise<any> {
		const entry = toEditorQuickOpenEntry(context);
		if (entry) {
			const input = entry.getInput();
			if (input instanceof EditorInput) {
				return this.editorService.openEditor(input, entry.getOptions(), SIDE_GROUP);
			}

			const resourceInput = input as IResourceInput;
			resourceInput.options = mixin(resourceInput.options, entry.getOptions());

			return this.editorService.openEditor(resourceInput, SIDE_GROUP);
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
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label, 'close-editor-action');
	}

	public run(context?: IEditorCommandsContext): TPromise<any> {
		let group: IEditorGroup;
		let editorIndex: number;
		if (context) {
			group = this.editorGroupService.getGroup(context.groupId);

			if (group) {
				editorIndex = context.editorIndex; // only allow editor at index if group is valid
			}
		}

		if (!group) {
			group = this.editorGroupService.activeGroup;
		}

		// Close specific editor in group
		if (typeof editorIndex === 'number') {
			const editorAtIndex = group.getEditor(editorIndex);
			if (editorAtIndex) {
				return group.closeEditor(editorAtIndex);
			}
		}

		// Otherwise close active editor in group
		if (group.activeEditor) {
			return group.closeEditor(group.activeEditor);
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
		@IEditorService private editorService: IEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeControl = this.editorService.activeControl;
		if (activeControl) {
			const editor = activeControl.input;
			const group = activeControl.group;

			// first try a normal revert where the contents of the editor are restored
			return editor.revert().then(() => group.closeEditor(editor), error => {
				// if that fails, since we are about to close the editor, we accept that
				// the editor cannot be reverted and instead do a soft revert that just
				// enables us to close the editor. With this, a user can always close a
				// dirty editor even when reverting fails.
				return editor.revert({ soft: true }).then(() => group.closeEditor(editor));
			});
		}

		return TPromise.as(false);
	}
}

export class CloseLeftEditorsInGroupAction extends Action {

	public static readonly ID = 'workbench.action.closeEditorsToTheLeft';
	public static readonly LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left in Group");

	constructor(
		id: string,
		label: string,
		@IEditorService private editorService: IEditorService,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		const { group, editor } = getTarget(this.editorService, this.editorGroupService, context);
		if (group && editor) {
			return group.closeEditors({ direction: CloseDirection.LEFT, except: editor });
		}

		return TPromise.as(false);
	}
}

function getTarget(editorService: IEditorService, editorGroupService: IEditorGroupsService, context?: IEditorIdentifier): { editor: IEditorInput, group: IEditorGroup } {
	if (context) {
		return { editor: context.editor, group: editorGroupService.getGroup(context.groupId) };
	}

	// Fallback to active group
	return { group: editorGroupService.activeGroup, editor: editorGroupService.activeGroup.activeEditor };
}

export abstract class BaseCloseAllAction extends Action {

	constructor(
		id: string,
		label: string,
		clazz: string,
		private textFileService: ITextFileService,
		protected editorGroupService: IEditorGroupsService
	) {
		super(id, label, clazz);
	}

	protected get groupsToClose(): IEditorGroup[] {
		const groupsToClose: IEditorGroup[] = [];

		// Close editors in reverse order of their grid appearance so that the editor
		// group that is the first (top-left) remains. This helps to keep view state
		// for editors around that have been opened in this visually first group.
		const groups = this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE);
		for (let i = groups.length - 1; i >= 0; i--) {
			groupsToClose.push(groups[i]);
		}

		return groupsToClose;
	}

	public run(): TPromise<any> {

		// Just close all if there are no or one dirty editor
		if (this.textFileService.getDirty().length < 2) {
			return this.doCloseAll();
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
					return this.doCloseAll();
				}

				return void 0;
			});
		});
	}

	protected abstract doCloseAll(): TPromise<any>;
}

export class CloseAllEditorsAction extends BaseCloseAllAction {

	public static readonly ID = 'workbench.action.closeAllEditors';
	public static readonly LABEL = nls.localize('closeAllEditors', "Close All Editors");

	constructor(
		id: string,
		label: string,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, 'action-close-all-files', textFileService, editorGroupService);
	}

	protected doCloseAll(): TPromise<any> {
		return TPromise.join(this.groupsToClose.map(g => g.closeAllEditors()));
	}
}

export class CloseAllEditorGroupsAction extends BaseCloseAllAction {

	public static readonly ID = 'workbench.action.closeAllGroups';
	public static readonly LABEL = nls.localize('closeAllGroups', "Close All Editor Groups");

	constructor(
		id: string,
		label: string,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, void 0, textFileService, editorGroupService);
	}

	protected doCloseAll(): TPromise<any> {
		return TPromise.join(this.groupsToClose.map(g => g.closeAllEditors())).then(() => {
			this.groupsToClose.forEach(group => this.editorGroupService.removeGroup(group));
		});
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	public static readonly ID = 'workbench.action.closeEditorsInOtherGroups';
	public static readonly LABEL = nls.localize('closeEditorsInOtherGroups', "Close Editors in Other Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		const groupToSkip = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
		return TPromise.join(this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(g => {
			if (g.id === groupToSkip.id) {
				return TPromise.as(null);
			}

			return g.closeAllEditors();
		}));
	}
}

export class BaseMoveGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private direction: GroupDirection,
		private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		let sourceGroup: IEditorGroup;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		const targetGroup = this.findTargetGroup(sourceGroup);
		if (targetGroup) {
			this.editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
		}

		return TPromise.as(true);
	}

	private findTargetGroup(sourceGroup: IEditorGroup): IEditorGroup {
		const targetNeighbours: GroupDirection[] = [this.direction];

		// Allow the target group to be in alternative locations to support more
		// scenarios of moving the group to the taret location.
		// Helps for https://github.com/Microsoft/vscode/issues/50741
		switch (this.direction) {
			case GroupDirection.LEFT:
			case GroupDirection.RIGHT:
				targetNeighbours.push(GroupDirection.UP, GroupDirection.DOWN);
				break;
			case GroupDirection.UP:
			case GroupDirection.DOWN:
				targetNeighbours.push(GroupDirection.LEFT, GroupDirection.RIGHT);
				break;
		}

		for (let i = 0; i < targetNeighbours.length; i++) {
			const targetNeighbour = this.editorGroupService.findGroup({ direction: targetNeighbours[i] }, sourceGroup);
			if (targetNeighbour) {
				return targetNeighbour;
			}
		}

		return void 0;
	}
}

export class MoveGroupLeftAction extends BaseMoveGroupAction {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupLeft';
	public static readonly LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class MoveGroupRightAction extends BaseMoveGroupAction {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupRight';
	public static readonly LABEL = nls.localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class MoveGroupUpAction extends BaseMoveGroupAction {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupUp';
	public static readonly LABEL = nls.localize('moveActiveGroupUp', "Move Editor Group Up");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class MoveGroupDownAction extends BaseMoveGroupAction {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupDown';
	public static readonly LABEL = nls.localize('moveActiveGroupDown', "Move Editor Group Down");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}

export class MinimizeOtherGroupsAction extends Action {

	public static readonly ID = 'workbench.action.minimizeOtherEditors';
	public static readonly LABEL = nls.localize('minimizeOtherEditorGroups', "Maximize Editor Group");

	constructor(id: string, label: string, @IEditorGroupsService private editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

export class ResetGroupSizesAction extends Action {

	public static readonly ID = 'workbench.action.evenEditorWidths';
	public static readonly LABEL = nls.localize('evenEditorGroups', "Reset Editor Group Sizes");

	constructor(id: string, label: string, @IEditorGroupsService private editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.EVEN);

		return TPromise.as(false);
	}
}

export class MaximizeGroupAction extends Action {

	public static readonly ID = 'workbench.action.maximizeEditor';
	public static readonly LABEL = nls.localize('maximizeEditor', "Maximize Editor Group and Hide Sidebar");

	constructor(
		id: string,
		label: string,
		@IEditorService private editorService: IEditorService,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		if (this.editorService.activeEditor) {
			this.editorGroupService.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);

			return this.partService.setSideBarHidden(true);
		}

		return TPromise.as(false);
	}
}

export abstract class BaseNavigateEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		protected editorGroupService: IEditorGroupsService,
		protected editorService: IEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const result = this.navigate();
		if (!result) {
			return TPromise.as(false);
		}

		const { groupId, editor } = result;
		if (!editor) {
			return TPromise.as(false);
		}

		const group = this.editorGroupService.getGroup(groupId);
		return group.openEditor(editor);
	}

	protected abstract navigate(): IEditorIdentifier;
}

export class OpenNextEditor extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.nextEditor';
	public static readonly LABEL = nls.localize('openNextEditor', "Open Next Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {

		// Navigate in active group if possible
		const activeGroup = this.editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroupEditors.indexOf(activeGroup.activeEditor);
		if (activeEditorIndex + 1 < activeGroupEditors.length) {
			return { editor: activeGroupEditors[activeEditorIndex + 1], groupId: activeGroup.id };
		}

		// Otherwise try in next group
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, this.editorGroupService.activeGroup, true);
		if (nextGroup) {
			const previousGroupEditors = nextGroup.getEditors(EditorsOrder.SEQUENTIAL);
			return { editor: previousGroupEditors[0], groupId: nextGroup.id };
		}

		return void 0;
	}
}

export class OpenPreviousEditor extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.previousEditor';
	public static readonly LABEL = nls.localize('openPreviousEditor', "Open Previous Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {

		// Navigate in active group if possible
		const activeGroup = this.editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroupEditors.indexOf(activeGroup.activeEditor);
		if (activeEditorIndex > 0) {
			return { editor: activeGroupEditors[activeEditorIndex - 1], groupId: activeGroup.id };
		}

		// Otherwise try in previous group
		const previousGroup = this.editorGroupService.findGroup({ location: GroupLocation.PREVIOUS }, this.editorGroupService.activeGroup, true);
		if (previousGroup) {
			const previousGroupEditors = previousGroup.getEditors(EditorsOrder.SEQUENTIAL);
			return { editor: previousGroupEditors[previousGroupEditors.length - 1], groupId: previousGroup.id };
		}

		return void 0;
	}
}

export class OpenNextEditorInGroup extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.nextEditorInGroup';
	public static readonly LABEL = nls.localize('nextEditorInGroup', "Open Next Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		const group = this.editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		const index = editors.indexOf(group.activeEditor);

		return { editor: index + 1 < editors.length ? editors[index + 1] : editors[0], groupId: group.id };
	}
}

export class OpenPreviousEditorInGroup extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.previousEditorInGroup';
	public static readonly LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		const group = this.editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		const index = editors.indexOf(group.activeEditor);

		return { editor: index > 0 ? editors[index - 1] : editors[editors.length - 1], groupId: group.id };
	}
}

export class OpenFirstEditorInGroup extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.firstEditorInGroup';
	public static readonly LABEL = nls.localize('firstEditorInGroup', "Open First Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		const group = this.editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);

		return { editor: editors[0], groupId: group.id };
	}
}

export class OpenLastEditorInGroup extends BaseNavigateEditorAction {

	public static readonly ID = 'workbench.action.lastEditorInGroup';
	public static readonly LABEL = nls.localize('lastEditorInGroup', "Open Last Editor in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier {
		const group = this.editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);

		return { editor: editors[editors.length - 1], groupId: group.id };
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

export class ShowEditorsInActiveGroupAction extends QuickOpenAction {

	public static readonly ID = 'workbench.action.showEditorsInActiveGroup';
	public static readonly LABEL = nls.localize('showEditorsInActiveGroup', "Show Editors in Active Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_ACTIVE_GROUP_PREFIX, quickOpenService);
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
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);



		this.quickOpenService.show(NAVIGATE_IN_ACTIVE_GROUP_PREFIX, { quickNavigateConfiguration: { keybindings: keys } });

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
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, quickOpenService, keybindingService);
	}
}

export class OpenNextRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	public static readonly ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	public static readonly LABEL = nls.localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, quickOpenService, keybindingService);
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

export class MoveEditorLeftInGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorLeftInGroup';
	public static readonly LABEL = nls.localize('moveEditorLeft', "Move Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorRightInGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorRightInGroup';
	public static readonly LABEL = nls.localize('moveEditorRight', "Move Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToPreviousGroup';
	public static readonly LABEL = nls.localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'previous', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToNextGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToNextGroup';
	public static readonly LABEL = nls.localize('moveEditorToNextGroup', "Move Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'next', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToAboveGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToAboveGroup';
	public static readonly LABEL = nls.localize('moveEditorToAboveGroup', "Move Editor into Above Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'up', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToBelowGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToBelowGroup';
	public static readonly LABEL = nls.localize('moveEditorToBelowGroup', "Move Editor into Below Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'down', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToLeftGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToLeftGroup';
	public static readonly LABEL = nls.localize('moveEditorToLeftGroup', "Move Editor into Left Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToRightGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToRightGroup';
	public static readonly LABEL = nls.localize('moveEditorToRightGroup', "Move Editor into Right Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToFirstGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToFirstGroup';
	public static readonly LABEL = nls.localize('moveEditorToFirstGroup', "Move Editor into First Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'first', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToLastGroupAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.moveEditorToLastGroup';
	public static readonly LABEL = nls.localize('moveEditorToLastGroup', "Move Editor into Last Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'last', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class EditorLayoutSingleAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutSingle';
	public static readonly LABEL = nls.localize('editorLayoutSingle', "Single Column Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}] } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutTwoColumns';
	public static readonly LABEL = nls.localize('editorLayoutTwoColumns', "Two Columns Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

export class EditorLayoutThreeColumnsAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutThreeColumns';
	public static readonly LABEL = nls.localize('editorLayoutThreeColumns', "Three Columns Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}, {}], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoRowsAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutTwoRows';
	public static readonly LABEL = nls.localize('editorLayoutTwoRows', "Two Rows Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutThreeRowsAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutThreeRows';
	public static readonly LABEL = nls.localize('editorLayoutThreeRows', "Three Rows Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoByTwoGridAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutTwoByTwoGrid';
	public static readonly LABEL = nls.localize('editorLayoutTwoByTwoGrid', "Grid Editor Layout (2x2)");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }] } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsBottomAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutTwoColumnsBottom';
	public static readonly LABEL = nls.localize('editorLayoutTwoColumnsBottom', "Two Columns Bottom Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsRightAction extends ExecuteCommandAction {

	public static readonly ID = 'workbench.action.editorLayoutTwoColumnsRight';
	public static readonly LABEL = nls.localize('editorLayoutTwoColumnsRight', "Two Columns Right Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

export class BaseCreateEditorGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private direction: GroupDirection,
		private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.addGroup(this.editorGroupService.activeGroup, this.direction, { activate: true });

		return TPromise.as(true);
	}
}

export class NewEditorGroupLeftAction extends BaseCreateEditorGroupAction {

	public static readonly ID = 'workbench.action.newGroupLeft';
	public static readonly LABEL = nls.localize('newEditorLeft', "New Editor Group to the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class NewEditorGroupRightAction extends BaseCreateEditorGroupAction {

	public static readonly ID = 'workbench.action.newGroupRight';
	public static readonly LABEL = nls.localize('newEditorRight', "New Editor Group to the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class NewEditorGroupAboveAction extends BaseCreateEditorGroupAction {

	public static readonly ID = 'workbench.action.newGroupAbove';
	public static readonly LABEL = nls.localize('newEditorAbove', "New Editor Group Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class NewEditorGroupBelowAction extends BaseCreateEditorGroupAction {

	public static readonly ID = 'workbench.action.newGroupBelow';
	public static readonly LABEL = nls.localize('newEditorBelow', "New Editor Group Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}
