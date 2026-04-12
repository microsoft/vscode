/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/actions.css';
import { localize, localize2 } from '../../../nls.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { DomEmitter } from '../../../base/browser/event.js';
import { Color } from '../../../base/common/color.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable, dispose, DisposableStore, setDisposableTracker, DisposableTracker } from '../../../base/common/lifecycle.js';
import { getDomNodePagePosition, append, $, getActiveDocument, onDidRegisterWindow, getWindows } from '../../../base/browser/dom.js';
import { createCSSRule, createStyleSheet } from '../../../base/browser/domStylesheets.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { registerAction2, Action2, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { clamp } from '../../../base/common/numbers.js';
import { Extensions as ConfigurationExtensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { IWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackup.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IOutputService } from '../../services/output/common/output.js';
import { windowLogId } from '../../services/log/common/logConstants.js';
import { ByteSize } from '../../../platform/files/common/files.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import product from '../../../platform/product/common/product.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IDefaultAccountService } from '../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { IAuthenticationAccessService } from '../../services/authentication/browser/authenticationAccessService.js';
import { IPolicyService } from '../../../platform/policy/common/policy.js';
class InspectContextKeysAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.inspectContextKeys',
            title: localize2('inspect context keys', 'Inspect Context Keys'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const contextKeyService = accessor.get(IContextKeyService);
        const disposables = new DisposableStore();
        const stylesheet = createStyleSheet(undefined, undefined, disposables);
        createCSSRule('*', 'cursor: crosshair !important;', stylesheet);
        const hoverFeedback = document.createElement('div');
        const activeDocument = getActiveDocument();
        activeDocument.body.appendChild(hoverFeedback);
        disposables.add(toDisposable(() => hoverFeedback.remove()));
        hoverFeedback.style.position = 'absolute';
        hoverFeedback.style.pointerEvents = 'none';
        hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        hoverFeedback.style.zIndex = '1000';
        const onMouseMove = disposables.add(new DomEmitter(activeDocument, 'mousemove', true));
        disposables.add(onMouseMove.event(e => {
            const target = e.target;
            const position = getDomNodePagePosition(target);
            hoverFeedback.style.top = `${position.top}px`;
            hoverFeedback.style.left = `${position.left}px`;
            hoverFeedback.style.width = `${position.width}px`;
            hoverFeedback.style.height = `${position.height}px`;
        }));
        const onMouseDown = disposables.add(new DomEmitter(activeDocument, 'mousedown', true));
        Event.once(onMouseDown.event)(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);
        const onMouseUp = disposables.add(new DomEmitter(activeDocument, 'mouseup', true));
        Event.once(onMouseUp.event)(e => {
            e.preventDefault();
            e.stopPropagation();
            const context = contextKeyService.getContext(e.target);
            console.log(context.collectAllValues());
            dispose(disposables);
        }, null, disposables);
    }
}
class ToggleScreencastModeAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleScreencastMode',
            title: localize2('toggle screencast mode', 'Toggle Screencast Mode'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        if (ToggleScreencastModeAction.disposable) {
            ToggleScreencastModeAction.disposable.dispose();
            ToggleScreencastModeAction.disposable = undefined;
            return;
        }
        const layoutService = accessor.get(ILayoutService);
        const configurationService = accessor.get(IConfigurationService);
        const keybindingService = accessor.get(IKeybindingService);
        const disposables = new DisposableStore();
        const container = layoutService.activeContainer;
        const mouseMarker = append(container, $('.screencast-mouse'));
        disposables.add(toDisposable(() => mouseMarker.remove()));
        const keyboardMarker = append(container, $('.screencast-keyboard'));
        disposables.add(toDisposable(() => keyboardMarker.remove()));
        const onMouseDown = disposables.add(new Emitter());
        const onMouseUp = disposables.add(new Emitter());
        const onMouseMove = disposables.add(new Emitter());
        function registerContainerListeners(container, windowDisposables) {
            const listeners = new DisposableStore();
            listeners.add(listeners.add(new DomEmitter(container, 'mousedown', true)).event(e => onMouseDown.fire(e)));
            listeners.add(listeners.add(new DomEmitter(container, 'mouseup', true)).event(e => onMouseUp.fire(e)));
            listeners.add(listeners.add(new DomEmitter(container, 'mousemove', true)).event(e => onMouseMove.fire(e)));
            windowDisposables.add(listeners);
            disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
            disposables.add(listeners);
        }
        for (const { window, disposables } of getWindows()) {
            registerContainerListeners(layoutService.getContainer(window), disposables);
        }
        disposables.add(onDidRegisterWindow(({ window, disposables }) => registerContainerListeners(layoutService.getContainer(window), disposables)));
        disposables.add(layoutService.onDidChangeActiveContainer(() => {
            layoutService.activeContainer.appendChild(mouseMarker);
            layoutService.activeContainer.appendChild(keyboardMarker);
        }));
        const updateMouseIndicatorColor = () => {
            mouseMarker.style.borderColor = Color.fromHex(configurationService.getValue('screencastMode.mouseIndicatorColor')).toString();
        };
        let mouseIndicatorSize;
        const updateMouseIndicatorSize = () => {
            mouseIndicatorSize = clamp(configurationService.getValue('screencastMode.mouseIndicatorSize') || 20, 20, 100);
            mouseMarker.style.height = `${mouseIndicatorSize}px`;
            mouseMarker.style.width = `${mouseIndicatorSize}px`;
        };
        updateMouseIndicatorColor();
        updateMouseIndicatorSize();
        disposables.add(onMouseDown.event(e => {
            mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
            mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
            mouseMarker.style.display = 'block';
            mouseMarker.style.transform = `scale(${1})`;
            mouseMarker.style.transition = 'transform 0.1s';
            const mouseMoveListener = onMouseMove.event(e => {
                mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
                mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
                mouseMarker.style.transform = `scale(${.8})`;
            });
            Event.once(onMouseUp.event)(() => {
                mouseMarker.style.display = 'none';
                mouseMoveListener.dispose();
            });
        }));
        const updateKeyboardFontSize = () => {
            keyboardMarker.style.fontSize = `${clamp(configurationService.getValue('screencastMode.fontSize') || 56, 20, 100)}px`;
        };
        const updateKeyboardMarker = () => {
            keyboardMarker.style.bottom = `${clamp(configurationService.getValue('screencastMode.verticalOffset') || 0, 0, 90)}%`;
        };
        let keyboardMarkerTimeout;
        const updateKeyboardMarkerTimeout = () => {
            keyboardMarkerTimeout = clamp(configurationService.getValue('screencastMode.keyboardOverlayTimeout') || 800, 500, 5000);
        };
        updateKeyboardFontSize();
        updateKeyboardMarker();
        updateKeyboardMarkerTimeout();
        disposables.add(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('screencastMode.verticalOffset')) {
                updateKeyboardMarker();
            }
            if (e.affectsConfiguration('screencastMode.fontSize')) {
                updateKeyboardFontSize();
            }
            if (e.affectsConfiguration('screencastMode.keyboardOverlayTimeout')) {
                updateKeyboardMarkerTimeout();
            }
            if (e.affectsConfiguration('screencastMode.mouseIndicatorColor')) {
                updateMouseIndicatorColor();
            }
            if (e.affectsConfiguration('screencastMode.mouseIndicatorSize')) {
                updateMouseIndicatorSize();
            }
        }));
        const onKeyDown = disposables.add(new Emitter());
        const onCompositionStart = disposables.add(new Emitter());
        const onCompositionUpdate = disposables.add(new Emitter());
        const onCompositionEnd = disposables.add(new Emitter());
        function registerWindowListeners(window, windowDisposables) {
            const listeners = new DisposableStore();
            listeners.add(listeners.add(new DomEmitter(window, 'keydown', true)).event(e => onKeyDown.fire(e)));
            listeners.add(listeners.add(new DomEmitter(window, 'compositionstart', true)).event(e => onCompositionStart.fire(e)));
            listeners.add(listeners.add(new DomEmitter(window, 'compositionupdate', true)).event(e => onCompositionUpdate.fire(e)));
            listeners.add(listeners.add(new DomEmitter(window, 'compositionend', true)).event(e => onCompositionEnd.fire(e)));
            windowDisposables.add(listeners);
            disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
            disposables.add(listeners);
        }
        for (const { window, disposables } of getWindows()) {
            registerWindowListeners(window, disposables);
        }
        disposables.add(onDidRegisterWindow(({ window, disposables }) => registerWindowListeners(window, disposables)));
        let length = 0;
        let composing = undefined;
        let imeBackSpace = false;
        const clearKeyboardScheduler = disposables.add(new RunOnceScheduler(() => {
            keyboardMarker.textContent = '';
            composing = undefined;
            length = 0;
        }, keyboardMarkerTimeout));
        disposables.add(onCompositionStart.event(e => {
            imeBackSpace = true;
        }));
        disposables.add(onCompositionUpdate.event(e => {
            if (e.data && imeBackSpace) {
                if (length > 20) {
                    keyboardMarker.innerText = '';
                    length = 0;
                }
                composing = composing ?? append(keyboardMarker, $('span.key'));
                composing.textContent = e.data;
            }
            else if (imeBackSpace) {
                keyboardMarker.innerText = '';
                append(keyboardMarker, $('span.key', {}, `Backspace`));
            }
            clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
        }));
        disposables.add(onCompositionEnd.event(e => {
            composing = undefined;
            length++;
        }));
        disposables.add(onKeyDown.event(e => {
            if (e.key === 'Process' || /[\uac00-\ud787\u3131-\u314e\u314f-\u3163\u3041-\u3094\u30a1-\u30f4\u30fc\u3005\u3006\u3024\u4e00-\u9fa5]/u.test(e.key)) {
                if (e.code === 'Backspace') {
                    imeBackSpace = true;
                }
                else if (!e.code.includes('Key')) {
                    composing = undefined;
                    imeBackSpace = false;
                }
                else {
                    imeBackSpace = true;
                }
                clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
                return;
            }
            if (e.isComposing) {
                return;
            }
            const options = configurationService.getValue('screencastMode.keyboardOptions');
            const event = new StandardKeyboardEvent(e);
            const shortcut = keybindingService.softDispatch(event, event.target);
            // Hide the single arrow key pressed
            if (shortcut.kind === 2 /* ResultKind.KbFound */ && shortcut.commandId && !(options.showSingleEditorCursorMoves ?? true) && (['cursorLeft', 'cursorRight', 'cursorUp', 'cursorDown'].includes(shortcut.commandId))) {
                return;
            }
            if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
                || length > 20
                || event.keyCode === 1 /* KeyCode.Backspace */ || event.keyCode === 9 /* KeyCode.Escape */
                || event.keyCode === 16 /* KeyCode.UpArrow */ || event.keyCode === 18 /* KeyCode.DownArrow */
                || event.keyCode === 15 /* KeyCode.LeftArrow */ || event.keyCode === 17 /* KeyCode.RightArrow */) {
                keyboardMarker.innerText = '';
                length = 0;
            }
            const keybinding = keybindingService.resolveKeyboardEvent(event);
            const commandDetails = (this._isKbFound(shortcut) && shortcut.commandId) ? this.getCommandDetails(shortcut.commandId) : undefined;
            let commandAndGroupLabel = commandDetails?.title;
            let keyLabel = keybinding.getLabel();
            if (commandDetails) {
                if ((options.showCommandGroups ?? false) && commandDetails.category) {
                    commandAndGroupLabel = `${commandDetails.category}: ${commandAndGroupLabel} `;
                }
                if (this._isKbFound(shortcut) && shortcut.commandId) {
                    const keybindings = keybindingService.lookupKeybindings(shortcut.commandId)
                        .filter(k => k.getLabel()?.endsWith(keyLabel ?? ''));
                    if (keybindings.length > 0) {
                        keyLabel = keybindings[keybindings.length - 1].getLabel();
                    }
                }
            }
            if ((options.showCommands ?? true) && commandAndGroupLabel) {
                append(keyboardMarker, $('span.title', {}, `${commandAndGroupLabel} `));
            }
            if ((options.showKeys ?? true) || ((options.showKeybindings ?? true) && this._isKbFound(shortcut))) {
                // Fix label for arrow keys
                keyLabel = keyLabel?.replace('UpArrow', '↑')
                    ?.replace('DownArrow', '↓')
                    ?.replace('LeftArrow', '←')
                    ?.replace('RightArrow', '→');
                append(keyboardMarker, $('span.key', {}, keyLabel ?? ''));
            }
            length++;
            clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
        }));
        ToggleScreencastModeAction.disposable = disposables;
    }
    _isKbFound(resolutionResult) {
        return resolutionResult.kind === 2 /* ResultKind.KbFound */;
    }
    getCommandDetails(commandId) {
        const fromMenuRegistry = MenuRegistry.getCommand(commandId);
        if (fromMenuRegistry) {
            return {
                title: typeof fromMenuRegistry.title === 'string' ? fromMenuRegistry.title : fromMenuRegistry.title.value,
                category: fromMenuRegistry.category ? (typeof fromMenuRegistry.category === 'string' ? fromMenuRegistry.category : fromMenuRegistry.category.value) : undefined
            };
        }
        const fromCommandsRegistry = CommandsRegistry.getCommand(commandId);
        if (fromCommandsRegistry?.metadata?.description) {
            return { title: typeof fromCommandsRegistry.metadata.description === 'string' ? fromCommandsRegistry.metadata.description : fromCommandsRegistry.metadata.description.value };
        }
        return undefined;
    }
}
class LogStorageAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.logStorage',
            title: localize2({ key: 'logStorage', comment: ['A developer only action to log the contents of the storage for the current window.'] }, "Log Storage Database Contents"),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const storageService = accessor.get(IStorageService);
        const dialogService = accessor.get(IDialogService);
        storageService.log();
        dialogService.info(localize('storageLogDialogMessage', "The storage database contents have been logged to the developer tools."), localize('storageLogDialogDetails', "Open developer tools from the menu and select the Console tab."));
    }
}
class LogWorkingCopiesAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.logWorkingCopies',
            title: localize2({ key: 'logWorkingCopies', comment: ['A developer only action to log the working copies that exist.'] }, "Log Working Copies"),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const workingCopyService = accessor.get(IWorkingCopyService);
        const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
        const logService = accessor.get(ILogService);
        const outputService = accessor.get(IOutputService);
        const backups = await workingCopyBackupService.getBackups();
        const msg = [
            ``,
            `[Working Copies]`,
            ...(workingCopyService.workingCopies.length > 0) ?
                workingCopyService.workingCopies.map(workingCopy => `${workingCopy.isDirty() ? '● ' : ''}${workingCopy.resource.toString(true)} (typeId: ${workingCopy.typeId || '<no typeId>'})`) :
                ['<none>'],
            ``,
            `[Backups]`,
            ...(backups.length > 0) ?
                backups.map(backup => `${backup.resource.toString(true)} (typeId: ${backup.typeId || '<no typeId>'})`) :
                ['<none>'],
        ];
        logService.info(msg.join('\n'));
        outputService.showChannel(windowLogId, true);
    }
}
class RemoveLargeStorageEntriesAction extends Action2 {
    static { this.SIZE_THRESHOLD = 1024 * 16; } // 16kb
    constructor() {
        super({
            id: 'workbench.action.removeLargeStorageDatabaseEntries',
            title: localize2('removeLargeStorageDatabaseEntries', 'Remove Large Storage Database Entries...'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const storageService = accessor.get(IStorageService);
        const quickInputService = accessor.get(IQuickInputService);
        const userDataProfileService = accessor.get(IUserDataProfileService);
        const dialogService = accessor.get(IDialogService);
        const environmentService = accessor.get(IEnvironmentService);
        const items = [];
        for (const scope of [-1 /* StorageScope.APPLICATION */, 0 /* StorageScope.PROFILE */, 1 /* StorageScope.WORKSPACE */]) {
            if (scope === 0 /* StorageScope.PROFILE */ && userDataProfileService.currentProfile.isDefault) {
                continue; // avoid duplicates
            }
            for (const target of [1 /* StorageTarget.MACHINE */, 0 /* StorageTarget.USER */]) {
                for (const key of storageService.keys(scope, target)) {
                    const value = storageService.get(key, scope);
                    if (value && (!environmentService.isBuilt /* show all keys in dev */ || value.length > RemoveLargeStorageEntriesAction.SIZE_THRESHOLD)) {
                        items.push({
                            key,
                            scope,
                            target,
                            size: value.length,
                            label: key,
                            description: ByteSize.formatSize(value.length),
                            detail: localize('largeStorageItemDetail', "Scope: {0}, Target: {1}", scope === -1 /* StorageScope.APPLICATION */ ? localize('global', "Global") : scope === 0 /* StorageScope.PROFILE */ ? localize('profile', "Profile") : localize('workspace', "Workspace"), target === 1 /* StorageTarget.MACHINE */ ? localize('machine', "Machine") : localize('user', "User")),
                        });
                    }
                }
            }
        }
        items.sort((itemA, itemB) => itemB.size - itemA.size);
        const selectedItems = await new Promise(resolve => {
            const disposables = new DisposableStore();
            const picker = disposables.add(quickInputService.createQuickPick());
            picker.items = items;
            picker.canSelectMany = true;
            picker.ok = false;
            picker.customButton = true;
            picker.hideCheckAll = true;
            picker.customLabel = localize('removeLargeStorageEntriesPickerButton', "Remove");
            picker.placeholder = localize('removeLargeStorageEntriesPickerPlaceholder', "Select large entries to remove from storage");
            if (items.length === 0) {
                picker.description = localize('removeLargeStorageEntriesPickerDescriptionNoEntries', "There are no large storage entries to remove.");
            }
            picker.show();
            disposables.add(picker.onDidCustom(() => {
                resolve(picker.selectedItems);
                picker.hide();
            }));
            disposables.add(picker.onDidHide(() => disposables.dispose()));
        });
        if (selectedItems.length === 0) {
            return;
        }
        const { confirmed } = await dialogService.confirm({
            type: 'warning',
            message: localize('removeLargeStorageEntriesConfirmRemove', "Do you want to remove the selected storage entries from the database?"),
            detail: localize('removeLargeStorageEntriesConfirmRemoveDetail', "{0}\n\nThis action is irreversible and may result in data loss!", selectedItems.map(item => item.label).join('\n')),
            primaryButton: localize({ key: 'removeLargeStorageEntriesButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Remove")
        });
        if (!confirmed) {
            return;
        }
        const scopesToOptimize = new Set();
        for (const item of selectedItems) {
            storageService.remove(item.key, item.scope);
            scopesToOptimize.add(item.scope);
        }
        for (const scope of scopesToOptimize) {
            await storageService.optimize(scope);
        }
    }
}
let tracker = undefined;
let trackedDisposables = new Set();
const DisposablesSnapshotStateContext = new RawContextKey('dirtyWorkingCopies', 'stopped');
class StartTrackDisposables extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.startTrackDisposables',
            title: localize2('startTrackDisposables', 'Start Tracking Disposables'),
            category: Categories.Developer,
            f1: true,
            precondition: ContextKeyExpr.and(DisposablesSnapshotStateContext.isEqualTo('pending').negate(), DisposablesSnapshotStateContext.isEqualTo('started').negate())
        });
    }
    run(accessor) {
        const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
        disposablesSnapshotStateContext.set('started');
        trackedDisposables.clear();
        tracker = new DisposableTracker();
        setDisposableTracker(tracker);
    }
}
class SnapshotTrackedDisposables extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.snapshotTrackedDisposables',
            title: localize2('snapshotTrackedDisposables', 'Snapshot Tracked Disposables'),
            category: Categories.Developer,
            f1: true,
            precondition: DisposablesSnapshotStateContext.isEqualTo('started')
        });
    }
    run(accessor) {
        const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
        disposablesSnapshotStateContext.set('pending');
        trackedDisposables = new Set(tracker?.computeLeakingDisposables(1000)?.leaks.map(disposable => disposable.value));
    }
}
class StopTrackDisposables extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.stopTrackDisposables',
            title: localize2('stopTrackDisposables', 'Stop Tracking Disposables'),
            category: Categories.Developer,
            f1: true,
            precondition: DisposablesSnapshotStateContext.isEqualTo('pending')
        });
    }
    run(accessor) {
        const editorService = accessor.get(IEditorService);
        const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
        disposablesSnapshotStateContext.set('stopped');
        if (tracker) {
            const disposableLeaks = new Set();
            for (const disposable of new Set(tracker.computeLeakingDisposables(1000)?.leaks) ?? []) {
                if (trackedDisposables.has(disposable.value)) {
                    disposableLeaks.add(disposable);
                }
            }
            const leaks = tracker.computeLeakingDisposables(1000, Array.from(disposableLeaks));
            if (leaks) {
                editorService.openEditor({ resource: undefined, contents: leaks.details });
            }
        }
        setDisposableTracker(null);
        tracker = undefined;
        trackedDisposables.clear();
    }
}
class PolicyDiagnosticsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.showPolicyDiagnostics',
            title: localize2('policyDiagnostics', 'Policy Diagnostics'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const configurationService = accessor.get(IConfigurationService);
        const productService = accessor.get(IProductService);
        const defaultAccountService = accessor.get(IDefaultAccountService);
        const authenticationService = accessor.get(IAuthenticationService);
        const authenticationAccessService = accessor.get(IAuthenticationAccessService);
        const policyService = accessor.get(IPolicyService);
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        let content = '# VS Code Policy Diagnostics\n\n';
        content += '*WARNING: This file may contain sensitive information.*\n\n';
        content += '## System Information\n\n';
        content += '| Property | Value |\n';
        content += '|----------|-------|\n';
        content += `| Generated | ${new Date().toISOString()} |\n`;
        content += `| Product | ${productService.nameLong} ${productService.version} |\n`;
        content += `| Commit | ${productService.commit || 'n/a'} |\n\n`;
        // Account information
        content += '## Account Information\n\n';
        try {
            const account = await defaultAccountService.getDefaultAccount();
            const sensitiveKeys = ['sessionId', 'analytics_tracking_id'];
            if (account) {
                // Try to get username/display info from the authentication session
                let username = 'Unknown';
                let accountLabel = 'Unknown';
                try {
                    const providerIds = authenticationService.getProviderIds();
                    for (const providerId of providerIds) {
                        const sessions = await authenticationService.getSessions(providerId);
                        const matchingSession = sessions.find(session => session.id === account.sessionId);
                        if (matchingSession) {
                            username = matchingSession.account.id;
                            accountLabel = matchingSession.account.label;
                            break;
                        }
                    }
                }
                catch (error) {
                    // Fallback to just session info
                }
                content += '### Default Account Summary\n\n';
                content += `**Account ID/Username**: ${username}\n\n`;
                content += `**Account Label**: ${accountLabel}\n\n`;
                content += '### Detailed Account Properties\n\n';
                content += '| Property | Value |\n';
                content += '|----------|-------|\n';
                // Iterate through all properties of the account object
                for (const [key, value] of Object.entries(account)) {
                    if (value !== undefined && value !== null) {
                        let displayValue;
                        // Mask sensitive information
                        if (sensitiveKeys.includes(key)) {
                            displayValue = '***';
                        }
                        else if (typeof value === 'object') {
                            displayValue = JSON.stringify(value);
                        }
                        else {
                            displayValue = String(value);
                        }
                        content += `| ${key} | ${displayValue} |\n`;
                    }
                }
                const policyData = defaultAccountService.policyData;
                content += `| policyData | ${policyData ? JSON.stringify(policyData) : 'No Policy Data'} |\n`;
                content += '\n';
            }
            else {
                content += '*No default account configured*\n\n';
            }
        }
        catch (error) {
            content += `*Error retrieving account information: ${error}*\n\n`;
        }
        content += '## Policy-Controlled Settings\n\n';
        const policyConfigurations = configurationRegistry.getPolicyConfigurations();
        const configurationProperties = configurationRegistry.getConfigurationProperties();
        const excludedProperties = configurationRegistry.getExcludedConfigurationProperties();
        if (policyConfigurations.size > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const appliedPolicy = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const notAppliedPolicy = [];
            for (const [policyName, settingKey] of policyConfigurations) {
                const property = configurationProperties[settingKey] ?? excludedProperties[settingKey];
                if (property) {
                    const inspectValue = configurationService.inspect(settingKey);
                    const settingInfo = {
                        name: policyName,
                        key: settingKey,
                        property,
                        inspection: inspectValue
                    };
                    if (inspectValue.policyValue !== undefined) {
                        appliedPolicy.push(settingInfo);
                    }
                    else {
                        notAppliedPolicy.push(settingInfo);
                    }
                }
            }
            // Try to detect where the policy came from
            const policySourceMemo = new Map();
            const getPolicySource = (policyName) => {
                if (policySourceMemo.has(policyName)) {
                    return policySourceMemo.get(policyName);
                }
                try {
                    const policyServiceConstructorName = policyService.constructor.name;
                    if (policyServiceConstructorName === 'MultiplexPolicyService') {
                        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
                        const multiplexService = policyService;
                        if (multiplexService.policyServices) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const componentServices = multiplexService.policyServices;
                            for (const service of componentServices) {
                                if (service.getPolicyValue && service.getPolicyValue(policyName) !== undefined) {
                                    policySourceMemo.set(policyName, service.constructor.name);
                                    return service.constructor.name;
                                }
                            }
                        }
                    }
                    return '';
                }
                catch {
                    return 'Unknown';
                }
            };
            content += '### Applied Policy\n\n';
            appliedPolicy.sort((a, b) => getPolicySource(a.name).localeCompare(getPolicySource(b.name)) || a.name.localeCompare(b.name));
            if (appliedPolicy.length > 0) {
                content += '| Setting Key | Policy Name | Policy Source | Default Value | Current Value | Policy Value |\n';
                content += '|-------------|-------------|---------------|---------------|---------------|-------------|\n';
                for (const setting of appliedPolicy) {
                    const defaultValue = JSON.stringify(setting.property.default);
                    const currentValue = JSON.stringify(setting.inspection.value);
                    const policyValue = JSON.stringify(setting.inspection.policyValue);
                    const policySource = getPolicySource(setting.name);
                    content += `| ${setting.key} | ${setting.name} | ${policySource} | \`${defaultValue}\` | \`${currentValue}\` | \`${policyValue}\` |\n`;
                }
                content += '\n';
            }
            else {
                content += '*No settings are currently controlled by policies*\n\n';
            }
            content += '###  Non-applied Policy\n\n';
            if (notAppliedPolicy.length > 0) {
                content += '| Setting Key | Policy Name  \n';
                content += '|-------------|-------------|\n';
                for (const setting of notAppliedPolicy) {
                    content += `| ${setting.key} | ${setting.name}|\n`;
                }
                content += '\n';
            }
            else {
                content += '*All policy-controllable settings are currently being enforced*\n\n';
            }
        }
        else {
            content += '*No policy-controlled settings found*\n\n';
        }
        // Authentication diagnostics
        content += '## Authentication Information\n\n';
        try {
            const providerIds = authenticationService.getProviderIds();
            if (providerIds.length > 0) {
                content += '### Authentication Providers\n\n';
                content += '| Provider ID | Sessions | Accounts |\n';
                content += '|-------------|----------|----------|\n';
                for (const providerId of providerIds) {
                    try {
                        const sessions = await authenticationService.getSessions(providerId);
                        const accounts = sessions.map(session => session.account);
                        const uniqueAccounts = Array.from(new Set(accounts.map(account => account.label)));
                        content += `| ${providerId} | ${sessions.length} | ${uniqueAccounts.join(', ') || 'None'} |\n`;
                    }
                    catch (error) {
                        content += `| ${providerId} | Error | ${error} |\n`;
                    }
                }
                content += '\n';
                // Detailed session information
                content += '### Detailed Session Information\n\n';
                for (const providerId of providerIds) {
                    try {
                        const sessions = await authenticationService.getSessions(providerId);
                        if (sessions.length > 0) {
                            content += `#### ${providerId}\n\n`;
                            content += '| Account | Scopes | Extensions with Access |\n';
                            content += '|---------|--------|------------------------|\n';
                            for (const session of sessions) {
                                const accountName = session.account.label;
                                const scopes = session.scopes.join(', ') || 'Default';
                                // Get extensions with access to this account
                                try {
                                    const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountName);
                                    const extensionNames = allowedExtensions
                                        .filter(ext => ext.allowed !== false)
                                        .map(ext => `${ext.name}${ext.trusted ? ' (trusted)' : ''}`)
                                        .join(', ') || 'None';
                                    content += `| ${accountName} | ${scopes} | ${extensionNames} |\n`;
                                }
                                catch (error) {
                                    content += `| ${accountName} | ${scopes} | Error: ${error} |\n`;
                                }
                            }
                            content += '\n';
                        }
                    }
                    catch (error) {
                        content += `#### ${providerId}\n*Error retrieving sessions: ${error}*\n\n`;
                    }
                }
            }
            else {
                content += '*No authentication providers found*\n\n';
            }
        }
        catch (error) {
            content += `*Error retrieving authentication information: ${error}*\n\n`;
        }
        await editorService.openEditor({
            resource: undefined,
            contents: content,
            languageId: 'markdown',
            options: { pinned: true, }
        });
    }
}
// --- Actions Registration
registerAction2(InspectContextKeysAction);
registerAction2(ToggleScreencastModeAction);
registerAction2(LogStorageAction);
registerAction2(LogWorkingCopiesAction);
registerAction2(RemoveLargeStorageEntriesAction);
registerAction2(PolicyDiagnosticsAction);
if (!product.commit) {
    registerAction2(StartTrackDisposables);
    registerAction2(SnapshotTrackedDisposables);
    registerAction2(StopTrackDisposables);
}
// --- Configuration
// Screen Cast Mode
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'screencastMode',
    order: 9,
    title: localize('screencastModeConfigurationTitle', "Screencast Mode"),
    type: 'object',
    properties: {
        'screencastMode.verticalOffset': {
            type: 'number',
            default: 20,
            minimum: 0,
            maximum: 90,
            description: localize('screencastMode.location.verticalPosition', "Controls the vertical offset of the screencast mode overlay from the bottom as a percentage of the workbench height.")
        },
        'screencastMode.fontSize': {
            type: 'number',
            default: 56,
            minimum: 20,
            maximum: 100,
            description: localize('screencastMode.fontSize', "Controls the font size (in pixels) of the screencast mode keyboard.")
        },
        'screencastMode.keyboardOptions': {
            type: 'object',
            description: localize('screencastMode.keyboardOptions.description', "Options for customizing the keyboard overlay in screencast mode."),
            properties: {
                'showKeys': {
                    type: 'boolean',
                    default: true,
                    description: localize('screencastMode.keyboardOptions.showKeys', "Show raw keys.")
                },
                'showKeybindings': {
                    type: 'boolean',
                    default: true,
                    description: localize('screencastMode.keyboardOptions.showKeybindings', "Show keyboard shortcuts.")
                },
                'showCommands': {
                    type: 'boolean',
                    default: true,
                    description: localize('screencastMode.keyboardOptions.showCommands', "Show command names.")
                },
                'showCommandGroups': {
                    type: 'boolean',
                    default: false,
                    description: localize('screencastMode.keyboardOptions.showCommandGroups', "Show command group names, when commands are also shown.")
                },
                'showSingleEditorCursorMoves': {
                    type: 'boolean',
                    default: true,
                    description: localize('screencastMode.keyboardOptions.showSingleEditorCursorMoves', "Show single editor cursor move commands.")
                }
            },
            default: {
                'showKeys': true,
                'showKeybindings': true,
                'showCommands': true,
                'showCommandGroups': false,
                'showSingleEditorCursorMoves': true
            },
            additionalProperties: false
        },
        'screencastMode.keyboardOverlayTimeout': {
            type: 'number',
            default: 800,
            minimum: 500,
            maximum: 5000,
            description: localize('screencastMode.keyboardOverlayTimeout', "Controls how long (in milliseconds) the keyboard overlay is shown in screencast mode.")
        },
        'screencastMode.mouseIndicatorColor': {
            type: 'string',
            format: 'color-hex',
            default: '#FF0000',
            description: localize('screencastMode.mouseIndicatorColor', "Controls the color in hex (#RGB, #RGBA, #RRGGBB or #RRGGBBAA) of the mouse indicator in screencast mode.")
        },
        'screencastMode.mouseIndicatorSize': {
            type: 'number',
            default: 20,
            minimum: 20,
            maximum: 100,
            description: localize('screencastMode.mouseIndicatorSize', "Controls the size (in pixels) of the mouse indicator in screencast mode.")
        },
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2ZWxvcGVyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvZGV2ZWxvcGVyQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLHFCQUFxQixDQUFDO0FBRTdCLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBZSxZQUFZLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqSyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNySSxPQUFPLEVBQUUsYUFBYSxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV0SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztB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