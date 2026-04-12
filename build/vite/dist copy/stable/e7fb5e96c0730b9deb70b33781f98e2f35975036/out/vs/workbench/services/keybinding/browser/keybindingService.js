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
var WorkbenchKeybindingService_1;
import * as nls from '../../../../nls.js';
// base
import * as browser from '../../../../base/browser/browser.js';
import { BrowserFeatures } from '../../../../base/browser/canIUse.js';
import * as dom from '../../../../base/browser/dom.js';
import { printKeyboardEvent, printStandardKeyboardEvent, StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { UserSettingsLabelProvider } from '../../../../base/common/keybindingLabels.js';
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { KeyCodeChord, ScanCodeChord } from '../../../../base/common/keybindings.js';
import { IMMUTABLE_CODE_TO_KEY_CODE, KeyCodeUtils, ScanCodeUtils } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import { isMacintosh, OS } from '../../../../base/common/platform.js';
import { dirname } from '../../../../base/common/resources.js';
// platform
import { isLocalizedString } from '../../../../platform/action/common/action.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Extensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { AbstractKeybindingService } from '../../../../platform/keybinding/common/abstractKeybindingService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingResolver } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
// workbench
import { remove } from '../../../../base/common/arrays.js';
import { commandsExtensionPoint } from '../../actions/common/menusExtensionPoint.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { KeybindingIO, OutputBuilder } from '../common/keybindingIO.js';
import { getAllUnboundCommands } from './unboundCommands.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
function isValidContributedKeyBinding(keyBinding, rejects) {
    if (!keyBinding) {
        rejects.push(nls.localize('nonempty', "expected non-empty value."));
        return false;
    }
    if (typeof keyBinding.command !== 'string') {
        rejects.push(nls.localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
        return false;
    }
    if (keyBinding.key && typeof keyBinding.key !== 'string') {
        rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'key'));
        return false;
    }
    if (keyBinding.when && typeof keyBinding.when !== 'string') {
        rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
        return false;
    }
    if (keyBinding.mac && typeof keyBinding.mac !== 'string') {
        rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'mac'));
        return false;
    }
    if (keyBinding.linux && typeof keyBinding.linux !== 'string') {
        rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'linux'));
        return false;
    }
    if (keyBinding.win && typeof keyBinding.win !== 'string') {
        rejects.push(nls.localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'win'));
        return false;
    }
    return true;
}
const keybindingType = {
    type: 'object',
    default: { command: '', key: '' },
    required: ['command', 'key'],
    properties: {
        command: {
            description: nls.localize('vscode.extension.contributes.keybindings.command', 'Identifier of the command to run when keybinding is triggered.'),
            type: 'string'
        },
        args: {
            description: nls.localize('vscode.extension.contributes.keybindings.args', "Arguments to pass to the command to execute.")
        },
        key: {
            description: nls.localize('vscode.extension.contributes.keybindings.key', 'Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord).'),
            type: 'string'
        },
        mac: {
            description: nls.localize('vscode.extension.contributes.keybindings.mac', 'Mac specific key or key sequence.'),
            type: 'string'
        },
        linux: {
            description: nls.localize('vscode.extension.contributes.keybindings.linux', 'Linux specific key or key sequence.'),
            type: 'string'
        },
        win: {
            description: nls.localize('vscode.extension.contributes.keybindings.win', 'Windows specific key or key sequence.'),
            type: 'string'
        },
        when: {
            description: nls.localize('vscode.extension.contributes.keybindings.when', 'Condition when the key is active.'),
            type: 'string'
        },
    }
};
const keybindingsExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'keybindings',
    deps: [commandsExtensionPoint],
    jsonSchema: {
        description: nls.localize('vscode.extension.contributes.keybindings', "Contributes keybindings."),
        oneOf: [
            keybindingType,
            {
                type: 'array',
                items: keybindingType
            }
        ]
    }
});
const NUMPAD_PRINTABLE_SCANCODES = [
    90 /* ScanCode.NumpadDivide */,
    91 /* ScanCode.NumpadMultiply */,
    92 /* ScanCode.NumpadSubtract */,
    93 /* ScanCode.NumpadAdd */,
    95 /* ScanCode.Numpad1 */,
    96 /* ScanCode.Numpad2 */,
    97 /* ScanCode.Numpad3 */,
    98 /* ScanCode.Numpad4 */,
    99 /* ScanCode.Numpad5 */,
    100 /* ScanCode.Numpad6 */,
    101 /* ScanCode.Numpad7 */,
    102 /* ScanCode.Numpad8 */,
    103 /* ScanCode.Numpad9 */,
    104 /* ScanCode.Numpad0 */,
    105 /* ScanCode.NumpadDecimal */
];
const otherMacNumpadMapping = new Map();
otherMacNumpadMapping.set(95 /* ScanCode.Numpad1 */, 22 /* KeyCode.Digit1 */);
otherMacNumpadMapping.set(96 /* ScanCode.Numpad2 */, 23 /* KeyCode.Digit2 */);
otherMacNumpadMapping.set(97 /* ScanCode.Numpad3 */, 24 /* KeyCode.Digit3 */);
otherMacNumpadMapping.set(98 /* ScanCode.Numpad4 */, 25 /* KeyCode.Digit4 */);
otherMacNumpadMapping.set(99 /* ScanCode.Numpad5 */, 26 /* KeyCode.Digit5 */);
otherMacNumpadMapping.set(100 /* ScanCode.Numpad6 */, 27 /* KeyCode.Digit6 */);
otherMacNumpadMapping.set(101 /* ScanCode.Numpad7 */, 28 /* KeyCode.Digit7 */);
otherMacNumpadMapping.set(102 /* ScanCode.Numpad8 */, 29 /* KeyCode.Digit8 */);
otherMacNumpadMapping.set(103 /* ScanCode.Numpad9 */, 30 /* KeyCode.Digit9 */);
otherMacNumpadMapping.set(104 /* ScanCode.Numpad0 */, 21 /* KeyCode.Digit0 */);
let WorkbenchKeybindingService = WorkbenchKeybindingService_1 = class WorkbenchKeybindingService extends AbstractKeybindingService {
    constructor(contextKeyService, commandService, telemetryService, notificationService, userDataProfileService, hostService, extensionService, fileService, uriIdentityService, logService, keyboardLayoutService) {
        super(contextKeyService, commandService, telemetryService, notificationService, logService);
        this.hostService = hostService;
        this.keyboardLayoutService = keyboardLayoutService;
        this._contributions = [];
        this.isComposingGlobalContextKey = contextKeyService.createKey(EditorContextKeys.isComposing.key, false);
        this.kbsJsonSchema = new KeybindingsJsonSchema();
        this.updateKeybindingsJsonSchema();
        this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
        this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
            this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
            this.updateResolver();
        }));
        this._keybindingHoldMode = null;
        this._cachedResolver = null;
        this.userKeybindings = this._register(new UserKeybindings(userDataProfileService, uriIdentityService, fileService, logService));
        this.userKeybindings.initialize().then(() => {
            if (this.userKeybindings.keybindings.length) {
                this.updateResolver();
            }
        });
        this._register(this.userKeybindings.onDidChange(() => {
            logService.debug('User keybindings changed');
            this.updateResolver();
        }));
        keybindingsExtPoint.setHandler((extensions) => {
            const keybindings = [];
            for (const extension of extensions) {
                this._handleKeybindingsExtensionPointUser(extension.description.identifier, extension.description.isBuiltin, extension.value, extension.collector, keybindings);
            }
            KeybindingsRegistry.setExtensionKeybindings(keybindings);
            this.updateResolver();
        });
        this.updateKeybindingsJsonSchema();
        this._register(extensionService.onDidRegisterExtensions(() => this.updateKeybindingsJsonSchema()));
        this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => disposables.add(this._registerKeyListeners(window)), { window: mainWindow, disposables: this._store }));
        this._register(browser.onDidChangeFullscreen(windowId => {
            if (windowId !== mainWindow.vscodeWindowId) {
                return;
            }
            const keyboard = navigator.keyboard;
            if (BrowserFeatures.keyboard === 2 /* KeyboardSupport.None */) {
                return;
            }
            if (browser.isFullscreen(mainWindow)) {
                keyboard?.lock(['Escape']);
            }
            else {
                keyboard?.unlock();
            }
            // update resolver which will bring back all unbound keyboard shortcuts
            this._cachedResolver = null;
            this._onDidUpdateKeybindings.fire();
        }));
    }
    dispose() {
        this._contributions.forEach(c => c.listener?.dispose());
        this._contributions.length = 0;
        super.dispose();
    }
    _registerKeyListeners(window) {
        const disposables = new DisposableStore();
        // for standard keybindings
        disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_DOWN, (e) => {
            if (this._keybindingHoldMode) {
                return;
            }
            this.isComposingGlobalContextKey.set(e.isComposing);
            const keyEvent = new StandardKeyboardEvent(e);
            this._log(`/ Received  keydown event - ${printKeyboardEvent(e)}`);
            this._log(`| Converted keydown event - ${printStandardKeyboardEvent(keyEvent)}`);
            const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
            if (shouldPreventDefault) {
                keyEvent.preventDefault();
            }
            this.isComposingGlobalContextKey.set(false);
        }));
        // for single modifier chord keybindings (e.g. shift shift)
        disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_UP, (e) => {
            this._resetKeybindingHoldMode();
            this.isComposingGlobalContextKey.set(e.isComposing);
            const keyEvent = new StandardKeyboardEvent(e);
            const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
            if (shouldPreventDefault) {
                keyEvent.preventDefault();
            }
            this.isComposingGlobalContextKey.set(false);
        }));
        return disposables;
    }
    registerSchemaContribution(contribution) {
        const listener = contribution.onDidChange?.(() => this.updateKeybindingsJsonSchema());
        const entry = { listener, contribution };
        this._contributions.push(entry);
        this.updateKeybindingsJsonSchema();
        return toDisposable(() => {
            listener?.dispose();
            remove(this._contributions, entry);
            this.updateKeybindingsJsonSchema();
        });
    }
    updateKeybindingsJsonSchema() {
        this.kbsJsonSchema.updateSchema(this._contributions.flatMap(x => x.contribution.getSchemaAdditions()));
    }
    _printKeybinding(keybinding) {
        return UserSettingsLabelProvider.toLabel(OS, keybinding.chords, (chord) => {
            if (chord instanceof KeyCodeChord) {
                return KeyCodeUtils.toString(chord.keyCode);
            }
            return ScanCodeUtils.toString(chord.scanCode);
        }) || '[null]';
    }
    _printResolvedKeybinding(resolvedKeybinding) {
        return resolvedKeybinding.getDispatchChords().map(x => x || '[null]').join(' ');
    }
    _printResolvedKeybindings(output, input, resolvedKeybindings) {
        const padLength = 35;
        const firstRow = `${input.padStart(padLength, ' ')} => `;
        if (resolvedKeybindings.length === 0) {
            // no binding found
            output.push(`${firstRow}${'[NO BINDING]'.padStart(padLength, ' ')}`);
            return;
        }
        const firstRowIndentation = firstRow.length;
        const isFirst = true;
        for (const resolvedKeybinding of resolvedKeybindings) {
            if (isFirst) {
                output.push(`${firstRow}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, ' ')}`);
            }
            else {
                output.push(`${' '.repeat(firstRowIndentation)}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, ' ')}`);
            }
        }
    }
    _dumpResolveKeybindingDebugInfo() {
        const seenBindings = new Set();
        const result = [];
        result.push(`Default Resolved Keybindings (unique only):`);
        for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
            if (!item.keybinding) {
                continue;
            }
            const input = this._printKeybinding(item.keybinding);
            if (seenBindings.has(input)) {
                continue;
            }
            seenBindings.add(input);
            const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
            this._printResolvedKeybindings(result, input, resolvedKeybindings);
        }
        result.push(`User Resolved Keybindings (unique only):`);
        for (const item of this.userKeybindings.keybindings) {
            if (!item.keybinding) {
                continue;
            }
            const input = item._sourceKey ?? 'Impossible: missing source key, but has keybinding';
            if (seenBindings.has(input)) {
                continue;
            }
            seenBindings.add(input);
            const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
            this._printResolvedKeybindings(result, input, resolvedKeybindings);
        }
        return result.join('\n');
    }
    _dumpDebugInfo() {
        const layoutInfo = JSON.stringify(this.keyboardLayoutService.getCurrentKeyboardLayout(), null, '\t');
        const mapperInfo = this._keyboardMapper.dumpDebugInfo();
        const resolvedKeybindings = this._dumpResolveKeybindingDebugInfo();
        const rawMapping = JSON.stringify(this.keyboardLayoutService.getRawKeyboardMapping(), null, '\t');
        return `Layout info:\n${layoutInfo}\n\n${resolvedKeybindings}\n\n${mapperInfo}\n\nRaw mapping:\n${rawMapping}`;
    }
    _dumpDebugInfoJSON() {
        const info = {
            layout: this.keyboardLayoutService.getCurrentKeyboardLayout(),
            rawMapping: this.keyboardLayoutService.getRawKeyboardMapping()
        };
        return JSON.stringify(info, null, '\t');
    }
    enableKeybindingHoldMode(commandId) {
        if (this._currentlyDispatchingCommandId !== commandId) {
            return undefined;
        }
        this._keybindingHoldMode = new DeferredPromise();
        const focusTracker = dom.trackFocus(dom.getWindow(undefined));
        const listener = focusTracker.onDidBlur(() => this._resetKeybindingHoldMode());
        this._keybindingHoldMode.p.finally(() => {
            listener.dispose();
            focusTracker.dispose();
        });
        this._log(`+ Enabled hold-mode for ${commandId}.`);
        return this._keybindingHoldMode.p;
    }
    _resetKeybindingHoldMode() {
        if (this._keybindingHoldMode) {
            this._keybindingHoldMode?.complete();
            this._keybindingHoldMode = null;
        }
    }
    customKeybindingsCount() {
        return this.userKeybindings.keybindings.length;
    }
    updateResolver() {
        this._cachedResolver = null;
        this._onDidUpdateKeybindings.fire();
    }
    _getResolver() {
        if (!this._cachedResolver) {
            const defaults = this._resolveKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
            const overrides = this._resolveUserKeybindingItems(this.userKeybindings.keybindings, false);
            this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
        }
        return this._cachedResolver;
    }
    _documentHasFocus() {
        // it is possible that the document has lost focus, but the
        // window is still focused, e.g. when a <webview> element
        // has focus
        return this.hostService.hasFocus;
    }
    _resolveKeybindingItems(items, isDefault) {
        const result = [];
        let resultLen = 0;
        for (const item of items) {
            const when = item.when || undefined;
            const keybinding = item.keybinding;
            if (!keybinding) {
                // This might be a removal keybinding item in user settings => accept it
                result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
            }
            else {
                if (this._assertBrowserConflicts(keybinding)) {
                    continue;
                }
                const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(keybinding);
                for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
                    const resolvedKeybinding = resolvedKeybindings[i];
                    result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
                }
            }
        }
        return result;
    }
    _resolveUserKeybindingItems(items, isDefault) {
        const result = [];
        let resultLen = 0;
        for (const item of items) {
            const when = item.when || undefined;
            if (!item.keybinding) {
                // This might be a removal keybinding item in user settings => accept it
                result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, null, false);
            }
            else {
                const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
                for (const resolvedKeybinding of resolvedKeybindings) {
                    result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
                }
            }
        }
        return result;
    }
    _assertBrowserConflicts(keybinding) {
        if (BrowserFeatures.keyboard === 0 /* KeyboardSupport.Always */) {
            return false;
        }
        if (BrowserFeatures.keyboard === 1 /* KeyboardSupport.FullScreen */ && browser.isFullscreen(mainWindow)) {
            return false;
        }
        for (const chord of keybinding.chords) {
            if (!chord.metaKey && !chord.altKey && !chord.ctrlKey && !chord.shiftKey) {
                continue;
            }
            const modifiersMask = 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */;
            let partModifiersMask = 0;
            if (chord.metaKey) {
                partModifiersMask |= 2048 /* KeyMod.CtrlCmd */;
            }
            if (chord.shiftKey) {
                partModifiersMask |= 1024 /* KeyMod.Shift */;
            }
            if (chord.altKey) {
                partModifiersMask |= 512 /* KeyMod.Alt */;
            }
            if (chord.ctrlKey && OS === 2 /* OperatingSystem.Macintosh */) {
                partModifiersMask |= 256 /* KeyMod.WinCtrl */;
            }
            if ((partModifiersMask & modifiersMask) === (2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */)) {
                if (chord instanceof ScanCodeChord && (chord.scanCode === 86 /* ScanCode.ArrowLeft */ || chord.scanCode === 85 /* ScanCode.ArrowRight */)) {
                    // console.warn('Ctrl/Cmd+Arrow keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
                    return true;
                }
                if (chord instanceof KeyCodeChord && (chord.keyCode === 15 /* KeyCode.LeftArrow */ || chord.keyCode === 17 /* KeyCode.RightArrow */)) {
                    // console.warn('Ctrl/Cmd+Arrow keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
                    return true;
                }
            }
            if ((partModifiersMask & modifiersMask) === 2048 /* KeyMod.CtrlCmd */) {
                if (chord instanceof ScanCodeChord && (chord.scanCode >= 36 /* ScanCode.Digit1 */ && chord.scanCode <= 45 /* ScanCode.Digit0 */)) {
                    // console.warn('Ctrl/Cmd+Num keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
                    return true;
                }
                if (chord instanceof KeyCodeChord && (chord.keyCode >= 21 /* KeyCode.Digit0 */ && chord.keyCode <= 30 /* KeyCode.Digit9 */)) {
                    // console.warn('Ctrl/Cmd+Num keybindings should not be used by default in web. Offender: ', kb.getHashCode(), ' for ', commandId);
                    return true;
                }
            }
        }
        return false;
    }
    resolveKeybinding(kb) {
        return this._keyboardMapper.resolveKeybinding(kb);
    }
    resolveKeyboardEvent(keyboardEvent) {
        this.keyboardLayoutService.validateCurrentKeyboardMapping(keyboardEvent);
        return this._keyboardMapper.resolveKeyboardEvent(keyboardEvent);
    }
    resolveUserBinding(userBinding) {
        const keybinding = KeybindingParser.parseKeybinding(userBinding);
        return (keybinding ? this._keyboardMapper.resolveKeybinding(keybinding) : []);
    }
    _handleKeybindingsExtensionPointUser(extensionId, isBuiltin, keybindings, collector, result) {
        if (Array.isArray(keybindings)) {
            for (let i = 0, len = keybindings.length; i < len; i++) {
                this._handleKeybinding(extensionId, isBuiltin, i + 1, keybindings[i], collector, result);
            }
        }
        else {
            this._handleKeybinding(extensionId, isBuiltin, 1, keybindings, collector, result);
        }
    }
    _handleKeybinding(extensionId, isBuiltin, idx, keybindings, collector, result) {
        const rejects = [];
        if (isValidContributedKeyBinding(keybindings, rejects)) {
            const rule = this._asCommandRule(extensionId, isBuiltin, idx++, keybindings);
            if (rule) {
                result.push(rule);
            }
        }
        if (rejects.length > 0) {
            collector.error(nls.localize('invalid.keybindings', "Invalid `contributes.{0}`: {1}", keybindingsExtPoint.name, rejects.join('\n')));
        }
    }
    static bindToCurrentPlatform(key, mac, linux, win) {
        if (OS === 1 /* OperatingSystem.Windows */ && win) {
            if (win) {
                return win;
            }
        }
        else if (OS === 2 /* OperatingSystem.Macintosh */) {
            if (mac) {
                return mac;
            }
        }
        else {
            if (linux) {
                return linux;
            }
        }
        return key;
    }
    _asCommandRule(extensionId, isBuiltin, idx, binding) {
        const { command, args, when, key, mac, linux, win } = binding;
        const keybinding = WorkbenchKeybindingService_1.bindToCurrentPlatform(key, mac, linux, win);
        if (!keybinding) {
            return undefined;
        }
        let weight;
        if (isBuiltin) {
            weight = 300 /* KeybindingWeight.BuiltinExtension */ + idx;
        }
        else {
            weight = 400 /* KeybindingWeight.ExternalExtension */ + idx;
        }
        const commandAction = MenuRegistry.getCommand(command);
        const precondition = commandAction && commandAction.precondition;
        let fullWhen;
        if (when && precondition) {
            fullWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(when));
        }
        else if (when) {
            fullWhen = ContextKeyExpr.deserialize(when);
        }
        else if (precondition) {
            fullWhen = precondition;
        }
        const desc = {
            id: command,
            args,
            when: fullWhen,
            weight: weight,
            keybinding: KeybindingParser.parseKeybinding(keybinding),
            extensionId: extensionId.value,
            isBuiltinExtension: isBuiltin
        };
        return desc;
    }
    getDefaultKeybindingsContent() {
        const resolver = this._getResolver();
        const defaultKeybindings = resolver.getDefaultKeybindings();
        const boundCommands = resolver.getDefaultBoundCommands();
        return (WorkbenchKeybindingService_1._getDefaultKeybindings(defaultKeybindings)
            + '\n\n'
            + WorkbenchKeybindingService_1._getAllCommandsAsComment(boundCommands));
    }
    static _getDefaultKeybindings(defaultKeybindings) {
        const out = new OutputBuilder();
        out.writeLine('[');
        const lastIndex = defaultKeybindings.length - 1;
        defaultKeybindings.forEach((k, index) => {
            KeybindingIO.writeKeybindingItem(out, k);
            if (index !== lastIndex) {
                out.writeLine(',');
            }
            else {
                out.writeLine();
            }
        });
        out.writeLine(']');
        return out.toString();
    }
    static _getAllCommandsAsComment(boundCommands) {
        const unboundCommands = getAllUnboundCommands(boundCommands);
        const pretty = unboundCommands.sort().join('\n// - ');
        return '// ' + nls.localize('unboundCommands', "Here are other available commands: ") + '\n// - ' + pretty;
    }
    mightProducePrintableCharacter(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            // ignore ctrl/cmd/alt-combination but not shift-combinatios
            return false;
        }
        const code = ScanCodeUtils.toEnum(event.code);
        if (NUMPAD_PRINTABLE_SCANCODES.indexOf(code) !== -1) {
            // This is a numpad key that might produce a printable character based on NumLock.
            // Let's check if NumLock is on or off based on the event's keyCode.
            // e.g.
            // - when NumLock is off, ScanCode.Numpad4 produces KeyCode.LeftArrow
            // - when NumLock is on, ScanCode.Numpad4 produces KeyCode.NUMPAD_4
            // However, ScanCode.NumpadAdd always produces KeyCode.NUMPAD_ADD
            if (event.keyCode === IMMUTABLE_CODE_TO_KEY_CODE[code]) {
                // NumLock is on or this is /, *, -, + on the numpad
                return true;
            }
            if (isMacintosh && event.keyCode === otherMacNumpadMapping.get(code)) {
                // on macOS, the numpad keys can also map to keys 1 - 0.
                return true;
            }
            return false;
        }
        const keycode = IMMUTABLE_CODE_TO_KEY_CODE[code];
        if (keycode !== -1) {
            // https://github.com/microsoft/vscode/issues/74934
            return false;
        }
        // consult the KeyboardMapperFactory to check the given event for
        // a printable value.
        const mapping = this.keyboardLayoutService.getRawKeyboardMapping();
        if (!mapping) {
            return false;
        }
        const keyInfo = mapping[event.code];
        if (!keyInfo) {
            return false;
        }
        if (!keyInfo.value || /\s/.test(keyInfo.value)) {
            return false;
        }
        return true;
    }
};
WorkbenchKeybindingService = WorkbenchKeybindingService_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, ICommandService),
    __param(2, ITelemetryService),
    __param(3, INotificationService),
    __param(4, IUserDataProfileService),
    __param(5, IHostService),
    __param(6, IExtensionService),
    __param(7, IFileService),
    __param(8, IUriIdentityService),
    __param(9, ILogService),
    __param(10, IKeyboardLayoutService)
], WorkbenchKeybindingService);
export { WorkbenchKeybindingService };
class UserKeybindings extends Disposable {
    get keybindings() { return this._keybindings; }
    constructor(userDataProfileService, uriIdentityService, fileService, logService) {
        super();
        this.userDataProfileService = userDataProfileService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this._rawKeybindings = [];
        this._keybindings = [];
        this.watchDisposables = this._register(new DisposableStore());
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.watch();
        this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(changed => {
            if (changed) {
                this._onDidChange.fire();
            }
        }), 50));
        this._register(Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.userDataProfileService.currentProfile.keybindingsResource))(() => {
            logService.debug('Keybindings file changed');
            this.reloadConfigurationScheduler.schedule();
        }));
        this._register(this.fileService.onDidRunOperation((e) => {
            if (e.operation === 4 /* FileOperation.WRITE */ && e.resource.toString() === this.userDataProfileService.currentProfile.keybindingsResource.toString()) {
                logService.debug('Keybindings file written');
                this.reloadConfigurationScheduler.schedule();
            }
        }));
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
            if (!this.uriIdentityService.extUri.isEqual(e.previous.keybindingsResource, e.profile.keybindingsResource)) {
                e.join(this.whenCurrentProfileChanged());
            }
        }));
    }
    async whenCurrentProfileChanged() {
        this.watch();
        this.reloadConfigurationScheduler.schedule();
    }
    watch() {
        this.watchDisposables.clear();
        this.watchDisposables.add(this.fileService.watch(dirname(this.userDataProfileService.currentProfile.keybindingsResource)));
        // Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
        this.watchDisposables.add(this.fileService.watch(this.userDataProfileService.currentProfile.keybindingsResource));
    }
    async initialize() {
        await this.reload();
    }
    async reload() {
        const newKeybindings = await this.readUserKeybindings();
        if (objects.equals(this._rawKeybindings, newKeybindings)) {
            // no change
            return false;
        }
        this._rawKeybindings = newKeybindings;
        this._keybindings = this._rawKeybindings.map((k) => KeybindingIO.readUserKeybindingItem(k));
        return true;
    }
    async readUserKeybindings() {
        try {
            const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.keybindingsResource);
            const value = parse(content.value.toString());
            return Array.isArray(value)
                ? value.filter(v => v && typeof v === 'object' /* just typeof === object doesn't catch `null` */)
                : [];
        }
        catch (e) {
            return [];
        }
    }
}
/**
 * Registers the `keybindings.json`'s schema with the JSON schema registry. Allows updating the schema, e.g., when new commands are registered (e.g., by extensions).
 *
 * Lifecycle owned by `WorkbenchKeybindingService`. Must be instantiated only once.
 */
