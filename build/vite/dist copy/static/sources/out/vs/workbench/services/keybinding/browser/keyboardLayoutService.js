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
import * as nls from '../../../../nls.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FileAccess } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeymapInfo } from '../common/keymapInfo.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { readKeyboardConfig } from '../../../../platform/keyboardLayout/common/keyboardConfig.js';
import { CachedKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { OS, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { WindowsKeyboardMapper } from '../common/windowsKeyboardMapper.js';
import { FallbackKeyboardMapper } from '../common/fallbackKeyboardMapper.js';
import { MacLinuxKeyboardMapper } from '../common/macLinuxKeyboardMapper.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { parse, getNodeType } from '../../../../base/common/json.js';
import * as objects from '../../../../base/common/objects.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { getKeyboardLayoutId, IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
export class BrowserKeyboardMapperFactoryBase extends Disposable {
    get activeKeymap() {
        return this._activeKeymapInfo;
    }
    get keymapInfos() {
        return this._keymapInfos;
    }
    get activeKeyboardLayout() {
        if (!this._initialized) {
            return null;
        }
        return this._activeKeymapInfo?.layout ?? null;
    }
    get activeKeyMapping() {
        if (!this._initialized) {
            return null;
        }
        return this._activeKeymapInfo?.mapping ?? null;
    }
    get keyboardLayouts() {
        return this._keymapInfos.map(keymapInfo => keymapInfo.layout);
    }
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
        this._onDidChangeKeyboardMapper = this._register(new Emitter());
        this.onDidChangeKeyboardMapper = this._onDidChangeKeyboardMapper.event;
        this.keyboardLayoutMapAllowed = navigator.keyboard !== undefined;
        this._keyboardMapper = null;
        this._initialized = false;
        this._keymapInfos = [];
        this._mru = [];
        this._activeKeymapInfo = null;
        if (navigator.keyboard && navigator.keyboard.addEventListener) {
            navigator.keyboard.addEventListener('layoutchange', () => {
                // Update user keyboard map settings
                this._getBrowserKeyMapping().then((mapping) => {
                    if (this.isKeyMappingActive(mapping)) {
                        return;
                    }
                    this.setLayoutFromBrowserAPI();
                });
            });
        }
        this._register(this._configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('keyboard')) {
                this._keyboardMapper = null;
                this._onDidChangeKeyboardMapper.fire();
            }
        }));
    }
    registerKeyboardLayout(layout) {
        this._keymapInfos.push(layout);
        this._mru = this._keymapInfos;
    }
    removeKeyboardLayout(layout) {
        let index = this._mru.indexOf(layout);
        this._mru.splice(index, 1);
        index = this._keymapInfos.indexOf(layout);
        this._keymapInfos.splice(index, 1);
    }
    getMatchedKeymapInfo(keyMapping) {
        if (!keyMapping) {
            return null;
        }
        const usStandard = this.getUSStandardLayout();
        if (usStandard) {
            let maxScore = usStandard.getScore(keyMapping);
            if (maxScore === 0) {
                return {
                    result: usStandard,
                    score: 0
                };
            }
            let result = usStandard;
            for (let i = 0; i < this._mru.length; i++) {
                const score = this._mru[i].getScore(keyMapping);
                if (score > maxScore) {
                    if (score === 0) {
                        return {
                            result: this._mru[i],
                            score: 0
                        };
                    }
                    maxScore = score;
                    result = this._mru[i];
                }
            }
            return {
                result,
                score: maxScore
            };
        }
        for (let i = 0; i < this._mru.length; i++) {
            if (this._mru[i].fuzzyEqual(keyMapping)) {
                return {
                    result: this._mru[i],
                    score: 0
                };
            }
        }
        return null;
    }
    getUSStandardLayout() {
        const usStandardLayouts = this._mru.filter(layout => layout.layout.isUSStandard);
        if (usStandardLayouts.length) {
            return usStandardLayouts[0];
        }
        return null;
    }
    isKeyMappingActive(keymap) {
        return this._activeKeymapInfo && keymap && this._activeKeymapInfo.fuzzyEqual(keymap);
    }
    setUSKeyboardLayout() {
        this._activeKeymapInfo = this.getUSStandardLayout();
    }
    setActiveKeyMapping(keymap) {
        let keymapUpdated = false;
        const matchedKeyboardLayout = this.getMatchedKeymapInfo(keymap);
        if (matchedKeyboardLayout) {
            // let score = matchedKeyboardLayout.score;
            // Due to https://bugs.chromium.org/p/chromium/issues/detail?id=977609, any key after a dead key will generate a wrong mapping,
            // we shoud avoid yielding the false error.
            // if (keymap && score < 0) {
            // const donotAskUpdateKey = 'missing.keyboardlayout.donotask';
            // if (this._storageService.getBoolean(donotAskUpdateKey, StorageScope.APPLICATION)) {
            // 	return;
            // }
            // the keyboard layout doesn't actually match the key event or the keymap from chromium
            // this._notificationService.prompt(
            // 	Severity.Info,
            // 	nls.localize('missing.keyboardlayout', 'Fail to find matching keyboard layout'),
            // 	[{
            // 		label: nls.localize('keyboardLayoutMissing.configure', "Configure"),
            // 		run: () => this._commandService.executeCommand('workbench.action.openKeyboardLayoutPicker')
            // 	}, {
            // 		label: nls.localize('neverAgain', "Don't Show Again"),
            // 		isSecondary: true,
            // 		run: () => this._storageService.store(donotAskUpdateKey, true, StorageScope.APPLICATION)
            // 	}]
            // );
            // console.warn('Active keymap/keyevent does not match current keyboard layout', JSON.stringify(keymap), this._activeKeymapInfo ? JSON.stringify(this._activeKeymapInfo.layout) : '');
            // return;
            // }
            if (!this._activeKeymapInfo) {
                this._activeKeymapInfo = matchedKeyboardLayout.result;
                keymapUpdated = true;
            }
            else if (keymap) {
                if (matchedKeyboardLayout.result.getScore(keymap) > this._activeKeymapInfo.getScore(keymap)) {
                    this._activeKeymapInfo = matchedKeyboardLayout.result;
                    keymapUpdated = true;
                }
            }
        }
        if (!this._activeKeymapInfo) {
            this._activeKeymapInfo = this.getUSStandardLayout();
            keymapUpdated = true;
        }
        if (!this._activeKeymapInfo || !keymapUpdated) {
            return;
        }
        const index = this._mru.indexOf(this._activeKeymapInfo);
        this._mru.splice(index, 1);
        this._mru.unshift(this._activeKeymapInfo);
        this._setKeyboardData(this._activeKeymapInfo);
    }
    setActiveKeymapInfo(keymapInfo) {
        this._activeKeymapInfo = keymapInfo;
        const index = this._mru.indexOf(this._activeKeymapInfo);
        if (index === 0) {
            return;
        }
        this._mru.splice(index, 1);
        this._mru.unshift(this._activeKeymapInfo);
        this._setKeyboardData(this._activeKeymapInfo);
    }
    setLayoutFromBrowserAPI() {
        this._updateKeyboardLayoutAsync(this._initialized);
    }
    _updateKeyboardLayoutAsync(initialized, keyboardEvent) {
        if (!initialized) {
            return;
        }
        this._getBrowserKeyMapping(keyboardEvent).then(keyMap => {
            // might be false positive
            if (this.isKeyMappingActive(keyMap)) {
                return;
            }
            this.setActiveKeyMapping(keyMap);
        });
    }
    getKeyboardMapper() {
        const config = readKeyboardConfig(this._configurationService);
        if (config.dispatch === 1 /* DispatchConfig.KeyCode */ || !this._initialized || !this._activeKeymapInfo) {
            // Forcefully set to use keyCode
            return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
        }
        if (!this._keyboardMapper) {
            this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._activeKeymapInfo, config.mapAltGrToCtrlAlt));
        }
        return this._keyboardMapper;
    }
    validateCurrentKeyboardMapping(keyboardEvent) {
        if (!this._initialized) {
            return;
        }
        const isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);
        if (isCurrentKeyboard) {
            return;
        }
        this._updateKeyboardLayoutAsync(true, keyboardEvent);
    }
    setKeyboardLayout(layoutName) {
        const matchedLayouts = this.keymapInfos.filter(keymapInfo => getKeyboardLayoutId(keymapInfo.layout) === layoutName);
        if (matchedLayouts.length > 0) {
            this.setActiveKeymapInfo(matchedLayouts[0]);
        }
    }
    _setKeyboardData(keymapInfo) {
        this._initialized = true;
        this._keyboardMapper = null;
        this._onDidChangeKeyboardMapper.fire();
    }
    static _createKeyboardMapper(keymapInfo, mapAltGrToCtrlAlt) {
        const rawMapping = keymapInfo.mapping;
        const isUSStandard = !!keymapInfo.layout.isUSStandard;
        if (OS === 1 /* OperatingSystem.Windows */) {
            return new WindowsKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt);
        }
        if (Object.keys(rawMapping).length === 0) {
            // Looks like reading the mappings failed (most likely Mac + Japanese/Chinese keyboard layouts)
            return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
        }
        return new MacLinuxKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt, OS);
    }
    //#region Browser API
    _validateCurrentKeyboardMapping(keyboardEvent) {
        if (!this._initialized) {
            return true;
        }
        const standardKeyboardEvent = keyboardEvent;
        const currentKeymap = this._activeKeymapInfo;
        if (!currentKeymap) {
            return true;
        }
        if (standardKeyboardEvent.browserEvent.key === 'Dead' || standardKeyboardEvent.browserEvent.isComposing) {
            return true;
        }
        const mapping = currentKeymap.mapping[standardKeyboardEvent.code];
        if (!mapping) {
            return false;
        }
        if (mapping.value === '') {
            // The value is empty when the key is not a printable character, we skip validation.
            if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
                setTimeout(() => {
                    this._getBrowserKeyMapping().then((keymap) => {
                        if (this.isKeyMappingActive(keymap)) {
                            return;
                        }
                        this.setLayoutFromBrowserAPI();
                    });
                }, 350);
            }
            return true;
        }
        const expectedValue = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey ? mapping.withShiftAltGr :
            standardKeyboardEvent.altKey ? mapping.withAltGr :
                standardKeyboardEvent.shiftKey ? mapping.withShift : mapping.value;
        const isDead = (standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey && mapping.withShiftAltGrIsDeadKey) ||
            (standardKeyboardEvent.altKey && mapping.withAltGrIsDeadKey) ||
            (standardKeyboardEvent.shiftKey && mapping.withShiftIsDeadKey) ||
            mapping.valueIsDeadKey;
        if (isDead && standardKeyboardEvent.browserEvent.key !== 'Dead') {
            return false;
        }
        // TODO, this assumption is wrong as `browserEvent.key` doesn't necessarily equal expectedValue from real keymap
        if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
            return false;
        }
        return true;
    }
    async _getBrowserKeyMapping(keyboardEvent) {
        if (this.keyboardLayoutMapAllowed) {
            try {
                return await navigator.keyboard.getLayoutMap().then((e) => {
                    const ret = {};
                    for (const key of e) {
                        ret[key[0]] = {
                            'value': key[1],
                            'withShift': '',
                            'withAltGr': '',
                            'withShiftAltGr': ''
                        };
                    }
                    return ret;
                    // const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);
                    // if (matchedKeyboardLayout) {
                    // 	return matchedKeyboardLayout.result.mapping;
                    // }
                    // return null;
                });
            }
            catch {
                // getLayoutMap can throw if invoked from a nested browsing context
                this.keyboardLayoutMapAllowed = false;
            }
        }
        if (keyboardEvent && !keyboardEvent.shiftKey && !keyboardEvent.altKey && !keyboardEvent.metaKey && !keyboardEvent.metaKey) {
            const ret = {};
            const standardKeyboardEvent = keyboardEvent;
            ret[standardKeyboardEvent.browserEvent.code] = {
                'value': standardKeyboardEvent.browserEvent.key,
                'withShift': '',
                'withAltGr': '',
                'withShiftAltGr': ''
            };
            const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);
            if (matchedKeyboardLayout) {
                return ret;
            }
            return null;
        }
        return null;
    }
}
export class BrowserKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
    constructor(configurationService, notificationService, storageService, commandService) {
        // super(notificationService, storageService, commandService);
        super(configurationService);
        const platform = isWindows ? 'win' : isMacintosh ? 'darwin' : 'linux';
        import(/* webpackIgnore: true */ FileAccess.asBrowserUri(`vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.${platform}.js`).path).then((m) => {
            const keymapInfos = m.KeyboardLayoutContribution.INSTANCE.layoutInfos;
            this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout))));
            this._mru = this._keymapInfos;
            this._initialized = true;
            this.setLayoutFromBrowserAPI();
        });
    }
}
class UserKeyboardLayout extends Disposable {
    get keyboardLayout() { return this._keyboardLayout; }
    constructor(keyboardLayoutResource, fileService) {
        super();
        this.keyboardLayoutResource = keyboardLayoutResource;
        this.fileService = fileService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._keyboardLayout = null;
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
            if (changed) {
                this._onDidChange.fire();
            }
        }), 50));
        this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.keyboardLayoutResource))(() => this.reloadConfigurationScheduler.schedule()));
    }
    async initialize() {
        await this.reload();
    }
    async reload() {
        const existing = this._keyboardLayout;
        try {
            const content = await this.fileService.readFile(this.keyboardLayoutResource);
            const value = parse(content.value.toString());
            if (getNodeType(value) === 'object') {
                const layoutInfo = value.layout;
                const mappings = value.rawMapping;
                this._keyboardLayout = KeymapInfo.createKeyboardLayoutFromDebugInfo(layoutInfo, mappings, true);
            }
            else {
                this._keyboardLayout = null;
            }
        }
        catch (e) {
            this._keyboardLayout = null;
        }
        return existing ? !objects.equals(existing, this._keyboardLayout) : true;
    }
}
let BrowserKeyboardLayoutService = class BrowserKeyboardLayoutService extends Disposable {
    constructor(environmentService, fileService, notificationService, storageService, commandService, configurationService) {
        super();
        this.configurationService = configurationService;
        this._onDidChangeKeyboardLayout = this._register(new Emitter());
        this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
        const keyboardConfig = configurationService.getValue('keyboard');
        const layout = keyboardConfig.layout;
        this._keyboardLayoutMode = layout ?? 'autodetect';
        this._factory = new BrowserKeyboardMapperFactory(configurationService, notificationService, storageService, commandService);
        this._register(this._factory.onDidChangeKeyboardMapper(() => {
            this._onDidChangeKeyboardLayout.fire();
        }));
        if (layout && layout !== 'autodetect') {
            // set keyboard layout
            this._factory.setKeyboardLayout(layout);
        }
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('keyboard.layout')) {
                const keyboardConfig = configurationService.getValue('keyboard');
                const layout = keyboardConfig.layout;
                this._keyboardLayoutMode = layout;
                if (layout === 'autodetect') {
                    this._factory.setLayoutFromBrowserAPI();
                }
                else {
                    this._factory.setKeyboardLayout(layout);
                }
            }
        }));
        this._userKeyboardLayout = new UserKeyboardLayout(environmentService.keyboardLayoutResource, fileService);
        this._userKeyboardLayout.initialize().then(() => {
            if (this._userKeyboardLayout.keyboardLayout) {
                this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
                this.setUserKeyboardLayoutIfMatched();
            }
        });
        this._register(this._userKeyboardLayout.onDidChange(() => {
            const userKeyboardLayouts = this._factory.keymapInfos.filter(layout => layout.isUserKeyboardLayout);
            if (userKeyboardLayouts.length) {
                if (this._userKeyboardLayout.keyboardLayout) {
                    userKeyboardLayouts[0].update(this._userKeyboardLayout.keyboardLayout);
                }
                else {
                    this._factory.removeKeyboardLayout(userKeyboardLayouts[0]);
                }
            }
            else {
                if (this._userKeyboardLayout.keyboardLayout) {
                    this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
                }
            }
            this.setUserKeyboardLayoutIfMatched();
        }));
    }
    setUserKeyboardLayoutIfMatched() {
        const keyboardConfig = this.configurationService.getValue('keyboard');
        const layout = keyboardConfig.layout;
        if (layout && this._userKeyboardLayout.keyboardLayout) {
            if (getKeyboardLayoutId(this._userKeyboardLayout.keyboardLayout.layout) === layout && this._factory.activeKeymap) {
                if (!this._userKeyboardLayout.keyboardLayout.equal(this._factory.activeKeymap)) {
                    this._factory.setActiveKeymapInfo(this._userKeyboardLayout.keyboardLayout);
                }
            }
        }
    }
    getKeyboardMapper() {
        return this._factory.getKeyboardMapper();
    }
    getCurrentKeyboardLayout() {
        return this._factory.activeKeyboardLayout;
    }
    getAllKeyboardLayouts() {
        return this._factory.keyboardLayouts;
    }
    getRawKeyboardMapping() {
        return this._factory.activeKeyMapping;
    }
    validateCurrentKeyboardMapping(keyboardEvent) {
        if (this._keyboardLayoutMode !== 'autodetect') {
            return;
        }
        this._factory.validateCurrentKeyboardMapping(keyboardEvent);
    }
};
BrowserKeyboardLayoutService = __decorate([
    __param(0, IEnvironmentService),
    __param(1, IFileService),
    __param(2, INotificationService),
    __param(3, IStorageService),
    __param(4, ICommandService),
    __param(5, IConfigurationService)
], BrowserKeyboardLayoutService);
export { BrowserKeyboardLayoutService };
registerSingleton(IKeyboardLayoutService, BrowserKeyboardLayoutService, 1 /* InstantiationType.Delayed */);
// Configuration
const configurationRegistry = Registry.as(ConfigExtensions.Configuration);
const keyboardConfiguration = {
    'id': 'keyboard',
    'order': 15,
    'type': 'object',
    'title': nls.localize('keyboardConfigurationTitle', "Keyboard"),
    'properties': {
        'keyboard.layout': {
            'type': 'string',
            'default': 'autodetect',
            'description': nls.localize('keyboard.layout.config', "Control the keyboard layout used in web.")
        }
    }
};
configurationRegistry.registerConfiguration(keyboardConfiguration);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvYnJvd3Nlci9rZXlib2FyZExheW91dFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBbUIsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQXlDLE1BQU0seUJBQXlCLENBQUM7QUFDNUYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBa0Isa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsSCxPQUFPLEVBQW1CLG9CQUFvQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDckgsT0FBTyxFQUFFLEVBQUUsRUFBbUIsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFF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