/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { isMacintosh } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { webFrame } from 'electron';
import { getBaseLabel } from 'vs/base/common/labels';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { FileKind } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { dirname } from 'vs/base/common/resources';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickInputService, IQuickPickItem, IQuickInputButton, IQuickPickSeparator, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import product from 'vs/platform/node/product';

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
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService
	) {
		super(id, label);
	}

	protected setConfiguredZoomLevel(level: number): void {
		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		const applyZoom = () => {
			webFrame.setZoomLevel(level);
			browser.setZoomFactor(webFrame.getZoomFactor());
			// See https://github.com/Microsoft/vscode/issues/26151
			// Cannot be trusted because the webFrame might take some time
			// until it really applies the new zoom level
			browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
		};

		this.configurationService.updateValue(BaseZoomAction.SETTING_KEY, level).then(() => applyZoom());
	}
}

export class ZoomInAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomIn';
	static readonly LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
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
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
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
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
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

	run(): Promise<boolean> {
		return this.windowService.reloadWindow().then(() => true);
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

	run(): Promise<boolean> {
		return this.windowService.reloadWindow({ _: [], 'disable-extensions': true }).then(() => true);
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

	run(): Promise<void> {
		const currentWindowId = this.windowService.getCurrentWindowId();

		return this.windowsService.getWindows().then(windows => {
			const placeHolder = nls.localize('switchWindowPlaceHolder', "Select a window to switch to");
			const picks = windows.map(win => {
				const resource = win.filename ? URI.file(win.filename) : win.folderUri ? win.folderUri : win.workspace ? URI.file(win.workspace.configPath) : undefined;
				const fileKind = win.filename ? FileKind.FILE : win.workspace ? FileKind.ROOT_FOLDER : win.folderUri ? FileKind.FOLDER : FileKind.FILE;
				return {
					payload: win.id,
					label: win.title,
					iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
					description: (currentWindowId === win.id) ? nls.localize('current', "Current Window") : undefined,
					buttons: (!this.isQuickNavigate() && currentWindowId !== win.id) ? [this.closeWindowAction] : undefined
				} as (IQuickPickItem & { payload: number });
			});

			const autoFocusIndex = (picks.indexOf(picks.filter(pick => pick.payload === currentWindowId)[0]) + 1) % picks.length;

			return this.quickInputService.pick(picks, {
				contextKey: 'inWindowsPicker',
				activeItem: picks[autoFocusIndex],
				placeHolder,
				quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : undefined,
				onDidTriggerItemButton: context => {
					this.windowsService.closeWindow(context.item.payload).then(() => {
						context.removeItem();
					});
				}
			});
		}).then(pick => {
			if (pick) {
				this.windowsService.showWindow(pick.payload);
			}
		});
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

	run(): Promise<void> {
		return this.windowService.getRecentlyOpened()
			.then(({ workspaces, files }) => this.openRecent(workspaces, files));
	}

	private openRecent(recentWorkspaces: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier>, recentFiles: URI[]): void {

		const toPick = (workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI, fileKind: FileKind, labelService: ILabelService, buttons: IQuickInputButton[] | undefined) => {
			let resource: URI;
			let label: string;
			let description: string;
			if (isSingleFolderWorkspaceIdentifier(workspace) && fileKind !== FileKind.FILE) {
				resource = workspace;
				label = labelService.getWorkspaceLabel(workspace);
				description = labelService.getUriLabel(dirname(resource)!);
			} else if (isWorkspaceIdentifier(workspace)) {
				resource = URI.file(workspace.configPath);
				label = labelService.getWorkspaceLabel(workspace);
				description = labelService.getUriLabel(dirname(resource)!);
			} else {
				resource = workspace;
				label = getBaseLabel(workspace);
				description = labelService.getUriLabel(dirname(resource)!);
			}

			return {
				iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
				label,
				description,
				buttons,
				workspace,
				resource,
				fileKind,
			};
		};

		const runPick = (resource: URI, isFile: boolean, keyMods: IKeyMods) => {
			const forceNewWindow = keyMods.ctrlCmd;
			return this.windowService.openWindow([resource], { forceNewWindow, forceOpenWorkspaceAsFile: isFile });
		};

		const workspacePicks = recentWorkspaces.map(workspace => toPick(workspace, isSingleFolderWorkspaceIdentifier(workspace) ? FileKind.FOLDER : FileKind.ROOT_FOLDER, this.labelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : undefined));
		const filePicks = recentFiles.map(p => toPick(p, FileKind.FILE, this.labelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : undefined));

		// focus second entry if the first recent workspace is the current workspace
		let autoFocusSecondEntry: boolean = recentWorkspaces[0] && this.contextService.isCurrentWorkspace(recentWorkspaces[0]);

		let keyMods: IKeyMods;
		const workspaceSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('workspaces', "workspaces") };
		const fileSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('files', "files") };
		const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];
		this.quickInputService.pick(picks, {
			contextKey: inRecentFilesPickerContextKey,
			activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select to open (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true,
			onKeyMods: mods => keyMods = mods,
			quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : undefined,
			onDidTriggerItemButton: context => {
				this.windowsService.removeFromRecentlyOpened([context.item.workspace]).then(() => context.removeItem());
			}
		})
			.then((pick): Promise<void> | void => {
				if (pick) {
					return runPick(pick.resource, pick.fileKind === FileKind.FILE, keyMods);
				}
			});
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

export class NewWindowTab extends Action {

	static readonly ID = 'workbench.action.newWindowTab';
	static readonly LABEL = nls.localize('newTab', "New Window Tab");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(NewWindowTab.ID, NewWindowTab.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.newWindowTab().then(() => true);
	}
}

export class ShowPreviousWindowTab extends Action {

	static readonly ID = 'workbench.action.showPreviousWindowTab';
	static readonly LABEL = nls.localize('showPreviousTab', "Show Previous Window Tab");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(ShowPreviousWindowTab.ID, ShowPreviousWindowTab.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.showPreviousWindowTab().then(() => true);
	}
}

export class ShowNextWindowTab extends Action {

	static readonly ID = 'workbench.action.showNextWindowTab';
	static readonly LABEL = nls.localize('showNextWindowTab', "Show Next Window Tab");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(ShowNextWindowTab.ID, ShowNextWindowTab.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.showNextWindowTab().then(() => true);
	}
}

export class MoveWindowTabToNewWindow extends Action {

	static readonly ID = 'workbench.action.moveWindowTabToNewWindow';
	static readonly LABEL = nls.localize('moveWindowTabToNewWindow', "Move Window Tab to New Window");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(MoveWindowTabToNewWindow.ID, MoveWindowTabToNewWindow.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.moveWindowTabToNewWindow().then(() => true);
	}
}

export class MergeAllWindowTabs extends Action {

	static readonly ID = 'workbench.action.mergeAllWindowTabs';
	static readonly LABEL = nls.localize('mergeAllWindowTabs', "Merge All Windows");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(MergeAllWindowTabs.ID, MergeAllWindowTabs.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.mergeAllWindowTabs().then(() => true);
	}
}

export class ToggleWindowTabsBar extends Action {

	static readonly ID = 'workbench.action.toggleWindowTabsBar';
	static readonly LABEL = nls.localize('toggleWindowTabsBar', "Toggle Window Tabs Bar");

	constructor(
		_id: string,
		_label: string,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(ToggleWindowTabsBar.ID, ToggleWindowTabsBar.LABEL);
	}

	run(): Promise<boolean> {
		return this.windowsService.toggleWindowTabsBar().then(() => true);
	}
}
