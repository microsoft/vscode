/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { firstOrDefault } from 'vs/base/common/arrays';
import { IEditorIdentifier, IEditorCommandsContext, CloseDirection, SaveReason, EditorsOrder, EditorInputCapabilities, DEFAULT_EDITOR_ASSOCIATION, GroupIdentifier, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { GoFilter, IHistoryService } from 'vs/workbench/services/history/common/history';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CLOSE_EDITOR_COMMAND_ID, MOVE_ACTIVE_EDITOR_COMMAND_ID, ActiveEditorMoveCopyArguments, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, COPY_ACTIVE_EDITOR_COMMAND_ID, SPLIT_EDITOR, TOGGLE_MAXIMIZE_EDITOR_GROUP, MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID as NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorGroupsService, IEditorGroup, GroupsArrangement, GroupLocation, GroupDirection, preferredSideBySideGroupDirection, IFindGroupScope, GroupOrientation, EditorGroupLayout, GroupsOrder, MergeGroupMode } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IFileDialogService, ConfirmResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ItemActivation, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { AllEditorsByMostRecentlyUsedQuickAccess, ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess } from 'vs/workbench/browser/parts/editor/editorQuickAccess';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { isLinux, isNative, isWindows } from 'vs/base/common/platform';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IKeybindingRule, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { ActiveEditorAvailableEditorIdsContext, ActiveEditorContext, ActiveEditorGroupEmptyContext, AuxiliaryBarVisibleContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, IsAuxiliaryWindowFocusedContext, MultipleEditorGroupsContext, SideBarVisibleContext } from 'vs/workbench/common/contextkeys';
import { getActiveDocument } from 'vs/base/browser/dom';
import { ICommandActionTitle } from 'vs/platform/action/common/action';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { resolveCommandsContext } from 'vs/workbench/browser/parts/editor/editorCommandsContext';
import { IListService } from 'vs/platform/list/browser/listService';

class ExecuteCommandAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly commandId: string,
		private readonly commandArgs?: unknown
	) {
		super(desc);
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);

		return commandService.executeCommand(this.commandId, this.commandArgs);
	}
}

abstract class AbstractSplitEditorAction extends Action2 {

	protected getDirection(configurationService: IConfigurationService): GroupDirection {
		return preferredSideBySideGroupDirection(configurationService);
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const configurationService = accessor.get(IConfigurationService);

		const direction = this.getDirection(configurationService);
		const commandContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));

		splitEditor(editorGroupsService, direction, commandContext);
	}
}

export class SplitEditorAction extends AbstractSplitEditorAction {

	static readonly ID = SPLIT_EDITOR;

	constructor() {
		super({
			id: SplitEditorAction.ID,
			title: localize2('splitEditor', 'Split Editor'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Backslash
			},
			category: Categories.View
		});
	}
}

export class SplitEditorOrthogonalAction extends AbstractSplitEditorAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorOrthogonal',
			title: localize2('splitEditorOrthogonal', 'Split Editor Orthogonal'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		});
	}

	protected override getDirection(configurationService: IConfigurationService): GroupDirection {
		const direction = preferredSideBySideGroupDirection(configurationService);

		return direction === GroupDirection.RIGHT ? GroupDirection.DOWN : GroupDirection.RIGHT;
	}
}

export class SplitEditorLeftAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: SPLIT_EDITOR_LEFT,
			title: localize2('splitEditorGroupLeft', 'Split Editor Left'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_LEFT);
	}
}

export class SplitEditorRightAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: SPLIT_EDITOR_RIGHT,
			title: localize2('splitEditorGroupRight', 'Split Editor Right'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_RIGHT);
	}
}

export class SplitEditorUpAction extends ExecuteCommandAction {

	static readonly LABEL = localize('splitEditorGroupUp', "Split Editor Up");

	constructor() {
		super({
			id: SPLIT_EDITOR_UP,
			title: localize2('splitEditorGroupUp', "Split Editor Up"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_UP);
	}
}

export class SplitEditorDownAction extends ExecuteCommandAction {

	static readonly LABEL = localize('splitEditorGroupDown', "Split Editor Down");

	constructor() {
		super({
			id: SPLIT_EDITOR_DOWN,
			title: localize2('splitEditorGroupDown', "Split Editor Down"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_DOWN);
	}
}

export class JoinTwoGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.joinTwoGroups',
			title: localize2('joinTwoGroups', 'Join Editor Group with Next Group'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor, context?: IEditorIdentifier): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		let sourceGroup: IEditorGroup | undefined;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = editorGroupService.activeGroup;
		}

		if (sourceGroup) {
			const targetGroupDirections = [GroupDirection.RIGHT, GroupDirection.DOWN, GroupDirection.LEFT, GroupDirection.UP];
			for (const targetGroupDirection of targetGroupDirections) {
				const targetGroup = editorGroupService.findGroup({ direction: targetGroupDirection }, sourceGroup);
				if (targetGroup && sourceGroup !== targetGroup) {
					editorGroupService.mergeGroup(sourceGroup, targetGroup);

					break;
				}
			}
		}
	}
}

export class JoinAllGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.joinAllGroups',
			title: localize2('joinAllGroups', 'Join All Editor Groups'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.mergeAllGroups(editorGroupService.activeGroup);
	}
}

export class NavigateBetweenGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateEditorGroups',
			title: localize2('navigateEditorGroups', 'Navigate Between Editor Groups'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const nextGroup = editorGroupService.findGroup({ location: GroupLocation.NEXT }, editorGroupService.activeGroup, true);
		nextGroup?.focus();
	}
}

export class FocusActiveGroupAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.focusActiveEditorGroup',
			title: localize2('focusActiveEditorGroup', 'Focus Active Editor Group'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.activeGroup.focus();
	}
}

abstract class AbstractFocusGroupAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly scope: IFindGroupScope
	) {
		super(desc);
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const group = editorGroupService.findGroup(this.scope, editorGroupService.activeGroup, true);
		group?.focus();
	}
}

export class FocusFirstGroupAction extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusFirstEditorGroup',
			title: localize2('focusFirstEditorGroup', 'Focus First Editor Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Digit1
			},
			category: Categories.View
		}, { location: GroupLocation.FIRST });
	}
}

export class FocusLastGroupAction extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusLastEditorGroup',
			title: localize2('focusLastEditorGroup', 'Focus Last Editor Group'),
			f1: true,
			category: Categories.View
		}, { location: GroupLocation.LAST });
	}
}

