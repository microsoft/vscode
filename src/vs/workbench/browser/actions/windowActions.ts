/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IURIToOpen, IWindowsService } from 'vs/platform/windows/common/windows';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IsFullscreenContext, IsDevelopmentContext, IsMacNativeContext } from 'vs/workbench/browser/contextkeys';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputButton, IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILabelService } from 'vs/platform/label/common/label';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IRecentWorkspace, IRecentFolder, IRecentFile, IRecent, isRecentFolder, isRecentWorkspace } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { FileKind } from 'vs/platform/files/common/files';
import { splitName } from 'vs/base/common/labels';
import { IKeyMods } from 'vs/base/parts/quickopen/common/quickOpen';
import { isMacintosh } from 'vs/base/common/platform';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { inQuickOpenContext, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';

export const inRecentFilesPickerContextKey = 'inRecentFilesPicker';

abstract class BaseOpenRecentAction extends Action {

	private removeFromRecentlyOpened: IQuickInputButton = {
		iconClass: 'action-remove-from-recently-opened',
		tooltip: nls.localize('remove', "Remove from Recently Opened")
	};

	constructor(
		id: string,
		label: string,
		private windowService: IWindowService,
		private quickInputService: IQuickInputService,
		private contextService: IWorkspaceContextService,
		private labelService: ILabelService,
		private keybindingService: IKeybindingService,
		private modelService: IModelService,
		private modeService: IModeService,
	) {
		super(id, label);
	}

	protected abstract isQuickNavigate(): boolean;

	async run(): Promise<void> {
		const { workspaces, files } = await this.windowService.getRecentlyOpened();

		this.openRecent(workspaces, files);
	}

	private async openRecent(recentWorkspaces: Array<IRecentWorkspace | IRecentFolder>, recentFiles: IRecentFile[]): Promise<void> {

		const toPick = (recent: IRecent, labelService: ILabelService, buttons: IQuickInputButton[] | undefined) => {
			let uriToOpen: IURIToOpen | undefined;
			let iconClasses: string[];
			let fullLabel: string | undefined;
			let resource: URI | undefined;

			// Folder
			if (isRecentFolder(recent)) {
				resource = recent.folderUri;
				iconClasses = getIconClasses(this.modelService, this.modeService, resource, FileKind.FOLDER);
				uriToOpen = { folderUri: resource };
				fullLabel = recent.label || labelService.getWorkspaceLabel(resource, { verbose: true });
			}

			// Workspace
			else if (isRecentWorkspace(recent)) {
				resource = recent.workspace.configPath;
				iconClasses = getIconClasses(this.modelService, this.modeService, resource, FileKind.ROOT_FOLDER);
				uriToOpen = { workspaceUri: resource };
				fullLabel = recent.label || labelService.getWorkspaceLabel(recent.workspace, { verbose: true });
			}

			// File
			else {
				resource = recent.fileUri;
				iconClasses = getIconClasses(this.modelService, this.modeService, resource, FileKind.FILE);
				uriToOpen = { fileUri: resource };
				fullLabel = recent.label || labelService.getUriLabel(resource);
			}

			const { name, parentPath } = splitName(fullLabel);

			return {
				iconClasses,
				label: name,
				description: parentPath,
				buttons,
				uriToOpen,
				resource
			};
		};

		const workspacePicks = recentWorkspaces.map(workspace => toPick(workspace, this.labelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : undefined));
		const filePicks = recentFiles.map(p => toPick(p, this.labelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : undefined));

		// focus second entry if the first recent workspace is the current workspace
		const firstEntry = recentWorkspaces[0];
		let autoFocusSecondEntry: boolean = firstEntry && this.contextService.isCurrentWorkspace(isRecentWorkspace(firstEntry) ? firstEntry.workspace : firstEntry.folderUri);

		let keyMods: IKeyMods | undefined;

		const workspaceSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('workspaces', "workspaces") };
		const fileSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('files', "files") };
		const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];

		const pick = await this.quickInputService.pick(picks, {
			contextKey: inRecentFilesPickerContextKey,
			activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select to open (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true,
			onKeyMods: mods => keyMods = mods,
			quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : undefined,
			onDidTriggerItemButton: async context => {
				await this.windowService.removeFromRecentlyOpened([context.item.resource]);
				context.removeItem();
			}
		});

		if (pick) {
			return this.windowService.openWindow([pick.uriToOpen], { forceNewWindow: keyMods && keyMods.ctrlCmd });
		}
	}
}

