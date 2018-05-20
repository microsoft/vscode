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
import { CLOSE_EDITOR_COMMAND_ID, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, MOVE_ACTIVE_EDITOR_COMMAND_ID, NAVIGATE_IN_ACTIVE_GROUP_PREFIX, ActiveEditorMoveArguments } from 'vs/workbench/browser/parts/editor/editorCommands';
import { INextEditorGroupsService, IEditorGroup, GroupsArrangement, EditorsOrder, GroupLocation, GroupDirection, preferredGroupDirection } from 'vs/workbench/services/group/common/editorGroupsService';
import { INextEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class BaseSplitEditorGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		clazz: string,
		protected direction: GroupDirection,
		private editorGroupService: INextEditorGroupsService
	) {
		super(id, label, clazz);
	}

	public run(context?: IEditorIdentifier & { event?: Event }): TPromise<any> {
		this.splitEditor(context ? context.groupId : void 0);

		return TPromise.as(true);
	}

	protected splitEditor(groupId?: number, direction = this.direction): void {
		let sourceGroup: IEditorGroup;
		if (typeof groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		// Add group
		const newGroup = this.editorGroupService.addGroup(sourceGroup, direction, { activate: true });

		// Split editor (if it can be split)
		if (sourceGroup.activeEditor) {
			if (sourceGroup.activeEditor instanceof EditorInput && !sourceGroup.activeEditor.supportsSplitEditor()) {
				return;
			}

			sourceGroup.copyEditor(sourceGroup.activeEditor, newGroup);
		}
	}
}

export class SplitEditorAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditor';
	public static readonly LABEL = nls.localize('splitEditor', "Split Editor");

	private toDispose: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label, null, preferredGroupDirection(configurationService), editorGroupService);

		this.updateAction();

		this.registerListeners();
	}

	private updateAction(): void {
		switch (this.direction) {
			case GroupDirection.LEFT:
				this.label = SplitEditorGroupLeftAction.LABEL;
				this.class = 'split-editor-horizontal-action';
				break;
			case GroupDirection.RIGHT:
				this.label = SplitEditorGroupRightAction.LABEL;
				this.class = 'split-editor-horizontal-action';
				break;
			case GroupDirection.UP:
				this.label = SplitEditorGroupUpAction.LABEL;
				this.class = 'split-editor-vertical-action';
				break;
			case GroupDirection.DOWN:
				this.label = SplitEditorGroupDownAction.LABEL;
				this.class = 'split-editor-vertical-action';
				break;
		}
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
				this.direction = preferredGroupDirection(this.configurationService);
				this.updateAction();
			}
		}));
	}

	public run(context?: IEditorIdentifier & { event?: Event }): TPromise<any> {
		let direction = this.direction;
		if (context && context.event instanceof MouseEvent && (context.event.altKey)) {
			direction = this.alternateGroupDirection;
		}

		this.splitEditor(context ? context.groupId : void 0, direction);

		return TPromise.as(true);
	}

	private get alternateGroupDirection(): GroupDirection {
		switch (this.direction) {
			case GroupDirection.LEFT: return GroupDirection.UP;
			case GroupDirection.RIGHT: return GroupDirection.DOWN;
			case GroupDirection.UP: return GroupDirection.LEFT;
			case GroupDirection.DOWN: return GroupDirection.RIGHT;
		}
	}

	public dispose(): void {
		super.dispose();

		this.toDispose = dispose(this.toDispose);
	}
}

export class SplitEditorGroupVerticalAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupVertical';
	public static readonly LABEL = nls.localize('splitEditorGroupVertical', "Split Editor Vertically");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, 'split-editor-vertical-action', GroupDirection.DOWN, editorGroupService);
	}
}

export class SplitEditorGroupHorizontalAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupHorizontal';
	public static readonly LABEL = nls.localize('splitEditorGroupHorizontal', "Split Editor Horizontally");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, 'split-editor-horizontal-action', GroupDirection.RIGHT, editorGroupService);
	}
}

export class SplitEditorGroupLeftAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupLeft';
	public static readonly LABEL = nls.localize('splitEditorGroupLeft', "Split Editor Left");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, null, GroupDirection.LEFT, editorGroupService);
	}
}

export class SplitEditorGroupRightAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupRight';
	public static readonly LABEL = nls.localize('splitEditorGroupRight', "Split Editor Right");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, null, GroupDirection.RIGHT, editorGroupService);
	}
}

export class SplitEditorGroupUpAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupUp';
	public static readonly LABEL = nls.localize('splitEditorGroupUp', "Split Editor Up");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, null, GroupDirection.UP, editorGroupService);
	}
}