class KeybindingsJsonSchema {
    static { this.schemaId = 'vscode://schemas/keybindings'; }
    constructor() {
        this.commandsSchemas = [];
        this.commandsEnum = [];
        this.removalCommandsEnum = [];
        this.commandsEnumDescriptions = [];
        this.schema = {
            id: KeybindingsJsonSchema.schemaId,
            type: 'array',
            title: nls.localize('keybindings.json.title', "Keybindings configuration"),
            allowTrailingCommas: true,
            allowComments: true,
            definitions: {
                'editorGroupsSchema': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'groups': {
                                '$ref': '#/definitions/editorGroupsSchema',
                                'default': [{}, {}]
                            },
                            'size': {
                                'type': 'number',
                                'default': 0.5
                            }
                        }
                    }
                },
                'commandNames': {
                    'type': 'string',
                    'enum': this.commandsEnum,
                    'enumDescriptions': this.commandsEnumDescriptions,
                    'description': nls.localize('keybindings.json.command', "Name of the command to execute"),
                },
                'commandType': {
                    'anyOf': [
                        {
                            $ref: '#/definitions/commandNames'
                        },
                        {
                            'type': 'string',
                            'enum': this.removalCommandsEnum,
                            'enumDescriptions': this.commandsEnumDescriptions,
                            'description': nls.localize('keybindings.json.removalCommand', "Name of the command to remove keyboard shortcut for"),
                        },
                        {
                            'type': 'string'
                        },
                    ]
                },
                'commandsSchemas': {
                    'allOf': this.commandsSchemas
                }
            },
            items: {
                'required': ['key'],
                'type': 'object',
                'defaultSnippets': [{ 'body': { 'key': '$1', 'command': '$2', 'when': '$3' } }],
                'properties': {
                    'key': {
                        'type': 'string',
                        'description': nls.localize('keybindings.json.key', "Key or key sequence (separated by space)"),
                    },
                    'command': {
                        'anyOf': [
                            {
                                'if': {
                                    'type': 'array'
                                },
                                'then': {
                                    'not': {
                                        'type': 'array'
                                    },
                                    'errorMessage': nls.localize('keybindings.commandsIsArray', "Incorrect type. Expected \"{0}\". The field 'command' does not support running multiple commands. Use command 'runCommands' to pass it multiple commands to run.", 'string')
                                },
                                'else': {
                                    '$ref': '#/definitions/commandType'
                                }
                            },
                            {
                                '$ref': '#/definitions/commandType'
                            }
                        ]
                    },
                    'when': {
                        'type': 'string',
                        'description': nls.localize('keybindings.json.when', "Condition when the key is active.")
                    },
                    'args': {
                        'description': nls.localize('keybindings.json.args', "Arguments to pass to the command to execute.")
                    }
                },
                '$ref': '#/definitions/commandsSchemas'
            }
        };
        this.schemaRegistry = Registry.as(Extensions.JSONContribution);
        this.schemaRegistry.registerSchema(KeybindingsJsonSchema.schemaId, this.schema);
    }
    // TODO@ulugbekna: can updates happen incrementally rather than rebuilding; concerns:
    // - is just appending additional schemas enough for the registry to pick them up?
    // - can `CommandsRegistry.getCommands` and `MenuRegistry.getCommands` return different values at different times? ie would just pushing new schemas from `additionalContributions` not be enough?
    updateSchema(additionalContributions) {
        this.commandsSchemas.length = 0;
        this.commandsEnum.length = 0;
        this.removalCommandsEnum.length = 0;
        this.commandsEnumDescriptions.length = 0;
        const knownCommands = new Set();
        const addKnownCommand = (commandId, description) => {
            if (!/^_/.test(commandId)) {
                if (!knownCommands.has(commandId)) {
                    knownCommands.add(commandId);
                    this.commandsEnum.push(commandId);
                    this.commandsEnumDescriptions.push(description === undefined
                        ? '' // `enumDescriptions` is an array of strings, so we can't use undefined
                        : (isLocalizedString(description) ? description.value : description));
                    // Also add the negative form for keybinding removal
                    this.removalCommandsEnum.push(`-${commandId}`);
                }
            }
        };
        const allCommands = CommandsRegistry.getCommands();
        for (const [commandId, command] of allCommands) {
            const commandMetadata = command.metadata;
            addKnownCommand(commandId, commandMetadata?.description ?? MenuRegistry.getCommand(commandId)?.title);
            if (!commandMetadata || !commandMetadata.args || commandMetadata.args.length !== 1 || !commandMetadata.args[0].schema) {
                continue;
            }
            const argsSchema = commandMetadata.args[0].schema;
            const argsRequired = ((typeof commandMetadata.args[0].isOptional !== 'undefined')
                ? (!commandMetadata.args[0].isOptional)
                : (Array.isArray(argsSchema.required) && argsSchema.required.length > 0));
            const addition = {
                'if': {
                    'required': ['command'],
                    'properties': {
                        'command': { 'const': commandId }
                    }
                },
                'then': {
                    'required': [].concat(argsRequired ? ['args'] : []),
                    'properties': {
                        'args': argsSchema
                    }
                }
            };
            this.commandsSchemas.push(addition);
        }
        const menuCommands = MenuRegistry.getCommands();
        for (const commandId of menuCommands.keys()) {
            addKnownCommand(commandId);
        }
        this.commandsSchemas.push(...additionalContributions);
        this.schemaRegistry.notifySchemaChanged(KeybindingsJsonSchema.schemaId);
    }
}
registerSingleton(IKeybindingService, WorkbenchKeybindingService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy9icm93c2VyL2tleWJpbmRpbmdTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU87QUFDUCxPQUFPLEtBQUssT0FBTyxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDdkYsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsMEJBQTBCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsSSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXhELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQy9FLE9BQU8sRUFBYyxZQUFZLEVBQXNCLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JILE9BQU8sRUFBRSwwQkFBMEIsRUFBVyxZQUFZLEVBQW9CLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlB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QU8sVUFBVSxDQUFDLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxRCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUcsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxVQUFVLENBQUMsSUFBSSxJQUFJLE9BQU8sVUFBVSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM1RCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDN0csT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxVQUFVLENBQUMsR0FBRyxJQUFJLE9BQU8sVUFBVSxDQUFDLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxRCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUcsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxVQUFVLENBQUMsS0FBSyxJQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM5RCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDOUcsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxVQUFVLENBQUMsR0FBRyxJQUFJLE9BQU8sVUFBVSxDQUFDLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUMxRCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLDJEQUEyRCxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUcsT0FBTyxLQUFLLENB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