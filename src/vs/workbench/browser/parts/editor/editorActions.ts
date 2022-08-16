/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { firstOrDefault } from 'vs/base/common/arrays';
import { IEditorIdentifier, IEditorCommandsContext, CloseDirection, SaveReason, EditorsOrder, EditorInputCapabilities, DEFAULT_EDITOR_ASSOCIATION, GroupIdentifier, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { GoFilter, IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CLOSE_EDITOR_COMMAND_ID, MOVE_ACTIVE_EDITOR_COMMAND_ID, ActiveEditorMoveCopyArguments, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, COPY_ACTIVE_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorGroupsService, IEditorGroup, GroupsArrangement, GroupLocation, GroupDirection, preferredSideBySideGroupDirection, IFindGroupScope, GroupOrientation, EditorGroupLayout, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IFileDialogService, ConfirmResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ItemActivation, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { AllEditorsByMostRecentlyUsedQuickAccess, ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess } from 'vs/workbench/browser/parts/editor/editorQuickAccess';
import { Codicon } from 'vs/base/common/codicons';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { isLinux, isNative, isWindows } from 'vs/base/common/platform';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

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

	override run(): Promise<void> {
		return this.commandService.executeCommand(this.commandId, this.commandArgs);
	}
}

abstract class AbstractSplitEditorAction extends Action {
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

	override async run(context?: IEditorIdentifier): Promise<void> {
		splitEditor(this.editorGroupService, this.direction, context);
	}
}

export class SplitEditorAction extends AbstractSplitEditorAction {

	static readonly ID = 'workbench.action.splitEditor';
	static readonly LABEL = localize('splitEditor', "Split Editor");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, editorGroupService, configurationService);
	}
}

export class SplitEditorOrthogonalAction extends AbstractSplitEditorAction {

	static readonly ID = 'workbench.action.splitEditorOrthogonal';
	static readonly LABEL = localize('splitEditorOrthogonal', "Split Editor Orthogonal");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, editorGroupService, configurationService);
	}

	protected override getDirection(): GroupDirection {
		const direction = preferredSideBySideGroupDirection(this.configurationService);

		return direction === GroupDirection.RIGHT ? GroupDirection.DOWN : GroupDirection.RIGHT;
	}
}

export class SplitEditorLeftAction extends ExecuteCommandAction {

	static readonly ID = SPLIT_EDITOR_LEFT;
	static readonly LABEL = localize('splitEditorGroupLeft', "Split Editor Left");

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
	static readonly LABEL = localize('splitEditorGroupRight', "Split Editor Right");

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
	static readonly LABEL = localize('splitEditorGroupUp', "Split Editor Up");

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
	static readonly LABEL = localize('splitEditorGroupDown', "Split Editor Down");

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
	static readonly LABEL = localize('joinTwoGroups', "Join Editor Group with Next Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(context?: IEditorIdentifier): Promise<void> {
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

					break;
				}
			}
		}
	}
}

export class JoinAllGroupsAction extends Action {

	static readonly ID = 'workbench.action.joinAllGroups';
	static readonly LABEL = localize('joinAllGroups', "Join All Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.mergeAllGroups();
	}
}

export class NavigateBetweenGroupsAction extends Action {

	static readonly ID = 'workbench.action.navigateEditorGroups';
	static readonly LABEL = localize('navigateEditorGroups', "Navigate Between Editor Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const nextGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, this.editorGroupService.activeGroup, true);
		nextGroup?.focus();
	}
}

export class FocusActiveGroupAction extends Action {

	static readonly ID = 'workbench.action.focusActiveEditorGroup';
	static readonly LABEL = localize('focusActiveEditorGroup', "Focus Active Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.activeGroup.focus();
	}
}

abstract class AbstractFocusGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private scope: IFindGroupScope,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const group = this.editorGroupService.findGroup(this.scope, this.editorGroupService.activeGroup, true);
		group?.focus();
	}
}

export class FocusFirstGroupAction extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusFirstEditorGroup';
	static readonly LABEL = localize('focusFirstEditorGroup', "Focus First Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.FIRST }, editorGroupService);
	}
}

export class FocusLastGroupAction extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusLastEditorGroup';
	static readonly LABEL = localize('focusLastEditorGroup', "Focus Last Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.LAST }, editorGroupService);
	}
}

export class FocusNextGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusNextGroup';
	static readonly LABEL = localize('focusNextGroup', "Focus Next Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.NEXT }, editorGroupService);
	}
}

export class FocusPreviousGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusPreviousGroup';
	static readonly LABEL = localize('focusPreviousGroup', "Focus Previous Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { location: GroupLocation.PREVIOUS }, editorGroupService);
	}
}

export class FocusLeftGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusLeftGroup';
	static readonly LABEL = localize('focusLeftGroup', "Focus Left Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.LEFT }, editorGroupService);
	}
}

export class FocusRightGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusRightGroup';
	static readonly LABEL = localize('focusRightGroup', "Focus Right Editor Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.RIGHT }, editorGroupService);
	}
}

export class FocusAboveGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusAboveGroup';
	static readonly LABEL = localize('focusAboveGroup', "Focus Editor Group Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.UP }, editorGroupService);
	}
}

