/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PartsSplash_1;
import { onDidChangeFullscreen, isFullscreen } from '../../../../base/browser/browser.js';
import * as dom from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { editorBackground, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { getThemeTypeSelector, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from '../../../browser/parts/editor/editor.js';
import * as themes from '../../../common/theme.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import * as perf from '../../../../base/common/performance.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ISplashStorageService } from './splash.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
let PartsSplash = class PartsSplash {
    static { PartsSplash_1 = this; }
    static { this.ID = 'workbench.contrib.partsSplash'; }
    static { this._splashElementId = 'monaco-parts-splash'; }
    constructor(_themeService, _layoutService, _environmentService, _configService, _partSplashService, editorGroupsService, lifecycleService) {
        this._themeService = _themeService;
        this._layoutService = _layoutService;
        this._environmentService = _environmentService;
        this._configService = _configService;
        this._partSplashService = _partSplashService;
        this._disposables = new DisposableStore();
        Event.once(_layoutService.onDidLayoutMainContainer)(() => {
            this._removePartsSplash();
            perf.mark('code/didRemovePartsSplash');
        }, undefined, this._disposables);
        const lastIdleSchedule = this._disposables.add(new MutableDisposable());
        const savePartsSplashSoon = () => {
            lastIdleSchedule.value = dom.runWhenWindowIdle(mainWindow, () => this._savePartsSplash(), 2500);
        };
        lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => {
            Event.any(Event.filter(onDidChangeFullscreen, windowId => windowId === mainWindow.vscodeWindowId), editorGroupsService.mainPart.onDidLayout, _themeService.onDidColorThemeChange)(savePartsSplashSoon, undefined, this._disposables);
            savePartsSplashSoon();
        });
        _configService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("window.titleBarStyle" /* TitleBarSetting.TITLE_BAR_STYLE */)) {
                this._didChangeTitleBarStyle = true;
                this._savePartsSplash();
            }
        }, this, this._disposables);
    }
    dispose() {
        this._disposables.dispose();
    }
    _savePartsSplash() {
        const theme = this._themeService.getColorTheme();
        this._partSplashService.saveWindowSplash({
            zoomLevel: this._configService.getValue('window.zoomLevel'),
            baseTheme: getThemeTypeSelector(theme.type),
            colorInfo: {
                foreground: theme.getColor(foreground)?.toString(),
                background: Color.Format.CSS.formatHex(theme.getColor(editorBackground) || themes.WORKBENCH_BACKGROUND(theme)),
                editorBackground: theme.getColor(editorBackground)?.toString(),
                titleBarBackground: theme.getColor(themes.TITLE_BAR_ACTIVE_BACKGROUND)?.toString(),
                titleBarBorder: theme.getColor(themes.TITLE_BAR_BORDER)?.toString(),
                activityBarBackground: theme.getColor(themes.ACTIVITY_BAR_BACKGROUND)?.toString(),
                activityBarBorder: theme.getColor(themes.ACTIVITY_BAR_BORDER)?.toString(),
                sideBarBackground: theme.getColor(themes.SIDE_BAR_BACKGROUND)?.toString(),
                sideBarBorder: theme.getColor(themes.SIDE_BAR_BORDER)?.toString(),
                statusBarBackground: theme.getColor(themes.STATUS_BAR_BACKGROUND)?.toString(),
                statusBarBorder: theme.getColor(themes.STATUS_BAR_BORDER)?.toString(),
                statusBarNoFolderBackground: theme.getColor(themes.STATUS_BAR_NO_FOLDER_BACKGROUND)?.toString(),
                windowBorder: theme.getColor(themes.WINDOW_ACTIVE_BORDER)?.toString() ?? theme.getColor(themes.WINDOW_INACTIVE_BORDER)?.toString()
            },
            layoutInfo: !this._shouldSaveLayoutInfo() ? undefined : {
                sideBarSide: this._layoutService.getSideBarPosition() === 1 /* Position.RIGHT */ ? 'right' : 'left',
                editorPartMinWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
                titleBarHeight: this._layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow) ? dom.getTotalHeight(assertReturnsDefined(this._layoutService.getContainer(mainWindow, "workbench.parts.titlebar" /* Parts.TITLEBAR_PART */))) : 0,
                activityBarWidth: this._layoutService.isVisible("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */))) : 0,
                sideBarWidth: this._layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */))) : 0,
                auxiliaryBarWidth: this._layoutService.isAuxiliaryBarMaximized() ? Number.MAX_SAFE_INTEGER /* marker for maximized state */ : this._layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) ? dom.getTotalWidth(assertReturnsDefined(this._layoutService.getContainer(mainWindow, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */))) : 0,
                statusBarHeight: this._layoutService.isVisible("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, mainWindow) ? dom.getTotalHeight(assertReturnsDefined(this._layoutService.getContainer(mainWindow, "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */))) : 0,
                windowBorder: this._layoutService.hasMainWindowBorder(),
                windowBorderRadius: this._layoutService.getMainWindowBorderRadius()
            }
        });
    }
    _shouldSaveLayoutInfo() {
        return !isFullscreen(mainWindow) && !this._environmentService.isExtensionDevelopment && !this._didChangeTitleBarStyle;
    }
    _removePartsSplash() {
        // eslint-disable-next-line no-restricted-syntax
        const element = mainWindow.document.getElementById(PartsSplash_1._splashElementId);
        if (element) {
            element.style.display = 'none';
        }
        // remove initial colors
        // eslint-disable-next-line no-restricted-syntax
        const defaultStyles = mainWindow.document.head.getElementsByClassName('initialShellColors');
        defaultStyles[0]?.remove();
    }
};
PartsSplash = PartsSplash_1 = __decorate([
    __param(0, IThemeService),
    __param(1, IWorkbenchLayoutService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IConfigurationService),
    __param(4, ISplashStorageService),
    __param(5, IEditorGroupsService),
    __param(6, ILifecycleService)
], PartsSplash);
export { PartsSplash };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydHNTcGxhc2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zcGxhc2gvYnJvd3Nlci9wYXJ0c1NwbGFzaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFGLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDMUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFVBQVUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RixPQUFPLEtBQUssTUFBTSxNQUFNLDBCQUEwQixDQUFDO0FBQ25ELE9BQU8sRUFBRSx1QkFBdUIsRUFBbUIsTUFBTSxtREFBbUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEtBQUssSUFBSSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hF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