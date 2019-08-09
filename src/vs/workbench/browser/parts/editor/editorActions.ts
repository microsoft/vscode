/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { mixin } from 'vs/base/common/objects';
import { IEditorInput, EditorInput, IEditorIdentifier, ConfirmResult, IEditorCommandsContext, CloseDirection } from 'vs/workbench/common/editor';
import { QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorQuickOpenEntry, EditorQuickOpenEntryGroup, IEditorQuickOpenEntry, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { CLOSE_EDITOR_COMMAND_ID, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, MOVE_ACTIVE_EDITOR_COMMAND_ID, NAVIGATE_IN_ACTIVE_GROUP_PREFIX, ActiveEditorMoveArguments, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, mergeAllGroups } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorGroupsService, IEditorGroup, GroupsArrangement, EditorsOrder, GroupLocation, GroupDirection, preferredSideBySideGroupDirection, IFindGroupScope, GroupOrientation, EditorGroupLayout, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class ExecuteCommandAction extends Action {

	constructor(
		id: string,
		label: string,
		private commandId: string,
		private commandService: ICommandService,
		private commandArgs?: unknown
	) {
		super(id, label);
	}

	run(): Promise<any> {
		return this.commandService.executeCommand(this.commandId, this.commandArgs);
	}
}

export class BaseSplitEditorAction extends Action {
	private readonly toDispose = this._register(new DisposableStore());
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
		this.toDispose.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
				this.direction = preferredSideBySideGroupDirection(this.configurationService);
			}
		}));
	}

	run(context?: IEditorIdentifier): Promise<any> {
		splitEditor(this.editorGroupService, this.direction, context);

		return Promise.resolve(true);
	}
}

export class SplitEditorAction extends BaseSplitEditorAction {

	static readonly ID = 'workbench.action.splitEditor';
	static readonly LABEL = nls.localize('splitEditor', "Split Editor");

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

	static readonly ID = 'workbench.action.splitEditorOrthogonal';
	static readonly LABEL = nls.localize('splitEditorOrthogonal', "Split Editor Orthogonal");

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

	static readonly ID = SPLIT_EDITOR_LEFT;
	static readonly LABEL = nls.localize('splitEditorGroupLeft', "Split Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_LEFT, commandService);
	}
}

export class SplitEditorRightAction extends ExecuteCommandAction {

	static readonly ID = SPLIT_EDITOR_RIGHT;
	static readonly LABEL = nls.localize('splitEditorGroupRight', "Split Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_RIGHT, commandService);
	}
}

export class SplitEditorUpAction extends ExecuteCommandAction {

	static readonly ID = SPLIT_EDITOR_UP;
	static readonly LABEL = nls.localize('splitEditorGroupUp', "Split Editor Up");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_UP, commandService);
	}
}

export class SplitEditorDownAction extends ExecuteCommandAction {

	static readonly ID = SPLIT_EDITOR_DOWN;
	static readonly LABEL = nls.localize('splitEditorGroupDown', "Split Editor Down");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, SPLIT_EDITOR_DOWN, commandService);
	}
}

export class JoinTwoGroupsAction extends Action {

	static readonly ID = 'workbench.action.joinTwoGroups';
	static readonly LABEL = nls.localize('joinTwoGroups', "Join Editor Group with Next Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(context?: IEditorIdentifier): Promise<any> {
		let sourceGroup: IEditorGroup | undefined;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		if (sourceGroup) {
			const targetGroupDirections = [GroupDirection.RIGHT, GroupDirection.DOWN, GroupDirection.LEFT, GroupDirection.UP];
			for (const targetGroupDirection of targetGroupDirections) {
				const targetGroup = this.editorGroupService.findGroup({ direction: targetGroupDirection }, sourceGroup);
				if (targetGroup && sourceGroup !== targetGroup) {
					this.editorGroupService.mergeGroup(sourceGroup, targetGroup);

					return Promise.resolve(true);
				}
			}
		}

		return Promise.resolve(true);
	}
}

export class JoinAllGroupsAction extends Action {

	static readonly ID = 'workbench.action.joinAllGroups';
	static readonly LABEL = nls.localize('joinAllGroups', "Join All Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(context?: IEditorIdentifier): Promise<any> {
		mergeAllGroups(this.editorGroupService);

		return Promise.resolve(true);
	}
}

export class NavigateBetweenGroupsAction extends Action {

	static readonly ID = 'workbench.action.navigateEditorGroups';
	static readonly LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, this.editorGroupService.activeGroup, true);
		nextGroup.focus();

		return Promise.resolve(true);
	}
}

