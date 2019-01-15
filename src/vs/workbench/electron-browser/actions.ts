/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';

import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService, MenuBarVisibility } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { IEditorGroupsService, GroupDirection, GroupLocation, IFindGroupScope } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts, Position as PartPosition } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { webFrame, shell } from 'electron';
import { getBaseLabel } from 'vs/base/common/labels';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { FileKind } from 'vs/platform/files/common/files';
import { IssueType } from 'vs/platform/issue/common/issue';
import { domEvent } from 'vs/base/browser/event';
import { Event } from 'vs/base/common/event';
import { IDisposable, toDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { getDomNodePagePosition, createStyleSheet, createCSSRule, append, $ } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context } from 'vs/platform/contextkey/browser/contextKeyService';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ILabelService } from 'vs/platform/label/common/label';
import { dirname } from 'vs/base/common/resources';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickInputService, IQuickPickItem, IQuickInputButton, IQuickPickSeparator, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { timeout } from 'vs/base/common/async';

// --- actions

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

export class CloseWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.closeFolder';
	static LABEL = nls.localize('closeWorkspace', "Close Workspace");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWindowService private readonly windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('noWorkspaceOpened', "There is currently no workspace opened in this instance to close."));

			return Promise.resolve(undefined);
		}

		return this.windowService.closeWorkspace();
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

export class ToggleMenuBarAction extends Action {

	static readonly ID = 'workbench.action.toggleMenuBar';
	static LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	private static readonly menuBarVisibilityKey = 'window.menuBarVisibility';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		let currentVisibilityValue = this.configurationService.getValue<MenuBarVisibility>(ToggleMenuBarAction.menuBarVisibilityKey);
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'default';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'default') {
			newVisibilityValue = 'toggle';
		} else {
			newVisibilityValue = 'default';
		}

		this.configurationService.updateValue(ToggleMenuBarAction.menuBarVisibilityKey, newVisibilityValue, ConfigurationTarget.USER);

		return Promise.resolve();
	}
}

export class ToggleDevToolsAction extends Action {

	static readonly ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private readonly windowsService: IWindowService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleDevTools();
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

export class OpenIssueReporterAction extends Action {
	static readonly ID = 'workbench.action.openIssueReporter';
	static readonly LABEL = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openReporter()
			.then(() => true);
	}
}

export class OpenProcessExplorer extends Action {
	static readonly ID = 'workbench.action.openProcessExplorer';
	static readonly LABEL = nls.localize('openProcessExplorer', "Open Process Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openProcessExplorer()
			.then(() => true);
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action {
	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		// TODO: Reporter should send timings table as well
		return this.issueService.openReporter({ issueType: IssueType.PerformanceIssue })
			.then(() => true);
	}
}


export class KeybindingsReferenceAction extends Action {

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static readonly URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	static readonly AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(KeybindingsReferenceAction.URL);
		return Promise.resolve();
	}
}

export class OpenDocumentationUrlAction extends Action {

	static readonly ID = 'workbench.action.openDocumentationUrl';
	static readonly LABEL = nls.localize('openDocumentationUrl', "Documentation");

	private static readonly URL = product.documentationUrl;
	static readonly AVAILABLE = !!OpenDocumentationUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenDocumentationUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenIntroductoryVideosUrlAction extends Action {

	static readonly ID = 'workbench.action.openIntroductoryVideosUrl';
	static readonly LABEL = nls.localize('openIntroductoryVideosUrl', "Introductory Videos");

	private static readonly URL = product.introductoryVideosUrl;
	static readonly AVAILABLE = !!OpenIntroductoryVideosUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenIntroductoryVideosUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenTipsAndTricksUrlAction extends Action {

	static readonly ID = 'workbench.action.openTipsAndTricksUrl';
	static readonly LABEL = nls.localize('openTipsAndTricksUrl', "Tips and Tricks");

	private static readonly URL = product.tipsAndTricksUrl;
	static readonly AVAILABLE = !!OpenTipsAndTricksUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenTipsAndTricksUrlAction.URL);
		return Promise.resolve();
	}
}

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @IWindowsService private readonly windowsService: IWindowsService) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.toggleSharedProcess();
	}
}

export const enum Direction {
	Next,
	Previous,
}

export abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IPanelService protected panelService: IPanelService,
		@IPartService protected partService: IPartService,
		@IViewletService protected viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);

		const isSidebarPositionLeft = this.partService.getSideBarPosition() === PartPosition.LEFT;
		const isPanelPositionDown = this.partService.getPanelPosition() === PartPosition.BOTTOM;

		if (isEditorFocus) {
			return this.navigateOnEditorFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isPanelFocus) {
			return this.navigateOnPanelFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isSidebarFocus) {
			return Promise.resolve(this.navigateOnSidebarFocus(isSidebarPositionLeft, isPanelPositionDown));
		}

		return Promise.resolve(false);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet | IPanel> {
		return Promise.resolve(true);
	}

	protected navigateOnPanelFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IPanel> {
		return Promise.resolve(true);
	}

	protected navigateOnSidebarFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean | IViewlet {
		return true;
	}

	protected navigateToPanel(): IPanel | boolean {
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			return false;
		}

		const activePanelId = this.panelService.getActivePanel().getId();

		return this.panelService.openPanel(activePanelId, true);
	}

	protected navigateToSidebar(): Promise<IViewlet | boolean> {
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return Promise.resolve(false);
		}

		const activeViewletId = this.viewletService.getActiveViewlet().getId();

		return this.viewletService.openViewlet(activeViewletId, true)
			.then(value => value === null ? false : value);
	}

	protected navigateAcrossEditorGroup(direction: GroupDirection): boolean {
		return this.doNavigateToEditorGroup({ direction });
	}

	protected navigateToEditorGroup(location: GroupLocation): boolean {
		return this.doNavigateToEditorGroup({ location });
	}

	private doNavigateToEditorGroup(scope: IFindGroupScope): boolean {
		const targetGroup = this.editorGroupService.findGroup(scope, this.editorGroupService.activeGroup);
		if (targetGroup) {
			targetGroup.focus();

			return true;
		}

		return false;
	}
}

export class NavigateLeftAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateLeft';
	static readonly LABEL = nls.localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.LEFT);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		if (isPanelPositionDown && isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		if (!isPanelPositionDown) {
			return Promise.resolve(this.navigateToEditorGroup(GroupLocation.LAST));
		}

		return Promise.resolve(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean {
		if (!isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.LAST);
		}

		return false;
	}
}

export class NavigateRightAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateRight';
	static readonly LABEL = nls.localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IViewlet | IPanel> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.RIGHT);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (!isPanelPositionDown) {
			return Promise.resolve(this.navigateToPanel());
		}

		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean {
		if (isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.FIRST);
		}

		return false;
	}
}

export class NavigateUpAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateUp';
	static readonly LABEL = nls.localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean> {
		return Promise.resolve(this.navigateAcrossEditorGroup(GroupDirection.UP));
	}

	protected navigateOnPanelFocus(_isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean> {
		if (isPanelPositionDown) {
			return Promise.resolve(this.navigateToEditorGroup(GroupLocation.LAST));
		}

		return Promise.resolve(false);
	}
}

export class NavigateDownAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateDown';
	static readonly LABEL = nls.localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IPanel> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.DOWN);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (isPanelPositionDown) {
			return Promise.resolve(this.navigateToPanel());
		}

		return Promise.resolve(false);
	}
}

// Resize focused view actions
export abstract class BaseResizeViewAction extends Action {

	// This is a media-size percentage
	protected static RESIZE_INCREMENT = 6.5;

	constructor(
		id: string,
		label: string,
		@IPartService protected partService: IPartService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		let part: Parts | undefined;
		if (isSidebarFocus) {
			part = Parts.SIDEBAR_PART;
		} else if (isPanelFocus) {
			part = Parts.PANEL_PART;
		} else if (isEditorFocus) {
			part = Parts.EDITOR_PART;
		}

		if (part) {
			this.partService.resizePart(part, sizeChange);
		}
	}
}

export class IncreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.increaseViewSize';
	static readonly LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService
	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.decreaseViewSize';
	static readonly LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
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

export class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static LABEL = nls.localize('openTwitterUrl', "Join Us on Twitter", product.applicationName);

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.twitterUrl) {
			return Promise.resolve(shell.openExternal(product.twitterUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.requestFeatureUrl) {
			return Promise.resolve(shell.openExternal(product.requestFeatureUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static LABEL = nls.localize('openLicenseUrl', "View License");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.licenseUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.licenseUrl));
			}
		}

		return Promise.resolve(false);
	}
}


export class OpenPrivacyStatementUrlAction extends Action {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static LABEL = nls.localize('openPrivacyStatement', "Privacy Statement");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.privacyStatementUrl));
			}
		}


		return Promise.resolve(false);
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

export class InspectContextKeysAction extends Action {

	static readonly ID = 'workbench.action.inspectContextKeys';
	static LABEL = nls.localize('inspect context keys', "Inspect Context Keys");

