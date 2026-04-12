/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/actions.css';
import { URI } from '../../../base/common/uri.js';
import { localize, localize2 } from '../../../nls.js';
import { ApplyZoomTarget, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, applyZoom } from '../../../platform/window/electron-browser/window.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { getZoomLevel } from '../../../base/browser/browser.js';
import { FileKind } from '../../../platform/files/common/files.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { getIconClasses } from '../../../editor/common/services/getIconClasses.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../../platform/workspace/common/workspace.js';
import { Action2, MenuId } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import { isOpenedAuxiliaryWindow } from '../../../platform/window/common/window.js';
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsWindowAlwaysOnTopContext } from '../../common/contextkeys.js';
import { isAuxiliaryWindow } from '../../../base/browser/window.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
export class CloseWindowAction extends Action2 {
    static { this.ID = 'workbench.action.closeWindow'; }
    constructor() {
        super({
            id: CloseWindowAction.ID,
            title: {
                ...localize2('closeWindow', "Close Window"),
                mnemonicTitle: localize({ key: 'miCloseWindow', comment: ['&& denotes a mnemonic'] }, "Clos&&e Window"),
            },
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 53 /* KeyCode.KeyW */ },
                linux: { primary: 512 /* KeyMod.Alt */ | 62 /* KeyCode.F4 */, secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 53 /* KeyCode.KeyW */] },
                win: { primary: 512 /* KeyMod.Alt */ | 62 /* KeyCode.F4 */, secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 53 /* KeyCode.KeyW */] }
            },
            menu: {
                id: MenuId.MenubarFileMenu,
                group: '6_close',
                order: 4
            }
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        return nativeHostService.closeWindow({ targetWindowId: getActiveWindow().vscodeWindowId });
    }
}
export class CloseOtherWindowsAction extends Action2 {
    static { this.ID = 'workbench.action.closeOtherWindows'; }
    constructor() {
        super({
            id: CloseOtherWindowsAction.ID,
            title: localize2('closeOtherWindows', "Close Other Windows"),
            f1: true
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const currentWindowId = getActiveWindow().vscodeWindowId;
        const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
        for (const window of windows) {
            if (window.id !== currentWindowId) {
                nativeHostService.closeWindow({ targetWindowId: window.id });
            }
        }
    }
}
class BaseZoomAction extends Action2 {
    static { this.ZOOM_LEVEL_SETTING_KEY = 'window.zoomLevel'; }
    static { this.ZOOM_PER_WINDOW_SETTING_KEY = 'window.zoomPerWindow'; }
    async setZoomLevel(accessor, levelOrReset) {
        const configurationService = accessor.get(IConfigurationService);
        let target;
        if (configurationService.getValue(BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY) !== false) {
            target = ApplyZoomTarget.ACTIVE_WINDOW;
        }
        else {
            target = ApplyZoomTarget.ALL_WINDOWS;
        }
        let level;
        if (typeof levelOrReset === 'number') {
            level = Math.round(levelOrReset); // prevent fractional zoom levels
        }
        else {
            // reset to 0 when we apply to all windows
            if (target === ApplyZoomTarget.ALL_WINDOWS) {
                level = 0;
            }
            // otherwise, reset to the default zoom level
            else {
                const defaultLevel = configurationService.getValue(BaseZoomAction.ZOOM_LEVEL_SETTING_KEY);
                if (typeof defaultLevel === 'number') {
                    level = defaultLevel;
                }
                else {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 86 /* KeyCode.Equal */, 2048 /* KeyMod.CtrlCmd */ | 109 /* KeyCode.NumpadAdd */]
            },
            menu: {
                id: MenuId.MenubarAppearanceMenu,
                group: '5_zoom',
                order: 1
            }
        });
    }
    run(accessor) {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 88 /* KeyCode.Minus */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 88 /* KeyCode.Minus */, 2048 /* KeyMod.CtrlCmd */ | 111 /* KeyCode.NumpadSubtract */],
                linux: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 88 /* KeyCode.Minus */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 111 /* KeyCode.NumpadSubtract */]
                }
            },
            menu: {
                id: MenuId.MenubarAppearanceMenu,
                group: '5_zoom',
                order: 2
            }
        });
    }
    run(accessor) {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */
            },
            menu: {
                id: MenuId.MenubarAppearanceMenu,
                group: '5_zoom',
                order: 3
            }
        });
    }
    run(accessor) {
        return super.setZoomLevel(accessor, true);
    }
}
class BaseSwitchWindow extends Action2 {
    constructor() {
        super(...arguments);
        this.closeWindowAction = {
            iconClass: ThemeIcon.asClassName(Codicon.removeClose),
            tooltip: localize('close', "Close Window")
        };
        this.closeDirtyWindowAction = {
            iconClass: 'dirty-window ' + ThemeIcon.asClassName(Codicon.closeDirty),
            tooltip: localize('close', "Close Window"),
            alwaysVisible: true
        };
        this.closeActiveWindowAction = {
            iconClass: 'active-window ' + ThemeIcon.asClassName(Codicon.windowActive),
            tooltip: localize('closeActive', "Close Active Window"),
            alwaysVisible: true
        };
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const keybindingService = accessor.get(IKeybindingService);
        const modelService = accessor.get(IModelService);
        const languageService = accessor.get(ILanguageService);
        const nativeHostService = accessor.get(INativeHostService);
        const currentWindowId = getActiveWindow().vscodeWindowId;
        const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: true });
        const mainWindows = new Set();
        const mapMainWindowToAuxiliaryWindows = new Map();
        for (const window of windows) {
            if (isOpenedAuxiliaryWindow(window)) {
                let auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.parentId);
                if (!auxiliaryWindows) {
                    auxiliaryWindows = new Set();
                    mapMainWindowToAuxiliaryWindows.set(window.parentId, auxiliaryWindows);
                }
                auxiliaryWindows.add(window);
            }
            else {
                mainWindows.add(window);
            }
        }
        function isWindowPickItem(candidate) {
            const windowPickItem = candidate;
            return typeof windowPickItem?.windowId === 'number';
        }
        const picks = [];
        for (const window of mainWindows) {
            const auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.id);
            if (mapMainWindowToAuxiliaryWindows.size > 0) {
                picks.push({ type: 'separator', label: auxiliaryWindows ? localize('windowGroup', "window group") : undefined });
            }
            const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : undefined;
            const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
            const pick = {
                windowId: window.id,
                label: window.title,
                ariaLabel: window.dirty ? localize('windowDirtyAriaLabel', "{0}, window with unsaved changes", window.title) : window.title,
                iconClasses: getIconClasses(modelService, languageService, resource, fileKind),
                description: (currentWindowId === window.id) ? localize('current', "Current Window") : undefined,
                buttons: window.dirty ? [this.closeDirtyWindowAction] : currentWindowId === window.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
            };
            picks.push(pick);
            if (auxiliaryWindows) {
                for (const auxiliaryWindow of auxiliaryWindows) {
                    const pick = {
                        windowId: auxiliaryWindow.id,
                        label: auxiliaryWindow.title,
                        iconClasses: getIconClasses(modelService, languageService, auxiliaryWindow.filename ? URI.file(auxiliaryWindow.filename) : undefined, FileKind.FILE),
                        description: (currentWindowId === auxiliaryWindow.id) ? localize('current', "Current Window") : undefined,
                        buttons: currentWindowId === auxiliaryWindow.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
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
            onDidTriggerItemButton: async (context) => {
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 0,
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 53 /* KeyCode.KeyW */ }
            }
        });
    }
    isQuickNavigate() {
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
    isQuickNavigate() {
        return true;
    }
}
function canRunNativeTabsHandler(accessor) {
    if (!isMacintosh) {
        return false;
    }
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.getValue('window.nativeTabs') === true;
}
export const NewWindowTabHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).newWindowTab();
};
export const ShowPreviousWindowTabHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).showPreviousWindowTab();
};
export const ShowNextWindowTabHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).showNextWindowTab();
};
export const MoveWindowTabToNewWindowHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).moveWindowTabToNewWindow();
};
export const MergeWindowTabsHandlerHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).mergeAllWindowTabs();
};
export const ToggleWindowTabsBarHandler = function (accessor) {
    if (!canRunNativeTabsHandler(accessor)) {
        return;
    }
    return accessor.get(INativeHostService).toggleWindowTabsBar();
};
export class ToggleWindowAlwaysOnTopAction extends Action2 {
    static { this.ID = 'workbench.action.toggleWindowAlwaysOnTop'; }
    constructor() {
        super({
            id: ToggleWindowAlwaysOnTopAction.ID,
            title: localize2('toggleWindowAlwaysOnTop', "Toggle Window Always on Top"),
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const targetWindow = getActiveWindow();
        if (!isAuxiliaryWindow(targetWindow.window)) {
            return; // Currently, we only support toggling always on top for auxiliary windows
        }
        return nativeHostService.toggleWindowAlwaysOnTop({ targetWindowId: getActiveWindow().vscodeWindowId });
    }
}
export class EnableWindowAlwaysOnTopAction extends Action2 {
    static { this.ID = 'workbench.action.enableWindowAlwaysOnTop'; }
    constructor() {
        super({
            id: EnableWindowAlwaysOnTopAction.ID,
            title: localize('enableWindowAlwaysOnTop', "Turn On Always on Top"),
            icon: Codicon.pin,
            menu: {
                id: MenuId.LayoutControlMenu,
                when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext.toNegated(), IsAuxiliaryWindowContext),
                order: 1
            }
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const targetWindow = getActiveWindow();
        if (!isAuxiliaryWindow(targetWindow.window)) {
            return; // Currently, we only support toggling always on top for auxiliary windows
        }
        return nativeHostService.setWindowAlwaysOnTop(true, { targetWindowId: targetWindow.vscodeWindowId });
    }
}
export class DisableWindowAlwaysOnTopAction extends Action2 {
    static { this.ID = 'workbench.action.disableWindowAlwaysOnTop'; }
    constructor() {
        super({
            id: DisableWindowAlwaysOnTopAction.ID,
            title: localize('disableWindowAlwaysOnTop', "Turn Off Always on Top"),
            icon: Codicon.pinned,
            menu: {
                id: MenuId.LayoutControlMenu,
                when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext, IsAuxiliaryWindowContext),
                order: 1
            }
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const targetWindow = getActiveWindow();
        if (!isAuxiliaryWindow(targetWindow.window)) {
            return; // Currently, we only support toggling always on top for auxiliary windows
        }
        return nativeHostService.setWindowAlwaysOnTop(false, { targetWindowId: targetWindow.vscodeWindowId });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLHFCQUFxQixDQUFDO0FBQzdCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsa0JBQWtCLEVBQXFELE1BQU0sbURBQW1ELENBQUM7QUFDMUksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDM0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFHdkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQTZDLHVCQUF1QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDL0gsT0FBTyxFQUFFLHdCQUF3QixFQUFFLCtCQUErQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDcEksT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5GLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxPQUFPO2FBRTdCLE9BQUUsR0FBRyw4QkFBOEIsQ0FBQztJQUVwRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFO1lBQ3hCLEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDO2dCQUMzQyxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLENBQUM7YUFDdkc7WUFDRCxFQUFFLEVBQUUsSUFBSTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLG1EQUE2Qix3QkFBZSxFQUFFO2dCQUM5RCxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsMENBQXVCLEVBQUUsU0FBUyxFQUFFLENBQUMsbURBQTZCLHdCQUFlLENBQUMsRUFBRTtnQkFDdEcsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLDBDQUF1QixFQUFFLFNBQVMsRUFBRSxDQUFDLG1EQUE2Qix3QkFBZSxDQUFDLEVBQUU7YUFDcEc7WUFDRCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2dCQUMxQixLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELE9BQU8saUJBQWlCLENBQUMsV0FBVyxDQUFDLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDNUYsQ0FBQzs7QUFHRixNQUFNLE9BQU8sdUJBQXdCLFNBQVEsT0FBTzthQUUzQixPQUFFLEdBQUcsb0NBQW9DLENBQUM7SUFFbEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsdUJBQXVCLENBQUMsRUFBRTtZQUM5QixLQUFLLEVBQUUsU0FBUyxDQUFDLG1CQUFtQixFQUFFLHFCQUFxQixDQUFDO1lBQzVELEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFM0QsTUFBTSxlQUFlLEdBQUcsZUFBZSxFQUFFLENBQUMsY0FBYyxDQUFDO1FBQ3pELE1BQU0sT0FBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsVUFBVSxDQUFDLEVBQUUsdUJBQXVCLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUV2RixLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzlCLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDbkMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQzs7QUFHRixNQUFlLGNBQWUsU0FBUSxPQUFPO2FBRXBCLDJCQUFzQixHQUFHLGtCQUFrQixDQUFDO2FBQzVDLGdDQUEyQixHQUFHLHNCQUFzQixDQUFDO0lBRW5FLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBMEIsRUFBRSxZQUEyQjtRQUNuRixNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUVqRSxJQUFJLE1BQXVCLENBQUM7UUFDNUIsSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDekYsTUFBTSxHQUFHLGVBQWUsQ0FBQyxhQUFhLENBQUM7UUFDeEMsQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLEdBQUcsZUFBZSxDQUFDLFdBQVcsQ0FBQztRQUN0QyxDQUFDO1FBRUQsSUFBSSxLQUFhLENBQUM7UUFDbEIsSUFBSSxPQUFPLFlBQVksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN0QyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLGlDQUFpQztRQUNwRSxDQUFDO2FBQU0sQ0FBQztZQUVQLDBDQUEwQztZQUMxQyxJQUFJLE1BQU0sS0FBSyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQzVDLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDWCxDQUFDO1lBRUQsNkNBQTZDO2lCQUN4QyxDQUFDO2dCQUNMLE1BQU0sWUFBWSxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFDMUYsSUFBSSxPQUFPLFlBQVksS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDdEMsS0FBSyxHQUFHLFlBQVksQ0FBQztnQkFDdEIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLEtBQUssR0FBRyxDQUFDLENBQUM7Z0JBQ1gsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxLQUFLLEdBQUcsY0FBYyxJQUFJLEtBQUssR0FBRyxjQUFjLEVBQUUsQ0FBQztZQUN0RCxPQUFPLENBQUMsbURBQW1EO1FBQzVELENBQUM7UUFFRCxJQUFJLE1BQU0sS0FBSyxlQUFlLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUMsTUFBTSxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RGLENBQUM7UUFFRCxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzFCLENBQUM7O0FBR0YsTUFBTSxPQUFPLFlBQWEsU0FBUSxjQUFjO0lBRS9DO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHlCQUF5QjtZQUM3QixLQUFLLEVBQUU7Z0JBQ04sR0FBRyxTQUFTLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQztnQkFDakMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQzthQUM3RjtZQUNELFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTtZQUN6QixFQUFFLEVBQUUsSUFBSTtZQUNSLFVBQVUsRUFBRTtnQkFDWCxNQUFNLDZDQUFtQztnQkFDekMsT0FBTyxFQUFFLGtEQUE4QjtnQkFDdkMsU0FBUyxFQUFFLENBQUMsbURBQTZCLHlCQUFnQixFQUFFLHVEQUFrQyxDQUFDO2FBQzlGO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsUUFBUTtnQkFDZixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEdBQUcsQ0FBQyxRQUEwQjtRQUN0QyxPQUFPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxhQUFjLFNBQVEsY0FBYztJQUVoRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwwQkFBMEI7WUFDOUIsS0FBSyxFQUFFO2dCQUNOLEdBQUcsU0FBUyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7Z0JBQ25DLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUM7YUFDL0Y7WUFDRCxRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7WUFDekIsRUFBRSxFQUFFLElBQUk7WUFDUixVQUFVLEVBQUU7Z0JBQ1gsTUFBTSw2Q0FBbUM7Z0JBQ3pDLE9BQU8sRUFBRSxrREFBOEI7Z0JBQ3ZDLFNBQVMsRUFBRSxDQUFDLG1EQUE2Qix5QkFBZ0IsRUFBRSw0REFBdUMsQ0FBQztnQkFDbkcsS0FBSyxFQUFFO29CQUNOLE9BQU8sRUFBRSxrREFBOEI7b0JBQ3ZDLFNBQVMsRUFBRSxDQUFDLDREQUF1QyxDQUFDO2lCQUNwRDthQUNEO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsUUFBUTtnQkFDZixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEdBQUcsQ0FBQyxRQUEwQjtRQUN0QyxPQUFPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxlQUFnQixTQUFRLGNBQWM7SUFFbEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsNEJBQTRCO1lBQ2hDLEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDO2dCQUN2QyxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsY0FBYyxDQUFDO2FBQ25HO1lBQ0QsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO1lBQ3pCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsVUFBVSxFQUFFO2dCQUNYLE1BQU0sNkNBQW1DO2dCQUN6QyxPQUFPLEVBQUUsb0RBQWdDO2FBQ3pDO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMscUJBQXFCO2dCQUNoQyxLQUFLLEVBQUUsUUFBUTtnQkFDZixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEdBQUcsQ0FBQyxRQUEwQjtRQUN0QyxPQUFPLEtBQUssQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzNDLENBQUM7Q0FDRDtBQUVELE1BQWUsZ0JBQWlCLFNBQVEsT0FBTztJQUEvQzs7UUFFa0Isc0JBQWlCLEdBQXNCO1lBQ3ZELFNBQVMsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7WUFDckQsT0FBTyxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDO1NBQzFDLENBQUM7UUFFZSwyQkFBc0IsR0FBc0I7WUFDNUQsU0FBUyxFQUFFLGVBQWUsR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUM7WUFDdEUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDO1lBQzFDLGFBQWEsRUFBRSxJQUFJO1NBQ25CLENBQUM7UUFFZSw0QkFBdUIsR0FBc0I7WUFDN0QsU0FBUyxFQUFFLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztZQUN6RSxPQUFPLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxxQkFBcUIsQ0FBQztZQUN2RCxhQUFhLEVBQUUsSUFBSTtTQUNuQixDQUFDO0lBMEdILENBQUM7SUF0R1MsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN2RCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUUzRCxNQUFNLGVBQWUsR0FBRyxlQUFlLEVBQUUsQ0FBQyxjQUFjLENBQUM7UUFFekQsTUFBTSxPQUFPLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRXRGLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO1FBQ2pELE1BQU0sK0JBQStCLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7UUFDdkYsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM5QixJQUFJLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3JDLElBQUksZ0JBQWdCLEdBQUcsK0JBQStCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7b0JBQ3ZCLGdCQUFnQixHQUFHLElBQUksR0FBRyxFQUEwQixDQUFDO29CQUNyRCwrQkFBK0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUN4RSxDQUFDO2dCQUNELGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQztRQU1ELFNBQVMsZ0JBQWdCLENBQUMsU0FBa0I7WUFDM0MsTUFBTSxjQUFjLEdBQUcsU0FBd0MsQ0FBQztZQUVoRSxPQUFPLE9BQU8sY0FBYyxFQUFFLFFBQVEsS0FBSyxRQUFRLENBQUM7UUFDckQsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUEyQyxFQUFFLENBQUM7UUFDekQsS0FBSyxNQUFNLE1BQU0sSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNsQyxNQUFNLGdCQUFnQixHQUFHLCtCQUErQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEUsSUFBSSwrQkFBK0IsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNsSCxDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUM5TixNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztZQUMxTSxNQUFNLElBQUksR0FBb0I7Z0JBQzdCLFFBQVEsRUFBRSxNQUFNLENBQUMsRUFBRTtnQkFDbkIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO2dCQUNuQixTQUFTLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUs7Z0JBQzNILFdBQVcsRUFBRSxjQUFjLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDO2dCQUM5RSxXQUFXLEVBQUUsQ0FBQyxlQUFlLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ2hHLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUM7YUFDakosQ0FBQztZQUNGLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakIsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN0QixLQUFLLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ2hELE1BQU0sSUFBSSxHQUFvQjt3QkFDN0IsUUFBUSxFQUFFLGVBQWUsQ0FBQyxFQUFFO3dCQUM1QixLQUFLLEVBQUUsZUFBZSxDQUFDLEtBQUs7d0JBQzVCLFdBQVcsRUFBRSxjQUFjLENBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUM7d0JBQ3BKLFdBQVcsRUFBRSxDQUFDLGVBQWUsS0FBSyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUzt3QkFDekcsT0FBTyxFQUFFLGVBQWUsS0FBSyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztxQkFDM0csQ0FBQztvQkFDRixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNsQixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDaEQsVUFBVSxFQUFFLGlCQUFpQjtZQUM3QixVQUFVLEVBQUUsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2pCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ3ZDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdEIsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLGVBQWUsRUFBRSxDQUFDO3dCQUNqRSxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsb0RBQW9EO3dCQUNqRixJQUFJLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7NEJBQ2hDLE9BQU8sUUFBUSxDQUFDO3dCQUNqQixDQUFDO3dCQUVELFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsOERBQThEO3dCQUN2RixJQUFJLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7NEJBQ2hDLE9BQU8sUUFBUSxDQUFDO3dCQUNqQixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDLENBQUMsRUFBRTtZQUNKLFdBQVcsRUFBRSxRQUFRLENBQUMseUJBQXlCLEVBQUUsOEJBQThCLENBQUM7WUFDaEYsYUFBYSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLEVBQUUsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ3RILFNBQVMsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFO1lBQ2pDLHNCQUFzQixFQUFFLEtBQUssRUFBQyxPQUFPLEVBQUMsRUFBRTtnQkFDdkMsTUFBTSxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxjQUFjLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRSxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdEIsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILElBQUksSUFBSSxFQUFFLENBQUM7WUFDVixpQkFBaUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDbEUsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxrQkFBbUIsU0FBUSxnQkFBZ0I7SUFFdkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsK0JBQStCO1lBQ25DLEtBQUssRUFBRSxTQUFTLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDO1lBQ3BELEVBQUUsRUFBRSxJQUFJO1lBQ1IsVUFBVSxFQUFFO2dCQUNYLE1BQU0sNkNBQW1DO2dCQUN6QyxPQUFPLEVBQUUsQ0FBQztnQkFDVixHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsZ0RBQTZCLEVBQUU7YUFDL0M7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRVMsZUFBZTtRQUN4QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx1QkFBd0IsU0FBUSxnQkFBZ0I7SUFFNUQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsb0NBQW9DO1lBQ3hDLEtBQUssRUFBRSxTQUFTLENBQUMsbUJBQW1CLEVBQUUsd0JBQXdCLENBQUM7WUFDL0QsRUFBRSxFQUFFLEtBQUssQ0FBQyx1R0FBdUc7U0FDakgsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVTLGVBQWU7UUFDeEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0Q7QUFFRCxTQUFTLHVCQUF1QixDQUFDLFFBQTBCO0lBQzFELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNsQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxNQUFNLG9CQUFvQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUNqRSxPQUFPLG9CQUFvQixDQUFDLFFBQVEsQ0FBVSxtQkFBbUIsQ0FBQyxLQUFLLElBQUksQ0FBQztBQUM3RSxDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQW9CLFVBQVUsUUFBMEI7SUFDdkYsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDeEMsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUN4RCxDQUFDLENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBb0IsVUFBVSxRQUEwQjtJQUNoRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUN4QyxPQUFPO0lBQ1IsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLHFCQUFxQixFQUFFLENBQUM7QUFDakUsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQW9CLFVBQVUsUUFBMEI7SUFDNUYsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDeEMsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0FBQzdELENBQUMsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFvQixVQUFVLFFBQTBCO0lBQ25HLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQ3hDLE9BQU87SUFDUixDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztBQUNwRSxDQUFDLENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBb0IsVUFBVSxRQUEwQjtJQUNqRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUN4QyxPQUFPO0lBQ1IsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUM7QUFDOUQsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQW9CLFVBQVUsUUFBMEI7SUFDOUYsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDeEMsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0FBQy9ELENBQUMsQ0FBQztBQUVGLE1BQU0sT0FBTyw2QkFBOEIsU0FBUSxPQUFPO2FBRXpDLE9BQUUsR0FBRywwQ0FBMEMsQ0FBQztJQUVoRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw2QkFBNkIsQ0FBQyxFQUFFO1lBQ3BDLEtBQUssRUFBRSxTQUFTLENBQUMseUJBQXlCLEVBQUUsNkJBQTZCLENBQUM7WUFDMUUsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsK0JBQStCO1NBQzdDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELE1BQU0sWUFBWSxHQUFHLGVBQWUsRUFBRSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLENBQUMsMEVBQTBFO1FBQ25GLENBQUM7UUFFRCxPQUFPLGlCQUFpQixDQUFDLHVCQUF1QixDQUFDLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDeEcsQ0FBQzs7QUFHRixNQUFNLE9BQU8sNkJBQThCLFNBQVEsT0FBTzthQUV6QyxPQUFFLEdBQUcsMENBQTBDLENBQUM7SUFFaEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsNkJBQTZCLENBQUMsRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLHVCQUF1QixDQUFDO1lBQ25FLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRztZQUNqQixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7Z0JBQzVCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBRSxFQUFFLHdCQUF3QixDQUFDO2dCQUMxRixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFM0QsTUFBTSxZQUFZLEdBQUcsZUFBZSxFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzdDLE9BQU8sQ0FBQywwRUFBMEU7UUFDbkYsQ0FBQztRQUVELE9BQU8saUJBQWlCLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLEVBQUUsY0FBYyxFQUFFLFlBQVksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQ3RHLENBQUM7O0FBR0YsTUFBTSxPQUFPLDhCQUErQixTQUFRLE9BQU87YUFFMUMsT0FBRSxHQUFHLDJDQUEyQyxDQUFDO0lBRWpFO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDhCQUE4QixDQUFDLEVBQUU7WUFDckMsS0FBSyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx3QkFBd0IsQ0FBQztZQUNyRSxJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQU07WUFDcEIsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO2dCQUM1QixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSx3QkFBd0IsQ0FBQztnQkFDOUUsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQzVDLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELE1BQU0sWUFBWSxHQUFHLGVBQWUsRUFBRSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLENBQUMsMEVBQTBFO1FBQ25GLENBQUM7UUFFRCxPQUFPLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxFQUFFLGNBQWMsRUFBRSxZQUFZLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztJQUN2RyxDQUFDIn0=