export class FocusActiveGroupAction extends Action {

	static readonly ID = 'workbench.action.focusActiveEditorGroup';
	static readonly LABEL = nls.localize('focusActiveEditorGroup', "Focus Active Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this.editorGroupService.activeGroup.focus();

		return Promise.resolve(true);
	}
}

export abstract class BaseFocusGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private scope: IFindGroupScope,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const group = this.editorGroupService.findGroup(this.scope, this.editorGroupService.activeGroup, true);
		if (group) {
			group.focus();
		}

		return Promise.resolve(true);
	}
}

export class FocusFirstGroupAction extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusFirstEditorGroup';
	static readonly LABEL = nls.localize('focusFirstEditorGroup', "Focus First Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.FIRST }, editorGroupService);
	}
}

export class FocusLastGroupAction extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusLastEditorGroup';
	static readonly LABEL = nls.localize('focusLastEditorGroup', "Focus Last Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.LAST }, editorGroupService);
	}
}

export class FocusNextGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusNextGroup';
	static readonly LABEL = nls.localize('focusNextGroup', "Focus Next Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.NEXT }, editorGroupService);
	}
}

export class FocusPreviousGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusPreviousGroup';
	static readonly LABEL = nls.localize('focusPreviousGroup', "Focus Previous Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.PREVIOUS }, editorGroupService);
	}
}

export class FocusLeftGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusLeftGroup';
	static readonly LABEL = nls.localize('focusLeftGroup', "Focus Left Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.LEFT }, editorGroupService);
	}
}

export class FocusRightGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusRightGroup';
	static readonly LABEL = nls.localize('focusRightGroup', "Focus Right Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.RIGHT }, editorGroupService);
	}
}

export class FocusAboveGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusAboveGroup';
	static readonly LABEL = nls.localize('focusAboveGroup', "Focus Above Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.UP }, editorGroupService);
	}
}

export class FocusBelowGroup extends BaseFocusGroupAction {

	static readonly ID = 'workbench.action.focusBelowGroup';
	static readonly LABEL = nls.localize('focusBelowGroup', "Focus Below Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.DOWN }, editorGroupService);
	}
}

export class OpenToSideFromQuickOpenAction extends Action {

	static readonly OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	static readonly OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(OpenToSideFromQuickOpenAction.OPEN_TO_SIDE_ID, OpenToSideFromQuickOpenAction.OPEN_TO_SIDE_LABEL);

		this.updateClass();
	}

	updateClass(): void {
		const preferredDirection = preferredSideBySideGroupDirection(this.configurationService);

		this.class = (preferredDirection === GroupDirection.RIGHT) ? 'quick-open-sidebyside-vertical' : 'quick-open-sidebyside-horizontal';
	}

	run(context: any): Promise<any> {
		const entry = toEditorQuickOpenEntry(context);
		if (entry) {
			const input = entry.getInput();
			if (input) {
				if (input instanceof EditorInput) {
					return this.editorService.openEditor(input, entry.getOptions() || undefined, SIDE_GROUP);
				}

				const resourceInput = input as IResourceInput;
				resourceInput.options = mixin(resourceInput.options, entry.getOptions());

				return this.editorService.openEditor(resourceInput, SIDE_GROUP);
			}
		}

		return Promise.resolve(false);
	}
}

