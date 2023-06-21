/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IWindowOpenable } from 'vs/platform/window/common/window';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MenuRegistry, MenuId, Action2, registerAction2, IAction2Options } from 'vs/platform/actions/common/actions';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IsFullscreenContext } from 'vs/workbench/common/contextkeys';
import { IsMacNativeContext, IsDevelopmentContext, IsWebContext, IsIOSContext } from 'vs/platform/contextkey/common/contextkeys';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputButton, IQuickInputService, IQuickPickSeparator, IKeyMods, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { ILabelService, Verbosity } from 'vs/platform/label/common/label';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IRecent, isRecentFolder, isRecentWorkspace, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { FileKind } from 'vs/platform/files/common/files';
import { splitRecentLabel } from 'vs/base/common/labels';
import { isMacintosh, isWeb, isWindows } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { inQuickPickContext, getQuickNavigateHandler } from 'vs/workbench/browser/quickaccess';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ResourceMap } from 'vs/base/common/map';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { isHTMLElement } from 'vs/base/browser/dom';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { isFolderBackupInfo, isWorkspaceBackupInfo } from 'vs/platform/backup/common/backup';

export const inRecentFilesPickerContextKey = 'inRecentFilesPicker';

interface IRecentlyOpenedPick extends IQuickPickItem {
	resource: URI;
	openable: IWindowOpenable;
	remoteAuthority: string | undefined;
}

abstract class BaseOpenRecentAction extends Action2 {