export class FocusBelowGroup extends AbstractFocusGroupAction {

	static readonly ID = 'workbench.action.focusBelowGroup';
	static readonly LABEL = localize('focusBelowGroup', "Focus Editor Group Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, { direction: GroupDirection.DOWN }, editorGroupService);
	}
}

export class CloseEditorAction extends Action {

	static readonly ID = 'workbench.action.closeActiveEditor';
	static readonly LABEL = localize('closeEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label, Codicon.close.classNames);
	}

	override run(context?: IEditorCommandsContext): Promise<void> {
		return this.commandService.executeCommand(CLOSE_EDITOR_COMMAND_ID, undefined, context);
	}
}

export class UnpinEditorAction extends Action {

	static readonly ID = 'workbench.action.unpinActiveEditor';
	static readonly LABEL = localize('unpinEditor', "Unpin Editor");

	constructor(
		id: string,
		label: string,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label, Codicon.pinned.classNames);
	}

	override run(context?: IEditorCommandsContext): Promise<void> {
		return this.commandService.executeCommand(UNPIN_EDITOR_COMMAND_ID, undefined, context);
	}
}

export class CloseOneEditorAction extends Action {

	static readonly ID = 'workbench.action.closeActiveEditor';
	static readonly LABEL = localize('closeOneEditor', "Close");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label, Codicon.close.classNames);
	}

	override async run(context?: IEditorCommandsContext): Promise<void> {
		let group: IEditorGroup | undefined;
		let editorIndex: number | undefined;
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
			const editorAtIndex = group.getEditorByIndex(editorIndex);
			if (editorAtIndex) {
				await group.closeEditor(editorAtIndex, { preserveFocus: context?.preserveFocus });
				return;
			}
		}

		// Otherwise close active editor in group
		if (group.activeEditor) {
			await group.closeEditor(group.activeEditor, { preserveFocus: context?.preserveFocus });
			return;
		}
	}
}

export class RevertAndCloseEditorAction extends Action {

	static readonly ID = 'workbench.action.revertAndCloseActiveEditor';
	static readonly LABEL = localize('revertAndCloseActiveEditor', "Revert and Close Editor");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane) {
			const editor = activeEditorPane.input;
			const group = activeEditorPane.group;

			// first try a normal revert where the contents of the editor are restored
			try {
				await this.editorService.revert({ editor, groupId: group.id });
			} catch (error) {
				// if that fails, since we are about to close the editor, we accept that
				// the editor cannot be reverted and instead do a soft revert that just
				// enables us to close the editor. With this, a user can always close a
				// dirty editor even when reverting fails.
				await this.editorService.revert({ editor, groupId: group.id }, { soft: true });
			}

			await group.closeEditor(editor);
		}
	}
}

export class CloseLeftEditorsInGroupAction extends Action {

	static readonly ID = 'workbench.action.closeEditorsToTheLeft';
	static readonly LABEL = localize('closeEditorsToTheLeft', "Close Editors to the Left in Group");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(context?: IEditorIdentifier): Promise<void> {
		const { group, editor } = this.getTarget(context);
		if (group && editor) {
			await group.closeEditors({ direction: CloseDirection.LEFT, except: editor, excludeSticky: true });
		}
	}

	private getTarget(context?: IEditorIdentifier): { editor: EditorInput | null; group: IEditorGroup | undefined } {
		if (context) {
			return { editor: context.editor, group: this.editorGroupService.getGroup(context.groupId) };
		}

		// Fallback to active group
		return { group: this.editorGroupService.activeGroup, editor: this.editorGroupService.activeGroup.activeEditor };
	}
}

abstract class AbstractCloseAllAction extends Action {

	constructor(
		id: string,
		label: string,
		clazz: string | undefined,
		private fileDialogService: IFileDialogService,
		protected editorGroupService: IEditorGroupsService,
		private editorService: IEditorService,
		private filesConfigurationService: IFilesConfigurationService
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

	override async run(): Promise<void> {

		// Depending on the editor and auto save configuration,
		// split editors into buckets for handling confirmation

		const dirtyEditorsWithDefaultConfirm = new Set<IEditorIdentifier>();
		const dirtyAutoSaveOnFocusChangeEditors = new Set<IEditorIdentifier>();
		const dirtyAutoSaveOnWindowChangeEditors = new Set<IEditorIdentifier>();
		const editorsWithCustomConfirm = new Map<string /* typeId */, Set<IEditorIdentifier>>();

		for (const { editor, groupId } of this.editorService.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: this.excludeSticky })) {
			let confirmClose = false;
			if (editor.closeHandler) {
				confirmClose = editor.closeHandler.showConfirm(); // custom handling of confirmation on close
			} else {
				confirmClose = editor.isDirty() && !editor.isSaving(); // default confirm only when dirty and not saving
			}

			if (!confirmClose) {
				continue;
			}

			// Editor has custom confirm implementation
			if (typeof editor.closeHandler?.confirm === 'function') {
				let customEditorsToConfirm = editorsWithCustomConfirm.get(editor.typeId);
				if (!customEditorsToConfirm) {
					customEditorsToConfirm = new Set();
					editorsWithCustomConfirm.set(editor.typeId, customEditorsToConfirm);
				}

				customEditorsToConfirm.add({ editor, groupId });
			}

			// Editor will be saved on focus change when a
			// dialog appears, so just track that separate
			else if (this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.ON_FOCUS_CHANGE && !editor.hasCapability(EditorInputCapabilities.Untitled)) {
				dirtyAutoSaveOnFocusChangeEditors.add({ editor, groupId });
			}

			// Windows, Linux: editor will be saved on window change
			// when a native dialog appears, so just track that separate
			// (see https://github.com/microsoft/vscode/issues/134250)
			else if ((isNative && (isWindows || isLinux)) && this.filesConfigurationService.getAutoSaveMode() === AutoSaveMode.ON_WINDOW_CHANGE && !editor.hasCapability(EditorInputCapabilities.Untitled)) {
				dirtyAutoSaveOnWindowChangeEditors.add({ editor, groupId });
			}

			// Editor will show in generic file based dialog
			else {
				dirtyEditorsWithDefaultConfirm.add({ editor, groupId });
			}
		}

