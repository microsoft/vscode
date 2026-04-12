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
import '../../../platform/hover/browser/hoverService.js';
import '../../../platform/undoRedo/common/undoRedoService.js';
import '../../browser/services/inlineCompletionsService.js';
import '../../common/services/languageFeatureDebounce.js';
import '../../common/services/languageFeaturesService.js';
import '../../common/services/semanticTokensStylingService.js';
import './standaloneCodeEditorService.js';
import './standaloneLayoutService.js';
import * as dom from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../base/browser/window.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../base/common/event.js';
import { KeyCodeChord, decodeKeybinding } from '../../../base/common/keybindings.js';
import { Disposable, DisposableStore, ImmortalReference, combinedDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { OS, isLinux, isMacintosh } from '../../../base/common/platform.js';
import { basename } from '../../../base/common/resources.js';
import Severity from '../../../base/common/severity.js';
import * as strings from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { AccessibilityService } from '../../../platform/accessibility/browser/accessibilityService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { MenuService } from '../../../platform/actions/common/menuService.js';
import { BrowserClipboardService } from '../../../platform/clipboard/browser/clipboardService.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { Configuration, ConfigurationChangeEvent, ConfigurationModel } from '../../../platform/configuration/common/configurationModels.js';
import { DefaultConfiguration } from '../../../platform/configuration/common/configurations.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { ContextMenuService } from '../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../platform/contextview/browser/contextViewService.js';
import { IDataChannelService, NullDataChannelService } from '../../../platform/dataChannel/common/dataChannel.js';
import { IDefaultAccountService } from '../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { AbstractKeybindingService } from '../../../platform/keybinding/common/abstractKeybindingService.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { KeybindingResolver } from '../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../platform/list/browser/listService.js';
import { ConsoleLogger, ILogService, ILoggerService, NullLoggerService } from '../../../platform/log/common/log.js';
import { LogService } from '../../../platform/log/common/logService.js';
import { IMarkerService } from '../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../platform/markers/common/markerService.js';
import { INotificationService, NoOpNotification, NotificationsFilter } from '../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IEditorProgressService, IProgressService } from '../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IStorageService, InMemoryStorageService } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IUserInteractionService } from '../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { IWebWorkerService } from '../../../platform/webWorker/browser/webWorkerService.js';
import { IWorkspaceContextService, STANDALONE_EDITOR_WORKSPACE_ID, WorkspaceFolder } from '../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../platform/workspace/common/workspaceTrust.js';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { OpenerService } from '../../browser/services/openerService.js';
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from '../../browser/services/renameSymbolTrackerService.js';
import { isDiffEditorConfigurationKey, isEditorConfigurationKey } from '../../common/config/editorConfigurationSchema.js';
import { EditOperation } from '../../common/core/editOperation.js';
import { Position as Pos } from '../../common/core/position.js';
import { Range } from '../../common/core/range.js';
import { getEditorFeatures } from '../../common/editorFeatures.js';
import { ILanguageService } from '../../common/languages/language.js';
import { LanguageService } from '../../common/services/languageService.js';
import { IMarkerDecorationsService } from '../../common/services/markerDecorations.js';
import { MarkerDecorationsService } from '../../common/services/markerDecorationsService.js';
import { IModelService } from '../../common/services/model.js';
import { ModelService } from '../../common/services/modelService.js';
import { ITextModelService } from '../../common/services/resolverService.js';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from '../../common/services/textResourceConfiguration.js';
import { ITreeSitterLibraryService } from '../../common/services/treeSitter/treeSitterLibraryService.js';
import { StandaloneServicesNLS } from '../../common/standaloneStrings.js';
import { IStandaloneThemeService } from '../common/standaloneTheme.js';
import { StandaloneQuickInputService } from './quickInput/standaloneQuickInputService.js';
import { StandaloneWebWorkerService } from './services/standaloneWebWorkerService.js';
import { StandaloneThemeService } from './standaloneThemeService.js';
import { StandaloneTreeSitterLibraryService } from './standaloneTreeSitterLibraryService.js';
class SimpleModel {
    constructor(model) {
        this.disposed = false;
        this.model = model;
        this._onWillDispose = new Emitter();
    }
    get onWillDispose() {
        return this._onWillDispose.event;
    }
    resolve() {
        return Promise.resolve();
    }
    get textEditorModel() {
        return this.model;
    }
    createSnapshot() {
        return this.model.createSnapshot();
    }
    isReadonly() {
        return false;
    }
    dispose() {
        this.disposed = true;
        this._onWillDispose.fire();
    }
    isDisposed() {
        return this.disposed;
    }
    isResolved() {
        return true;
    }
    getLanguageId() {
        return this.model.getLanguageId();
    }
}
let StandaloneTextModelService = class StandaloneTextModelService {
    constructor(modelService) {
        this.modelService = modelService;
    }
    createModelReference(resource) {
        const model = this.modelService.getModel(resource);
        if (!model) {
            return Promise.reject(new Error(`Model not found`));
        }
        return Promise.resolve(new ImmortalReference(new SimpleModel(model)));
    }
    registerTextModelContentProvider(scheme, provider) {
        return {
            dispose: function () { }
        };
    }
    canHandleResource(resource) {
        return false;
    }
};
StandaloneTextModelService = __decorate([
    __param(0, IModelService)
], StandaloneTextModelService);
class StandaloneEditorProgressService {
    static { this.NULL_PROGRESS_RUNNER = {
        done: () => { },
        total: () => { },
        worked: () => { }
    }; }
    show() {
        return StandaloneEditorProgressService.NULL_PROGRESS_RUNNER;
    }
    async showWhile(promise, delay) {
        await promise;
    }
}
class StandaloneProgressService {
    withProgress(_options, task, onDidCancel) {
        return task({
            report: () => { },
        });
    }
}
class StandaloneEnvironmentService {
    constructor() {
        this.stateResource = URI.from({ scheme: 'monaco', authority: 'stateResource' });
        this.userRoamingDataHome = URI.from({ scheme: 'monaco', authority: 'userRoamingDataHome' });
        this.keyboardLayoutResource = URI.from({ scheme: 'monaco', authority: 'keyboardLayoutResource' });
        this.argvResource = URI.from({ scheme: 'monaco', authority: 'argvResource' });
        this.untitledWorkspacesHome = URI.from({ scheme: 'monaco', authority: 'untitledWorkspacesHome' });
        this.workspaceStorageHome = URI.from({ scheme: 'monaco', authority: 'workspaceStorageHome' });
        this.localHistoryHome = URI.from({ scheme: 'monaco', authority: 'localHistoryHome' });
        this.cacheHome = URI.from({ scheme: 'monaco', authority: 'cacheHome' });
        this.userDataSyncHome = URI.from({ scheme: 'monaco', authority: 'userDataSyncHome' });
        this.sync = undefined;
        this.continueOn = undefined;
        this.editSessionId = undefined;
        this.debugExtensionHost = { port: null, break: false };
        this.isExtensionDevelopment = false;
        this.disableExtensions = false;
        this.disableExperiments = false;
        this.enableExtensions = undefined;
        this.extensionDevelopmentLocationURI = undefined;
        this.extensionDevelopmentKind = undefined;
        this.extensionTestsLocationURI = undefined;
        this.logsHome = URI.from({ scheme: 'monaco', authority: 'logsHome' });
        this.logLevel = undefined;
        this.extensionLogLevel = undefined;
        this.verbose = false;
        this.isBuilt = false;
        this.disableTelemetry = false;
        this.serviceMachineIdResource = URI.from({ scheme: 'monaco', authority: 'serviceMachineIdResource' });
        this.policyFile = undefined;
    }
}
class StandaloneDialogService {
    constructor() {
        this.onWillShowDialog = Event.None;
        this.onDidShowDialog = Event.None;
    }
    async confirm(confirmation) {
        const confirmed = this.doConfirm(confirmation.message, confirmation.detail);
        return {
            confirmed,
            checkboxChecked: false // unsupported
        };
    }
    doConfirm(message, detail) {
        let messageText = message;
        if (detail) {
            messageText = messageText + '\n\n' + detail;
        }
        return mainWindow.confirm(messageText);
    }
    async prompt(prompt) {
        let result = undefined;
        const confirmed = this.doConfirm(prompt.message, prompt.detail);
        if (confirmed) {
            const promptButtons = [...(prompt.buttons ?? [])];
            if (prompt.cancelButton && typeof prompt.cancelButton !== 'string' && typeof prompt.cancelButton !== 'boolean') {
                promptButtons.push(prompt.cancelButton);
            }
            result = await promptButtons[0]?.run({ checkboxChecked: false });
        }
        return { result };
    }
    async info(message, detail) {
        await this.prompt({ type: Severity.Info, message, detail });
    }
    async warn(message, detail) {
        await this.prompt({ type: Severity.Warning, message, detail });
    }
    async error(message, detail) {
        await this.prompt({ type: Severity.Error, message, detail });
    }
    input() {
        return Promise.resolve({ confirmed: false }); // unsupported
    }
    about() {
        return Promise.resolve(undefined);
    }
}
export class StandaloneNotificationService {
    constructor() {
        this.onDidChangeFilter = Event.None;
    }
    static { this.NO_OP = new NoOpNotification(); }
    info(message) {
        return this.notify({ severity: Severity.Info, message });
    }
    warn(message) {
        return this.notify({ severity: Severity.Warning, message });
    }
    error(error) {
        return this.notify({ severity: Severity.Error, message: error });
    }
    notify(notification) {
        switch (notification.severity) {
            case Severity.Error:
                console.error(notification.message);
                break;
            case Severity.Warning:
                console.warn(notification.message);
                break;
            default:
                console.log(notification.message);
                break;
        }
        return StandaloneNotificationService.NO_OP;
    }
    prompt(severity, message, choices, options) {
        return StandaloneNotificationService.NO_OP;
    }
    status(message, options) {
        return { close: () => { } };
    }
    setFilter(filter) { }
    getFilter(source) {
        return NotificationsFilter.OFF;
    }
    getFilters() {
        return [];
    }
    removeFilter(sourceId) { }
}
let StandaloneCommandService = class StandaloneCommandService {
    constructor(instantiationService) {
        this._onWillExecuteCommand = new Emitter();
        this._onDidExecuteCommand = new Emitter();
        this.onWillExecuteCommand = this._onWillExecuteCommand.event;
        this.onDidExecuteCommand = this._onDidExecuteCommand.event;
        this._instantiationService = instantiationService;
    }
    executeCommand(id, ...args) {
        const command = CommandsRegistry.getCommand(id);
        if (!command) {
            return Promise.reject(new Error(`command '${id}' not found`));
        }
        try {
            this._onWillExecuteCommand.fire({ commandId: id, args });
            const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]);
            this._onDidExecuteCommand.fire({ commandId: id, args });
            return Promise.resolve(result);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
};
StandaloneCommandService = __decorate([
    __param(0, IInstantiationService)
], StandaloneCommandService);
export { StandaloneCommandService };
let StandaloneKeybindingService = class StandaloneKeybindingService extends AbstractKeybindingService {
    constructor(contextKeyService, commandService, telemetryService, notificationService, logService, codeEditorService) {
        super(contextKeyService, commandService, telemetryService, notificationService, logService);
        this._cachedResolver = null;
        this._dynamicKeybindings = [];
        this._domNodeListeners = [];
        const addContainer = (domNode) => {
            const disposables = new DisposableStore();
            // for standard keybindings
            disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e) => {
                const keyEvent = new StandardKeyboardEvent(e);
                const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
                if (shouldPreventDefault) {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                }
            }));
            // for single modifier chord keybindings (e.g. shift shift)
            disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_UP, (e) => {
                const keyEvent = new StandardKeyboardEvent(e);
                const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
                if (shouldPreventDefault) {
                    keyEvent.preventDefault();
                }
            }));
            this._domNodeListeners.push(new DomNodeListeners(domNode, disposables));
        };
        const removeContainer = (domNode) => {
            for (let i = 0; i < this._domNodeListeners.length; i++) {
                const domNodeListeners = this._domNodeListeners[i];
                if (domNodeListeners.domNode === domNode) {
                    this._domNodeListeners.splice(i, 1);
                    domNodeListeners.dispose();
                }
            }
        };
        const addCodeEditor = (codeEditor) => {
            if (codeEditor.getOption(70 /* EditorOption.inDiffEditor */)) {
                return;
            }
            addContainer(codeEditor.getContainerDomNode());
        };
        const removeCodeEditor = (codeEditor) => {
            if (codeEditor.getOption(70 /* EditorOption.inDiffEditor */)) {
                return;
            }
            removeContainer(codeEditor.getContainerDomNode());
        };
        this._register(codeEditorService.onCodeEditorAdd(addCodeEditor));
        this._register(codeEditorService.onCodeEditorRemove(removeCodeEditor));
        codeEditorService.listCodeEditors().forEach(addCodeEditor);
        const addDiffEditor = (diffEditor) => {
            addContainer(diffEditor.getContainerDomNode());
        };
        const removeDiffEditor = (diffEditor) => {
            removeContainer(diffEditor.getContainerDomNode());
        };
        this._register(codeEditorService.onDiffEditorAdd(addDiffEditor));
        this._register(codeEditorService.onDiffEditorRemove(removeDiffEditor));
        codeEditorService.listDiffEditors().forEach(addDiffEditor);
    }
    addDynamicKeybinding(command, keybinding, handler, when) {
        return combinedDisposable(CommandsRegistry.registerCommand(command, handler), this.addDynamicKeybindings([{
                keybinding,
                command,
                when
            }]));
    }
    addDynamicKeybindings(rules) {
        const entries = rules.map((rule) => {
            const keybinding = decodeKeybinding(rule.keybinding, OS);
            return {
                keybinding,
                command: rule.command ?? null,
                commandArgs: rule.commandArgs,
                when: rule.when,
                weight1: 1000,
                weight2: 0,
                extensionId: null,
                isBuiltinExtension: false
            };
        });
        this._dynamicKeybindings = this._dynamicKeybindings.concat(entries);
        this.updateResolver();
        return toDisposable(() => {
            // Search the first entry and remove them all since they will be contiguous
            for (let i = 0; i < this._dynamicKeybindings.length; i++) {
                if (this._dynamicKeybindings[i] === entries[0]) {
                    this._dynamicKeybindings.splice(i, entries.length);
                    this.updateResolver();
                    return;
                }
            }
        });
    }
    updateResolver() {
        this._cachedResolver = null;
        this._onDidUpdateKeybindings.fire();
    }
    _getResolver() {
        if (!this._cachedResolver) {
            const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
            const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
            this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
        }
        return this._cachedResolver;
    }
    _documentHasFocus() {
        return mainWindow.document.hasFocus();
    }
    _toNormalizedKeybindingItems(items, isDefault) {
        const result = [];
        let resultLen = 0;
        for (const item of items) {
            const when = item.when || undefined;
            const keybinding = item.keybinding;
            if (!keybinding) {
                // This might be a removal keybinding item in user settings => accept it
                result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, null, false);
            }
            else {
                const resolvedKeybindings = USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
                for (const resolvedKeybinding of resolvedKeybindings) {
                    result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
                }
            }
        }
        return result;
    }
    resolveKeybinding(keybinding) {
        return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
    }
    resolveKeyboardEvent(keyboardEvent) {
        const chord = new KeyCodeChord(keyboardEvent.ctrlKey, keyboardEvent.shiftKey, keyboardEvent.altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
        return new USLayoutResolvedKeybinding([chord], OS);
    }
    resolveUserBinding(userBinding) {
        return [];
    }
    _dumpDebugInfo() {
        return '';
    }
    _dumpDebugInfoJSON() {
        return '';
    }
    registerSchemaContribution(contribution) {
        return Disposable.None;
    }
    /**
     * not yet supported
     */
    enableKeybindingHoldMode(commandId) {
        return undefined;
    }
};
StandaloneKeybindingService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ICommandService),
    __param(2, ITelemetryService),
    __param(3, INotificationService),
    __param(4, ILogService),
    __param(5, ICodeEditorService)
], StandaloneKeybindingService);
export { StandaloneKeybindingService };
class DomNodeListeners extends Disposable {
    constructor(domNode, disposables) {
        super();
        this.domNode = domNode;
        this._register(disposables);
    }
}
function isConfigurationOverrides(thing) {
    return !!thing
        && typeof thing === 'object'
        && (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
        && (!thing.resource || thing.resource instanceof URI);
}
let StandaloneConfigurationService = class StandaloneConfigurationService {
    constructor(logService) {
        this.logService = logService;
        this._onDidChangeConfiguration = new Emitter();
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        const defaultConfiguration = new DefaultConfiguration(logService);
        this._configuration = new Configuration(defaultConfiguration.reload(), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), logService);
        defaultConfiguration.dispose();
    }
    getValue(arg1, arg2) {
        const section = typeof arg1 === 'string' ? arg1 : undefined;
        const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
        return this._configuration.getValue(section, overrides, undefined);
    }
    updateValues(values) {
        const previous = { data: this._configuration.toData() };
        const changedKeys = [];
        for (const entry of values) {
            const [key, value] = entry;
            if (this.getValue(key) === value) {
                continue;
            }
            this._configuration.updateValue(key, value);
            changedKeys.push(key);
        }
        if (changedKeys.length > 0) {
            const configurationChangeEvent = new ConfigurationChangeEvent({ keys: changedKeys, overrides: [] }, previous, this._configuration, undefined, this.logService);
            configurationChangeEvent.source = 8 /* ConfigurationTarget.MEMORY */;
            this._onDidChangeConfiguration.fire(configurationChangeEvent);
        }
        return Promise.resolve();
    }
    updateValue(key, value, arg3, arg4) {
        return this.updateValues([[key, value]]);
    }
    inspect(key, options = {}) {
        return this._configuration.inspect(key, options, undefined);
    }
    keys() {
        return this._configuration.keys(undefined);
    }
    reloadConfiguration() {
        return Promise.resolve(undefined);
    }
    getConfigurationData() {
        const emptyModel = {
            contents: {},
            keys: [],
            overrides: []
        };
        return {
            defaults: emptyModel,
            policy: emptyModel,
            application: emptyModel,
            userLocal: emptyModel,
            userRemote: emptyModel,
            workspace: emptyModel,
            folders: []
        };
    }
};
StandaloneConfigurationService = __decorate([
    __param(0, ILogService)
], StandaloneConfigurationService);
export { StandaloneConfigurationService };
let StandaloneResourceConfigurationService = class StandaloneResourceConfigurationService extends Disposable {
    constructor(configurationService, modelService, languageService) {
        super();
        this.configurationService = configurationService;
        this.modelService = modelService;
        this.languageService = languageService;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._register(this.configurationService.onDidChangeConfiguration((e) => {
            this._onDidChangeConfiguration.fire({ affectedKeys: e.affectedKeys, affectsConfiguration: (resource, configuration) => e.affectsConfiguration(configuration) });
        }));
    }
    getValue(resource, arg2, arg3) {
        const position = Pos.isIPosition(arg2) ? arg2 : null;
        const section = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
        const language = resource ? this.getLanguage(resource, position) : undefined;
        if (typeof section === 'undefined') {
            return this.configurationService.getValue({
                resource,
                overrideIdentifier: language
            });
        }
        return this.configurationService.getValue(section, {
            resource,
            overrideIdentifier: language
        });
    }
    inspect(resource, position, section) {
        const language = resource ? this.getLanguage(resource, position) : undefined;
        return this.configurationService.inspect(section, { resource, overrideIdentifier: language });
    }
    getLanguage(resource, position) {
        const model = this.modelService.getModel(resource);
        if (model) {
            return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
        }
        return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
    }
    updateValue(resource, key, value, configurationTarget) {
        return this.configurationService.updateValue(key, value, { resource }, configurationTarget);
    }
};
StandaloneResourceConfigurationService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IModelService),
    __param(2, ILanguageService)
], StandaloneResourceConfigurationService);
let StandaloneResourcePropertiesService = class StandaloneResourcePropertiesService {
    constructor(configurationService) {
        this.configurationService = configurationService;
    }
    getEOL(resource, language) {
        const eol = this.configurationService.getValue('files.eol', { overrideIdentifier: language, resource });
        if (eol && typeof eol === 'string' && eol !== 'auto') {
            return eol;
        }
        return (isLinux || isMacintosh) ? '\n' : '\r\n';
    }
};
StandaloneResourcePropertiesService = __decorate([
    __param(0, IConfigurationService)
], StandaloneResourcePropertiesService);
class StandaloneTelemetryService {
    constructor() {
        this.telemetryLevel = 0 /* TelemetryLevel.NONE */;
        this.sessionId = 'someValue.sessionId';
        this.machineId = 'someValue.machineId';
        this.sqmId = 'someValue.sqmId';
        this.devDeviceId = 'someValue.devDeviceId';
        this.firstSessionDate = 'someValue.firstSessionDate';
        this.sendErrorTelemetry = false;
    }
    setEnabled() { }
    setExperimentProperty() { }
    setCommonProperty() { }
    publicLog() { }
    publicLog2() { }
    publicLogError() { }
    publicLogError2() { }
}
class StandaloneWorkspaceContextService {
    static { this.SCHEME = 'inmemory'; }
    constructor() {
        this._onDidChangeWorkspaceName = new Emitter();
        this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
        this._onWillChangeWorkspaceFolders = new Emitter();
        this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
        this._onDidChangeWorkspaceFolders = new Emitter();
        this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
        this._onDidChangeWorkbenchState = new Emitter();
        this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
        const resource = URI.from({ scheme: StandaloneWorkspaceContextService.SCHEME, authority: 'model', path: '/' });
        this.workspace = { id: STANDALONE_EDITOR_WORKSPACE_ID, folders: [new WorkspaceFolder({ uri: resource, name: '', index: 0 })] };
    }
    getCompleteWorkspace() {
        return Promise.resolve(this.getWorkspace());
    }
    getWorkspace() {
        return this.workspace;
    }
    getWorkbenchState() {
        if (this.workspace) {
            if (this.workspace.configuration) {
                return 3 /* WorkbenchState.WORKSPACE */;
            }
            return 2 /* WorkbenchState.FOLDER */;
        }
        return 1 /* WorkbenchState.EMPTY */;
    }
    hasWorkspaceData() {
        return this.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    }
    getWorkspaceFolder(resource) {
        return resource && resource.scheme === StandaloneWorkspaceContextService.SCHEME ? this.workspace.folders[0] : null;
    }
    isInsideWorkspace(resource) {
        return resource && resource.scheme === StandaloneWorkspaceContextService.SCHEME;
    }
    isCurrentWorkspace(workspaceIdOrFolder) {
        return true;
    }
}
export function updateConfigurationService(configurationService, source, isDiffEditor) {
    if (!source) {
        return;
    }
    if (!(configurationService instanceof StandaloneConfigurationService)) {
        return;
    }
    const toUpdate = [];
    Object.keys(source).forEach((key) => {
        if (isEditorConfigurationKey(key)) {
            toUpdate.push([`editor.${key}`, source[key]]);
        }
        if (isDiffEditor && isDiffEditorConfigurationKey(key)) {
            toUpdate.push([`diffEditor.${key}`, source[key]]);
        }
    });
    if (toUpdate.length > 0) {
        configurationService.updateValues(toUpdate);
    }
}
let StandaloneBulkEditService = class StandaloneBulkEditService {
    constructor(_modelService) {
        this._modelService = _modelService;
        //
    }
    hasPreviewHandler() {
        return false;
    }
    setPreviewHandler() {
        return Disposable.None;
    }
    async apply(editsIn, _options) {
        const edits = Array.isArray(editsIn) ? editsIn : ResourceEdit.convert(editsIn);
        const textEdits = new Map();
        for (const edit of edits) {
            if (!(edit instanceof ResourceTextEdit)) {
                throw new Error('bad edit - only text edits are supported');
            }
            const model = this._modelService.getModel(edit.resource);
            if (!model) {
                throw new Error('bad edit - model not found');
            }
            if (typeof edit.versionId === 'number' && model.getVersionId() !== edit.versionId) {
                throw new Error('bad state - model changed in the meantime');
            }
            let array = textEdits.get(model);
            if (!array) {
                array = [];
                textEdits.set(model, array);
            }
            array.push(EditOperation.replaceMove(Range.lift(edit.textEdit.range), edit.textEdit.text));
        }
        let totalEdits = 0;
        let totalFiles = 0;
        for (const [model, edits] of textEdits) {
            model.pushStackElement();
            model.pushEditOperations([], edits, () => []);
            model.pushStackElement();
            totalFiles += 1;
            totalEdits += edits.length;
        }
        return {
            ariaSummary: strings.format(StandaloneServicesNLS.bulkEditServiceSummary, totalEdits, totalFiles),
            isApplied: totalEdits > 0
        };
    }
};
StandaloneBulkEditService = __decorate([
    __param(0, IModelService)
], StandaloneBulkEditService);
class StandaloneUriLabelService {
    constructor() {
        this.onDidChangeFormatters = Event.None;
    }
    getUriLabel(resource, options) {
        if (resource.scheme === 'file') {
            return resource.fsPath;
        }
        return resource.path;
    }
    getUriBasenameLabel(resource) {
        return basename(resource);
    }
    getWorkspaceLabel(workspace, options) {
        return '';
    }
    getSeparator(scheme, authority) {
        return '/';
    }
    registerFormatter(formatter) {
        throw new Error('Not implemented');
    }
    registerCachedFormatter(formatter) {
        return this.registerFormatter(formatter);
    }
    getHostLabel() {
        return '';
    }
    getHostTooltip() {
        return undefined;
    }
}
let StandaloneContextViewService = class StandaloneContextViewService extends ContextViewService {
    constructor(layoutService, _codeEditorService) {
        super(layoutService);
        this._codeEditorService = _codeEditorService;
    }
    showContextView(delegate, container, shadowRoot) {
        if (!container) {
            const codeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
            if (codeEditor) {
                container = codeEditor.getContainerDomNode();
            }
        }
        return super.showContextView(delegate, container, shadowRoot);
    }
};
StandaloneContextViewService = __decorate([
    __param(0, ILayoutService),
    __param(1, ICodeEditorService)
], StandaloneContextViewService);
class StandaloneWorkspaceTrustManagementService {
    constructor() {
        this._neverEmitter = new Emitter();
        this.onDidChangeTrust = this._neverEmitter.event;
        this.onDidChangeTrustedFolders = this._neverEmitter.event;
        this.workspaceResolved = Promise.resolve();
        this.workspaceTrustInitialized = Promise.resolve();
        this.acceptsOutOfWorkspaceFiles = true;
    }
    isWorkspaceTrusted() {
        return true;
    }
    isWorkspaceTrustForced() {
        return false;
    }
    canSetParentFolderTrust() {
        return false;
    }
    async setParentFolderTrust(trusted) {
        // noop
    }
    canSetWorkspaceTrust() {
        return false;
    }
    async setWorkspaceTrust(trusted) {
        // noop
    }
    getUriTrustInfo(uri) {
        throw new Error('Method not supported.');
    }
    async setUrisTrust(uri, trusted) {
        // noop
    }
    getTrustedUris() {
        return [];
    }
    async setTrustedUris(uris) {
        // noop
    }
    addWorkspaceTrustTransitionParticipant(participant) {
        throw new Error('Method not supported.');
    }
}
class StandaloneLanguageService extends LanguageService {
    constructor() {
        super();
    }
}
class StandaloneLogService extends LogService {
    constructor() {
        super(new ConsoleLogger());
    }
}
let StandaloneContextMenuService = class StandaloneContextMenuService extends ContextMenuService {
    constructor(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService) {
        super(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
        this.configure({ blockMouse: false }); // we do not want that in the standalone editor
    }
};
StandaloneContextMenuService = __decorate([
    __param(0, ITelemetryService),
    __param(1, INotificationService),
    __param(2, IContextViewService),
    __param(3, IKeybindingService),
    __param(4, IMenuService),
    __param(5, IContextKeyService)
], StandaloneContextMenuService);
class StandaloneAccessbilitySignalService {
    async playSignal(cue, options) {
    }
    async playSignals(cues) {
    }
    getEnabledState(signal, userGesture, modality) {
        return ValueWithChangeEvent.const(false);
    }
    getDelayMs(signal, modality) {
        return 0;
    }
    isSoundEnabled(cue) {
        return false;
    }
    isAnnouncementEnabled(cue) {
        return false;
    }
    onSoundEnabledChanged(cue) {
        return Event.None;
    }
    async playSound(cue, allowManyInParallel) {
    }
    playSignalLoop(cue) {
        return toDisposable(() => { });
    }
}
class StandaloneDefaultAccountService {
    constructor() {
        this.onDidChangeDefaultAccount = Event.None;
        this.onDidChangePolicyData = Event.None;
        this.policyData = null;
        this.copilotTokenInfo = null;
        this.onDidChangeCopilotTokenInfo = Event.None;
    }
    async getDefaultAccount() {
        return null;
    }
    setDefaultAccountProvider() {
        // no-op
    }
    async refresh() {
        return null;
    }
    getDefaultAccountAuthenticationProvider() {
        return { id: 'default', name: 'Default', enterprise: false };
    }
    async signIn() {
        return null;
    }
    async signOut() {
        // no-op
    }
}
registerSingleton(IWebWorkerService, StandaloneWebWorkerService, 0 /* InstantiationType.Eager */);
registerSingleton(ILogService, StandaloneLogService, 0 /* InstantiationType.Eager */);
registerSingleton(IConfigurationService, StandaloneConfigurationService, 0 /* InstantiationType.Eager */);
registerSingleton(ITextResourceConfigurationService, StandaloneResourceConfigurationService, 0 /* InstantiationType.Eager */);
registerSingleton(ITextResourcePropertiesService, StandaloneResourcePropertiesService, 0 /* InstantiationType.Eager */);
registerSingleton(IWorkspaceContextService, StandaloneWorkspaceContextService, 0 /* InstantiationType.Eager */);
registerSingleton(ILabelService, StandaloneUriLabelService, 0 /* InstantiationType.Eager */);
registerSingleton(ITelemetryService, StandaloneTelemetryService, 0 /* InstantiationType.Eager */);
registerSingleton(IDialogService, StandaloneDialogService, 0 /* InstantiationType.Eager */);
registerSingleton(IEnvironmentService, StandaloneEnvironmentService, 0 /* InstantiationType.Eager */);
registerSingleton(INotificationService, StandaloneNotificationService, 0 /* InstantiationType.Eager */);
registerSingleton(IMarkerService, MarkerService, 0 /* InstantiationType.Eager */);
registerSingleton(ILanguageService, StandaloneLanguageService, 0 /* InstantiationType.Eager */);
registerSingleton(IStandaloneThemeService, StandaloneThemeService, 0 /* InstantiationType.Eager */);
registerSingleton(IModelService, ModelService, 0 /* InstantiationType.Eager */);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, 0 /* InstantiationType.Eager */);
registerSingleton(IContextKeyService, ContextKeyService, 0 /* InstantiationType.Eager */);
registerSingleton(IProgressService, StandaloneProgressService, 0 /* InstantiationType.Eager */);
registerSingleton(IEditorProgressService, StandaloneEditorProgressService, 0 /* InstantiationType.Eager */);
registerSingleton(IStorageService, InMemoryStorageService, 0 /* InstantiationType.Eager */);
registerSingleton(IBulkEditService, StandaloneBulkEditService, 0 /* InstantiationType.Eager */);
registerSingleton(IWorkspaceTrustManagementService, StandaloneWorkspaceTrustManagementService, 0 /* InstantiationType.Eager */);
registerSingleton(ITextModelService, StandaloneTextModelService, 0 /* InstantiationType.Eager */);
registerSingleton(IAccessibilityService, AccessibilityService, 0 /* InstantiationType.Eager */);
registerSingleton(IListService, ListService, 0 /* InstantiationType.Eager */);
registerSingleton(ICommandService, StandaloneCommandService, 0 /* InstantiationType.Eager */);
registerSingleton(IKeybindingService, StandaloneKeybindingService, 0 /* InstantiationType.Eager */);
registerSingleton(IQuickInputService, StandaloneQuickInputService, 0 /* InstantiationType.Eager */);
registerSingleton(IContextViewService, StandaloneContextViewService, 0 /* InstantiationType.Eager */);
registerSingleton(IOpenerService, OpenerService, 0 /* InstantiationType.Eager */);
registerSingleton(IClipboardService, BrowserClipboardService, 0 /* InstantiationType.Eager */);
registerSingleton(IContextMenuService, StandaloneContextMenuService, 0 /* InstantiationType.Eager */);
registerSingleton(IMenuService, MenuService, 0 /* InstantiationType.Eager */);
registerSingleton(IAccessibilitySignalService, StandaloneAccessbilitySignalService, 0 /* InstantiationType.Eager */);
registerSingleton(ITreeSitterLibraryService, StandaloneTreeSitterLibraryService, 0 /* InstantiationType.Eager */);
registerSingleton(ILoggerService, NullLoggerService, 0 /* InstantiationType.Eager */);
registerSingleton(IDataChannelService, NullDataChannelService, 0 /* InstantiationType.Eager */);
registerSingleton(IDefaultAccountService, StandaloneDefaultAccountService, 0 /* InstantiationType.Eager */);
registerSingleton(IRenameSymbolTrackerService, NullRenameSymbolTrackerService, 0 /* InstantiationType.Eager */);
registerSingleton(IUserInteractionService, UserInteractionService, 0 /* InstantiationType.Eager */);
/**
 * We don't want to eagerly instantiate services because embedders get a one time chance
 * to override services when they create the first editor.
 */