export class FocusNextGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusNextGroup',
			title: localize2('focusNextGroup', 'Focus Next Editor Group'),
			f1: true,
			category: Categories.View
		}, { location: GroupLocation.NEXT });
	}
}

export class FocusPreviousGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusPreviousGroup',
			title: localize2('focusPreviousGroup', 'Focus Previous Editor Group'),
			f1: true,
			category: Categories.View
		}, { location: GroupLocation.PREVIOUS });
	}
}

export class FocusLeftGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusLeftGroup',
			title: localize2('focusLeftGroup', 'Focus Left Editor Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.LeftArrow)
			},
			category: Categories.View
		}, { direction: GroupDirection.LEFT });
	}
}

export class FocusRightGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusRightGroup',
			title: localize2('focusRightGroup', 'Focus Right Editor Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.RightArrow)
			},
			category: Categories.View
		}, { direction: GroupDirection.RIGHT });
	}
}

export class FocusAboveGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusAboveGroup',
			title: localize2('focusAboveGroup', 'Focus Editor Group Above'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.UpArrow)
			},
			category: Categories.View
		}, { direction: GroupDirection.UP });
	}
}

export class FocusBelowGroup extends AbstractFocusGroupAction {

	constructor() {
		super({
			id: 'workbench.action.focusBelowGroup',
			title: localize2('focusBelowGroup', 'Focus Editor Group Below'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.DownArrow)
			},
			category: Categories.View
		}, { direction: GroupDirection.DOWN });
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
		super(id, label, ThemeIcon.asClassName(Codicon.close));
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
		super(id, label, ThemeIcon.asClassName(Codicon.pinned));
	}

	override run(context?: IEditorCommandsContext): Promise<void> {
		return this.commandService.executeCommand(UNPIN_EDITOR_COMMAND_ID, undefined, context);
	}
}

export class CloseEditorTabAction extends Action {

	static readonly ID = 'workbench.action.closeActiveEditor';
	static readonly LABEL = localize('closeOneEditor', "Close");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label, ThemeIcon.asClassName(Codicon.close));
	}

	override async run(context?: IEditorCommandsContext): Promise<void> {
		const group = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
		if (!group) {
			// group mentioned in context does not exist
			return;
		}

		const targetEditor = context?.editorIndex !== undefined ? group.getEditorByIndex(context.editorIndex) : group.activeEditor;
		if (!targetEditor) {
			// No editor open or editor at index does not exist
			return;
		}

		const editors: EditorInput[] = [];
		if (group.isSelected(targetEditor)) {
			editors.push(...group.selectedEditors);
		} else {
			editors.push(targetEditor);
		}

		// Close specific editors in group
		for (const editor of editors) {
			await group.closeEditor(editor, { preserveFocus: context?.preserveFocus });
		}
	}
}

export class RevertAndCloseEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.revertAndCloseActiveEditor',
			title: localize2('revertAndCloseActiveEditor', 'Revert and Close Editor'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);

		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane) {
			const editor = activeEditorPane.input;
			const group = activeEditorPane.group;

			// first try a normal revert where the contents of the editor are restored
			try {
				await editorService.revert({ editor, groupId: group.id });
			} catch (error) {
				logService.error(error);

				// if that fails, since we are about to close the editor, we accept that
				// the editor cannot be reverted and instead do a soft revert that just
				// enables us to close the editor. With this, a user can always close a
				// dirty editor even when reverting fails.

				await editorService.revert({ editor, groupId: group.id }, { soft: true });
			}

			await group.closeEditor(editor);
		}
	}
}

export class CloseLeftEditorsInGroupAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.closeEditorsToTheLeft',
			title: localize2('closeEditorsToTheLeft', 'Close Editors to the Left in Group'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor, context?: IEditorIdentifier): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const { group, editor } = this.getTarget(editorGroupService, context);
		if (group && editor) {
			await group.closeEditors({ direction: CloseDirection.LEFT, except: editor, excludeSticky: true });
		}
	}

	private getTarget(editorGroupService: IEditorGroupsService, context?: IEditorIdentifier): { editor: EditorInput | null; group: IEditorGroup | undefined } {
		if (context) {
			return { editor: context.editor, group: editorGroupService.getGroup(context.groupId) };
		}

		// Fallback to active group
		return { group: editorGroupService.activeGroup, editor: editorGroupService.activeGroup.activeEditor };
	}
}

abstract class AbstractCloseAllAction extends Action2 {

	protected groupsToClose(editorGroupService: IEditorGroupsService): IEditorGroup[] {
		const groupsToClose: IEditorGroup[] = [];

		// Close editors in reverse order of their grid appearance so that the editor
		// group that is the first (top-left) remains. This helps to keep view state
		// for editors around that have been opened in this visually first group.
		const groups = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE);
		for (let i = groups.length - 1; i >= 0; i--) {
			groupsToClose.push(groups[i]);
		}