export class SplitEditorGroupDownAction extends BaseSplitEditorGroupAction {

	public static readonly ID = 'workbench.action.splitEditorGroupDown';
	public static readonly LABEL = nls.localize('splitEditorGroupDown', "Split Editor Down");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, null, GroupDirection.DOWN, editorGroupService);
	}
}

export class JoinTwoGroupsAction extends Action {

	public static readonly ID = 'workbench.action.joinTwoGroups';
	public static readonly LABEL = nls.localize('joinTwoGroups', "Join Editors of Two Groups");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
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

		const targetGroup =
			this.editorGroupService.findGroup({ direction: GroupDirection.RIGHT }, sourceGroup) ||
			this.editorGroupService.findGroup({ direction: GroupDirection.DOWN }, sourceGroup) ||
			this.editorGroupService.findGroup({ direction: GroupDirection.UP }, sourceGroup) ||
			this.editorGroupService.findGroup({ direction: GroupDirection.LEFT }, sourceGroup);

		if (targetGroup && sourceGroup !== targetGroup) {
			this.editorGroupService.mergeGroup(sourceGroup, targetGroup);
		}

		return TPromise.as(true);
	}
}

export class NavigateBetweenGroupsAction extends Action {

	public static readonly ID = 'workbench.action.navigateEditorGroups';
	public static readonly LABEL = nls.localize('navigateEditorGroups', "Navigate Between Editor Groups");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT });
		if (!nextGroup) {
			nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.FIRST });
		}

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
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.activeGroup.focus();

		return TPromise.as(true);
	}
}

export class FocusFirstGroupAction extends Action {

	public static readonly ID = 'workbench.action.focusFirstEditorGroup';
	public static readonly LABEL = nls.localize('focusFirstEditorGroup', "Focus First Editor Group");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.findGroup({ location: GroupLocation.FIRST }).focus();

		return TPromise.as(true);
	}
}

export class FocusLastGroupAction extends Action {

	public static readonly ID = 'workbench.action.focusLastEditorGroup';
	public static readonly LABEL = nls.localize('focusLastEditorGroup', "Focus Last Editor Group");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.findGroup({ location: GroupLocation.LAST }).focus();

		return TPromise.as(true);
	}
}

export class FocusPreviousGroup extends Action {

	public static readonly ID = 'workbench.action.focusPreviousGroup';
	public static readonly LABEL = nls.localize('focusPreviousGroup', "Focus Previous Editor Group");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const previousGroup = this.editorGroupService.findGroup({ location: GroupLocation.PREVIOUS });
		if (previousGroup) {
			previousGroup.focus();
		}

		return TPromise.as(true);
	}
}

export class FocusNextGroup extends Action {

	public static readonly ID = 'workbench.action.focusNextGroup';
	public static readonly LABEL = nls.localize('focusNextGroup', "Focus Next Editor Group");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT });
		if (nextGroup) {
			nextGroup.focus();
		}

		return TPromise.as(true);
	}
}

export class OpenToSideAction extends Action {

	public static readonly OPEN_TO_SIDE_ID = 'workbench.action.openToSide';
	public static readonly OPEN_TO_SIDE_LABEL = nls.localize('openToSide', "Open to the Side");

	constructor(
		@INextEditorService private editorService: INextEditorService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(OpenToSideAction.OPEN_TO_SIDE_ID, OpenToSideAction.OPEN_TO_SIDE_LABEL);

		this.updateClass();
	}

