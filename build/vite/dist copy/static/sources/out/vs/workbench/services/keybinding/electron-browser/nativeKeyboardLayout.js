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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { Emitter } from '../../../../base/common/event.js';
import { OS } from '../../../../base/common/platform.js';
import { CachedKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { WindowsKeyboardMapper } from '../common/windowsKeyboardMapper.js';
import { FallbackKeyboardMapper } from '../common/fallbackKeyboardMapper.js';
import { MacLinuxKeyboardMapper } from '../common/macLinuxKeyboardMapper.js';
import { readKeyboardConfig } from '../../../../platform/keyboardLayout/common/keyboardConfig.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INativeKeyboardLayoutService } from './nativeKeyboardLayoutService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
let KeyboardLayoutService = class KeyboardLayoutService extends Disposable {
    constructor(_nativeKeyboardLayoutService, _configurationService) {
        super();
        this._nativeKeyboardLayoutService = _nativeKeyboardLayoutService;
        this._configurationService = _configurationService;
        this._onDidChangeKeyboardLayout = this._register(new Emitter());
        this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
        this._keyboardMapper = null;
        this._register(this._nativeKeyboardLayoutService.onDidChangeKeyboardLayout(async () => {
            this._keyboardMapper = null;
            this._onDidChangeKeyboardLayout.fire();
        }));
        this._register(_configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('keyboard')) {
                this._keyboardMapper = null;
                this._onDidChangeKeyboardLayout.fire();
            }
        }));
    }
    getRawKeyboardMapping() {
        return this._nativeKeyboardLayoutService.getRawKeyboardMapping();
    }
    getCurrentKeyboardLayout() {
        return this._nativeKeyboardLayoutService.getCurrentKeyboardLayout();
    }
    getAllKeyboardLayouts() {
        return [];
    }
    getKeyboardMapper() {
        const config = readKeyboardConfig(this._configurationService);
        if (config.dispatch === 1 /* DispatchConfig.KeyCode */) {
            // Forcefully set to use keyCode
            return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
        }
        if (!this._keyboardMapper) {
            this._keyboardMapper = new CachedKeyboardMapper(createKeyboardMapper(this.getCurrentKeyboardLayout(), this.getRawKeyboardMapping(), config.mapAltGrToCtrlAlt));
        }
        return this._keyboardMapper;
    }
    validateCurrentKeyboardMapping(keyboardEvent) {
        return;
    }
};
KeyboardLayoutService = __decorate([
    __param(0, INativeKeyboardLayoutService),
    __param(1, IConfigurationService)
], KeyboardLayoutService);
export { KeyboardLayoutService };
function createKeyboardMapper(layoutInfo, rawMapping, mapAltGrToCtrlAlt) {
    const _isUSStandard = isUSStandard(layoutInfo);
    if (OS === 1 /* OperatingSystem.Windows */) {
        return new WindowsKeyboardMapper(_isUSStandard, rawMapping, mapAltGrToCtrlAlt);
    }
    if (!rawMapping || Object.keys(rawMapping).length === 0) {
        // Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
        return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
    }
    if (OS === 2 /* OperatingSystem.Macintosh */) {
        const kbInfo = layoutInfo;
        if (kbInfo.id === 'com.apple.keylayout.DVORAK-QWERTYCMD') {
            // Use keyCode based dispatching for DVORAK - QWERTY ⌘
            return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
        }
    }
    return new MacLinuxKeyboardMapper(_isUSStandard, rawMapping, mapAltGrToCtrlAlt, OS);
}
function isUSStandard(_kbInfo) {
    if (!_kbInfo) {
        return false;
    }
    if (OS === 3 /* OperatingSystem.Linux */) {
        const kbInfo = _kbInfo;
        const layouts = kbInfo.layout.split(/,/g);
        return (layouts[kbInfo.group] === 'us');
    }
    if (OS === 2 /* OperatingSystem.Macintosh */) {
        const kbInfo = _kbInfo;
        return (kbInfo.id === 'com.apple.keylayout.US');
    }
    if (OS === 1 /* OperatingSystem.Windows */) {
        const kbInfo = _kbInfo;
        return (kbInfo.name === '00000409');
    }
    return false;
}
registerSingleton(IKeyboardLayoutService, KeyboardLayoutService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlS2V5Ym9hcmRMYXlvdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy9lbGVjdHJvbi1icm93c2VyL25hdGl2ZUtleWJvYXJkTGF5b3V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQXVCLHNCQUFzQixFQUFxSixNQUFNLDhEQUE4RCxDQUFDO0FBQzlRLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQW1CLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSw4REFBOEQsQ0FBQztBQUNySCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RSxPQUFPLEVBQWtCLGtCQUFrQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFFbEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRXhHLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsVUFBVTtJQVNwRCxZQUMrQiw0QkFBMkUsRUFDbEYscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSHVDLGlDQUE0QixHQUE1Qiw0QkFBNEIs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