export var StandaloneServices;
(function (StandaloneServices) {
    const serviceCollection = new ServiceCollection();
    for (const [id, descriptor] of getSingletonServiceDescriptors()) {
        serviceCollection.set(id, descriptor);
    }
    const instantiationService = new InstantiationService(serviceCollection, true);
    serviceCollection.set(IInstantiationService, instantiationService);
    function get(serviceId) {
        if (!initialized) {
            initialize({});
        }
        const r = serviceCollection.get(serviceId);
        if (!r) {
            throw new Error('Missing service ' + serviceId);
        }
        if (r instanceof SyncDescriptor) {
            return instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
        }
        else {
            return r;
        }
    }
    StandaloneServices.get = get;
    let initialized = false;
    const onDidInitialize = new Emitter();
    function initialize(overrides) {
        if (initialized) {
            return instantiationService;
        }
        initialized = true;
        // Add singletons that were registered after this module loaded
        for (const [id, descriptor] of getSingletonServiceDescriptors()) {
            if (!serviceCollection.get(id)) {
                serviceCollection.set(id, descriptor);
            }
        }
        // Initialize the service collection with the overrides, but only if the
        // service was not instantiated in the meantime.
        for (const serviceId in overrides) {
            if (overrides.hasOwnProperty(serviceId)) {
                const serviceIdentifier = createDecorator(serviceId);
                const r = serviceCollection.get(serviceIdentifier);
                if (r instanceof SyncDescriptor) {
                    serviceCollection.set(serviceIdentifier, overrides[serviceId]);
                }
            }
        }
        // Instantiate all editor features
        const editorFeatures = getEditorFeatures();
        for (const feature of editorFeatures) {
            try {
                instantiationService.createInstance(feature);
            }
            catch (err) {
                onUnexpectedError(err);
            }
        }
        onDidInitialize.fire();
        return instantiationService;
    }
    StandaloneServices.initialize = initialize;
    /**
     * Executes callback once services are initialized.
     */
    function withServices(callback) {
        if (initialized) {
            return callback();
        }
        const disposable = new DisposableStore();
        const listener = disposable.add(onDidInitialize.event(() => {
            listener.dispose();
            disposable.add(callback());
        }));
        return disposable;
    }
    StandaloneServices.withServices = withServices;
})(StandaloneServices || (StandaloneServices = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvYnJvd3Nlci9zdGFuZGFsb25lU2VydmljZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpREFBaUQsQ0FBQztBQUN6RCxPQUFPLHNEQUFzRCxDQUFDO0FBQzlELE9BQU8sb0RBQW9ELENBQUM7QUFDNUQsT0FBTyxrREFBa0QsQ0FBQztBQUMxRCxPQUFPLGtEQUFrRCxDQUFDO0FBQzFELE9BQU8sdURBQXVELENBQUM7QUFDL0QsT0FBTyxrQ0FBa0MsQ0FBQztBQUMxQyxPQUFPLDhCQUE4QixDQUFDO0FBRXRDLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUF5QixvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVHLE9BQU8sRUFBRSxZQUFZLEVBQWtDLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckgsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQTJCLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlKLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFB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