		// 1.) Show default file based dialog
		if (dirtyEditorsWithDefaultConfirm.size > 0) {
			const editors = Array.from(dirtyEditorsWithDefaultConfirm.values());

			await this.revealEditorsToConfirm(editors); // help user make a decision by revealing editors

			const confirmation = await this.fileDialogService.showSaveConfirm(editors.map(({ editor }) => {
				if (editor instanceof SideBySideEditorInput) {
					return editor.primary.getName(); // prefer shorter names by using primary's name in this case
				}

				return editor.getName();
			}));

			switch (confirmation) {
				case ConfirmResult.CANCEL:
					return;
				case ConfirmResult.DONT_SAVE:
					await this.editorService.revert(editors, { soft: true });
					break;
				case ConfirmResult.SAVE:
					await this.editorService.save(editors, { reason: SaveReason.EXPLICIT });
					break;
			}
		}

		// 2.) Show custom confirm based dialog
		for (const [, editorIdentifiers] of editorsWithCustomConfirm) {
			const editors = Array.from(editorIdentifiers.values());

			await this.revealEditorsToConfirm(editors); // help user make a decision by revealing editors

			const confirmation = await firstOrDefault(editors)?.editor.closeHandler?.confirm?.(editors);
			if (typeof confirmation === 'number') {
				switch (confirmation) {
					case ConfirmResult.CANCEL:
						return;
					case ConfirmResult.DONT_SAVE:
						await this.editorService.revert(editors, { soft: true });
						break;
					case ConfirmResult.SAVE:
						await this.editorService.save(editors, { reason: SaveReason.EXPLICIT });
						break;
				}
			}
		}

		// 3.) Save autosaveable editors (focus change)
		if (dirtyAutoSaveOnFocusChangeEditors.size > 0) {
			const editors = Array.from(dirtyAutoSaveOnFocusChangeEditors.values());

			await this.editorService.save(editors, { reason: SaveReason.FOCUS_CHANGE });
		}

		// 4.) Save autosaveable editors (window change)
		if (dirtyAutoSaveOnWindowChangeEditors.size > 0) {
			const editors = Array.from(dirtyAutoSaveOnWindowChangeEditors.values());

			await this.editorService.save(editors, { reason: SaveReason.WINDOW_CHANGE });
		}

		// 5.) Finally close all editors: even if an editor failed to
		// save or revert and still reports dirty, the editor part makes
		// sure to bring up another confirm dialog for those editors
		// specifically.
		return this.doCloseAll();
	}

	private async revealEditorsToConfirm(editors: ReadonlyArray<IEditorIdentifier>): Promise<void> {
		try {
			const handledGroups = new Set<GroupIdentifier>();
			for (const { editor, groupId } of editors) {
				if (handledGroups.has(groupId)) {
					continue;
				}

				handledGroups.add(groupId);

				const group = this.editorGroupService.getGroup(groupId);
				await group?.openEditor(editor);
			}
		} catch (error) {
			// ignore any error as the revealing is just convinience
		}
	}

	protected abstract get excludeSticky(): boolean;

	protected async doCloseAll(): Promise<void> {
		await Promise.all(this.groupsToClose.map(group => group.closeAllEditors({ excludeSticky: this.excludeSticky })));
	}
}

export class CloseAllEditorsAction extends AbstractCloseAllAction {

	static readonly ID = 'workbench.action.closeAllEditors';
	static readonly LABEL = localize('closeAllEditors', "Close All Editors");

	constructor(
		id: string,
		label: string,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(id, label, Codicon.closeAll.classNames, fileDialogService, editorGroupService, editorService, filesConfigurationService);
	}

	protected get excludeSticky(): boolean {
		return true; // exclude sticky from this mass-closing operation
	}
}

export class CloseAllEditorGroupsAction extends AbstractCloseAllAction {

	static readonly ID = 'workbench.action.closeAllGroups';
	static readonly LABEL = localize('closeAllGroups', "Close All Editor Groups");

