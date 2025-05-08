/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/actions.css';
import { URI } from '../../../base/common/uri.js';
import { localize, localize2 } from '../../../nls.js';
import { ApplyZoomTarget, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, applyZoom } from '../../../platform/window/electron-sandbox/window.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { getZoomLevel } from '../../../base/browser/browser.js';
import { FileKind } from '../../../platform/files/common/files.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IQuickInputService, IQuickInputButton, IQuickPickItem, QuickPickInput } from '../../../platform/quickinput/common/quickInput.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { ICommandHandler } from '../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../../platform/workspace/common/workspace.js';
import { Action2, IAction2Options, MenuId } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import { IOpenedAuxiliaryWindow, IOpenedMainWindow, isOpenedAuxiliaryWindow } from '../../../platform/window/common/window.js';
import { IsAuxiliaryTitleBarContext, IsAuxiliaryWindowFocusedContext, IsWindowAlwaysOnTopContext } from '../../common/contextkeys.js';
import { isAuxiliaryWindow } from '../../../base/browser/window.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';

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

export class ToggleWindowAlwaysOnTopAction extends Action2 {

	static readonly ID = 'workbench.action.toggleWindowAlwaysOnTop';

	constructor() {
		super({
			id: ToggleWindowAlwaysOnTopAction.ID,
			title: localize2('toggleWindowAlwaysOnTop', "Toggle Window Always on Top"),
			f1: true,
			precondition: IsAuxiliaryWindowFocusedContext
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		const targetWindow = getActiveWindow();
		if (!isAuxiliaryWindow(targetWindow.window)) {
			return; // Currently, we only support toggling always on top for auxiliary windows
		}

		return nativeHostService.toggleWindowAlwaysOnTop({ targetWindowId: getActiveWindow().vscodeWindowId });
	}
}

export class EnableWindowAlwaysOnTopAction extends Action2 {

	static readonly ID = 'workbench.action.enableWindowAlwaysOnTop';

	constructor() {
		super({
			id: EnableWindowAlwaysOnTopAction.ID,
			title: localize('enableWindowAlwaysOnTop', "Set Always on Top"),
			icon: Codicon.pin,
			menu: {
				id: MenuId.LayoutControlMenu,
				when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext.toNegated(), IsAuxiliaryTitleBarContext),
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		const targetWindow = getActiveWindow();
		if (!isAuxiliaryWindow(targetWindow.window)) {
			return; // Currently, we only support toggling always on top for auxiliary windows
		}

		return nativeHostService.setWindowAlwaysOnTop(true, { targetWindowId: targetWindow.vscodeWindowId });
	}
}

export class DisableWindowAlwaysOnTopAction extends Action2 {

	static readonly ID = 'workbench.action.disableWindowAlwaysOnTop';

	constructor() {
		super({
			id: DisableWindowAlwaysOnTopAction.ID,
			title: localize('disableWindowAlwaysOnTop', "Unset Always on Top"),
			icon: Codicon.pin,
			toggled: { condition: IsWindowAlwaysOnTopContext, icon: Codicon.pinned },
			menu: {
				id: MenuId.LayoutControlMenu,
				when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext, IsAuxiliaryTitleBarContext),
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		const targetWindow = getActiveWindow();
		if (!isAuxiliaryWindow(targetWindow.window)) {
			return; // Currently, we only support toggling always on top for auxiliary windows
		}

		return nativeHostService.setWindowAlwaysOnTop(false, { targetWindowId: targetWindow.vscodeWindowId });
	}
}
