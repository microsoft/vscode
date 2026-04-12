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
import { localize, localize2 } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { browserZoomFactors, browserZoomLabel, browserZoomAccessibilityLabel } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserZoomService, IBrowserZoomService, MATCH_WINDOW_ZOOM_LABEL } from '../../../browserView/common/browserZoomService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_FOCUSED } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { getZoomLevel, onDidChangeZoomLevel } from '../../../../../base/browser/browser.js';
import { zoomLevelToZoomFactor } from '../../../../../platform/window/common/window.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
const CONTEXT_BROWSER_CAN_ZOOM_IN = new RawContextKey('browserCanZoomIn', true, localize('browser.canZoomIn', "Whether the browser can zoom in further"));
const CONTEXT_BROWSER_CAN_ZOOM_OUT = new RawContextKey('browserCanZoomOut', true, localize('browser.canZoomOut', "Whether the browser can zoom out further"));
/**
 * Transient zoom-level indicator that briefly appears inside the URL bar on zoom changes.
 */
class BrowserZoomPill extends Disposable {
    constructor() {
        super();
        this._timeout = this._register(new MutableDisposable());
        this.element = $('.browser-zoom-pill');
        // Don't announce this transient element; the zoom level is announced via IAccessibilityService.status()
        this.element.setAttribute('aria-hidden', 'true');
        this._icon = $('span');
        this._label = $('span');
        this.element.appendChild(this._icon);
        this.element.appendChild(this._label);
    }
    /**
     * Briefly show the zoom level, then auto-hide after 750 ms.
     */
    show(zoomLabel, isAtOrAboveDefault) {
        this._icon.className = ThemeIcon.asClassName(isAtOrAboveDefault ? Codicon.zoomIn : Codicon.zoomOut);
        this._label.textContent = zoomLabel;
        this.element.classList.add('visible');
        // Reset auto-hide timer so rapid zoom actions extend the display
        this._timeout.value = disposableTimeout(() => {
            this.element.classList.remove('visible');
        }, 750); // Chrome shows the zoom level for 1.5 seconds, but we show it for less because ours is non-interactive
    }
}
/**
 * Browser editor contribution that manages zoom context keys and the zoom pill indicator.
 */
