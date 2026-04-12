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
var TerminalMouseWheelZoomContribution_1;
import { Event } from '../../../../../base/common/event.js';
import { MouseWheelClassifier } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { localize2 } from '../../../../../nls.js';
import { isNumber } from '../../../../../base/common/types.js';
import { defaultTerminalFontSize } from '../../../terminal/common/terminalConfiguration.js';
import * as dom from '../../../../../base/browser/dom.js';
let TerminalMouseWheelZoomContribution = class TerminalMouseWheelZoomContribution extends Disposable {
    static { TerminalMouseWheelZoomContribution_1 = this; }
    static { this.ID = 'terminal.mouseWheelZoom'; }
    static get(instance) {
        return instance.getContribution(TerminalMouseWheelZoomContribution_1.ID);
    }
    constructor(_ctx, _configurationService) {
        super();
        this._configurationService = _configurationService;
        this._listener = this._register(new MutableDisposable());
    }
    xtermOpen(xterm) {
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration("terminal.integrated.mouseWheelZoom" /* TerminalZoomSettingId.MouseWheelZoom */)) {
                if (!!this._configurationService.getValue("terminal.integrated.mouseWheelZoom" /* TerminalZoomSettingId.MouseWheelZoom */)) {
                    this._setupMouseWheelZoomListener(xterm.raw);
                }
                else {
                    this._listener.clear();
                }
            }
        }));
    }
    _getConfigFontSize() {
        return this._configurationService.getValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */);
    }
    _clampFontSize(fontSize) {
        return clampTerminalFontSize(fontSize);
    }
    _setupMouseWheelZoomListener(raw) {
        // This is essentially a copy of what we do in the editor, just we modify font size directly
        // as there is no separate zoom level concept in the terminal
        const classifier = MouseWheelClassifier.INSTANCE;
        let prevMouseWheelTime = 0;
        let gestureStartFontSize = this._getConfigFontSize();
        let gestureHasZoomModifiers = false;
        let gestureAccumulatedDelta = 0;
        const wheelListener = (browserEvent) => {
            if (classifier.isPhysicalMouseWheel()) {
                if (this._hasMouseWheelZoomModifiers(browserEvent)) {
                    const delta = browserEvent.deltaY > 0 ? -1 : 1;
                    const newFontSize = this._clampFontSize(this._getConfigFontSize() + delta);
                    this._configurationService.updateValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */, newFontSize);
                    // EditorZoom.setZoomLevel(zoomLevel + delta);
                    browserEvent.preventDefault();
                    browserEvent.stopPropagation();
                }
            }
            else {
                // we consider mousewheel events that occur within 50ms of each other to be part of the same gesture
                // we don't want to consider mouse wheel events where ctrl/cmd is pressed during the inertia phase
                // we also want to accumulate deltaY values from the same gesture and use that to set the zoom level
                if (Date.now() - prevMouseWheelTime > 50) {
                    // reset if more than 50ms have passed
                    gestureStartFontSize = this._getConfigFontSize();
                    gestureHasZoomModifiers = this._hasMouseWheelZoomModifiers(browserEvent);
                    gestureAccumulatedDelta = 0;
                }
                prevMouseWheelTime = Date.now();
                gestureAccumulatedDelta += browserEvent.deltaY;
                if (gestureHasZoomModifiers) {
                    const deltaAbs = Math.ceil(Math.abs(gestureAccumulatedDelta / 5));
                    const deltaDirection = gestureAccumulatedDelta > 0 ? -1 : 1;
                    const delta = deltaAbs * deltaDirection;
                    const newFontSize = this._clampFontSize(gestureStartFontSize + delta);
                    this._configurationService.updateValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */, newFontSize);
                    gestureAccumulatedDelta += browserEvent.deltaY;
                    browserEvent.preventDefault();
                    browserEvent.stopPropagation();
                }
            }
        };
        // Use the capture phase to ensure we catch the event before the terminal's scrollable element consumes it
        this._listener.value = dom.addDisposableListener(raw.element, dom.EventType.MOUSE_WHEEL, wheelListener, { capture: true, passive: false });
    }
    _hasMouseWheelZoomModifiers(browserEvent) {
        return (isMacintosh
            // on macOS we support cmd + two fingers scroll (`metaKey` set)
            // and also the two fingers pinch gesture (`ctrKey` set)
            ? ((browserEvent.metaKey || browserEvent.ctrlKey) && !browserEvent.shiftKey && !browserEvent.altKey)
            : (browserEvent.ctrlKey && !browserEvent.metaKey && !browserEvent.shiftKey && !browserEvent.altKey));
    }
};
TerminalMouseWheelZoomContribution = TerminalMouseWheelZoomContribution_1 = __decorate([
    __param(1, IConfigurationService)
], TerminalMouseWheelZoomContribution);
registerTerminalContribution(TerminalMouseWheelZoomContribution.ID, TerminalMouseWheelZoomContribution, true);
registerTerminalAction({
    id: "workbench.action.terminal.fontZoomIn" /* TerminalZoomCommandId.FontZoomIn */,
    title: localize2('fontZoomIn', 'Increase Font Size'),
    run: async (c, accessor) => {
        const configurationService = accessor.get(IConfigurationService);
        const value = configurationService.getValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */);
        if (isNumber(value)) {
            const newFontSize = clampTerminalFontSize(value + 1);
            await configurationService.updateValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */, newFontSize);
        }
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.fontZoomOut" /* TerminalZoomCommandId.FontZoomOut */,
    title: localize2('fontZoomOut', 'Decrease Font Size'),
    run: async (c, accessor) => {
        const configurationService = accessor.get(IConfigurationService);
        const value = configurationService.getValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */);
        if (isNumber(value)) {
            const newFontSize = clampTerminalFontSize(value - 1);
            await configurationService.updateValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */, newFontSize);
        }
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.fontZoomReset" /* TerminalZoomCommandId.FontZoomReset */,
    title: localize2('fontZoomReset', 'Reset Font Size'),
    run: async (c, accessor) => {
        const configurationService = accessor.get(IConfigurationService);
        await configurationService.updateValue("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */, defaultTerminalFontSize);
    }
});
export function clampTerminalFontSize(fontSize) {
    return Math.max(6, Math.min(100, fontSize));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuem9vbS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvem9vbS9icm93c2VyL3Rlcm1pbmFsLnpvb20uY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFNUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDckcsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUdyRSxPQUFPLEVBQUUsNEJBQTRCLEVBQTBGLE1BQU0saURBQWlELENBQUM7QUFDdkwsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU1RixPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRTFELElBQU0sa0NBQWtDLEdBQXhDLE1BQU0sa0NBQW1DLFNBQVEsVUFBVTs7YUFDMUMsT0FBRSxHQUFHLHlCQUF5QixBQUE1QixDQUE2QjtJQVEvQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQXVEO1FBQ2pFLE9BQU8sUUFBUSxDQUFDLGVBQWUsQ0FBcUMsb0NBQWtDLENBQUMsRUFB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