	private readonly removeFromRecentlyOpened: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.removeClose),
		tooltip: localize('remove', "Remove from Recently Opened")
	};

	private readonly dirtyRecentlyOpenedFolder: IQuickInputButton = {
		iconClass: 'dirty-workspace ' + ThemeIcon.asClassName(Codicon.closeDirty),
		tooltip: localize('dirtyRecentlyOpenedFolder', "Folder With Unsaved Files"),
		alwaysVisible: true
	};

	private readonly dirtyRecentlyOpenedWorkspace: IQuickInputButton = {
		...this.dirtyRecentlyOpenedFolder,
		tooltip: localize('dirtyRecentlyOpenedWorkspace', "Workspace With Unsaved Files"),
	};

	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	protected abstract isQuickNavigate(): boolean;

	override async run(accessor: ServicesAccessor): Promise<void> {
		const workspacesService = accessor.get(IWorkspacesService);
		const quickInputService = accessor.get(IQuickInputService);
		const contextService = accessor.get(IWorkspaceContextService);
		const labelService = accessor.get(ILabelService);
		const keybindingService = accessor.get(IKeybindingService);
		const modelService = accessor.get(IModelService);
		const languageService = accessor.get(ILanguageService);
		const hostService = accessor.get(IHostService);
		const dialogService = accessor.get(IDialogService);

		const recentlyOpened = await workspacesService.getRecentlyOpened();
		const dirtyWorkspacesAndFolders = await workspacesService.getDirtyWorkspaces();

		let hasWorkspaces = false;

		// Identify all folders and workspaces with unsaved files
		const dirtyFolders = new ResourceMap<boolean>();
		const dirtyWorkspaces = new ResourceMap<IWorkspaceIdentifier>();
		for (const dirtyWorkspace of dirtyWorkspacesAndFolders) {
			if (isFolderBackupInfo(dirtyWorkspace)) {
				dirtyFolders.set(dirtyWorkspace.folderUri, true);
			} else {
				dirtyWorkspaces.set(dirtyWorkspace.workspace.configPath, dirtyWorkspace.workspace);
				hasWorkspaces = true;
			}
		}

		// Identify all recently opened folders and workspaces
		const recentFolders = new ResourceMap<boolean>();
		const recentWorkspaces = new ResourceMap<IWorkspaceIdentifier>();
		for (const recent of recentlyOpened.workspaces) {
			if (isRecentFolder(recent)) {
				recentFolders.set(recent.folderUri, true);
			} else {
				recentWorkspaces.set(recent.workspace.configPath, recent.workspace);
				hasWorkspaces = true;
			}
		}

		// Fill in all known recently opened workspaces
		const workspacePicks: IRecentlyOpenedPick[] = [];
		for (const recent of recentlyOpened.workspaces) {
			const isDirty = isRecentFolder(recent) ? dirtyFolders.has(recent.folderUri) : dirtyWorkspaces.has(recent.workspace.configPath);

			workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, recent, isDirty));
		}

		// Fill any backup workspace that is not yet shown at the end
		for (const dirtyWorkspaceOrFolder of dirtyWorkspacesAndFolders) {
			if (isFolderBackupInfo(dirtyWorkspaceOrFolder) && !recentFolders.has(dirtyWorkspaceOrFolder.folderUri)) {
				workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, dirtyWorkspaceOrFolder, true));
			} else if (isWorkspaceBackupInfo(dirtyWorkspaceOrFolder) && !recentWorkspaces.has(dirtyWorkspaceOrFolder.workspace.configPath)) {
				workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, dirtyWorkspaceOrFolder, true));
			}
		}

		const filePicks = recentlyOpened.files.map(p => this.toQuickPick(modelService, languageService, labelService, p, false));

		// focus second entry if the first recent workspace is the current workspace
		const firstEntry = recentlyOpened.workspaces[0];
		const autoFocusSecondEntry: boolean = firstEntry && contextService.isCurrentWorkspace(isRecentWorkspace(firstEntry) ? firstEntry.workspace : firstEntry.folderUri);

		let keyMods: IKeyMods | undefined;

		const workspaceSeparator: IQuickPickSeparator = { type: 'separator', label: hasWorkspaces ? localize('workspacesAndFolders', "folders & workspaces") : localize('folders', "folders") };
		const fileSeparator: IQuickPickSeparator = { type: 'separator', label: localize('files', "files") };
		const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];

		const pick = await quickInputService.pick(picks, {
			contextKey: inRecentFilesPickerContextKey,
			activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
			placeHolder: isMacintosh ? localize('openRecentPlaceholderMac', "Select to open (hold Cmd-key to force new window or Option-key for same window)") : localize('openRecentPlaceholder', "Select to open (hold Ctrl-key to force new window or Alt-key for same window)"),
			matchOnDescription: true,
			onKeyMods: mods => keyMods = mods,
			quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : undefined,
			hideInput: this.isQuickNavigate(),
			onDidTriggerItemButton: async context => {

				// Remove
				if (context.button === this.removeFromRecentlyOpened) {
					await workspacesService.removeRecentlyOpened([context.item.resource]);
					context.removeItem();
				}

				// Dirty Folder/Workspace
				else if (context.button === this.dirtyRecentlyOpenedFolder || context.button === this.dirtyRecentlyOpenedWorkspace) {
					const isDirtyWorkspace = context.button === this.dirtyRecentlyOpenedWorkspace;
					const { confirmed } = await dialogService.confirm({
						title: isDirtyWorkspace ? localize('dirtyWorkspace', "Workspace with Unsaved Files") : localize('dirtyFolder', "Folder with Unsaved Files"),
						message: isDirtyWorkspace ? localize('dirtyWorkspaceConfirm', "Do you want to open the workspace to review the unsaved files?") : localize('dirtyFolderConfirm', "Do you want to open the folder to review the unsaved files?"),
						detail: isDirtyWorkspace ? localize('dirtyWorkspaceConfirmDetail', "Workspaces with unsaved files cannot be removed until all unsaved files have been saved or reverted.") : localize('dirtyFolderConfirmDetail', "Folders with unsaved files cannot be removed until all unsaved files have been saved or reverted.")
					});

					if (confirmed) {
						hostService.openWindow(
							[context.item.openable], {
							remoteAuthority: context.item.remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
						});
						quickInputService.cancel();
					}
				}
			}
		});

		if (pick) {
			return hostService.openWindow([pick.openable], {
				forceNewWindow: keyMods?.ctrlCmd,
				forceReuseWindow: keyMods?.alt,
				remoteAuthority: pick.remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
			});
		}
	}

	private toQuickPick(modelService: IModelService, languageService: ILanguageService, labelService: ILabelService, recent: IRecent, isDirty: boolean): IRecentlyOpenedPick {
		let openable: IWindowOpenable | undefined;
		let iconClasses: string[];
		let fullLabel: string | undefined;
		let resource: URI | undefined;
		let isWorkspace = false;

		// Folder
		if (isRecentFolder(recent)) {
			resource = recent.folderUri;
			iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FOLDER);
			openable = { folderUri: resource };
			fullLabel = recent.label || labelService.getWorkspaceLabel(resource, { verbose: Verbosity.LONG });
		}

		// Workspace
		else if (isRecentWorkspace(recent)) {
			resource = recent.workspace.configPath;
			iconClasses = getIconClasses(modelService, languageService, resource, FileKind.ROOT_FOLDER);
			openable = { workspaceUri: resource };
			fullLabel = recent.label || labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
			isWorkspace = true;
		}

		// File
		else {
			resource = recent.fileUri;
			iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FILE);
			openable = { fileUri: resource };
			fullLabel = recent.label || labelService.getUriLabel(resource);
		}

		const { name, parentPath } = splitRecentLabel(fullLabel);

		return {
			iconClasses,
			label: name,
			ariaLabel: isDirty ? isWorkspace ? localize('recentDirtyWorkspaceAriaLabel', "{0}, workspace with unsaved changes", name) : localize('recentDirtyFolderAriaLabel', "{0}, folder with unsaved changes", name) : name,
			description: parentPath,
			buttons: isDirty ? [isWorkspace ? this.dirtyRecentlyOpenedWorkspace : this.dirtyRecentlyOpenedFolder] : [this.removeFromRecentlyOpened],
			openable,
			resource,
			remoteAuthority: recent.remoteAuthority
		};
	}
}