	constructor(
		id: string,
		label: string,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService
	) {
		super(id, label, undefined, fileDialogService, editorGroupService, editorService, filesConfigurationService);
	}

	protected get excludeSticky(): boolean {
		return false; // the intent to close groups means, even sticky are included
	}

	protected override async doCloseAll(): Promise<void> {
		await super.doCloseAll();

		for (const groupToClose of this.groupsToClose) {
			this.editorGroupService.removeGroup(groupToClose);
		}
	}
}

export class CloseEditorsInOtherGroupsAction extends Action {

	static readonly ID = 'workbench.action.closeEditorsInOtherGroups';
	static readonly LABEL = localize('closeEditorsInOtherGroups', "Close Editors in Other Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
	) {
		super(id, label);
	}

	override async run(context?: IEditorIdentifier): Promise<void> {
		const groupToSkip = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
		await Promise.all(this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(async group => {
			if (groupToSkip && group.id === groupToSkip.id) {
				return;
			}

			return group.closeAllEditors({ excludeSticky: true });
		}));
	}
}

export class CloseEditorInAllGroupsAction extends Action {

	static readonly ID = 'workbench.action.closeEditorInAllGroups';
	static readonly LABEL = localize('closeEditorInAllGroups', "Close Editor in All Groups");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor) {
			await Promise.all(this.editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(group => group.closeEditor(activeEditor)));
		}
	}
}

abstract class AbstractMoveCopyGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private direction: GroupDirection,
		private isMove: boolean,
		private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(context?: IEditorIdentifier): Promise<void> {
		let sourceGroup: IEditorGroup | undefined;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = this.editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = this.editorGroupService.activeGroup;
		}

		if (sourceGroup) {
			let resultGroup: IEditorGroup | undefined = undefined;
			if (this.isMove) {
				const targetGroup = this.findTargetGroup(sourceGroup);
				if (targetGroup) {
					resultGroup = this.editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
				}
			} else {
				resultGroup = this.editorGroupService.copyGroup(sourceGroup, sourceGroup, this.direction);
			}

			if (resultGroup) {
				this.editorGroupService.activateGroup(resultGroup);
			}
		}
	}

	private findTargetGroup(sourceGroup: IEditorGroup): IEditorGroup | undefined {
		const targetNeighbours: GroupDirection[] = [this.direction];

		// Allow the target group to be in alternative locations to support more
		// scenarios of moving the group to the taret location.
		// Helps for https://github.com/microsoft/vscode/issues/50741
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

abstract class AbstractMoveGroupAction extends AbstractMoveCopyGroupAction {

	constructor(
		id: string,
		label: string,
		direction: GroupDirection,
		editorGroupService: IEditorGroupsService
	) {
		super(id, label, direction, true, editorGroupService);
	}
}

export class MoveGroupLeftAction extends AbstractMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupLeft';
	static readonly LABEL = localize('moveActiveGroupLeft', "Move Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class MoveGroupRightAction extends AbstractMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupRight';
	static readonly LABEL = localize('moveActiveGroupRight', "Move Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class MoveGroupUpAction extends AbstractMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupUp';
	static readonly LABEL = localize('moveActiveGroupUp', "Move Editor Group Up");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class MoveGroupDownAction extends AbstractMoveGroupAction {

	static readonly ID = 'workbench.action.moveActiveEditorGroupDown';
	static readonly LABEL = localize('moveActiveGroupDown', "Move Editor Group Down");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}

abstract class AbstractDuplicateGroupAction extends AbstractMoveCopyGroupAction {

	constructor(
		id: string,
		label: string,
		direction: GroupDirection,
		editorGroupService: IEditorGroupsService
	) {
		super(id, label, direction, false, editorGroupService);
	}
}

export class DuplicateGroupLeftAction extends AbstractDuplicateGroupAction {

	static readonly ID = 'workbench.action.duplicateActiveEditorGroupLeft';
	static readonly LABEL = localize('duplicateActiveGroupLeft', "Duplicate Editor Group Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class DuplicateGroupRightAction extends AbstractDuplicateGroupAction {

	static readonly ID = 'workbench.action.duplicateActiveEditorGroupRight';
	static readonly LABEL = localize('duplicateActiveGroupRight', "Duplicate Editor Group Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class DuplicateGroupUpAction extends AbstractDuplicateGroupAction {

	static readonly ID = 'workbench.action.duplicateActiveEditorGroupUp';
	static readonly LABEL = localize('duplicateActiveGroupUp', "Duplicate Editor Group Up");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class DuplicateGroupDownAction extends AbstractDuplicateGroupAction {

	static readonly ID = 'workbench.action.duplicateActiveEditorGroupDown';
	static readonly LABEL = localize('duplicateActiveGroupDown', "Duplicate Editor Group Down");

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
	static readonly LABEL = localize('minimizeOtherEditorGroups', "Maximize Editor Group");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.MAXIMIZE);
	}
}

export class ResetGroupSizesAction extends Action {

	static readonly ID = 'workbench.action.evenEditorWidths';
	static readonly LABEL = localize('evenEditorGroups', "Reset Editor Group Sizes");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.EVEN);
	}
}

export class ToggleGroupSizesAction extends Action {

	static readonly ID = 'workbench.action.toggleEditorWidths';
	static readonly LABEL = localize('toggleEditorWidths', "Toggle Editor Group Sizes");

	constructor(id: string, label: string, @IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.arrangeGroups(GroupsArrangement.TOGGLE);
	}
}

export class MaximizeGroupAction extends Action {

	static readonly ID = 'workbench.action.maximizeEditor';
	static readonly LABEL = localize('maximizeEditor', "Maximize Editor Group and Hide Side Bars");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		if (this.editorService.activeEditor) {
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			this.editorGroupService.arrangeGroups(GroupsArrangement.MAXIMIZE);
		}
	}
}

abstract class AbstractNavigateEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		protected editorGroupService: IEditorGroupsService,
		protected editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const result = this.navigate();
		if (!result) {
			return;
		}

		const { groupId, editor } = result;
		if (!editor) {
			return;
		}

		const group = this.editorGroupService.getGroup(groupId);
		if (group) {
			await group.openEditor(editor);
		}
	}

	protected abstract navigate(): IEditorIdentifier | undefined;
}

