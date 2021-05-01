/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { applyZoom } from 'vs/platform/windows/electron-sandbox/window';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { getZoomLevel } from 'vs/base/browser/browser';
import { FileKind } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickInputService, IQuickInputButton } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { Codicon } from 'vs/base/common/codicons';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export class CloseCurrentWindowAction extends Action {

	static readonly ID = 'workbench.action.closeWindow';
	static readonly LABEL = localize('closeWindow', "Close Window");

	constructor(
		id: string,
		label: string,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		this.nativeHostService.closeWindow();
	}
}

export abstract class BaseZoomAction extends Action {

	private static readonly SETTING_KEY = 'window.zoomLevel';

	private static readonly MAX_ZOOM_LEVEL = 9;
	private static readonly MIN_ZOOM_LEVEL = -8;

	constructor(
		id: string,
		label: string,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(id, label);
	}

	protected async setConfiguredZoomLevel(level: number): Promise<void> {
		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		if (level > BaseZoomAction.MAX_ZOOM_LEVEL || level < BaseZoomAction.MIN_ZOOM_LEVEL) {
			return; // https://github.com/microsoft/vscode/issues/48357
		}

		await this.configurationService.updateValue(BaseZoomAction.SETTING_KEY, level);

		applyZoom(level);
	}
}

export class ZoomInAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomIn';
	static readonly LABEL = localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	override async run(): Promise<void> {
		this.setConfiguredZoomLevel(getZoomLevel() + 1);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomOut';
	static readonly LABEL = localize('zoomOut', "Zoom Out");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	override async run(): Promise<void> {
		this.setConfiguredZoomLevel(getZoomLevel() - 1);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomReset';
	static readonly LABEL = localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	override async run(): Promise<void> {
		this.setConfiguredZoomLevel(0);
	}
}

export abstract class BaseSwitchWindow extends Action {

	private readonly closeWindowAction: IQuickInputButton = {
		iconClass: Codicon.removeClose.classNames,
		tooltip: localize('close', "Close Window")
	};

	private readonly closeDirtyWindowAction: IQuickInputButton = {
		iconClass: 'dirty-window ' + Codicon.closeDirty,
		tooltip: localize('close', "Close Window"),
		alwaysVisible: true
	};

	constructor(
		id: string,
		label: string,
		private readonly quickInputService: IQuickInputService,
		private readonly keybindingService: IKeybindingService,
		private readonly modelService: IModelService,
		private readonly modeService: IModeService,
		private readonly nativeHostService: INativeHostService
	) {
		super(id, label);
	}

	protected abstract isQuickNavigate(): boolean;

	override async run(): Promise<void> {
		const currentWindowId = this.nativeHostService.windowId;

		const windows = await this.nativeHostService.getWindows();
		const placeHolder = localize('switchWindowPlaceHolder', "Select a window to switch to");
		const picks = windows.map(window => {
			const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : undefined;
			const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
			return {
				payload: window.id,
				label: window.title,
				ariaLabel: window.dirty ? localize('windowDirtyAriaLabel', "{0}, dirty window", window.title) : window.title,
				iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
				description: (currentWindowId === window.id) ? localize('current', "Current Window") : undefined,
				buttons: currentWindowId !== window.id ? window.dirty ? [this.closeDirtyWindowAction] : [this.closeWindowAction] : undefined
			};
		});
		const autoFocusIndex = (picks.indexOf(picks.filter(pick => pick.payload === currentWindowId)[0]) + 1) % picks.length;

		const pick = await this.quickInputService.pick(picks, {
			contextKey: 'inWindowsPicker',
			activeItem: picks[autoFocusIndex],
			placeHolder,
			quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : undefined,
			onDidTriggerItemButton: async context => {
				await this.nativeHostService.closeWindowById(context.item.payload);
				context.removeItem();
			}
		});

		if (pick) {
			this.nativeHostService.focusWindow({ windowId: pick.payload });
		}
	}
}

export class SwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.switchWindow';
	static readonly LABEL = localize('switchWindow', "Switch Window...");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super(id, label, quickInputService, keybindingService, modelService, modeService, nativeHostService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickSwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.quickSwitchWindow';
	static readonly LABEL = localize('quickSwitchWindow', "Quick Switch Window...");

	constructor(
		id: string,
		label: string,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super(id, label, quickInputService, keybindingService, modelService, modeService, nativeHostService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export const NewWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).newWindowTab();
};

export const ShowPreviousWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).showPreviousWindowTab();
};

export const ShowNextWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).showNextWindowTab();
};

export const MoveWindowTabToNewWindowHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).moveWindowTabToNewWindow();
};

export const MergeWindowTabsHandlerHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).mergeAllWindowTabs();
};

export const ToggleWindowTabsBarHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	return accessor.get(INativeHostService).toggleWindowTabsBar();
};
