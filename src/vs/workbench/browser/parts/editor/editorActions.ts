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
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';

class ExecuteCommandAction extends Action {

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

class ExecuteCommandAction2 extends Action2 {

	constructor(
		desc: Readonly<IAction2Options>,
		private commandId: string,
		private commandArgs?: unknown
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

	override async run(accessor: ServicesAccessor, context?: IEditorIdentifier): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		const configurationService = accessor.get(IConfigurationService);

		splitEditor(editorGroupService, this.getDirection(configurationService), context);
	}
}

export class SplitEditorAction extends AbstractSplitEditorAction {

	static readonly ID = 'workbench.action.splitEditor';

	constructor() {
		super({
			id: SplitEditorAction.ID,
			title: { value: localize('splitEditor', "Split Editor"), original: 'Split Editor' },
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
			title: { value: localize('splitEditorOrthogonal', "Split Editor Orthogonal"), original: 'Split Editor Orthogonal' },
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

export class SplitEditorLeftAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: SPLIT_EDITOR_LEFT,
			title: { value: localize('splitEditorGroupLeft', "Split Editor Left"), original: 'Split Editor Left' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_LEFT);
	}
}

export class SplitEditorRightAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: SPLIT_EDITOR_RIGHT,
			title: { value: localize('splitEditorGroupRight', "Split Editor Right"), original: 'Split Editor Right' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_RIGHT);
	}
}

export class SplitEditorUpAction extends ExecuteCommandAction2 {

	static readonly LABEL = localize('splitEditorGroupUp', "Split Editor Up");

	constructor() {
		super({
			id: SPLIT_EDITOR_UP,
			title: { value: localize('splitEditorGroupUp', "Split Editor Up"), original: 'Split Editor Up' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
			},
			category: Categories.View
		}, SPLIT_EDITOR_UP);
	}
}

export class SplitEditorDownAction extends ExecuteCommandAction2 {

	static readonly LABEL = localize('splitEditorGroupDown', "Split Editor Down");

	constructor() {
		super({
			id: SPLIT_EDITOR_DOWN,
			title: { value: localize('splitEditorGroupDown', "Split Editor Down"), original: 'Split Editor Down' },
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
			title: { value: localize('joinTwoGroups', "Join Editor Group with Next Group"), original: 'Join Editor Group with Next Group' },
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
			title: { value: localize('joinAllGroups', "Join All Editor Groups"), original: 'Join All Editor Groups' },
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.mergeAllGroups();
	}
}

export class NavigateBetweenGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.navigateEditorGroups',
			title: { value: localize('navigateEditorGroups', "Navigate Between Editor Groups"), original: 'Navigate Between Editor Groups' },
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

export class CloseOneEditorAction extends Action {

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

export class RevertAndCloseEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.revertAndCloseActiveEditor',
			title: { value: localize('revertAndCloseActiveEditor', "Revert and Close Editor"), original: 'Revert and Close Editor' },
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
			title: { value: localize('closeEditorsToTheLeft', "Close Editors to the Left in Group"), original: 'Close Editors to the Left in Group' },
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
			else if (filesConfigurationService.getAutoSaveMode() === AutoSaveMode.ON_FOCUS_CHANGE && !editor.hasCapability(EditorInputCapabilities.Untitled)) {
				dirtyAutoSaveOnFocusChangeEditors.add({ editor, groupId });
			}

			// Windows, Linux: editor will be saved on window change
			// when a native dialog appears, so just track that separate
			// (see https://github.com/microsoft/vscode/issues/134250)
			else if ((isNative && (isWindows || isLinux)) && filesConfigurationService.getAutoSaveMode() === AutoSaveMode.ON_WINDOW_CHANGE && !editor.hasCapability(EditorInputCapabilities.Untitled)) {
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
					await editorService.revert(editors, { soft: true });
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
						await editorService.revert(editors, { soft: true });
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
	static readonly LABEL = { value: localize('closeAllEditors', "Close All Editors"), original: 'Close All Editors' };

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
			title: { value: localize('closeAllGroups', "Close All Editor Groups"), original: 'Close All Editor Groups' },
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
			title: { value: localize('closeEditorsInOtherGroups', "Close Editors in Other Groups"), original: 'Close Editors in Other Groups' },
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
			title: { value: localize('closeEditorInAllGroups', "Close Editor in All Groups"), original: 'Close Editor in All Groups' },
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
		private direction: GroupDirection,
		private isMove: boolean
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
			title: { value: localize('moveActiveGroupLeft', "Move Editor Group Left"), original: 'Move Editor Group Left' },
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
			title: { value: localize('moveActiveGroupRight', "Move Editor Group Right"), original: 'Move Editor Group Right' },
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
			title: { value: localize('moveActiveGroupUp', "Move Editor Group Up"), original: 'Move Editor Group Up' },
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
			title: { value: localize('moveActiveGroupDown', "Move Editor Group Down"), original: 'Move Editor Group Down' },
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
			title: { value: localize('duplicateActiveGroupLeft', "Duplicate Editor Group Left"), original: 'Duplicate Editor Group Left' },
			f1: true,
			category: Categories.View
		}, GroupDirection.LEFT);
	}
}

export class DuplicateGroupRightAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupRight',
			title: { value: localize('duplicateActiveGroupRight', "Duplicate Editor Group Right"), original: 'Duplicate Editor Group Right' },
			f1: true,
			category: Categories.View
		}, GroupDirection.RIGHT);
	}
}