	public updateClass(): void {
		const preferredDirection = preferredGroupDirection(this.configurationService);

		this.class = (preferredDirection === GroupDirection.LEFT || preferredDirection === GroupDirection.RIGHT) ? 'quick-open-sidebyside-vertical' : 'quick-open-sidebyside-horizontal';
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
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
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
		@INextEditorService private editorService: INextEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeControl = this.editorService.activeControl;
		if (activeControl && activeControl.input) {
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
	public static readonly LABEL = nls.localize('closeEditorsToTheLeft', "Close Editors to the Left");

	constructor(
		id: string,
		label: string,
		@INextEditorService private editorService: INextEditorService,
		@INextEditorGroupsService private groupService: INextEditorGroupsService
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		const { group, editor } = getTarget(this.editorService, this.groupService, context);
		if (group && editor) {
			return group.closeEditors({ direction: CloseDirection.LEFT, except: editor });
		}

		return TPromise.as(false);
	}
}

function getTarget(editorService: INextEditorService, editorGroupService: INextEditorGroupsService, context?: IEditorIdentifier): { editor: IEditorInput, group: IEditorGroup } {
	if (context) {
		return { editor: context.editor, group: editorGroupService.getGroup(context.groupId) };
	}

	// Fallback to active group
	return { group: editorGroupService.activeGroup, editor: editorGroupService.activeGroup.activeEditor };
}

export class CloseAllEditorsAction extends Action {

	public static readonly ID = 'workbench.action.closeAllEditors';
	public static readonly LABEL = nls.localize('closeAllEditors', "Close All Editors");

	constructor(
		id: string,
		label: string,
		@ITextFileService private textFileService: ITextFileService,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService
	) {
		super(id, label, 'action-close-all-files');
	}

	public run(): TPromise<any> {

		// Just close all if there are no or one dirty editor
		if (this.textFileService.getDirty().length < 2) {
			return TPromise.join(this.editorGroupService.groups.map(g => g.closeAllEditors()));
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
					return TPromise.join(this.editorGroupService.groups.map(g => g.closeAllEditors()));
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
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService,
	) {
		super(id, label);
	}

	public run(context?: IEditorIdentifier): TPromise<any> {
		const groupToSkip = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
		return TPromise.join(this.editorGroupService.groups.map(g => {
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
		private editorGroupService: INextEditorGroupsService
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

		const targetGroup = this.editorGroupService.findGroup({ direction: this.direction }, sourceGroup);
		if (targetGroup) {
			this.editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
		}

		return TPromise.as(true);
	}
}

export class MoveGroupLeftAction extends BaseMoveGroupAction {

	public static readonly ID = 'workbench.action.moveActiveEditorGroupLeft';
	public static readonly LABEL = nls.localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}

export class MinimizeOtherGroupsAction extends Action {

	public static readonly ID = 'workbench.action.minimizeOtherEditors';
	public static readonly LABEL = nls.localize('minimizeOtherEditorGroups', "Minimize Other Editor Groups");

	constructor(id: string, label: string, @INextEditorGroupsService private editorGroupService: INextEditorGroupsService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.MINIMIZE_OTHERS);

		return TPromise.as(false);
	}
}

export class EvenGroupWidthsAction extends Action {

	public static readonly ID = 'workbench.action.evenEditorWidths';
	public static readonly LABEL = nls.localize('evenEditorGroups', "Even Editor Group Widths");

	constructor(id: string, label: string, @INextEditorGroupsService private editorGroupService: INextEditorGroupsService) {
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
		@INextEditorService private editorService: INextEditorService,
		@INextEditorGroupsService private editorGroupService: INextEditorGroupsService,
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
		protected editorGroupService: INextEditorGroupsService,
		protected editorService: INextEditorService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT });
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		const previousGroup = this.editorGroupService.findGroup({ location: GroupLocation.PREVIOUS });
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		@INextEditorGroupsService editorGroupService: INextEditorGroupsService,
		@INextEditorService editorService: INextEditorService
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
		const args: ActiveEditorMoveArguments = { to: 'left' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

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
		const args: ActiveEditorMoveArguments = { to: 'right' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToPreviousGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToPreviousGroup';
	public static readonly LABEL = nls.localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'previous', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToUpwardsGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToUpwardsGroup';
	public static readonly LABEL = nls.localize('moveEditorToUpwardsGroup', "Move Editor into Upwards Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'up', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToDownwardsGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToDownwardsGroup';
	public static readonly LABEL = nls.localize('moveEditorToDownwardsGroup', "Move Editor into Downwards Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'down', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToLeftGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToLeftGroup';
	public static readonly LABEL = nls.localize('moveEditorToLeftGroup', "Move Editor into Left Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'left', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToRightGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToRightGroup';
	public static readonly LABEL = nls.localize('moveEditorToRightGroup', "Move Editor into Right Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'right', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToNextGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToNextGroup';
	public static readonly LABEL = nls.localize('moveEditorToNextGroup', "Move Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'next', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToFirstGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToFirstGroup';
	public static readonly LABEL = nls.localize('moveEditorToFirstGroup', "Move Editor into First Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'first', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}

export class MoveEditorToLastGroupAction extends Action {

	public static readonly ID = 'workbench.action.moveEditorToLastGroup';
	public static readonly LABEL = nls.localize('moveEditorToLastGroup', "Move Editor into Last Group");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const args: ActiveEditorMoveArguments = { to: 'last', by: 'group' };
		this.commandService.executeCommand(MOVE_ACTIVE_EDITOR_COMMAND_ID, args);

		return TPromise.as(true);
	}
}