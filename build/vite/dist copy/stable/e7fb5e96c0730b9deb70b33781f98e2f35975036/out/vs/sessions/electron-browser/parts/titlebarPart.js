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
var AuxiliaryNativeTitlebarPart_1;
import { getZoomFactor } from '../../../base/browser/browser.js';
import { getWindow, getWindowId } from '../../../base/browser/dom.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { useWindowControlsOverlay } from '../../../platform/window/common/window.js';
import { IsWindowAlwaysOnTopContext } from '../../../workbench/common/contextkeys.js';
import { IHostService } from '../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { TitlebarPart, TitleService } from '../../browser/parts/titlebarPart.js';
import { isMacintosh } from '../../../base/common/platform.js';
let NativeTitlebarPart = class NativeTitlebarPart extends TitlebarPart {
    constructor(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, productService, nativeHostService) {
        super(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
        this.productService = productService;
        this.nativeHostService = nativeHostService;
        this.handleWindowsAlwaysOnTop(targetWindow.vscodeWindowId, contextKeyService);
    }
    createContentArea(parent) {
        // Workaround for macOS/Electron bug where the window does not
        // appear in the "Windows" menu if the first `document.title`
        // matches the BrowserWindow's initial title.
        // See: https://github.com/microsoft/vscode/issues/191288
        if (isMacintosh) {
            const window = getWindow(this.element);
            const nativeTitle = this.productService.nameLong;
            if (!window.document.title || window.document.title === nativeTitle) {
                window.document.title = `${nativeTitle} \u200b`;
            }
            window.document.title = nativeTitle;
        }
        return super.createContentArea(parent);
    }
    async handleWindowsAlwaysOnTop(targetWindowId, contextKeyService) {
        const isWindowAlwaysOnTopContext = IsWindowAlwaysOnTopContext.bindTo(contextKeyService);
        this._register(this.nativeHostService.onDidChangeWindowAlwaysOnTop(({ windowId, alwaysOnTop }) => {
            if (windowId === targetWindowId) {
                isWindowAlwaysOnTopContext.set(alwaysOnTop);
            }
        }));
        isWindowAlwaysOnTopContext.set(await this.nativeHostService.isWindowAlwaysOnTop({ targetWindowId }));
    }
    updateStyles() {
        super.updateStyles();
        if (this.element) {
            if (useWindowControlsOverlay(this.configurationService)) {
                if (!this.cachedWindowControlStyles ||
                    this.cachedWindowControlStyles.bgColor !== this.element.style.backgroundColor ||
                    this.cachedWindowControlStyles.fgColor !== this.element.style.color) {
                    this.cachedWindowControlStyles = {
                        bgColor: this.element.style.backgroundColor,
                        fgColor: this.element.style.color
                    };
                    this.nativeHostService.updateWindowControls({
                        targetWindowId: getWindowId(getWindow(this.element)),
                        backgroundColor: this.element.style.backgroundColor,
                        foregroundColor: this.element.style.color
                    });
                }
            }
        }
    }
    layout(width, height) {
        super.layout(width, height);
        if (useWindowControlsOverlay(this.configurationService)) {
            const newHeight = Math.round(height * getZoomFactor(getWindow(this.element)));
            if (newHeight !== this.cachedWindowControlHeight) {
                this.cachedWindowControlHeight = newHeight;
                this.nativeHostService.updateWindowControls({
                    targetWindowId: getWindowId(getWindow(this.element)),
                    height: newHeight
                });
            }
        }
    }
};
NativeTitlebarPart = __decorate([
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IStorageService),
    __param(7, IWorkbenchLayoutService),
    __param(8, IContextKeyService),
    __param(9, IHostService),
    __param(10, IProductService),
    __param(11, INativeHostService)
], NativeTitlebarPart);
export { NativeTitlebarPart };
let MainNativeTitlebarPart = class MainNativeTitlebarPart extends NativeTitlebarPart {
    constructor(contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, productService, nativeHostService) {
        super("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, productService, nativeHostService);
    }
};
MainNativeTitlebarPart = __decorate([
    __param(0, IContextMenuService),
    __param(1, IConfigurationService),
    __param(2, IInstantiationService),
    __param(3, IThemeService),
    __param(4, IStorageService),
    __param(5, IWorkbenchLayoutService),
    __param(6, IContextKeyService),
    __param(7, IHostService),
    __param(8, IProductService),
    __param(9, INativeHostService)
], MainNativeTitlebarPart);
let AuxiliaryNativeTitlebarPart = class AuxiliaryNativeTitlebarPart extends NativeTitlebarPart {
    static { AuxiliaryNativeTitlebarPart_1 = this; }
    static { this.COUNTER = 1; }
    get height() { return this.minimumHeight; }
    constructor(container, mainTitlebar, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, productService, nativeHostService) {
        const id = AuxiliaryNativeTitlebarPart_1.COUNTER++;
        super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, productService, nativeHostService);
        this.container = container;
        this.mainTitlebar = mainTitlebar;
    }
    get preventZoom() {
        return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
    }
};
AuxiliaryNativeTitlebarPart = AuxiliaryNativeTitlebarPart_1 = __decorate([
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IStorageService),
    __param(7, IWorkbenchLayoutService),
    __param(8, IContextKeyService),
    __param(9, IHostService),
    __param(10, IProductService),
    __param(11, INativeHostService)
], AuxiliaryNativeTitlebarPart);
export class NativeTitleService extends TitleService {
    createMainTitlebarPart() {
        return this.instantiationService.createInstance(MainNativeTitlebarPart);
    }
    doCreateAuxiliaryTitlebarPart(container, _editorGroupsContainer, instantiationService) {
        return instantiationService.createInstance(AuxiliaryNativeTitlebarPart, container, this.mainPart);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGl0bGViYXJQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvZWxlY3Ryb24tYnJvd3Nlci9wYXJ0cy90aXRsZWJhclBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsdUJBQXVCLEVBQVMsTUFBTSw2REFBNkQsQ0FBQztBQUc3RyxPQUFPLEVBQWMsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxFQUFFLFlBQVksRUFB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