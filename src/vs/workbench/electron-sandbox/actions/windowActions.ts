/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/actions';
import { URI } from 'vs/base/common/uri';
import { localize, localize2 } from 'vs/nls';
import { ApplyZoomTarget, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, applyZoom } from 'vs/platform/window/electron-sandbox/window';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { getZoomLevel } from 'vs/base/browser/browser';
import { FileKind } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IQuickInputService, IQuickInputButton, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
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
import { getActiveWindow } from 'vs/base/browser/dom';
import { IOpenedAuxiliaryWindow, IOpenedMainWindow, isOpenedAuxiliaryWindow } from 'vs/platform/window/common/window';

export class CloseWindowAction extends Action2 {

	static readonly ID = 'workbench.action.closeWindow';

	constructor() {
		super({
			id: CloseWindowAction.ID,
			title: {
				...localize2('closeWindow', "Close Window"),
				mnemonicTitle: localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window"),
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

		return nativeHostService.closeWindow({ targetWindowId: getActiveWindow().vscodeWindowId });
	}
}

abstract class BaseZoomAction extends Action2 {

	private static readonly ZOOM_LEVEL_SETTING_KEY = 'window.zoomLevel';
	private static readonly ZOOM_PER_WINDOW_SETTING_KEY = 'window.zoomPerWindow';

	constructor(desc: Readonly<IAction2Options>) {
		super(desc);
	}

	protected async setZoomLevel(accessor: ServicesAccessor, levelOrReset: number | true): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		let target: ApplyZoomTarget;
		if (configurationService.getValue(BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY) !== false) {
			target = ApplyZoomTarget.ACTIVE_WINDOW;
		} else {
			target = ApplyZoomTarget.ALL_WINDOWS;
		}

		let level: number;
		if (typeof levelOrReset === 'number') {
			level = Math.round(levelOrReset); // prevent fractional zoom levels
		} else {

			// reset to 0 when we apply to all windows
			if (target === ApplyZoomTarget.ALL_WINDOWS) {
				level = 0;
			}

			// otherwise, reset to the default zoom level
			else {
				const defaultLevel = configurationService.getValue(BaseZoomAction.ZOOM_LEVEL_SETTING_KEY);
				if (typeof defaultLevel === 'number') {
					level = defaultLevel;
				} else {
					level = 0;
				}
			}
		}

		if (level > MAX_ZOOM_LEVEL || level < MIN_ZOOM_LEVEL) {
			return; // https://github.com/microsoft/vscode/issues/48357
		}

		if (target === ApplyZoomTarget.ALL_WINDOWS) {
			await configurationService.updateValue(BaseZoomAction.ZOOM_LEVEL_SETTING_KEY, level);
		}

		applyZoom(level, target);
	}
}

export class ZoomInAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomIn',
			title: {
				...localize2('zoomIn', "Zoom In"),
				mnemonicTitle: localize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"),
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
		return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) + 1);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomOut',
			title: {
				...localize2('zoomOut', "Zoom Out"),
				mnemonicTitle: localize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "&&Zoom Out"),
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
		return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) - 1);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	constructor() {
		super({
			id: 'workbench.action.zoomReset',
			title: {
				...localize2('zoomReset', "Reset Zoom"),
				mnemonicTitle: localize({ key: 'miZoomReset', comment: ['&& denotes a mnemonic'] }, "&&Reset Zoom"),
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
		return super.setZoomLevel(accessor, true);
	}
}

abstract class BaseSwitchWindow extends Action2 {

	private readonly closeWindowAction: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.removeClose),
		tooltip: localize('close', "Close Window")
	};

	private readonly closeDirtyWindowAction: IQuickInputButton = {
		iconClass: 'dirty-window ' + ThemeIcon.asClassName(Codicon.closeDirty),
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

		const currentWindowId = getActiveWindow().vscodeWindowId;

		const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: true });

		const mainWindows = new Set<IOpenedMainWindow>();
		const mapMainWindowToAuxiliaryWindows = new Map<number, Set<IOpenedAuxiliaryWindow>>();
		for (const window of windows) {
			if (isOpenedAuxiliaryWindow(window)) {
				let auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.parentId);
				if (!auxiliaryWindows) {
					auxiliaryWindows = new Set<IOpenedAuxiliaryWindow>();
					mapMainWindowToAuxiliaryWindows.set(window.parentId, auxiliaryWindows);
				}
				auxiliaryWindows.add(window);
			} else {
				mainWindows.add(window);
			}
		}

		interface IWindowPickItem extends IQuickPickItem {
			readonly windowId: number;
		}

		function isWindowPickItem(candidate: unknown): candidate is IWindowPickItem {
			const windowPickItem = candidate as IWindowPickItem | undefined;

			return typeof windowPickItem?.windowId === 'number';
		}

		const picks: Array<QuickPickInput<IWindowPickItem>> = [];
		for (const window of mainWindows) {
			const auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.id);
			if (mapMainWindowToAuxiliaryWindows.size > 0) {
				picks.push({ type: 'separator', label: auxiliaryWindows ? localize('windowGroup', "window group") : undefined });
			}

			const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : undefined;
			const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
			const pick: IWindowPickItem = {
				windowId: window.id,
				label: window.title,
				ariaLabel: window.dirty ? localize('windowDirtyAriaLabel', "{0}, window with unsaved changes", window.title) : window.title,
				iconClasses: getIconClasses(modelService, languageService, resource, fileKind),
				description: (currentWindowId === window.id) ? localize('current', "Current Window") : undefined,
				buttons: currentWindowId !== window.id ? window.dirty ? [this.closeDirtyWindowAction] : [this.closeWindowAction] : undefined
			};
			picks.push(pick);

			if (auxiliaryWindows) {
				for (const auxiliaryWindow of auxiliaryWindows) {
					const pick: IWindowPickItem = {
						windowId: auxiliaryWindow.id,
						label: auxiliaryWindow.title,
						iconClasses: getIconClasses(modelService, languageService, auxiliaryWindow.filename ? URI.file(auxiliaryWindow.filename) : undefined, FileKind.FILE),
						description: (currentWindowId === auxiliaryWindow.id) ? localize('current', "Current Window") : undefined,
						buttons: [this.closeWindowAction]
					};
					picks.push(pick);
				}
			}
		}

		const pick = await quickInputService.pick(picks, {
			contextKey: 'inWindowsPicker',
			activeItem: (() => {
				for (let i = 0; i < picks.length; i++) {
					const pick = picks[i];
					if (isWindowPickItem(pick) && pick.windowId === currentWindowId) {
						let nextPick = picks[i + 1]; // try to select next window unless it's a separator
						if (isWindowPickItem(nextPick)) {
							return nextPick;
						}

						nextPick = picks[i + 2]; // otherwise try to select the next window after the separator
						if (isWindowPickItem(nextPick)) {
							return nextPick;
						}
					}
				}

				return undefined;
			})(),
			placeHolder: localize('switchWindowPlaceHolder', "Select a window to switch to"),
			quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : undefined,
			hideInput: this.isQuickNavigate(),
			onDidTriggerItemButton: async context => {
				await nativeHostService.closeWindow({ targetWindowId: context.item.windowId });
				context.removeItem();
			}
		});

		if (pick) {
			nativeHostService.focusWindow({ targetWindowId: pick.windowId });
		}
	}
}

export class SwitchWindowAction extends BaseSwitchWindow {

	constructor() {
		super({
			id: 'workbench.action.switchWindow',
			title: localize2('switchWindow', 'Switch Window...'),
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
			title: localize2('quickSwitchWindow', 'Quick Switch Window...'),
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