export class OpenNextEditor extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.nextEditor';
	static readonly LABEL = localize('openNextEditor', "Open Next Editor");

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

		// Otherwise try in next group that has editors
		const handledGroups = new Set<number>();
		let currentGroup: IEditorGroup | undefined = this.editorGroupService.activeGroup;
		while (currentGroup && !handledGroups.has(currentGroup.id)) {
			currentGroup = this.editorGroupService.findGroup({ location: GroupLocation.NEXT }, currentGroup, true);
			if (currentGroup) {
				handledGroups.add(currentGroup.id);

				const groupEditors = currentGroup.getEditors(EditorsOrder.SEQUENTIAL);
				if (groupEditors.length > 0) {
					return { editor: groupEditors[0], groupId: currentGroup.id };
				}
			}
		}

		return undefined;
	}
}

export class OpenPreviousEditor extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.previousEditor';
	static readonly LABEL = localize('openPreviousEditor', "Open Previous Editor");

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

		// Otherwise try in previous group that has editors
		const handledGroups = new Set<number>();
		let currentGroup: IEditorGroup | undefined = this.editorGroupService.activeGroup;
		while (currentGroup && !handledGroups.has(currentGroup.id)) {
			currentGroup = this.editorGroupService.findGroup({ location: GroupLocation.PREVIOUS }, currentGroup, true);
			if (currentGroup) {
				handledGroups.add(currentGroup.id);

				const groupEditors = currentGroup.getEditors(EditorsOrder.SEQUENTIAL);
				if (groupEditors.length > 0) {
					return { editor: groupEditors[groupEditors.length - 1], groupId: currentGroup.id };
				}
			}
		}

		return undefined;
	}
}

export class OpenNextEditorInGroup extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.nextEditorInGroup';
	static readonly LABEL = localize('nextEditorInGroup', "Open Next Editor in Group");

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

export class OpenPreviousEditorInGroup extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.previousEditorInGroup';
	static readonly LABEL = localize('openPreviousEditorInGroup', "Open Previous Editor in Group");

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

export class OpenFirstEditorInGroup extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.firstEditorInGroup';
	static readonly LABEL = localize('firstEditorInGroup', "Open First Editor in Group");

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

export class OpenLastEditorInGroup extends AbstractNavigateEditorAction {

	static readonly ID = 'workbench.action.lastEditorInGroup';
	static readonly LABEL = localize('lastEditorInGroup', "Open Last Editor in Group");

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

export class NavigateForwardAction extends Action2 {

	static readonly ID = 'workbench.action.navigateForward';
	static readonly LABEL = localize('navigateForward', "Go Forward");