export class OpenRecentAction extends BaseOpenRecentAction {

	static readonly ID = 'workbench.action.openRecent';
	static readonly LABEL = nls.localize('openRecent', "Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILabelService labelService: ILabelService
	) {
		super(id, label, windowService, quickInputService, contextService, labelService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickOpenRecentAction extends BaseOpenRecentAction {

	static readonly ID = 'workbench.action.quickOpenRecent';
	static readonly LABEL = nls.localize('quickOpenRecent', "Quick Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILabelService labelService: ILabelService
	) {
		super(id, label, windowService, quickInputService, contextService, labelService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export class ToggleFullScreenAction extends Action {

	static readonly ID = 'workbench.action.toggleFullScreen';
	static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(
		id: string,
		label: string,
		@IWindowService private readonly windowService: IWindowService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService) {
		super(id, label);
	}

	run(): Promise<void> {
		const container = this.layoutService.getWorkbenchElement();

		return this.windowService.toggleFullScreen(container);
	}
}

export class ReloadWindowAction extends Action {

	static readonly ID = 'workbench.action.reloadWindow';
	static LABEL = nls.localize('reloadWindow', "Reload Window");

	constructor(
		id: string,
		label: string,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		await this.windowService.reloadWindow();

		return true;
	}
}

export class ShowAboutDialogAction extends Action {

	static readonly ID = 'workbench.action.showAboutDialog';
	static readonly LABEL = nls.localize('about', "About");

	constructor(
		id: string,
		label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.openAboutDialog();
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

// --- Actions Registration

const fileCategory = nls.localize('file', "File");
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenRecentAction, QuickOpenRecentAction.ID, QuickOpenRecentAction.LABEL), 'File: Quick Open Recent...', fileCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_R, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R } }), 'File: Open Recent...', fileCategory);

const viewCategory = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleFullScreenAction, ToggleFullScreenAction.ID, ToggleFullScreenAction.LABEL, { primary: KeyCode.F11, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_F } }), 'View: Toggle Full Screen', viewCategory);

const developerCategory = nls.localize('developer', "Developer");
registry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL), 'Developer: Reload Window', developerCategory);

const helpCategory = nls.localize('help', "Help");
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAboutDialogAction, ShowAboutDialogAction.ID, ShowAboutDialogAction.LABEL), `Help: About`, helpCategory);

// --- Commands/Keybindings Registration

const recentFilesPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));

const quickOpenNavigateNextInRecentFilesPickerId = 'workbench.action.quickOpenNavigateNextInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInRecentFilesPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInRecentFilesPickerId, true),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R }
});

const quickOpenNavigatePreviousInRecentFilesPicker = 'workbench.action.quickOpenNavigatePreviousInRecentFilesPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInRecentFilesPicker,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInRecentFilesPicker, false),
	when: recentFilesPickerContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_R }
});

KeybindingsRegistry.registerKeybindingRule({
	id: ReloadWindowAction.ID,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: IsDevelopmentContext,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_R
});

// --- Menu Registration

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: nls.localize({ key: 'miOpenRecent', comment: ['&& denotes a mnemonic'] }, "Open &&Recent"),
	submenu: MenuId.MenubarRecentMenu,
	group: '2_open',
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: 'y_more',
	command: {
		id: OpenRecentAction.ID,
		title: nls.localize({ key: 'miMore', comment: ['&& denotes a mnemonic'] }, "&&More...")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '1_toggle_view',
	command: {
		id: ToggleFullScreenAction.ID,
		title: nls.localize({ key: 'miToggleFullScreen', comment: ['&& denotes a mnemonic'] }, "&&Full Screen"),
		toggled: IsFullscreenContext
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: 'z_about',
	command: {
		id: ShowAboutDialogAction.ID,
		title: nls.localize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About")
	},
	order: 1,
	when: IsMacNativeContext.toNegated()
});