export class OpenRecentAction extends BaseOpenRecentAction {

	static ID = 'workbench.action.openRecent';

	constructor() {
		super({
			id: OpenRecentAction.ID,
			title: {
				value: localize('openRecent', "Open Recent..."),
				mnemonicTitle: localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More..."),
				original: 'Open Recent...'
			},
			category: Categories.File,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
			},
			menu: {
				id: MenuId.MenubarRecentMenu,
				group: 'y_more',
				order: 1
			}
		});
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

class QuickPickRecentAction extends BaseOpenRecentAction {

	constructor() {
		super({
			id: 'workbench.action.quickOpenRecent',
			title: { value: localize('quickOpenRecent', "Quick Open Recent..."), original: 'Quick Open Recent...' },
			category: Categories.File,
			f1: false // hide quick pickers from command palette to not confuse with the other entry that shows a input field
		});
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

class ToggleFullScreenAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.toggleFullScreen',
			title: {
				value: localize('toggleFullScreen', "Toggle Full Screen"),
				mnemonicTitle: localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "&&Full Screen"),
				original: 'Toggle Full Screen'
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F11,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyF
				}
			},
			precondition: IsIOSContext.toNegated(),
			toggled: IsFullscreenContext,
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '1_toggle_view',
				order: 1
			}]
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const hostService = accessor.get(IHostService);

		return hostService.toggleFullScreen();
	}
}

export class ReloadWindowAction extends Action2 {

	static readonly ID = 'workbench.action.reloadWindow';

	constructor() {
		super({
			id: ReloadWindowAction.ID,
			title: { value: localize('reloadWindow', "Reload Window"), original: 'Reload Window' },
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 50,
				when: IsDevelopmentContext,
				primary: KeyMod.CtrlCmd | KeyCode.KeyR
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const hostService = accessor.get(IHostService);

		return hostService.reload();
	}
}

class ShowAboutDialogAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.showAboutDialog',
			title: {
				value: localize('about', "About"),
				mnemonicTitle: localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About"),
				original: 'About'
			},
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: 'z_about',
				order: 1,
				when: IsMacNativeContext.toNegated()
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);

		return dialogService.about();
	}
}

class NewWindowAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.newWindow',
			title: {
				value: localize('newWindow', "New Window"),
				mnemonicTitle: localize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window"),
				original: 'New Window'
			},
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: isWeb ? (isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN,
				secondary: isWeb ? [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN] : undefined
			},
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_new',
				order: 3
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const hostService = accessor.get(IHostService);

		return hostService.openWindow({ remoteAuthority: null });
	}
}

class BlurAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.blur',
			title: { value: localize('blur', "Remove keyboard focus from focused element"), original: 'Remove keyboard focus from focused element' }
		});
	}

	run(): void {
		const el = document.activeElement;

		if (isHTMLElement(el)) {
			el.blur();
		}
	}
}

// --- Actions Registration

registerAction2(NewWindowAction);
registerAction2(ToggleFullScreenAction);
registerAction2(QuickPickRecentAction);
registerAction2(OpenRecentAction);
registerAction2(ReloadWindowAction);
registerAction2(ShowAboutDialogAction);
registerAction2(BlurAction);

// --- Commands/Keybindings Registration

const recentFilesPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));

const quickPickNavigateNextInRecentFilesPickerId = 'workbench.action.quickOpenNavigateNextInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickPickNavigateNextInRecentFilesPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickPickNavigateNextInRecentFilesPickerId, true),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
});

const quickPickNavigatePreviousInRecentFilesPicker = 'workbench.action.quickOpenNavigatePreviousInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickPickNavigatePreviousInRecentFilesPicker,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickPickNavigatePreviousInRecentFilesPicker, false),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR }
});

CommandsRegistry.registerCommand('workbench.action.toggleConfirmBeforeClose', accessor => {
	const configurationService = accessor.get(IConfigurationService);
	const setting = configurationService.inspect<'always' | 'keyboardOnly' | 'never'>('window.confirmBeforeClose').userValue;

	return configurationService.updateValue('window.confirmBeforeClose', setting === 'never' ? 'keyboardOnly' : 'never');
});

// --- Menu Registration

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	group: 'z_ConfirmClose',
	command: {
		id: 'workbench.action.toggleConfirmBeforeClose',
		title: localize('miConfirmClose', "Confirm Before Close"),
		toggled: ContextKeyExpr.notEquals('config.window.confirmBeforeClose', 'never')
	},
	order: 1,
	when: IsWebContext
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent"),
	submenu: MenuId.MenubarRecentMenu,
	group: '2_open',
	order: 4
});