export function toEditorQuickOpenEntry(element: any): IEditorQuickOpenEntry | null {

	// QuickOpenEntryGroup
	if (element instanceof QuickOpenEntryGroup) {
		const group = element;
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

	static readonly ID = 'workbench.action.closeActiveEditor';
	static readonly LABEL = nls.localize('closeEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label, 'close-editor-action');
	}

	run(context?: IEditorCommandsContext): Promise<any> {
		return this.commandService.executeCommand(CLOSE_EDITOR_COMMAND_ID, undefined, context);
	}
}

export class CloseOneEditorAction extends Action {

	static readonly ID = 'workbench.action.closeActiveEditor';
	static readonly LABEL = nls.localize('closeOneEditor', "Close");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label, 'close-editor-action');
	}

	run(context?: IEditorCommandsContext): Promise<any> {
		let group: IEditorGroup | undefined;
		let editorIndex: number | undefined;
		if (context) {
			group = this.editorGroupService.getGroup(context.groupId);

			if (group) {
				editorIndex = context.editorIndex!; // only allow editor at index if group is valid
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

		return Promise.resolve(false);
	}
}

export class RevertAndCloseEditorAction extends Action {

	static readonly ID = 'workbench.action.revertAndCloseActiveEditor';
	static readonly LABEL = nls.localize('revertAndCloseActiveEditor', "Revert and Close Editor");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	async run(): Promise<any> {
		const activeControl = this.editorService.activeControl;
		if (activeControl) {
			const editor = activeControl.input;
			const group = activeControl.group;

			// first try a normal revert where the contents of the editor are restored
			try {
				await editor.revert();
			} catch (error) {
				// if that fails, since we are about to close the editor, we accept that
				// the editor cannot be reverted and instead do a soft revert that just
				// enables us to close the editor. With this, a user can always close a
				// dirty editor even when reverting fails.
				await editor.revert({ soft: true });
			}

			group.closeEditor(editor);
		}

		return true;
	}
}

export class CloseLeftEditorsInGroupAction extends Action {

	static readonly ID = 'workbench.action.closeEditorsToTheLeft';
	static readonly LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left in Group");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	run(context?: IEditorIdentifier): Promise<any> {
		const { group, editor } = getTarget(this.editorService, this.editorGroupService, context);
		if (group && editor) {
			return group.closeEditors({ direction: CloseDirection.LEFT, except: editor });
		}

		return Promise.resolve(false);
	}
}

function getTarget(editorService: IEditorService, editorGroupService: IEditorGroupsService, context?: IEditorIdentifier): { editor: IEditorInput | null, group: IEditorGroup | undefined } {
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
		clazz: string | undefined,
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

	async run(): Promise<any> {

		// Just close all if there are no or one dirty editor
		if (this.textFileService.getDirty().length < 2) {
			return this.doCloseAll();
		}

		// Otherwise ask for combined confirmation
		const confirm = await this.textFileService.confirmSave();
		if (confirm === ConfirmResult.CANCEL) {
			return;
		}

		let saveOrRevert: boolean;
		if (confirm === ConfirmResult.DONT_SAVE) {
			await this.textFileService.revertAll(undefined, { soft: true });
			saveOrRevert = true;
		} else {
			const res = await this.textFileService.saveAll(true);
			saveOrRevert = res.results.every(r => !!r.success);
		}

		if (saveOrRevert) {
			return this.doCloseAll();
		}
	}

	protected abstract doCloseAll(): Promise<any>;
}

export class CloseAllEditorsAction extends BaseCloseAllAction {

	static readonly ID = 'workbench.action.closeAllEditors';
	static readonly LABEL = nls.localize('closeAllEditors', "Close All Editors");

	constructor(
		id: string,
		label: string,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, 'action-close-all-files', textFileService, editorGroupService);
	}

	protected doCloseAll(): Promise<any> {
		return Promise.all(this.groupsToClose.map(g => g.closeAllEditors()));
	}
}

export class CloseAllEditorGroupsAction extends BaseCloseAllAction {

	static readonly ID = 'workbench.action.closeAllGroups';
	static readonly LABEL = nls.localize('closeAllGroups', "Close All Editor Groups");

	constructor(
		id: string,
		label: string,
		@ITextFileService textFileService: ITextFileService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, undefined, textFileService, editorGroupService);
	}

	protected async doCloseAll(): Promise<any> {
		await Promise.all(this.groupsToClose.map(group => group.closeAllEditors()));

		this.groupsToClose.forEach(group => this.editorGroupService.removeGroup(group));
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	static readonly ID = 'workbench.action.closeEditorsInOtherGroups';
	static readonly LABEL = nls.localize('closeEditorsInOtherGroups', "Close Editors in Other Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
	) {
		super(id, label);
	}

	run(context?: IEditorIdentifier): Promise<any> {
		const groupToSkip = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
		return Promise.all(this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(g => {
			if (groupToSkip && g.id === groupToSkip.id) {
				return Promise.resolve();
			}

			return g.closeAllEditors();
		}));
	}
}

export class CloseEditorInAllGroupsAction extends Action {

	static readonly ID = 'workbench.action.closeEditorInAllGroups';
	static readonly LABEL = nls.localize('closeEditorInAllGroups', "Close Editor in All Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor) {
			return Promise.all(this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(g => g.closeEditor(activeEditor)));
		}

		return Promise.resolve();
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

	run(context?: IEditorIdentifier): Promise<any> {
		let sourceGroup: IEditorGroup | undefined;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		if (sourceGroup) {
			const targetGroup = this.findTargetGroup(sourceGroup);
			if (targetGroup) {
				this.editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
			}
		}

		return Promise.resolve(true);
	}