let BrowserEditorZoomSupport = class BrowserEditorZoomSupport extends BrowserEditorContribution {
    constructor(editor, contextKeyService, browserZoomService, accessibilityService) {
        super(editor);
        this.browserZoomService = browserZoomService;
        this.accessibilityService = accessibilityService;
        this._canZoomInContext = CONTEXT_BROWSER_CAN_ZOOM_IN.bindTo(contextKeyService);
        this._canZoomOutContext = CONTEXT_BROWSER_CAN_ZOOM_OUT.bindTo(contextKeyService);
        this._zoomPill = this._register(new BrowserZoomPill());
    }
    get urlBarWidgets() {
        return [{ element: this._zoomPill.element, order: 0 }];
    }
    subscribeToModel(model, store) {
        this._updateZoomContext(model);
        store.add(model.onDidChangeZoom(() => {
            this._updateZoomContext(model);
        }));
    }
    clear() {
        this._canZoomInContext.reset();
        this._canZoomOutContext.reset();
    }
    async zoomIn() {
        await this.editor.model?.zoomIn();
        this._showZoomPill();
    }
    async zoomOut() {
        await this.editor.model?.zoomOut();
        this._showZoomPill();
    }
    async resetZoom() {
        await this.editor.model?.resetZoom();
        this._showZoomPill();
    }
    _updateZoomContext(model) {
        this._canZoomInContext.set(model.canZoomIn);
        this._canZoomOutContext.set(model.canZoomOut);
    }
    _showZoomPill() {
        const model = this.editor.model;
        if (!model) {
            return;
        }
        const defaultIndex = this.browserZoomService.getEffectiveZoomIndex(undefined, false);
        const defaultFactor = browserZoomFactors[defaultIndex];
        const currentFactor = model.zoomFactor;
        const label = browserZoomLabel(currentFactor);
        this._zoomPill.show(label, currentFactor >= defaultFactor);
        // Announce the new zoom level to screen readers (polite, non-interruptive).
        this.accessibilityService.status(browserZoomAccessibilityLabel(currentFactor));
    }
};
BrowserEditorZoomSupport = __decorate([
    __param(1, IContextKeyService),
    __param(2, IBrowserZoomService),
    __param(3, IAccessibilityService)
], BrowserEditorZoomSupport);
export { BrowserEditorZoomSupport };
// Register the contribution
BrowserEditor.registerContribution(BrowserEditorZoomSupport);
// -- Actions ------------------------------------------------------------
class ZoomInAction extends Action2 {
    static { this.ID = 'workbench.action.browser.zoomIn'; }
    constructor() {
        super({
            id: ZoomInAction.ID,
            title: localize2('browser.zoomInAction', 'Zoom In'),
            category: BrowserActionCategory,
            icon: Codicon.zoomIn,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Zoom,
                order: 1,
                when: CONTEXT_BROWSER_CAN_ZOOM_IN,
            },
            keybinding: {
                when: CONTEXT_BROWSER_FOCUSED,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 75,
                // Same shortcuts as 'workbench.action.zoomIn'
                primary: 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 86 /* KeyCode.Equal */, 2048 /* KeyMod.CtrlCmd */ | 109 /* KeyCode.NumpadAdd */],
            },
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorZoomSupport)?.zoomIn();
        }
    }
}
class ZoomOutAction extends Action2 {
    static { this.ID = 'workbench.action.browser.zoomOut'; }
    constructor() {
        super({
            id: ZoomOutAction.ID,
            title: localize2('browser.zoomOutAction', 'Zoom Out'),
            category: BrowserActionCategory,
            icon: Codicon.zoomOut,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Zoom,
                order: 2,
                when: CONTEXT_BROWSER_CAN_ZOOM_OUT,
            },
            keybinding: {
                when: CONTEXT_BROWSER_FOCUSED,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 75,
                // Same shortcuts as 'workbench.action.zoomOut'
                primary: 2048 /* KeyMod.CtrlCmd */ | 88 /* KeyCode.Minus */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 88 /* KeyCode.Minus */, 2048 /* KeyMod.CtrlCmd */ | 111 /* KeyCode.NumpadSubtract */],
                linux: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 88 /* KeyCode.Minus */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 111 /* KeyCode.NumpadSubtract */]
                }
            },
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorZoomSupport)?.zoomOut();
        }
    }
}
class ResetZoomAction extends Action2 {
    static { this.ID = 'workbench.action.browser.resetZoom'; }
    constructor() {
        super({
            id: ResetZoomAction.ID,
            title: localize2('browser.resetZoomAction', 'Reset Zoom'),
            category: BrowserActionCategory,
            icon: Codicon.screenNormal,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Zoom,
                order: 3,
            },
            keybinding: {
                when: CONTEXT_BROWSER_FOCUSED,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 75,
                // Same shortcuts as 'workbench.action.zoomReset'
                // (note: both workbench and here use Numpad0 instead of Digit0 to avoid conflicts with keybinding to focus sidebar.)
                primary: 2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */,
            },
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.getContribution(BrowserEditorZoomSupport)?.resetZoom();
        }
    }
}
registerAction2(ZoomInAction);
registerAction2(ZoomOutAction);
registerAction2(ResetZoomAction);
/**
 * Bridges the application's UI zoom level changes into IBrowserZoomService so that
 * views using the 'Match Window' default zoom level stay in sync.
 */
let WindowZoomSynchronizer = class WindowZoomSynchronizer extends Disposable {
    static { this.ID = 'workbench.contrib.browserView.windowZoomSynchronizer'; }
    constructor(browserZoomService) {
        super();
        browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
        this._register(onDidChangeZoomLevel(() => {
            browserZoomService.notifyWindowZoomChanged(zoomLevelToZoomFactor(getZoomLevel(mainWindow)));
        }));
    }
};
WindowZoomSynchronizer = __decorate([
    __param(0, IBrowserZoomService)
], WindowZoomSynchronizer);
registerWorkbenchContribution2(WindowZoomSynchronizer.ID, WindowZoomSynchronizer, 2 /* WorkbenchPhase.BlockRestore */);
registerSingleton(IBrowserZoomService, BrowserZoomService, 1 /* InstantiationType.Delayed */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
        'workbench.browser.pageZoom': {
            type: 'string',
            enum: [MATCH_WINDOW_ZOOM_LABEL, ...browserZoomFactors.map(f => `${Math.round(f * 100)}%`)],
            markdownEnumDescriptions: [
                localize({ comment: ['This is the description for a setting enum value.'], key: 'browser.defaultZoomLevel.matchWindow' }, 'Matches the application\'s current UI zoom level.'),
                ...browserZoomFactors.map(() => ''),
            ],
            default: MATCH_WINDOW_ZOOM_LABEL,
            markdownDescription: localize({ comment: ['This is the description for a setting.'], key: 'browser.pageZoom' }, 'Default zoom level for all sites in the Integrated Browser.'),
            // Zoom can change from machine to machine, so we don't need the workspace-level nor syncing that WINDOW has.
            scope: 2 /* ConfigurationScope.MACHINE */
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVkaXRvclpvb21GZWF0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9mZWF0dXJlcy9icm93c2VyRWRpdG9yWm9vbUZlYXR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkQsT0FBTyxFQUFFLGFBQWEsRUFBZSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6SSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUdyRyxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBc0IsTUFBTSx1RUFBdUUsQ0FBQztBQUUxSyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFtQixpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWhKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFD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