		return groupsToClose;
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const logService = accessor.get(ILogService);
		const progressService = accessor.get(IProgressService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const filesConfigurationService = accessor.get(IFilesConfigurationService);
		const fileDialogService = accessor.get(IFileDialogService);

		// Depending on the editor and auto save configuration,
		// split editors into buckets for handling confirmation

		const dirtyEditorsWithDefaultConfirm = new Set<IEditorIdentifier>();
		const dirtyAutoSaveOnFocusChangeEditors = new Set<IEditorIdentifier>();
		const dirtyAutoSaveOnWindowChangeEditors = new Set<IEditorIdentifier>();
		const editorsWithCustomConfirm = new Map<string /* typeId */, Set<IEditorIdentifier>>();

		for (const { editor, groupId } of editorService.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: this.excludeSticky })) {
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
			else if (!editor.hasCapability(EditorInputCapabilities.Untitled) && filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_FOCUS_CHANGE) {
				dirtyAutoSaveOnFocusChangeEditors.add({ editor, groupId });
			}

			// Windows, Linux: editor will be saved on window change
			// when a native dialog appears, so just track that separate
			// (see https://github.com/microsoft/vscode/issues/134250)
			else if ((isNative && (isWindows || isLinux)) && !editor.hasCapability(EditorInputCapabilities.Untitled) && filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_WINDOW_CHANGE) {
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

			await this.revealEditorsToConfirm(editors, editorGroupService); // help user make a decision by revealing editors

			const confirmation = await fileDialogService.showSaveConfirm(editors.map(({ editor }) => {
				if (editor instanceof SideBySideEditorInput) {
					return editor.primary.getName(); // prefer shorter names by using primary's name in this case
				}

				return editor.getName();
			}));

			switch (confirmation) {
				case ConfirmResult.CANCEL:
					return;
				case ConfirmResult.DONT_SAVE:
					await this.revertEditors(editorService, logService, progressService, editors);
					break;
				case ConfirmResult.SAVE:
					await editorService.save(editors, { reason: SaveReason.EXPLICIT });
					break;
			}
		}

		// 2.) Show custom confirm based dialog
		for (const [, editorIdentifiers] of editorsWithCustomConfirm) {
			const editors = Array.from(editorIdentifiers.values());

			await this.revealEditorsToConfirm(editors, editorGroupService); // help user make a decision by revealing editors

			const confirmation = await firstOrDefault(editors)?.editor.closeHandler?.confirm?.(editors);
			if (typeof confirmation === 'number') {
				switch (confirmation) {
					case ConfirmResult.CANCEL:
						return;
					case ConfirmResult.DONT_SAVE:
						await this.revertEditors(editorService, logService, progressService, editors);
						break;
					case ConfirmResult.SAVE:
						await editorService.save(editors, { reason: SaveReason.EXPLICIT });
						break;
				}
			}
		}

		// 3.) Save autosaveable editors (focus change)
		if (dirtyAutoSaveOnFocusChangeEditors.size > 0) {
			const editors = Array.from(dirtyAutoSaveOnFocusChangeEditors.values());

			await editorService.save(editors, { reason: SaveReason.FOCUS_CHANGE });
		}

		// 4.) Save autosaveable editors (window change)
		if (dirtyAutoSaveOnWindowChangeEditors.size > 0) {
			const editors = Array.from(dirtyAutoSaveOnWindowChangeEditors.values());

			await editorService.save(editors, { reason: SaveReason.WINDOW_CHANGE });
		}

		// 5.) Finally close all editors: even if an editor failed to
		// save or revert and still reports dirty, the editor part makes
		// sure to bring up another confirm dialog for those editors
		// specifically.
		return this.doCloseAll(editorGroupService);
	}

	private revertEditors(editorService: IEditorService, logService: ILogService, progressService: IProgressService, editors: IEditorIdentifier[]): Promise<void> {
		return progressService.withProgress({
			location: ProgressLocation.Window, 	// use window progress to not be too annoying about this operation
			delay: 800,							// delay so that it only appears when operation takes a long time
			title: localize('reverting', "Reverting Editors..."),
		}, () => this.doRevertEditors(editorService, logService, editors));
	}

	private async doRevertEditors(editorService: IEditorService, logService: ILogService, editors: IEditorIdentifier[]): Promise<void> {
		try {
			// We first attempt to revert all editors with `soft: false`, to ensure that
			// working copies revert to their state on disk. Even though we close editors,
			// it is possible that other parties hold a reference to the working copy
			// and expect it to be in a certain state after the editor is closed without
			// saving.
			await editorService.revert(editors);
		} catch (error) {
			logService.error(error);

			// if that fails, since we are about to close the editor, we accept that
			// the editor cannot be reverted and instead do a soft revert that just
			// enables us to close the editor. With this, a user can always close a
			// dirty editor even when reverting fails.
			await editorService.revert(editors, { soft: true });
		}
	}

	private async revealEditorsToConfirm(editors: ReadonlyArray<IEditorIdentifier>, editorGroupService: IEditorGroupsService): Promise<void> {
		try {
			const handledGroups = new Set<GroupIdentifier>();
			for (const { editor, groupId } of editors) {
				if (handledGroups.has(groupId)) {
					continue;
				}

				handledGroups.add(groupId);

				const group = editorGroupService.getGroup(groupId);
				await group?.openEditor(editor);
			}
		} catch (error) {
			// ignore any error as the revealing is just convinience
		}
	}

	protected abstract get excludeSticky(): boolean;

	protected async doCloseAll(editorGroupService: IEditorGroupsService): Promise<void> {
		await Promise.all(this.groupsToClose(editorGroupService).map(group => group.closeAllEditors({ excludeSticky: this.excludeSticky })));
	}
}

export class CloseAllEditorsAction extends AbstractCloseAllAction {

	static readonly ID = 'workbench.action.closeAllEditors';
	static readonly LABEL = localize2('closeAllEditors', 'Close All Editors');

	constructor() {
		super({
			id: CloseAllEditorsAction.ID,
			title: CloseAllEditorsAction.LABEL,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW)
			},
			icon: Codicon.closeAll,
			category: Categories.View
		});
	}

	protected get excludeSticky(): boolean {
		return true; // exclude sticky from this mass-closing operation
	}
}

export class CloseAllEditorGroupsAction extends AbstractCloseAllAction {

	constructor() {
		super({
			id: 'workbench.action.closeAllGroups',
			title: localize2('closeAllGroups', 'Close All Editor Groups'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW)
			},
			category: Categories.View
		});
	}

	protected get excludeSticky(): boolean {
		return false; // the intent to close groups means, even sticky are included
	}

	protected override async doCloseAll(editorGroupService: IEditorGroupsService): Promise<void> {
		await super.doCloseAll(editorGroupService);

		for (const groupToClose of this.groupsToClose(editorGroupService)) {
			editorGroupService.removeGroup(groupToClose);
		}
	}
}

export class CloseEditorsInOtherGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.closeEditorsInOtherGroups',
			title: localize2('closeEditorsInOtherGroups', 'Close Editors in Other Groups'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor, context?: IEditorIdentifier): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const groupToSkip = context ? editorGroupService.getGroup(context.groupId) : editorGroupService.activeGroup;
		await Promise.all(editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(async group => {
			if (groupToSkip && group.id === groupToSkip.id) {
				return;
			}

			return group.closeAllEditors({ excludeSticky: true });
		}));
	}
}

export class CloseEditorInAllGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.closeEditorInAllGroups',
			title: localize2('closeEditorInAllGroups', 'Close Editor in All Groups'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		const activeEditor = editorService.activeEditor;
		if (activeEditor) {
			await Promise.all(editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(group => group.closeEditor(activeEditor)));
		}
	}
}

abstract class AbstractMoveCopyGroupAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly direction: GroupDirection,
		private readonly isMove: boolean
	) {
		super(desc);
	}

	override async run(accessor: ServicesAccessor, context?: IEditorIdentifier): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		let sourceGroup: IEditorGroup | undefined;
		if (context && typeof context.groupId === 'number') {
			sourceGroup = editorGroupService.getGroup(context.groupId);
		} else {
			sourceGroup = editorGroupService.activeGroup;
		}

		if (sourceGroup) {
			let resultGroup: IEditorGroup | undefined = undefined;
			if (this.isMove) {
				const targetGroup = this.findTargetGroup(editorGroupService, sourceGroup);
				if (targetGroup) {
					resultGroup = editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
				}
			} else {
				resultGroup = editorGroupService.copyGroup(sourceGroup, sourceGroup, this.direction);
			}

			if (resultGroup) {
				editorGroupService.activateGroup(resultGroup);
			}
		}
	}

	private findTargetGroup(editorGroupService: IEditorGroupsService, sourceGroup: IEditorGroup): IEditorGroup | undefined {
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
			const targetNeighbourGroup = editorGroupService.findGroup({ direction: targetNeighbour }, sourceGroup);
			if (targetNeighbourGroup) {
				return targetNeighbourGroup;
			}
		}

		return undefined;
	}
}

abstract class AbstractMoveGroupAction extends AbstractMoveCopyGroupAction {

	constructor(
		desc: Readonly<IAction2Options>,
		direction: GroupDirection
	) {
		super(desc, direction, true);
	}
}

export class MoveGroupLeftAction extends AbstractMoveGroupAction {

	constructor() {
		super({
			id: 'workbench.action.moveActiveEditorGroupLeft',
			title: localize2('moveActiveGroupLeft', 'Move Editor Group Left'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.LeftArrow)
			},
			category: Categories.View
		}, GroupDirection.LEFT);
	}
}

export class MoveGroupRightAction extends AbstractMoveGroupAction {

	constructor() {
		super({
			id: 'workbench.action.moveActiveEditorGroupRight',
			title: localize2('moveActiveGroupRight', 'Move Editor Group Right'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.RightArrow)
			},
			category: Categories.View
		}, GroupDirection.RIGHT);
	}
}

export class MoveGroupUpAction extends AbstractMoveGroupAction {

	constructor() {
		super({
			id: 'workbench.action.moveActiveEditorGroupUp',
			title: localize2('moveActiveGroupUp', 'Move Editor Group Up'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.UpArrow)
			},
			category: Categories.View
		}, GroupDirection.UP);
	}
}

export class MoveGroupDownAction extends AbstractMoveGroupAction {

	constructor() {
		super({
			id: 'workbench.action.moveActiveEditorGroupDown',
			title: localize2('moveActiveGroupDown', 'Move Editor Group Down'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.DownArrow)
			},
			category: Categories.View
		}, GroupDirection.DOWN);
	}
}

abstract class AbstractDuplicateGroupAction extends AbstractMoveCopyGroupAction {

	constructor(
		desc: Readonly<IAction2Options>,
		direction: GroupDirection
	) {
		super(desc, direction, false);
	}
}

export class DuplicateGroupLeftAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupLeft',
			title: localize2('duplicateActiveGroupLeft', 'Duplicate Editor Group Left'),
			f1: true,
			category: Categories.View
		}, GroupDirection.LEFT);
	}
}

export class DuplicateGroupRightAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupRight',
			title: localize2('duplicateActiveGroupRight', 'Duplicate Editor Group Right'),
			f1: true,
			category: Categories.View
		}, GroupDirection.RIGHT);
	}
}

export class DuplicateGroupUpAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupUp',
			title: localize2('duplicateActiveGroupUp', 'Duplicate Editor Group Up'),
			f1: true,
			category: Categories.View
		}, GroupDirection.UP);
	}
}

export class DuplicateGroupDownAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupDown',
			title: localize2('duplicateActiveGroupDown', 'Duplicate Editor Group Down'),
			f1: true,
			category: Categories.View
		}, GroupDirection.DOWN);
	}
}

export class MinimizeOtherGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.minimizeOtherEditors',
			title: localize2('minimizeOtherEditorGroups', 'Expand Editor Group'),
			f1: true,
			category: Categories.View,
			precondition: MultipleEditorGroupsContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.arrangeGroups(GroupsArrangement.EXPAND);
	}
}

export class MinimizeOtherGroupsHideSidebarAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.minimizeOtherEditorsHideSidebar',
			title: localize2('minimizeOtherEditorGroupsHideSidebar', 'Expand Editor Group and Hide Side Bars'),
			f1: true,
			category: Categories.View,
			precondition: ContextKeyExpr.or(MultipleEditorGroupsContext, SideBarVisibleContext, AuxiliaryBarVisibleContext)
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		editorGroupService.arrangeGroups(GroupsArrangement.EXPAND);
	}
}

export class ResetGroupSizesAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.evenEditorWidths',
			title: localize2('evenEditorGroups', 'Reset Editor Group Sizes'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.arrangeGroups(GroupsArrangement.EVEN);
	}
}

export class ToggleGroupSizesAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleEditorWidths',
			title: localize2('toggleEditorWidths', 'Toggle Editor Group Sizes'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.toggleExpandGroup();
	}
}

export class MaximizeGroupHideSidebarAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.maximizeEditorHideSidebar',
			title: localize2('maximizeEditorHideSidebar', 'Maximize Editor Group and Hide Side Bars'),
			f1: true,
			category: Categories.View,
			precondition: ContextKeyExpr.or(ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext), SideBarVisibleContext, AuxiliaryBarVisibleContext)
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);

		if (editorService.activeEditor) {
			layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			editorGroupService.arrangeGroups(GroupsArrangement.MAXIMIZE);
		}
	}
}

export class ToggleMaximizeEditorGroupAction extends Action2 {

	constructor() {
		super({
			id: TOGGLE_MAXIMIZE_EDITOR_GROUP,
			title: localize2('toggleMaximizeEditorGroup', 'Toggle Maximize Editor Group'),
			f1: true,
			category: Categories.View,
			precondition: ContextKeyExpr.or(EditorPartMultipleEditorGroupsContext, EditorPartMaximizedEditorGroupContext),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyM),
			},
			menu: [{
				id: MenuId.EditorTitle,
				order: -10000, // towards the front
				group: 'navigation',
				when: EditorPartMaximizedEditorGroupContext
			},
			{
				id: MenuId.EmptyEditorGroup,
				order: -10000, // towards the front
				group: 'navigation',
				when: EditorPartMaximizedEditorGroupContext
			}],
			icon: Codicon.screenFull,
			toggled: EditorPartMaximizedEditorGroupContext,
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);