	constructor() {
		super({
			id: NavigateForwardAction.ID,
			title: { value: localize('navigateForward', "Go Forward"), original: 'Go Forward', mnemonicTitle: localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward") },
			f1: true,
			icon: Codicon.arrowRight,
			precondition: ContextKeyExpr.has('canNavigateForward'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				win: { primary: KeyMod.Alt | KeyCode.RightArrow },
				mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus }
			},
			menu: [
				{ id: MenuId.MenubarGoMenu, group: '1_history_nav', order: 2 },
				{ id: MenuId.CommandCenter, order: 2 }
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goForward(GoFilter.NONE);
	}
}

export class NavigateBackwardsAction extends Action2 {

	static readonly ID = 'workbench.action.navigateBack';
	static readonly LABEL = localize('navigateBack', "Go Back");

	constructor() {
		super({
			id: NavigateBackwardsAction.ID,
			title: { value: localize('navigateBack', "Go Back"), original: 'Go Back', mnemonicTitle: localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back") },
			f1: true,
			precondition: ContextKeyExpr.has('canNavigateBack'),
			icon: Codicon.arrowLeft,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
				mac: { primary: KeyMod.WinCtrl | KeyCode.Minus },
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus }
			},
			menu: [
				{ id: MenuId.MenubarGoMenu, group: '1_history_nav', order: 1 },
				{ id: MenuId.CommandCenter, order: 1 }
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goBack(GoFilter.NONE);
	}
}

export class NavigatePreviousAction extends Action {

	static readonly ID = 'workbench.action.navigateLast';
	static readonly LABEL = localize('navigatePrevious', "Go Previous");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goPrevious(GoFilter.NONE);
	}
}

export class NavigateForwardInEditsAction extends Action {

	static readonly ID = 'workbench.action.navigateForwardInEditLocations';
	static readonly LABEL = localize('navigateForwardInEdits', "Go Forward in Edit Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goForward(GoFilter.EDITS);
	}
}

export class NavigateBackwardsInEditsAction extends Action {

	static readonly ID = 'workbench.action.navigateBackInEditLocations';
	static readonly LABEL = localize('navigateBackInEdits', "Go Back in Edit Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goBack(GoFilter.EDITS);
	}
}

export class NavigatePreviousInEditsAction extends Action {

	static readonly ID = 'workbench.action.navigatePreviousInEditLocations';
	static readonly LABEL = localize('navigatePreviousInEdits', "Go Previous in Edit Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goPrevious(GoFilter.EDITS);
	}
}

export class NavigateToLastEditLocationAction extends Action {

	static readonly ID = 'workbench.action.navigateToLastEditLocation';
	static readonly LABEL = localize('navigateToLastEditLocation', "Go to Last Edit Location");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goLast(GoFilter.EDITS);
	}
}

export class NavigateForwardInNavigationsAction extends Action {

	static readonly ID = 'workbench.action.navigateForwardInNavigationLocations';
	static readonly LABEL = localize('navigateForwardInNavigations', "Go Forward in Navigation Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goForward(GoFilter.NAVIGATION);
	}
}

export class NavigateBackwardsInNavigationsAction extends Action {

	static readonly ID = 'workbench.action.navigateBackInNavigationLocations';
	static readonly LABEL = localize('navigateBackInNavigations', "Go Back in Navigation Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goBack(GoFilter.NAVIGATION);
	}
}

export class NavigatePreviousInNavigationsAction extends Action {

	static readonly ID = 'workbench.action.navigatePreviousInNavigationLocations';
	static readonly LABEL = localize('navigatePreviousInNavigationLocations', "Go Previous in Navigation Locations");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goPrevious(GoFilter.NAVIGATION);
	}
}

export class NavigateToLastNavigationLocationAction extends Action {

	static readonly ID = 'workbench.action.navigateToLastNavigationLocation';
	static readonly LABEL = localize('navigateToLastNavigationLocation', "Go to Last Navigation Location");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.goLast(GoFilter.NAVIGATION);
	}
}

export class ReopenClosedEditorAction extends Action {

	static readonly ID = 'workbench.action.reopenClosedEditor';
	static readonly LABEL = localize('reopenClosedEditor', "Reopen Closed Editor");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		await this.historyService.reopenLastClosedEditor();
	}
}

export class ClearRecentFilesAction extends Action {

	static readonly ID = 'workbench.action.clearRecentFiles';
	static readonly LABEL = localize('clearRecentFiles', "Clear Recently Opened");

	constructor(
		id: string,
		label: string,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {

		// Ask for confirmation
		const { confirmed } = await this.dialogService.confirm({
			message: localize('confirmClearRecentsMessage', "Do you want to clear all recently opened files and workspaces?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear"),
			type: 'warning'
		});

		if (!confirmed) {
			return;
		}

		// Clear global recently opened
		this.workspacesService.clearRecentlyOpened();

		// Clear workspace specific recently opened
		this.historyService.clearRecentlyOpened();
	}
}

export class ShowEditorsInActiveGroupByMostRecentlyUsedAction extends Action {

	static readonly ID = 'workbench.action.showEditorsInActiveGroup';
	static readonly LABEL = localize('showEditorsInActiveGroup', "Show Editors in Active Group By Most Recently Used");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
	}
}

export class ShowAllEditorsByAppearanceAction extends Action {

	static readonly ID = 'workbench.action.showAllEditors';
	static readonly LABEL = localize('showAllEditors', "Show All Editors By Appearance");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.quickInputService.quickAccess.show(AllEditorsByAppearanceQuickAccess.PREFIX);
	}
}

export class ShowAllEditorsByMostRecentlyUsedAction extends Action {

	static readonly ID = 'workbench.action.showAllEditorsByMostRecentlyUsed';
	static readonly LABEL = localize('showAllEditorsByMostRecentlyUsed', "Show All Editors By Most Recently Used");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.quickInputService.quickAccess.show(AllEditorsByMostRecentlyUsedQuickAccess.PREFIX);
	}
}

abstract class AbstractQuickAccessEditorAction extends Action {

	constructor(
		id: string,
		label: string,
		private prefix: string,
		private itemActivation: ItemActivation | undefined,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const keybindings = this.keybindingService.lookupKeybindings(this.id);

		this.quickInputService.quickAccess.show(this.prefix, {
			quickNavigateConfiguration: { keybindings },
			itemActivation: this.itemActivation
		});
	}
}

export class QuickAccessPreviousRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {

	static readonly ID = 'workbench.action.quickOpenPreviousRecentlyUsedEditor';
	static readonly LABEL = localize('quickOpenPreviousRecentlyUsedEditor', "Quick Open Previous Recently Used Editor");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined, quickInputService, keybindingService);
	}
}

export class QuickAccessLeastRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {

	static readonly ID = 'workbench.action.quickOpenLeastRecentlyUsedEditor';
	static readonly LABEL = localize('quickOpenLeastRecentlyUsedEditor', "Quick Open Least Recently Used Editor");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined, quickInputService, keybindingService);
	}
}

export class QuickAccessPreviousRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {

	static readonly ID = 'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup';
	static readonly LABEL = localize('quickOpenPreviousRecentlyUsedEditorInGroup', "Quick Open Previous Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined, quickInputService, keybindingService);
	}
}

export class QuickAccessLeastRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {

	static readonly ID = 'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup';
	static readonly LABEL = localize('quickOpenLeastRecentlyUsedEditorInGroup', "Quick Open Least Recently Used Editor in Group");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, ItemActivation.LAST, quickInputService, keybindingService);
	}
}

export class QuickAccessPreviousEditorFromHistoryAction extends Action {

	static readonly ID = 'workbench.action.openPreviousEditorFromHistory';
	static readonly LABEL = localize('navigateEditorHistoryByInput', "Quick Open Previous Editor from History");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const keybindings = this.keybindingService.lookupKeybindings(this.id);

		// Enforce to activate the first item in quick access if
		// the currently active editor group has n editor opened
		let itemActivation: ItemActivation | undefined = undefined;
		if (this.editorGroupService.activeGroup.count === 0) {
			itemActivation = ItemActivation.FIRST;
		}

		this.quickInputService.quickAccess.show('', { quickNavigateConfiguration: { keybindings }, itemActivation });
	}
}

export class OpenNextRecentlyUsedEditorAction extends Action {

	static readonly ID = 'workbench.action.openNextRecentlyUsedEditor';
	static readonly LABEL = localize('openNextRecentlyUsedEditor', "Open Next Recently Used Editor");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.historyService.openNextRecentlyUsedEditor();
	}
}

export class OpenPreviousRecentlyUsedEditorAction extends Action {

	static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditor';
	static readonly LABEL = localize('openPreviousRecentlyUsedEditor', "Open Previous Recently Used Editor");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.historyService.openPreviouslyUsedEditor();
	}
}

export class OpenNextRecentlyUsedEditorInGroupAction extends Action {

	static readonly ID = 'workbench.action.openNextRecentlyUsedEditorInGroup';
	static readonly LABEL = localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor In Group");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.historyService.openNextRecentlyUsedEditor(this.editorGroupsService.activeGroup.id);
	}
}

export class OpenPreviousRecentlyUsedEditorInGroupAction extends Action {

	static readonly ID = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
	static readonly LABEL = localize('openPreviousRecentlyUsedEditorInGroup', "Open Previous Recently Used Editor In Group");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.historyService.openPreviouslyUsedEditor(this.editorGroupsService.activeGroup.id);
	}
}

export class ClearEditorHistoryAction extends Action {

	static readonly ID = 'workbench.action.clearEditorHistory';
	static readonly LABEL = localize('clearEditorHistory', "Clear Editor History");