export class DuplicateGroupUpAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupUp',
			title: { value: localize('duplicateActiveGroupUp', "Duplicate Editor Group Up"), original: 'Duplicate Editor Group Up' },
			f1: true,
			category: Categories.View
		}, GroupDirection.UP);
	}
}

export class DuplicateGroupDownAction extends AbstractDuplicateGroupAction {

	constructor() {
		super({
			id: 'workbench.action.duplicateActiveEditorGroupDown',
			title: { value: localize('duplicateActiveGroupDown', "Duplicate Editor Group Down"), original: 'Duplicate Editor Group Down' },
			f1: true,
			category: Categories.View
		}, GroupDirection.DOWN);
	}
}

export class MinimizeOtherGroupsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.minimizeOtherEditors',
			title: { value: localize('minimizeOtherEditorGroups', "Maximize Editor Group"), original: 'Maximize Editor Group' },
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.arrangeGroups(GroupsArrangement.MAXIMIZE);
	}
}

export class ResetGroupSizesAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.evenEditorWidths',
			title: { value: localize('evenEditorGroups', "Reset Editor Group Sizes"), original: 'Reset Editor Group Sizes' },
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
			title: { value: localize('toggleEditorWidths', "Toggle Editor Group Sizes"), original: 'Toggle Editor Group Sizes' },
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);

		editorGroupService.arrangeGroups(GroupsArrangement.TOGGLE);
	}
}

export class MaximizeGroupAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.maximizeEditor',
			title: { value: localize('maximizeEditor', "Maximize Editor Group and Hide Side Bars"), original: 'Maximize Editor Group and Hide Side Bars' },
			f1: true,
			category: Categories.View
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
			title: { value: localize('openNextEditor', "Open Next Editor"), original: 'Open Next Editor' },
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
			title: { value: localize('openPreviousEditor', "Open Previous Editor"), original: 'Open Previous Editor' },
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
			title: { value: localize('nextEditorInGroup', "Open Next Editor in Group"), original: 'Open Next Editor in Group' },
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
			title: { value: localize('openPreviousEditorInGroup', "Open Previous Editor in Group"), original: 'Open Previous Editor in Group' },
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
			title: { value: localize('firstEditorInGroup', "Open First Editor in Group"), original: 'Open First Editor in Group' },
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
			title: { value: localize('lastEditorInGroup', "Open Last Editor in Group"), original: 'Open Last Editor in Group' },
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

export class ReopenClosedEditorAction extends Action2 {

	static readonly ID = 'workbench.action.reopenClosedEditor';