		const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
		if (resolvedContext.groupedEditors.length) {
			editorGroupsService.toggleMaximizeGroup(resolvedContext.groupedEditors[0].group);
		}
	}
}

abstract class AbstractNavigateEditorAction extends Action2 {

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const result = this.navigate(editorGroupService);
		if (!result) {
			return;
		}

		const { groupId, editor } = result;
		if (!editor) {
			return;
		}

		const group = editorGroupService.getGroup(groupId);
		if (group) {
			await group.openEditor(editor);
		}
	}

	protected abstract navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier | undefined;
}

export class OpenNextEditor extends AbstractNavigateEditorAction {

	constructor() {
		super({
			id: 'workbench.action.nextEditor',
			title: localize2('openNextEditor', 'Open Next Editor'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.PageDown,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight]
				}
			},
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier | undefined {

		// Navigate in active group if possible
		const activeGroup = editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
		if (activeEditorIndex + 1 < activeGroupEditors.length) {
			return { editor: activeGroupEditors[activeEditorIndex + 1], groupId: activeGroup.id };
		}

		// Otherwise try in next group that has editors
		const handledGroups = new Set<number>();
		let currentGroup: IEditorGroup | undefined = editorGroupService.activeGroup;
		while (currentGroup && !handledGroups.has(currentGroup.id)) {
			currentGroup = editorGroupService.findGroup({ location: GroupLocation.NEXT }, currentGroup, true);
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

	constructor() {
		super({
			id: 'workbench.action.previousEditor',
			title: localize2('openPreviousEditor', 'Open Previous Editor'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.PageUp,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft]
				}
			},
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier | undefined {

		// Navigate in active group if possible
		const activeGroup = editorGroupService.activeGroup;
		const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
		const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
		if (activeEditorIndex > 0) {
			return { editor: activeGroupEditors[activeEditorIndex - 1], groupId: activeGroup.id };
		}

		// Otherwise try in previous group that has editors
		const handledGroups = new Set<number>();
		let currentGroup: IEditorGroup | undefined = editorGroupService.activeGroup;
		while (currentGroup && !handledGroups.has(currentGroup.id)) {
			currentGroup = editorGroupService.findGroup({ location: GroupLocation.PREVIOUS }, currentGroup, true);
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

	constructor() {
		super({
			id: 'workbench.action.nextEditorInGroup',
			title: localize2('nextEditorInGroup', 'Open Next Editor in Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageDown),
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow)
				}
			},
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier {
		const group = editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;

		return { editor: index + 1 < editors.length ? editors[index + 1] : editors[0], groupId: group.id };
	}
}

export class OpenPreviousEditorInGroup extends AbstractNavigateEditorAction {

	constructor() {
		super({
			id: 'workbench.action.previousEditorInGroup',
			title: localize2('openPreviousEditorInGroup', 'Open Previous Editor in Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageUp),
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow)
				}
			},
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier {
		const group = editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
		const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;

		return { editor: index > 0 ? editors[index - 1] : editors[editors.length - 1], groupId: group.id };
	}
}

export class OpenFirstEditorInGroup extends AbstractNavigateEditorAction {

	constructor() {
		super({
			id: 'workbench.action.firstEditorInGroup',
			title: localize2('firstEditorInGroup', 'Open First Editor in Group'),
			f1: true,
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier {
		const group = editorGroupService.activeGroup;
		const editors = group.getEditors(EditorsOrder.SEQUENTIAL);

		return { editor: editors[0], groupId: group.id };
	}
}

export class OpenLastEditorInGroup extends AbstractNavigateEditorAction {

	constructor() {
		super({
			id: 'workbench.action.lastEditorInGroup',
			title: localize2('lastEditorInGroup', 'Open Last Editor in Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.Digit0,
				secondary: [KeyMod.CtrlCmd | KeyCode.Digit9],
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Digit0,
					secondary: [KeyMod.CtrlCmd | KeyCode.Digit9]
				}
			},
			category: Categories.View
		});
	}

	protected navigate(editorGroupService: IEditorGroupsService): IEditorIdentifier {
		const group = editorGroupService.activeGroup;
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
			title: {
				...localize2('navigateForward', "Go Forward"),
				mnemonicTitle: localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward")
			},
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
			title: {
				...localize2('navigateBack', "Go Back"),
				mnemonicTitle: localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back")
			},
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

export class NavigatePreviousAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateLast',
			title: localize2('navigatePrevious', 'Go Previous'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goPrevious(GoFilter.NONE);
	}
}

export class NavigateForwardInEditsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateForwardInEditLocations',
			title: localize2('navigateForwardInEdits', 'Go Forward in Edit Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goForward(GoFilter.EDITS);
	}
}

export class NavigateBackwardsInEditsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateBackInEditLocations',
			title: localize2('navigateBackInEdits', 'Go Back in Edit Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goBack(GoFilter.EDITS);
	}
}

export class NavigatePreviousInEditsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigatePreviousInEditLocations',
			title: localize2('navigatePreviousInEdits', 'Go Previous in Edit Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goPrevious(GoFilter.EDITS);
	}
}

export class NavigateToLastEditLocationAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateToLastEditLocation',
			title: localize2('navigateToLastEditLocation', 'Go to Last Edit Location'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyQ)
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goLast(GoFilter.EDITS);
	}
}

export class NavigateForwardInNavigationsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateForwardInNavigationLocations',
			title: localize2('navigateForwardInNavigations', 'Go Forward in Navigation Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goForward(GoFilter.NAVIGATION);
	}
}

export class NavigateBackwardsInNavigationsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateBackInNavigationLocations',
			title: localize2('navigateBackInNavigations', 'Go Back in Navigation Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goBack(GoFilter.NAVIGATION);
	}
}

export class NavigatePreviousInNavigationsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigatePreviousInNavigationLocations',
			title: localize2('navigatePreviousInNavigationLocations', 'Go Previous in Navigation Locations'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goPrevious(GoFilter.NAVIGATION);
	}
}

export class NavigateToLastNavigationLocationAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateToLastNavigationLocation',
			title: localize2('navigateToLastNavigationLocation', 'Go to Last Navigation Location'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.goLast(GoFilter.NAVIGATION);
	}
}

export class ReopenClosedEditorAction extends Action2 {

	static readonly ID = 'workbench.action.reopenClosedEditor';

	constructor() {
		super({
			id: ReopenClosedEditorAction.ID,
			title: localize2('reopenClosedEditor', 'Reopen Closed Editor'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
			},
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		await historyService.reopenLastClosedEditor();
	}
}

export class ClearRecentFilesAction extends Action2 {

	static readonly ID = 'workbench.action.clearRecentFiles';

	constructor() {
		super({
			id: ClearRecentFilesAction.ID,
			title: localize2('clearRecentFiles', 'Clear Recently Opened...'),
			f1: true,
			category: Categories.File
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const workspacesService = accessor.get(IWorkspacesService);
		const historyService = accessor.get(IHistoryService);

		// Ask for confirmation
		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('confirmClearRecentsMessage', "Do you want to clear all recently opened files and workspaces?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		});

		if (!confirmed) {
			return;
		}

		// Clear global recently opened
		workspacesService.clearRecentlyOpened();

		// Clear workspace specific recently opened
		historyService.clearRecentlyOpened();
	}
}

export class ShowEditorsInActiveGroupByMostRecentlyUsedAction extends Action2 {

	static readonly ID = 'workbench.action.showEditorsInActiveGroup';

	constructor() {
		super({
			id: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID,
			title: localize2('showEditorsInActiveGroup', 'Show Editors in Active Group By Most Recently Used'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
	}
}

export class ShowAllEditorsByAppearanceAction extends Action2 {

	static readonly ID = 'workbench.action.showAllEditors';

	constructor() {
		super({
			id: ShowAllEditorsByAppearanceAction.ID,
			title: localize2('showAllEditors', 'Show All Editors By Appearance'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyP),
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab
				}
			},
			category: Categories.File
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(AllEditorsByAppearanceQuickAccess.PREFIX);
	}
}

export class ShowAllEditorsByMostRecentlyUsedAction extends Action2 {

	static readonly ID = 'workbench.action.showAllEditorsByMostRecentlyUsed';

	constructor() {
		super({
			id: ShowAllEditorsByMostRecentlyUsedAction.ID,
			title: localize2('showAllEditorsByMostRecentlyUsed', 'Show All Editors By Most Recently Used'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(AllEditorsByMostRecentlyUsedQuickAccess.PREFIX);
	}
}

abstract class AbstractQuickAccessEditorAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly prefix: string,
		private readonly itemActivation: ItemActivation | undefined,
	) {
		super(desc);
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);

		const keybindings = keybindingService.lookupKeybindings(this.desc.id);

		quickInputService.quickAccess.show(this.prefix, {
			quickNavigateConfiguration: { keybindings },
			itemActivation: this.itemActivation
		});
	}
}

export class QuickAccessPreviousRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {

	constructor() {
		super({
			id: 'workbench.action.quickOpenPreviousRecentlyUsedEditor',
			title: localize2('quickOpenPreviousRecentlyUsedEditor', 'Quick Open Previous Recently Used Editor'),
			f1: true,
			category: Categories.View
		}, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
	}
}

export class QuickAccessLeastRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {

	constructor() {
		super({
			id: 'workbench.action.quickOpenLeastRecentlyUsedEditor',
			title: localize2('quickOpenLeastRecentlyUsedEditor', 'Quick Open Least Recently Used Editor'),
			f1: true,
			category: Categories.View
		}, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
	}
}

export class QuickAccessPreviousRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {

	constructor() {
		super({
			id: 'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
			title: localize2('quickOpenPreviousRecentlyUsedEditorInGroup', 'Quick Open Previous Recently Used Editor in Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Tab,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.Tab
				}
			},
			precondition: ActiveEditorGroupEmptyContext.toNegated(),
			category: Categories.View
		}, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
	}
}

export class QuickAccessLeastRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {

	constructor() {
		super({
			id: 'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup',
			title: localize2('quickOpenLeastRecentlyUsedEditorInGroup', 'Quick Open Least Recently Used Editor in Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab
				}
			},
			precondition: ActiveEditorGroupEmptyContext.toNegated(),
			category: Categories.View
		}, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, ItemActivation.LAST);
	}
}

export class QuickAccessPreviousEditorFromHistoryAction extends Action2 {

	private static readonly ID = 'workbench.action.openPreviousEditorFromHistory';

	constructor() {
		super({
			id: QuickAccessPreviousEditorFromHistoryAction.ID,
			title: localize2('navigateEditorHistoryByInput', 'Quick Open Previous Editor from History'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		const keybindings = keybindingService.lookupKeybindings(QuickAccessPreviousEditorFromHistoryAction.ID);

		// Enforce to activate the first item in quick access if
		// the currently active editor group has n editor opened
		let itemActivation: ItemActivation | undefined = undefined;
		if (editorGroupService.activeGroup.count === 0) {
			itemActivation = ItemActivation.FIRST;
		}

		quickInputService.quickAccess.show('', { quickNavigateConfiguration: { keybindings }, itemActivation });
	}
}

export class OpenNextRecentlyUsedEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.openNextRecentlyUsedEditor',
			title: localize2('openNextRecentlyUsedEditor', 'Open Next Recently Used Editor'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		historyService.openNextRecentlyUsedEditor();
	}
}

export class OpenPreviousRecentlyUsedEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.openPreviousRecentlyUsedEditor',
			title: localize2('openPreviousRecentlyUsedEditor', 'Open Previous Recently Used Editor'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);

		historyService.openPreviouslyUsedEditor();
	}
}

export class OpenNextRecentlyUsedEditorInGroupAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
			title: localize2('openNextRecentlyUsedEditorInGroup', 'Open Next Recently Used Editor In Group'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);
		const editorGroupsService = accessor.get(IEditorGroupsService);

		historyService.openNextRecentlyUsedEditor(editorGroupsService.activeGroup.id);
	}
}

export class OpenPreviousRecentlyUsedEditorInGroupAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
			title: localize2('openPreviousRecentlyUsedEditorInGroup', 'Open Previous Recently Used Editor In Group'),
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const historyService = accessor.get(IHistoryService);
		const editorGroupsService = accessor.get(IEditorGroupsService);

		historyService.openPreviouslyUsedEditor(editorGroupsService.activeGroup.id);
	}
}

export class ClearEditorHistoryAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.clearEditorHistory',
			title: localize2('clearEditorHistory', 'Clear Editor History'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const historyService = accessor.get(IHistoryService);

		// Ask for confirmation
		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('confirmClearEditorHistoryMessage', "Do you want to clear the history of recently opened editors?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		});

		if (!confirmed) {
			return;
		}

		// Clear editor history
		historyService.clear();
	}
}

export class MoveEditorLeftInGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorLeftInGroup',
			title: localize2('moveEditorLeft', 'Move Editor Left'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp,
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow)
				}
			},
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'left' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorRightInGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorRightInGroup',
			title: localize2('moveEditorRight', 'Move Editor Right'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown,
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow)
				}
			},
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'right' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToPreviousGroup',
			title: localize2('moveEditorToPreviousGroup', 'Move Editor into Previous Group'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow
				}
			},
			f1: true,
			category: Categories.View,
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToNextGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToNextGroup',
			title: localize2('moveEditorToNextGroup', 'Move Editor into Next Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToAboveGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToAboveGroup',
			title: localize2('moveEditorToAboveGroup', 'Move Editor into Group Above'),
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'up', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToBelowGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToBelowGroup',
			title: localize2('moveEditorToBelowGroup', 'Move Editor into Group Below'),
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'down', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLeftGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToLeftGroup',
			title: localize2('moveEditorToLeftGroup', 'Move Editor into Left Group'),
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'left', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToRightGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToRightGroup',
			title: localize2('moveEditorToRightGroup', 'Move Editor into Right Group'),
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'right', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToFirstGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToFirstGroup',
			title: localize2('moveEditorToFirstGroup', 'Move Editor into First Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit1,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit1
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLastGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToLastGroup',
			title: localize2('moveEditorToLastGroup', 'Move Editor into Last Group'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit9,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit9
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToPreviousGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToPreviousGroup',
			title: localize2('splitEditorToPreviousGroup', 'Split Editor into Previous Group'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToNextGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToNextGroup',
			title: localize2('splitEditorToNextGroup', 'Split Editor into Next Group'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToAboveGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToAboveGroup',
			title: localize2('splitEditorToAboveGroup', 'Split Editor into Group Above'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'up', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToBelowGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToBelowGroup',
			title: localize2('splitEditorToBelowGroup', 'Split Editor into Group Below'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'down', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLeftGroupAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.splitEditorToLeftGroup';
	static readonly LABEL = localize('splitEditorToLeftGroup', "Split Editor into Left Group");

	constructor() {
		super({
			id: 'workbench.action.splitEditorToLeftGroup',
			title: localize2('splitEditorToLeftGroup', "Split Editor into Left Group"),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'left', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToRightGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToRightGroup',
			title: localize2('splitEditorToRightGroup', 'Split Editor into Right Group'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'right', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToFirstGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToFirstGroup',
			title: localize2('splitEditorToFirstGroup', 'Split Editor into First Group'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLastGroupAction extends ExecuteCommandAction {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToLastGroup',
			title: localize2('splitEditorToLastGroup', 'Split Editor into Last Group'),
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' } satisfies ActiveEditorMoveCopyArguments);
	}
}

export class EditorLayoutSingleAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutSingle';

	constructor() {
		super({
			id: EditorLayoutSingleAction.ID,
			title: localize2('editorLayoutSingle', 'Single Column Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}], orientation: GroupOrientation.HORIZONTAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoColumns';

	constructor() {
		super({
			id: EditorLayoutTwoColumnsAction.ID,
			title: localize2('editorLayoutTwoColumns', 'Two Columns Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: GroupOrientation.HORIZONTAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutThreeColumnsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutThreeColumns';

	constructor() {
		super({
			id: EditorLayoutThreeColumnsAction.ID,
			title: localize2('editorLayoutThreeColumns', 'Three Columns Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: GroupOrientation.HORIZONTAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutTwoRowsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoRows';

	constructor() {
		super({
			id: EditorLayoutTwoRowsAction.ID,
			title: localize2('editorLayoutTwoRows', 'Two Rows Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: GroupOrientation.VERTICAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutThreeRowsAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutThreeRows';

	constructor() {
		super({
			id: EditorLayoutThreeRowsAction.ID,
			title: localize2('editorLayoutThreeRows', 'Three Rows Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutTwoByTwoGridAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoByTwoGrid';

	constructor() {
		super({
			id: EditorLayoutTwoByTwoGridAction.ID,
			title: localize2('editorLayoutTwoByTwoGrid', 'Grid Editor Layout (2x2)'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutTwoColumnsBottomAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoColumnsBottom';

	constructor() {
		super({
			id: EditorLayoutTwoColumnsBottomAction.ID,
			title: localize2('editorLayoutTwoColumnsBottom', 'Two Columns Bottom Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.VERTICAL } satisfies EditorGroupLayout);
	}
}

export class EditorLayoutTwoRowsRightAction extends ExecuteCommandAction {

	static readonly ID = 'workbench.action.editorLayoutTwoRowsRight';

	constructor() {
		super({
			id: EditorLayoutTwoRowsRightAction.ID,
			title: localize2('editorLayoutTwoRowsRight', 'Two Rows Right Editor Layout'),
			f1: true,
			category: Categories.View
		}, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL } satisfies EditorGroupLayout);
	}
}

abstract class AbstractCreateEditorGroupAction extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private readonly direction: GroupDirection
	) {
		super(desc);
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const layoutService = accessor.get(IWorkbenchLayoutService);

		// We are about to create a new empty editor group. We make an opiniated
		// decision here whether to focus that new editor group or not based
		// on what is currently focused. If focus is outside the editor area not
		// in the <body>, we do not focus, with the rationale that a user might
		// have focus on a tree/list with the intention to pick an element to
		// open in the new group from that tree/list.
		//
		// If focus is inside the editor area, we want to prevent the situation
		// of an editor having keyboard focus in an inactive editor group
		// (see https://github.com/microsoft/vscode/issues/189256)

		const activeDocument = getActiveDocument();
		const focusNewGroup = layoutService.hasFocus(Parts.EDITOR_PART) || activeDocument.activeElement === activeDocument.body;

		const group = editorGroupService.addGroup(editorGroupService.activeGroup, this.direction);
		editorGroupService.activateGroup(group);

		if (focusNewGroup) {
			group.focus();
		}
	}
}

export class NewEditorGroupLeftAction extends AbstractCreateEditorGroupAction {

	constructor() {
		super({
			id: 'workbench.action.newGroupLeft',
			title: localize2('newGroupLeft', 'New Editor Group to the Left'),
			f1: true,
			category: Categories.View
		}, GroupDirection.LEFT);
	}
}

export class NewEditorGroupRightAction extends AbstractCreateEditorGroupAction {

	constructor() {
		super({
			id: 'workbench.action.newGroupRight',
			title: localize2('newGroupRight', 'New Editor Group to the Right'),
			f1: true,
			category: Categories.View
		}, GroupDirection.RIGHT);
	}
}

export class NewEditorGroupAboveAction extends AbstractCreateEditorGroupAction {

	constructor() {
		super({
			id: 'workbench.action.newGroupAbove',
			title: localize2('newGroupAbove', 'New Editor Group Above'),
			f1: true,
			category: Categories.View
		}, GroupDirection.UP);
	}
}

export class NewEditorGroupBelowAction extends AbstractCreateEditorGroupAction {

	constructor() {
		super({
			id: 'workbench.action.newGroupBelow',
			title: localize2('newGroupBelow', 'New Editor Group Below'),
			f1: true,
			category: Categories.View
		}, GroupDirection.DOWN);
	}
}

export class ToggleEditorTypeAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleEditorType',
			title: localize2('toggleEditorType', 'Toggle Editor Type'),
			f1: true,
			category: Categories.View,
			precondition: ActiveEditorAvailableEditorIdsContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorResolverService = accessor.get(IEditorResolverService);

		const activeEditorPane = editorService.activeEditorPane;
		if (!activeEditorPane) {
			return;
		}

		const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
		if (!activeEditorResource) {
			return;
		}

		const editorIds = editorResolverService.getEditors(activeEditorResource).map(editor => editor.id).filter(id => id !== activeEditorPane.input.editorId);
		if (editorIds.length === 0) {
			return;
		}

		// Replace the current editor with the next avaiable editor type
		await editorService.replaceEditors([
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

export class ReOpenInTextEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.reopenTextEditor',
			title: localize2('reopenTextEditor', 'Reopen Editor With Text Editor'),
			f1: true,
			category: Categories.View,
			precondition: ActiveEditorAvailableEditorIdsContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const activeEditorPane = editorService.activeEditorPane;
		if (!activeEditorPane) {
			return;
		}

		const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
		if (!activeEditorResource) {
			return;
		}

		// Replace the current editor with the text editor
		await editorService.replaceEditors([
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


abstract class BaseMoveCopyEditorToNewWindowAction extends Action2 {

	constructor(
		id: string,
		title: ICommandActionTitle,
		keybinding: Omit<IKeybindingRule, 'id'> | undefined,
		private readonly move: boolean
	) {
		super({
			id,
			title,
			category: Categories.View,
			precondition: ActiveEditorContext,
			keybinding,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupService, accessor.get(IListService));
		if (!resolvedContext.groupedEditors.length) {
			return;
		}

		const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();

		// only single group supported for move/copy for now
		const { group, editors } = resolvedContext.groupedEditors[0];
		const options = { preserveFocus: resolvedContext.preserveFocus };
		const editorsWithOptions = editors.map(editor => ({ editor, options }));

		if (this.move) {
			group.moveEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
		} else {
			group.copyEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
		}

		auxiliaryEditorPart.activeGroup.focus();
	}
}

export class MoveEditorToNewWindowAction extends BaseMoveCopyEditorToNewWindowAction {

	constructor() {
		super(
			MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
			{
				...localize2('moveEditorToNewWindow', "Move Editor into New Window"),
				mnemonicTitle: localize({ key: 'miMoveEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Move Editor into New Window"),
			},
			undefined,
			true
		);
	}
}

export class CopyEditorToNewindowAction extends BaseMoveCopyEditorToNewWindowAction {

	constructor() {
		super(
			COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
			{
				...localize2('copyEditorToNewWindow', "Copy Editor into New Window"),
				mnemonicTitle: localize({ key: 'miCopyEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Copy Editor into New Window"),
			},
			{ primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyO), weight: KeybindingWeight.WorkbenchContrib },
			false
		);
	}
}

abstract class BaseMoveCopyEditorGroupToNewWindowAction extends Action2 {

	constructor(
		id: string,
		title: ICommandActionTitle,
		private readonly move: boolean
	) {
		super({
			id,
			title,
			category: Categories.View,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const activeGroup = editorGroupService.activeGroup;

		const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();

		editorGroupService.mergeGroup(activeGroup, auxiliaryEditorPart.activeGroup, {
			mode: this.move ? MergeGroupMode.MOVE_EDITORS : MergeGroupMode.COPY_EDITORS
		});

		auxiliaryEditorPart.activeGroup.focus();
	}
}

export class MoveEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {

	constructor() {
		super(
			MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
			{
				...localize2('moveEditorGroupToNewWindow', "Move Editor Group into New Window"),
				mnemonicTitle: localize({ key: 'miMoveEditorGroupToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Move Editor Group into New Window"),
			},
			true
		);
	}
}

export class CopyEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {

	constructor() {
		super(
			COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
			{
				...localize2('copyEditorGroupToNewWindow', "Copy Editor Group into New Window"),
				mnemonicTitle: localize({ key: 'miCopyEditorGroupToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Copy Editor Group into New Window"),
			},
			false
		);
	}
}

export class RestoreEditorsToMainWindowAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.restoreEditorsToMainWindow',
			title: {
				...localize2('restoreEditorsToMainWindow', "Restore Editors into Main Window"),
				mnemonicTitle: localize({ key: 'miRestoreEditorsToMainWindow', comment: ['&& denotes a mnemonic'] }, "&&Restore Editors into Main Window"),
			},
			f1: true,
			precondition: IsAuxiliaryWindowFocusedContext,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.mergeAllGroups(editorGroupService.mainPart.activeGroup);
	}
}

export class NewEmptyEditorWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
			title: {
				...localize2('newEmptyEditorWindow', "New Empty Editor Window"),
				mnemonicTitle: localize({ key: 'miNewEmptyEditorWindow', comment: ['&& denotes a mnemonic'] }, "&&New Empty Editor Window"),
			},
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
		auxiliaryEditorPart.activeGroup.focus();
	}
}