	constructor(
		id: string,
		label: string,
		@IHistoryService private readonly historyService: IHistoryService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {

		// Ask for confirmation
		const { confirmed } = await this.dialogService.confirm({
			message: localize('confirmClearEditorHistoryMessage', "Do you want to clear the history of recently opened editors?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear"),
			type: 'warning'
		});

		if (!confirmed) {
			return;
		}

		// Clear editor history
		this.historyService.clear();
	}
}

export class MoveEditorLeftInGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorLeftInGroup';
	static readonly LABEL = localize('moveEditorLeft', "Move Editor Left");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorRightInGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorRightInGroup';
	static readonly LABEL = localize('moveEditorRight', "Move Editor Right");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToPreviousGroup';
	static readonly LABEL = localize('moveEditorToPreviousGroup', "Move Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'previous', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToNextGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToNextGroup';
	static readonly LABEL = localize('moveEditorToNextGroup', "Move Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'next', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToAboveGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToAboveGroup';
	static readonly LABEL = localize('moveEditorToAboveGroup', "Move Editor into Group Above");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'up', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToBelowGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToBelowGroup';
	static readonly LABEL = localize('moveEditorToBelowGroup', "Move Editor into Group Below");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'down', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLeftGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToLeftGroup';
	static readonly LABEL = localize('moveEditorToLeftGroup', "Move Editor into Left Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToRightGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToRightGroup';
	static readonly LABEL = localize('moveEditorToRightGroup', "Move Editor into Right Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToFirstGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToFirstGroup';
	static readonly LABEL = localize('moveEditorToFirstGroup', "Move Editor into First Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'first', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLastGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.moveEditorToLastGroup';
	static readonly LABEL = localize('moveEditorToLastGroup', "Move Editor into Last Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, MOVE_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'last', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToPreviousGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToPreviousGroup';
	static readonly LABEL = localize('splitEditorToPreviousGroup', "Split Editor into Previous Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'previous', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToNextGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToNextGroup';
	static readonly LABEL = localize('splitEditorToNextGroup', "Split Editor into Next Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'next', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToAboveGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToAboveGroup';
	static readonly LABEL = localize('splitEditorToAboveGroup', "Split Editor into Group Above");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'up', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToBelowGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToBelowGroup';
	static readonly LABEL = localize('splitEditorToBelowGroup', "Split Editor into Group Below");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'down', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLeftGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToLeftGroup';
	static readonly LABEL = localize('splitEditorToLeftGroup', "Split Editor into Left Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'left', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToRightGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToRightGroup';
	static readonly LABEL = localize('splitEditorToRightGroup', "Split Editor into Right Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'right', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToFirstGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToFirstGroup';
	static readonly LABEL = localize('splitEditorToFirstGroup', "Split Editor into First Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'first', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLastGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToLastGroup';
	static readonly LABEL = localize('splitEditorToLastGroup', "Split Editor into Last Group");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, COPY_ACTIVE_EDITOR_COMMAND_ID, commandService, { to: 'last', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class EditorLayoutSingleAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutSingle';
	static readonly LABEL = localize('editorLayoutSingle', "Single Column Editor Layout");

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
	static readonly LABEL = localize('editorLayoutTwoColumns', "Two Columns Editor Layout");

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
	static readonly LABEL = localize('editorLayoutThreeColumns', "Three Columns Editor Layout");

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
	static readonly LABEL = localize('editorLayoutTwoRows', "Two Rows Editor Layout");

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
	static readonly LABEL = localize('editorLayoutThreeRows', "Three Rows Editor Layout");

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
	static readonly LABEL = localize('editorLayoutTwoByTwoGrid', "Grid Editor Layout (2x2)");

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
	static readonly LABEL = localize('editorLayoutTwoColumnsBottom', "Two Columns Bottom Editor Layout");

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
	static readonly LABEL = localize('editorLayoutTwoRowsRight', "Two Rows Right Editor Layout");

	constructor(
		id: string,
		label: string,
		@ICommandService commandService: ICommandService
	) {
		super(id, label, LAYOUT_EDITOR_GROUPS_COMMAND_ID, commandService, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL } as EditorGroupLayout);
	}
}

abstract class AbstractCreateEditorGroupAction extends Action {

	constructor(
		id: string,
		label: string,
		private direction: GroupDirection,
		private editorGroupService: IEditorGroupsService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.editorGroupService.addGroup(this.editorGroupService.activeGroup, this.direction, { activate: true });
	}
}

export class NewEditorGroupLeftAction extends AbstractCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupLeft';
	static readonly LABEL = localize('newEditorLeft', "New Editor Group to the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.LEFT, editorGroupService);
	}
}

export class NewEditorGroupRightAction extends AbstractCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupRight';
	static readonly LABEL = localize('newEditorRight', "New Editor Group to the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.RIGHT, editorGroupService);
	}
}

export class NewEditorGroupAboveAction extends AbstractCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupAbove';
	static readonly LABEL = localize('newEditorAbove', "New Editor Group Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.UP, editorGroupService);
	}
}

export class NewEditorGroupBelowAction extends AbstractCreateEditorGroupAction {

	static readonly ID = 'workbench.action.newGroupBelow';
	static readonly LABEL = localize('newEditorBelow', "New Editor Group Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService
	) {
		super(id, label, GroupDirection.DOWN, editorGroupService);
	}
}

export class ToggleEditorTypeAction extends Action {

	static readonly ID = 'workbench.action.toggleEditorType';
	static readonly LABEL = localize('workbench.action.toggleEditorType', "Toggle Editor Type");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (!activeEditorPane) {
			return;
		}

		const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
		if (!activeEditorResource) {
			return;
		}

		const editorIds = this.editorResolverService.getEditors(activeEditorResource).map(editor => editor.id).filter(id => id !== activeEditorPane.input.editorId);
		if (editorIds.length === 0) {
			return;
		}

		// Replace the current editor with the next avaiable editor type
		await this.editorService.replaceEditors([
			{
				editor: activeEditorPane.input,
				replacement: {
					resource: activeEditorResource,
					options: {
						override: editorIds[0]
					}
				}
			}
		], activeEditorPane.group);
	}
}

export class ReOpenInTextEditorAction extends Action {

	static readonly ID = 'workbench.action.reopenTextEditor';
	static readonly LABEL = localize('workbench.action.reopenTextEditor', "Reopen Editor With Text Editor");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const activeEditorPane = this.editorService.activeEditorPane;
		if (!activeEditorPane) {
			return;
		}

		const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
		if (!activeEditorResource) {
			return;
		}

		// Replace the current editor with the text editor
		await this.editorService.replaceEditors([
			{
				editor: activeEditorPane.input,
				replacement: {
					resource: activeEditorResource,
					options: {
						override: DEFAULT_EDITOR_ASSOCIATION.id
					}
				}
			}
		], activeEditorPane.group);
	}
}