	constructor(
		id: string,
		label: string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWindowService private readonly windowService: IWindowService,
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const disposables: IDisposable[] = [];

		const stylesheet = createStyleSheet();
		disposables.push(toDisposable(() => {
			if (stylesheet.parentNode) {
				stylesheet.parentNode.removeChild(stylesheet);
			}
		}));
		createCSSRule('*', 'cursor: crosshair !important;', stylesheet);

		const hoverFeedback = document.createElement('div');
		document.body.appendChild(hoverFeedback);
		disposables.push(toDisposable(() => document.body.removeChild(hoverFeedback)));

		hoverFeedback.style.position = 'absolute';
		hoverFeedback.style.pointerEvents = 'none';
		hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		hoverFeedback.style.zIndex = '1000';

		const onMouseMove = domEvent(document.body, 'mousemove', true);
		disposables.push(onMouseMove(e => {
			const target = e.target as HTMLElement;
			const position = getDomNodePagePosition(target);

			hoverFeedback.style.top = `${position.top}px`;
			hoverFeedback.style.left = `${position.left}px`;
			hoverFeedback.style.width = `${position.width}px`;
			hoverFeedback.style.height = `${position.height}px`;
		}));

		const onMouseDown = Event.once(domEvent(document.body, 'mousedown', true));
		onMouseDown(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);

		const onMouseUp = Event.once(domEvent(document.body, 'mouseup', true));
		onMouseUp(e => {
			e.preventDefault();
			e.stopPropagation();

			const context = this.contextKeyService.getContext(e.target as HTMLElement) as Context;
			console.log(context.collectAllValues());
			this.windowService.openDevTools();

			dispose(disposables);
		}, null, disposables);

		return Promise.resolve();
	}
}

export class ToggleScreencastModeAction extends Action {

	static readonly ID = 'workbench.action.toggleScreencastMode';
	static LABEL = nls.localize('toggle mouse clicks', "Toggle Screencast Mode");

	static disposable: IDisposable | undefined;

	constructor(id: string, label: string, @IKeybindingService private readonly keybindingService: IKeybindingService) {
		super(id, label);
	}

	async run(): Promise<void> {
		if (ToggleScreencastModeAction.disposable) {
			ToggleScreencastModeAction.disposable.dispose();
			ToggleScreencastModeAction.disposable = undefined;
			return;
		}

		const mouseMarker = append(document.body, $('div'));
		mouseMarker.style.position = 'absolute';
		mouseMarker.style.border = '2px solid red';
		mouseMarker.style.borderRadius = '20px';
		mouseMarker.style.width = '20px';
		mouseMarker.style.height = '20px';
		mouseMarker.style.top = '0';
		mouseMarker.style.left = '0';
		mouseMarker.style.zIndex = '100000';
		mouseMarker.style.content = ' ';
		mouseMarker.style.pointerEvents = 'none';
		mouseMarker.style.display = 'none';

		const onMouseDown = domEvent(document.body, 'mousedown', true);
		const onMouseUp = domEvent(document.body, 'mouseup', true);
		const onMouseMove = domEvent(document.body, 'mousemove', true);

		const mouseListener = onMouseDown(e => {
			mouseMarker.style.top = `${e.clientY - 10}px`;
			mouseMarker.style.left = `${e.clientX - 10}px`;
			mouseMarker.style.display = 'block';

			const mouseMoveListener = onMouseMove(e => {
				mouseMarker.style.top = `${e.clientY - 10}px`;
				mouseMarker.style.left = `${e.clientX - 10}px`;
			});

			Event.once(onMouseUp)(() => {
				mouseMarker.style.display = 'none';
				mouseMoveListener.dispose();
			});
		});

		const keyboardMarker = append(document.body, $('div'));
		keyboardMarker.style.position = 'absolute';
		keyboardMarker.style.backgroundColor = 'rgba(0, 0, 0 ,0.5)';
		keyboardMarker.style.width = '100%';
		keyboardMarker.style.height = '100px';
		keyboardMarker.style.bottom = '20%';
		keyboardMarker.style.left = '0';
		keyboardMarker.style.zIndex = '100000';
		keyboardMarker.style.pointerEvents = 'none';
		keyboardMarker.style.color = 'white';
		keyboardMarker.style.lineHeight = '100px';
		keyboardMarker.style.textAlign = 'center';
		keyboardMarker.style.fontSize = '56px';
		keyboardMarker.style.display = 'none';

		const onKeyDown = domEvent(document.body, 'keydown', true);
		let keyboardTimeout: IDisposable = Disposable.None;

		const keyboardListener = onKeyDown(e => {
			keyboardTimeout.dispose();

			const event = new StandardKeyboardEvent(e);
			const keybinding = this.keybindingService.resolveKeyboardEvent(event);
			const label = keybinding.getLabel();

			if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && this.keybindingService.mightProducePrintableCharacter(event) && label) {
				keyboardMarker.textContent += ' ' + label;
			} else {
				keyboardMarker.textContent = label;
			}

			keyboardMarker.style.display = 'block';

			const promise = timeout(800);
			keyboardTimeout = toDisposable(() => promise.cancel());

			promise.then(() => {
				keyboardMarker.textContent = '';
				keyboardMarker.style.display = 'none';
			});
		});

		ToggleScreencastModeAction.disposable = toDisposable(() => {
			mouseListener.dispose();
			keyboardListener.dispose();
			document.body.removeChild(mouseMarker);
		});
	}
}