	private findTargetGroup(sourceGroup: IEditorGroup): IEditorGroup | undefined {
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

		for (const targetNeighbour of targetNeighbours) {
			const targetNeighbourGroup = this.editorGroupService.findGroup({ direction: targetNeighbour }, sourceGroup);
			if (targetNeighbourGroup) {
				return targetNeighbourGroup;
			}
		}

		return undefined;
	}
}

export class MoveGroupLeftAction extends BaseMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupLeft';
	static readonly LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class MoveGroupRightAction extends BaseMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupRight';
	static readonly LABEL = nls.localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class MoveGroupUpAction extends BaseMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupUp';
	static readonly LABEL = nls.localize('moveActiveGroupUp', "Move Editor Group Up");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class MoveGroupDownAction extends BaseMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupDown';
	static readonly LABEL = nls.localize('moveActiveGroupDown', "Move Editor Group Down");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}

export class MinimizeOtherGroupsAction extends Action {

	static readonly ID = 'workbench.action.minimizeOtherEditors';
	static readonly LABEL = nls.localize('minimizeOtherEditorGroups', "Maximize Editor Group");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);

		return Promise.resolve(false);
	}
}

export class ResetGroupSizesAction extends Action {

	static readonly ID = 'workbench.action.evenEditorWidths';
	static readonly LABEL = nls.localize('evenEditorGroups', "Reset Editor Group Sizes");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.EVEN);

		return Promise.resolve(false);
	}
}

export class ToggleGroupSizesAction extends Action {

	static readonly ID = 'workbench.action.toggleEditorWidths';
	static readonly LABEL = nls.localize('toggleEditorWidths', "Toggle Editor Group Sizes");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.TOGGLE);

		return Promise.resolve(false);
	}
}

export class MaximizeGroupAction extends Action {

	static readonly ID = 'workbench.action.maximizeEditor';
	static readonly LABEL = nls.localize('maximizeEditor', "Maximize Editor Group and Hide Side Bar");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		if (this.editorService.activeEditor) {
			this.editorGroupService.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);
			this.layoutService.setSideBarHidden(true);
		}

		return Promise.resolve(false);
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

	run(): Promise<any> {
		const result = this.navigate();
		if (!result) {
			return Promise.resolve(false);
		}

		const { groupId, editor } = result;
		if (!editor) {
			return Promise.resolve(false);
		}

		const group = this.editorGroupService.getGroup(groupId);
		if (group) {
			return group.openEditor(editor);
		}

		return Promise.resolve();
	}

	protected abstract navigate(): IEditorIdentifier | undefined;
}

export class OpenNextEditor extends BaseNavigateEditorAction {

	static readonly ID = 'workbench.action.nextEditor';
	static readonly LABEL = nls.localize('openNextEditor', "Open Next Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier | undefined {

		// Navigate in active group if possible
		const activeGroup = this.editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
		if (activeEditorIndex + 1 < activeGroupEditors.length) {
			return { editor: activeGroupEditors[activeEditorIndex + 1], groupId: activeGroup.id };
		}

		// Otherwise try in next group
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, this.editorGroupService.activeGroup, true);
		if (nextGroup) {
			const previousGroupEditors = nextGroup.getEditors(EditorsOrder.SEQUENTIAL);
			return { editor: previousGroupEditors[0], groupId: nextGroup.id };
		}

		return undefined;
	}
}

export class OpenPreviousEditor extends BaseNavigateEditorAction {

	static readonly ID = 'workbench.action.previousEditor';
	static readonly LABEL = nls.localize('openPreviousEditor', "Open Previous Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {
		super(id, label, editorGroupService, editorService);
	}

	protected navigate(): IEditorIdentifier | undefined {

		// Navigate in active group if possible
		const activeGroup = this.editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
		if (activeEditorIndex > 0) {
			return { editor: activeGroupEditors[activeEditorIndex - 1], groupId: activeGroup.id };
		}

		// Otherwise try in previous group
		const previousGroup = this.editorGroupService.findGroup({ location: GroupLocation.PREVIOUS }, this.editorGroupService.activeGroup, true);
		if (previousGroup) {
			const previousGroupEditors = previousGroup.getEditors(EditorsOrder.SEQUENTIAL);
			return { editor: previousGroupEditors[previousGroupEditors.length - 1], groupId: previousGroup.id };
		}

		return undefined;
	}
}