	constructor() {
		super({
			id: ReopenClosedEditorAction.ID,
			title: { value: localize('reopenClosedEditor', "Reopen Closed Editor"), original: 'Reopen Closed Editor' },
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
			title: { value: localize('clearRecentFiles', "Clear Recently Opened"), original: 'Clear Recently Opened' },
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
			title: { value: localize('showEditorsInActiveGroup', "Show Editors in Active Group By Most Recently Used"), original: 'Show Editors in Active Group By Most Recently Used' },
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
			title: { value: localize('showAllEditors', "Show All Editors By Appearance"), original: 'Show All Editors By Appearance' },
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
			title: { value: localize('showAllEditorsByMostRecentlyUsed', "Show All Editors By Most Recently Used"), original: 'Show All Editors By Most Recently Used' },
			f1: true,
			category: Categories.View
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);

		quickInputService.quickAccess.show(AllEditorsByMostRecentlyUsedQuickAccess.PREFIX);
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

export class OpenNextRecentlyUsedEditorAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.openNextRecentlyUsedEditor',
			title: { value: localize('openNextRecentlyUsedEditor', "Open Next Recently Used Editor"), original: 'Open Next Recently Used Editor' },
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
			title: { value: localize('openPreviousRecentlyUsedEditor', "Open Previous Recently Used Editor"), original: 'Open Previous Recently Used Editor' },
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
			title: { value: localize('openNextRecentlyUsedEditorInGroup', "Open Next Recently Used Editor In Group"), original: 'Open Next Recently Used Editor In Group' },
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
			title: { value: localize('openPreviousRecentlyUsedEditorInGroup', "Open Previous Recently Used Editor In Group"), original: 'Open Previous Recently Used Editor In Group' },
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
			type: 'warning',
			message: localize('confirmClearEditorHistoryMessage', "Do you want to clear the history of recently opened editors?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		});

		if (!confirmed) {
			return;
		}

		// Clear editor history
		this.historyService.clear();
	}
}

export class MoveEditorLeftInGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorLeftInGroup',
			title: { value: localize('moveEditorLeft', "Move Editor Left"), original: 'Move Editor Left' },
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp,
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow)
				}
			},
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'left' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorRightInGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorRightInGroup',
			title: { value: localize('moveEditorRight', "Move Editor Right"), original: 'Move Editor Right' },
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown,
				mac: {
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow)
				}
			},
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'right' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToPreviousGroup',
			title: { value: localize('moveEditorToPreviousGroup', "Move Editor into Previous Group"), original: 'Move Editor into Previous Group' },
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow
				}
			},
			f1: true,
			category: Categories.View,
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToNextGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToNextGroup',
			title: { value: localize('moveEditorToNextGroup', "Move Editor into Next Group"), original: 'Move Editor into Next Group' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToAboveGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToAboveGroup',
			title: { value: localize('moveEditorToAboveGroup', "Move Editor into Group Above"), original: 'Move Editor into Group Above' },
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'up', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToBelowGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToBelowGroup',
			title: { value: localize('moveEditorToBelowGroup', "Move Editor into Group Below"), original: 'Move Editor into Group Below' },
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'down', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLeftGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToLeftGroup',
			title: { value: localize('moveEditorToLeftGroup', "Move Editor into Left Group"), original: 'Move Editor into Left Group' },
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'left', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToRightGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToRightGroup',
			title: { value: localize('moveEditorToRightGroup', "Move Editor into Right Group"), original: 'Move Editor into Right Group' },
			f1: true,
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'right', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToFirstGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToFirstGroup',
			title: { value: localize('moveEditorToFirstGroup', "Move Editor into First Group"), original: 'Move Editor into First Group' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit1,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit1
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class MoveEditorToLastGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.moveEditorToLastGroup',
			title: { value: localize('moveEditorToLastGroup', "Move Editor into Last Group"), original: 'Move Editor into Last Group' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit9,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit9
				}
			},
			category: Categories.View
		}, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToPreviousGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToPreviousGroup',
			title: { value: localize('splitEditorToPreviousGroup', "Split Editor into Previous Group"), original: 'Split Editor into Previous Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToNextGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToNextGroup',
			title: { value: localize('splitEditorToNextGroup', "Split Editor into Next Group"), original: 'Split Editor into Next Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToAboveGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToAboveGroup',
			title: { value: localize('splitEditorToAboveGroup', "Split Editor into Group Above"), original: 'Split Editor into Group Above' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'up', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToBelowGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToBelowGroup',
			title: { value: localize('splitEditorToBelowGroup', "Split Editor into Group Below"), original: 'Split Editor into Group Below' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'down', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLeftGroupAction extends ExecuteCommandAction2 {

	static readonly ID = 'workbench.action.splitEditorToLeftGroup';
	static readonly LABEL = localize('splitEditorToLeftGroup', "Split Editor into Left Group");

	constructor() {
		super({
			id: 'workbench.action.splitEditorToLeftGroup',
			title: { value: localize('splitEditorToLeftGroup', "Split Editor into Left Group"), original: 'Split Editor into Left Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'left', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToRightGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToRightGroup',
			title: { value: localize('splitEditorToRightGroup', "Split Editor into Right Group"), original: 'Split Editor into Right Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'right', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToFirstGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToFirstGroup',
			title: { value: localize('splitEditorToFirstGroup', "Split Editor into First Group"), original: 'Split Editor into First Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' } as ActiveEditorMoveCopyArguments);
	}
}

export class SplitEditorToLastGroupAction extends ExecuteCommandAction2 {

	constructor() {
		super({
			id: 'workbench.action.splitEditorToLastGroup',
			title: { value: localize('splitEditorToLastGroup', "Split Editor into Last Group"), original: 'Split Editor into Last Group' },
			f1: true,
			category: Categories.View
		}, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' } as ActiveEditorMoveCopyArguments);
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
