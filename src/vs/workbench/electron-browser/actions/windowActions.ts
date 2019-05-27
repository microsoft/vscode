/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService, IURIToOpen } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { isMacintosh } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { webFrame } from 'electron';
import { FileKind } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickInputService, IQuickInputButton, IQuickPickSeparator, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import product from 'vs/platform/product/node/product';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRecentFolder, IRecentFile, IRecentWorkspace, IRecent, isRecentFolder, isRecentWorkspace } from 'vs/platform/history/common/history';
import { splitName } from 'vs/base/common/labels';

export class CloseCurrentWindowAction extends Action {

	static readonly ID = 'workbench.action.closeWindow';
	static readonly LABEL = nls.localize('closeWindow', "Close Window");

	constructor(id: string, label: string, @IWindowService private readonly windowService: IWindowService) {
		super(id, label);
	}

	run(): Promise<boolean> {
		this.windowService.closeWindow();

		return Promise.resolve(true);
	}
}

export class NewWindowAction extends Action {

	static readonly ID = 'workbench.action.newWindow';
	static LABEL = nls.localize('newWindow', "New Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.openNewWindow();
	}
}

export class ToggleFullScreenAction extends Action {

	static readonly ID = 'workbench.action.toggleFullScreen';
	static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(id: string, label: string, @IWindowService private readonly windowService: IWindowService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowService.toggleFullScreen();
	}
}

export abstract class BaseZoomAction extends Action {
	private static readonly SETTING_KEY = 'window.zoomLevel';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	protected async setConfiguredZoomLevel(level: number): Promise<void> {
		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		const applyZoom = () => {
			webFrame.setZoomLevel(level);
			browser.setZoomFactor(webFrame.getZoomFactor());
			// See https://github.com/Microsoft/vscode/issues/26151
			// Cannot be trusted because the webFrame might take some time
			// until it really applies the new zoom level
			browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
		};

		await this.configurationService.updateValue(BaseZoomAction.SETTING_KEY, level);

		applyZoom();
	}
}

export class ZoomInAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomIn';
	static readonly LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): Promise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() + 1);

		return Promise.resolve(true);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomOut';
	static readonly LABEL = nls.localize('zoomOut', "Zoom Out");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): Promise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() - 1);

		return Promise.resolve(true);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomReset';
	static readonly LABEL = nls.localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): Promise<boolean> {
		this.setConfiguredZoomLevel(0);

		return Promise.resolve(true);
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

export class ReloadWindowWithExtensionsDisabledAction extends Action {

	static readonly ID = 'workbench.action.reloadWindowWithExtensionsDisabled';
	static LABEL = nls.localize('reloadWindowWithExntesionsDisabled', "Reload Window With Extensions Disabled");

	constructor(
		id: string,
		label: string,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		await this.windowService.reloadWindow({ _: [], 'disable-extensions': true });

		return true;
	}
}

export abstract class BaseSwitchWindow extends Action {

	private closeWindowAction: IQuickInputButton = {
		iconClass: 'action-remove-from-recently-opened',
		tooltip: nls.localize('close', "Close Window")
	};

	constructor(
		id: string,
		label: string,
		private windowsService: IWindowsService,
		private windowService: IWindowService,
		private quickInputService: IQuickInputService,
		private keybindingService: IKeybindingService,
		private modelService: IModelService,
		private modeService: IModeService,
	) {
		super(id, label);

	}

	protected abstract isQuickNavigate(): boolean;

	async run(): Promise<void> {
		const currentWindowId = this.windowService.windowId;

		const windows = await this.windowsService.getWindows();
		const placeHolder = nls.localize('switchWindowPlaceHolder', "Select a window to switch to");
		const picks = windows.map(win => {
			const resource = win.filename ? URI.file(win.filename) : win.folderUri ? win.folderUri : win.workspace ? win.workspace.configPath : undefined;
			const fileKind = win.filename ? FileKind.FILE : win.workspace ? FileKind.ROOT_FOLDER : win.folderUri ? FileKind.FOLDER : FileKind.FILE;
			return {
				payload: win.id,
				label: win.title,
				iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
				description: (currentWindowId === win.id) ? nls.localize('current', "Current Window") : undefined,
				buttons: (!this.isQuickNavigate() && currentWindowId !== win.id) ? [this.closeWindowAction] : undefined
			};
		});
		const autoFocusIndex = (picks.indexOf(picks.filter(pick => pick.payload === currentWindowId)[0]) + 1) % picks.length;

		const pick = await this.quickInputService.pick(picks, {
			contextKey: 'inWindowsPicker',
			activeItem: picks[autoFocusIndex],
			placeHolder,
			quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : undefined,
			onDidTriggerItemButton: async context => {
				await this.windowsService.closeWindow(context.item.payload);
				context.removeItem();
			}
		});

		if (pick) {
			this.windowsService.focusWindow(pick.payload);
		}
	}
}

export class SwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.switchWindow';
	static LABEL = nls.localize('switchWindow', "Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
	) {
		super(id, label, windowsService, windowService, quickInputService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickSwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.quickSwitchWindow';
	static LABEL = nls.localize('quickSwitchWindow', "Quick Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
	) {
		super(id, label, windowsService, windowService, quickInputService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export const inRecentFilesPickerContextKey = 'inRecentFilesPicker';

export abstract class BaseOpenRecentAction extends Action {

	private removeFromRecentlyOpened: IQuickInputButton = {
		iconClass: 'action-remove-from-recently-opened',
		tooltip: nls.localize('remove', "Remove from Recently Opened")
	};

	constructor(
		id: string,
		label: string,
		private windowService: IWindowService,
		private windowsService: IWindowsService,
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
			if (isRecentFolder(recent)) {
				resource = recent.folderUri;
				iconClasses = getIconClasses(this.modelService, this.modeService, resource, FileKind.FOLDER);
				uriToOpen = { folderUri: resource };
				fullLabel = recent.label || labelService.getWorkspaceLabel(resource, { verbose: true });
			} else if (isRecentWorkspace(recent)) {
				resource = recent.workspace.configPath;
				iconClasses = getIconClasses(this.modelService, this.modeService, resource, FileKind.ROOT_FOLDER);
				uriToOpen = { workspaceUri: resource };
				fullLabel = recent.label || labelService.getWorkspaceLabel(recent.workspace, { verbose: true });
			} else {
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
				await this.windowsService.removeFromRecentlyOpened([context.item.resource]);
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
		@IWindowsService windowsService: IWindowsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILabelService labelService: ILabelService
	) {
		super(id, label, windowService, windowsService, quickInputService, contextService, labelService, keybindingService, modelService, modeService);
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
		@IWindowsService windowsService: IWindowsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILabelService labelService: ILabelService
	) {
		super(id, label, windowService, windowsService, quickInputService, contextService, labelService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export class ShowAboutDialogAction extends Action {

	static readonly ID = 'workbench.action.showAboutDialog';
	static LABEL = nls.localize('about', "About {0}", product.applicationName);

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

export const NewWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).newWindowTab();
};

export const ShowPreviousWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).showPreviousWindowTab();
};

export const ShowNextWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).showNextWindowTab();
};

export const MoveWindowTabToNewWindowHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).moveWindowTabToNewWindow();
};

export const MergeWindowTabsHandlerHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).mergeAllWindowTabs();
};

export const ToggleWindowTabsBarHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(IWindowsService).toggleWindowTabsBar();
};