export class OpenNextEditorInGroup extends BaseNavigateEditorAction {

	static readonly ID = 'workbench.action.nextEditorInGroup';
	static readonly LABEL = nls.localize('nextEditorInGroup', "Open Next Editor in Group");

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
		const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;

		return { editor: index + 1 < editors.length ? editors[index + 1] : editors[0], groupId: group.id };
	}
}

export class OpenPreviousEditorInGroup extends BaseNavigateEditorAction {

	static readonly ID = 'workbench.action.previousEditorInGroup';
	static readonly LABEL = nls.localize('openPreviousEditorInGroup', "Open Previous Editor in Group");

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
		const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;

		return { editor: index > 0 ? editors[index - 1] : editors[editors.length - 1], groupId: group.id };
	}
}

export class OpenFirstEditorInGroup extends BaseNavigateEditorAction {

	static readonly ID = 'workbench.action.firstEditorInGroup';
	static readonly LABEL = nls.localize('firstEditorInGroup', "Open First Editor in Group");

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

	static readonly ID = 'workbench.action.lastEditorInGroup';
	static readonly LABEL = nls.localize('lastEditorInGroup', "Open Last Editor in Group");

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

	static readonly ID = 'workbench.action.navigateForward';
	static readonly LABEL = nls.localize('navigateNext', "Go Forward");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.forward();

		return Promise.resolve();
	}
}

export class NavigateBackwardsAction extends Action {

	static readonly ID = 'workbench.action.navigateBack';
	static readonly LABEL = nls.localize('navigatePrevious', "Go Back");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.back();

		return Promise.resolve();
	}
}

export class NavigateToLastEditLocationAction extends Action {

	static readonly ID = 'workbench.action.navigateToLastEditLocation';
	static readonly LABEL = nls.localize('navigateToLastEditLocation', "Go to Last Edit Location");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.openLastEditLocation();

		return Promise.resolve();
	}
}

export class NavigateLastAction extends Action {

	static readonly ID = 'workbench.action.navigateLast';
	static readonly LABEL = nls.localize('navigateLast', "Go Last");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.last();

		return Promise.resolve();
	}
}

export class ReopenClosedEditorAction extends Action {

	static readonly ID = 'workbench.action.reopenClosedEditor';
	static readonly LABEL = nls.localize('reopenClosedEditor', "Reopen Closed Editor");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.reopenLastClosedEditor();

		return Promise.resolve(false);
	}
}

export class ClearRecentFilesAction extends Action {

	static readonly ID = 'workbench.action.clearRecentFiles';
	static readonly LABEL = nls.localize('clearRecentFiles', "Clear Recently Opened");

	constructor(
		id: string,
		label: string,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	run(): Promise<any> {

		// Clear global recently opened
		this.windowsService.clearRecentlyOpened();

		// Clear workspace specific recently opened
		this.historyService.clearRecentlyOpened();

		return Promise.resolve(false);
	}
}

export class ShowEditorsInActiveGroupAction extends QuickOpenAction {

	static readonly ID = 'workbench.action.showEditorsInActiveGroup';
	static readonly LABEL = nls.localize('showEditorsInActiveGroup', "Show Editors in Active Group");

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel, NAVIGATE_IN_ACTIVE_GROUP_PREFIX, quickOpenService);
	}
}

export class ShowAllEditorsAction extends QuickOpenAction {

	static readonly ID = 'workbench.action.showAllEditors';
	static readonly LABEL = nls.localize('showAllEditors', "Show All Editors");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, quickOpenService);
	}
}

export class BaseQuickOpenEditorInGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);



		this.quickOpenService.show(NAVIGATE_IN_ACTIVE_GROUP_PREFIX, { quickNavigateConfiguration: { keybindings: keys } });

		return Promise.resolve(true);
	}
}

export class OpenPreviousRecentlyUsedEditorInGroupAction extends BaseQuickOpenEditorInGroupAction {

	static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
	static readonly LABEL = nls.localize('openPreviousRecentlyUsedEditorInGroup', "Open Previous Recently Used Editor in Group");

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

	static readonly ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	static readonly LABEL = nls.localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor in Group");

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

	static readonly ID = 'workbench.action.openPreviousEditorFromHistory';
	static readonly LABEL = nls.localize('navigateEditorHistoryByInput', "Open Previous Editor from History");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);

		this.quickOpenService.show(undefined, { quickNavigateConfiguration: { keybindings: keys } });

		return Promise.resolve(true);
	}
}

