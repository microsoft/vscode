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
import { Dimension, getActiveDocument } from '../../../../base/browser/dom.js';
import { codiconsLibrary } from '../../../../base/common/codiconsLibrary.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { WorkbenchIconSelectBox } from '../../../services/userDataProfile/browser/iconSelectBox.js';
const icons = new Lazy(() => {
    const iconDefinitions = getIconRegistry().getIcons();
    const includedChars = new Set();
    const dedupedIcons = iconDefinitions.filter(e => {
        if (e.id === codiconsLibrary.blank.id) {
            return false;
        }
        if (ThemeIcon.isThemeIcon(e.defaults)) {
            return false;
        }
        if (includedChars.has(e.defaults.fontCharacter)) {
            return false;
        }
        includedChars.add(e.defaults.fontCharacter);
        return true;
    });
    return dedupedIcons;
});
let TerminalIconPicker = class TerminalIconPicker extends Disposable {
    constructor(instantiationService, _hoverService, _layoutService) {
        super();
        this._hoverService = _hoverService;
        this._layoutService = _layoutService;
        this._iconSelectBox = instantiationService.createInstance(WorkbenchIconSelectBox, {
            icons: icons.value,
            inputBoxStyles: defaultInputBoxStyles
        });
    }
    async pickIcons() {
        const dimension = new Dimension(486, 260);
        return new Promise(resolve => {
            this._register(this._iconSelectBox.onDidSelect(e => {
                resolve(e);
                this._iconSelectBox.dispose();
            }));
            this._iconSelectBox.clearInput();
            const body = getActiveDocument().body;
            const bodyRect = body.getBoundingClientRect();
            const hoverWidget = this._hoverService.showInstantHover({
                content: this._iconSelectBox.domNode,
                target: {
                    targetElements: [body],
                    x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
                    y: bodyRect.top + this._layoutService.activeContainerOffset.top
                },
                position: {
                    hoverPosition: 2 /* HoverPosition.BELOW */,
                },
                persistence: {
                    sticky: true,
                },
            }, true);
            if (hoverWidget) {
                this._register(hoverWidget);
            }
            this._iconSelectBox.layout(dimension);
            this._iconSelectBox.focus();
        });
    }
};
TerminalIconPicker = __decorate([
    __param(0, IInstantiationService),
    __param(1, IHoverService),
    __param(2, ILayoutService)
], TerminalIconPicker);
export { TerminalIconPicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJY29uUGlja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEljb25QaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxlQUFlLEVBQW9CLE1BQU0sbURBQW1ELENBQUM7QUFDdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFcEcsTUFBTSxLQUFLLEdBQUcsSUFBSSxJQUFJLENBQXFCLEdBQUcsRUFBRTtJQUMvQyxNQUFNLGVBQWUsR0FBRyxlQUFlLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNyRCxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3hDLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFD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