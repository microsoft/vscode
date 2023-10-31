/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { applyZoom } from 'vs/platform/window/electron-sandbox/window';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { getZoomLevel } from 'vs/base/browser/browser';
import { FileKind } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IQuickInputService, IQuickInputButton } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INativeHostService } from 'vs/platform/native/common/native';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { Action2, IAction2Options, MenuId } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { isMacintosh } from 'vs/base/common/platform';

export class CloseWindowAction extends Action2 {

	static readonly ID = 'workbench.action.closeWindow';

	constructor() {
		super({
			id: CloseWindowAction.ID,
			title: {
				value: localize('closeWindow', "Close Window"),
				mnemonicTitle: localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window"),
				original: 'Close Window'
			},
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW },
				linux: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] },
				win: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] }
			},
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '6_close',
				order: 4
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		return nativeHostService.closeWindow();
	}
}

abstract class BaseZoomAction extends Action2 {

	private static readonly SETTING_KEY = 'window.zoomLevel';

	private static readonly MAX_ZOOM_LEVEL = 8;
	private static readonly MIN_ZOOM_LEVEL = -8;

	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	protected async setConfiguredZoomLevel(accessor: ServicesAccessor, level: number): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		if (level > BaseZoomAction.MAX_ZOOM_LEVEL || level < BaseZoomAction.MIN_ZOOM_LEVEL) {
			return; // https://github.com/microsoft/vscode/issues/48357
		}

		await configurationService.updateValue(BaseZoomAction.SETTING_KEY, level);

		applyZoom(level);
	}
}

export class ZoomInAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomIn',
			title: {
				value: localize('zoomIn', "Zoom In"),
				mnemonicTitle: localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"),
				original: 'Zoom In'
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Equal,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Equal, KeyMod.CtrlCmd | KeyCode.NumpadAdd]
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 1
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return super.setConfiguredZoomLevel(accessor, getZoomLevel() + 1);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomOut',
			title: {
				value: localize('zoomOut', "Zoom Out"),
				mnemonicTitle: localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "&&Zoom Out"),
				original: 'Zoom Out'
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Minus,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, KeyMod.CtrlCmd | KeyCode.NumpadSubtract],
				linux: {
					primary: KeyMod.CtrlCmd | KeyCode.Minus,
					secondary: [KeyMod.CtrlCmd | KeyCode.NumpadSubtract]
				}
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 2
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return super.setConfiguredZoomLevel(accessor, getZoomLevel() - 1);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomReset',
			title: {
				value: localize('zoomReset', "Reset Zoom"),
				mnemonicTitle: localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom"),
				original: 'Reset Zoom'
			},
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Numpad0
			},
			menu: {
				id: MenuId.MenubarAppearanceMenu,
				group: '5_zoom',
				order: 3
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return super.setConfiguredZoomLevel(accessor, 0);
	}
}

abstract class BaseSwitchWindow extends Action2 {

	private readonly closeWindowAction: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.removeClose),
		tooltip: localize('close', "Close Window")
	};

	private readonly closeDirtyWindowAction: IQuickInputButton = {
		iconClass: 'dirty-window ' + Codicon.closeDirty,
		tooltip: localize('close', "Close Window"),
		alwaysVisible: true
	};

	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	protected abstract isQuickNavigate(): boolean;

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const keybindingService = accessor.get(IKeybindingService);
		const modelService = accessor.get(IModelService);
		const languageService = accessor.get(ILanguageService);
		const nativeHostService = accessor.get(INativeHostService);

		const currentWindowId = nativeHostService.windowId;

		const windows = await nativeHostService.getWindows();
		const placeHolder = localize('switchWindowPlaceHolder', "Select a window to switch to");
		const picks = windows.map(window => {
			const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : undefined;
			const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
			return {
				payload: window.id,
				label: window.title,
				ariaLabel: window.dirty ? localize('windowDirtyAriaLabel', "{0}, window with unsaved changes", window.title) : window.title,
				iconClasses: getIconClasses(modelService, languageService, resource, fileKind),
				description: (currentWindowId === window.id) ? localize('current', "Current Window") : undefined,
				buttons: currentWindowId !== window.id ? window.dirty ? [this.closeDirtyWindowAction] : [this.closeWindowAction] : undefined
			};
		});
		const autoFocusIndex = (picks.indexOf(picks.filter(pick => pick.payload === currentWindowId)[0]) + 1) % picks.length;

		const pick = await quickInputService.pick(picks, {
			contextKey: 'inWindowsPicker',
			activeItem: picks[autoFocusIndex],
			placeHolder,
			quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : undefined,
			hideInput: this.isQuickNavigate(),
			onDidTriggerItemButton: async context => {
				await nativeHostService.closeWindowById(context.item.payload);
				context.removeItem();
			}
		});

		if (pick) {
			nativeHostService.focusWindow({ windowId: pick.payload });
		}
	}
}

export class SwitchWindowAction extends BaseSwitchWindow {

	constructor() {
		super({
			id: 'workbench.action.switchWindow',
			title: { value: localize('switchWindow', "Switch Window..."), original: 'Switch Window...' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: 0,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyW }
			}
		});
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickSwitchWindowAction extends BaseSwitchWindow {

	constructor() {
		super({
			id: 'workbench.action.quickSwitchWindow',
			title: { value: localize('quickSwitchWindow', "Quick Switch Window..."), original: 'Quick Switch Window...' },
			f1: false // hide quick pickers from command palette to not confuse with the other entry that shows a input field
		});
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

function canRunNativeTabsHandler(accessor: ServicesAccessor): boolean {
	if (!isMacintosh) {
		return false;
	}

	const configurationService = accessor.get(IConfigurationService);
	return configurationService.getValue<unknown>('window.nativeTabs') === true;
}

export const NewWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).newWindowTab();
};

export const ShowPreviousWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).showPreviousWindowTab();
};

export const ShowNextWindowTabHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).showNextWindowTab();
};

export const MoveWindowTabToNewWindowHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).moveWindowTabToNewWindow();
};

export const MergeWindowTabsHandlerHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).mergeAllWindowTabs();
};

export const ToggleWindowTabsBarHandler: ICommandHandler = function (accessor: ServicesAccessor) {
	if (!canRunNativeTabsHandler(accessor)) {
		return;
	}

	return accessor.get(INativeHostService).toggleWindowTabsBar();
};