export class OpenNextRecentlyUsedEditorAction extends Action {

	static readonly ID = 'workbench.action.openNextRecentlyUsedEditor';
	static readonly LABEL = nls.localize('openNextRecentlyUsedEditor', "Open Next Recently Used Editor");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.forward(true);

		return Promise.resolve();
	}
}

export class OpenPreviousRecentlyUsedEditorAction extends Action {

	static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditor';
	static readonly LABEL = nls.localize('openPreviousRecentlyUsedEditor', "Open Previous Recently Used Editor");

	constructor(id: string, label: string, @IHistoryService private readonly historyService: IHistoryService) {
		super(id, label);
	}

	run(): Promise<any> {
		this.historyService.back(true);

		return Promise.resolve();
	}
}

export class ClearEditorHistoryAction extends Action {

	static readonly ID = 'workbench.action.clearEditorHistory';
	static readonly LABEL = nls.localize('clearEditorHistory', "Clear Editor History");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	run(): Promise<any> {

		// Editor history
		this.historyService.clear();

		return Promise.resolve(true);
	}
}

export class MoveEditorLeftInGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorLeftInGroup';
	static readonly LABEL = nls.localize('moveEditorLeft', "Move Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorRightInGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorRightInGroup';
	static readonly LABEL = nls.localize('moveEditorRight', "Move Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToPreviousGroup';
	static readonly LABEL = nls.localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'previous', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToNextGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToNextGroup';
	static readonly LABEL = nls.localize('moveEditorToNextGroup', "Move Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'next', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToAboveGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToAboveGroup';
	static readonly LABEL = nls.localize('moveEditorToAboveGroup', "Move Editor into Above Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'up', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToBelowGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToBelowGroup';
	static readonly LABEL = nls.localize('moveEditorToBelowGroup', "Move Editor into Below Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'down', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToLeftGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToLeftGroup';
	static readonly LABEL = nls.localize('moveEditorToLeftGroup', "Move Editor into Left Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToRightGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToRightGroup';
	static readonly LABEL = nls.localize('moveEditorToRightGroup', "Move Editor into Right Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToFirstGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToFirstGroup';
	static readonly LABEL = nls.localize('moveEditorToFirstGroup', "Move Editor into First Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'first', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class MoveEditorToLastGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToLastGroup';
	static readonly LABEL = nls.localize('moveEditorToLastGroup', "Move Editor into Last Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'last', by: 'group' } as ActiveEditorMoveArguments);
	}
}

export class EditorLayoutSingleAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutSingle';
	static readonly LABEL = nls.localize('editorLayoutSingle', "Single Column Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}] } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoColumns';
	static readonly LABEL = nls.localize('editorLayoutTwoColumns', "Two Columns Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

export class EditorLayoutThreeColumnsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutThreeColumns';
	static readonly LABEL = nls.localize('editorLayoutThreeColumns', "Three Columns Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}, {}], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoRowsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoRows';
	static readonly LABEL = nls.localize('editorLayoutTwoRows', "Two Rows Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutThreeRowsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutThreeRows';
	static readonly LABEL = nls.localize('editorLayoutThreeRows', "Three Rows Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoByTwoGridAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoByTwoGrid';
	static readonly LABEL = nls.localize('editorLayoutTwoByTwoGrid', "Grid Editor Layout (2x2)");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }] } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsBottomAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoColumnsBottom';
	static readonly LABEL = nls.localize('editorLayoutTwoColumnsBottom', "Two Columns Bottom Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.VERTICAL } as EditorGroupLayout);
	}
}

export class EditorLayoutTwoRowsRightAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoRowsRight';
	static readonly LABEL = nls.localize('editorLayoutTwoRowsRight', "Two Rows Right Editor Layout");

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

	run(): Promise<any> {
		this.editorGroupService.addGroup(this.editorGroupService.activeGroup, this.direction, { activate: true });

		return Promise.resolve(true);
	}
}

export class NewEditorGroupLeftAction extends BaseCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupLeft';
	static readonly LABEL = nls.localize('newEditorLeft', "New Editor Group to the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class NewEditorGroupRightAction extends BaseCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupRight';
	static readonly LABEL = nls.localize('newEditorRight', "New Editor Group to the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class NewEditorGroupAboveAction extends BaseCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupAbove';
	static readonly LABEL = nls.localize('newEditorAbove', "New Editor Group Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class NewEditorGroupBelowAction extends BaseCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupBelow';
	static readonly LABEL = nls.localize('newEditorBelow', "New Editor Group Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}
