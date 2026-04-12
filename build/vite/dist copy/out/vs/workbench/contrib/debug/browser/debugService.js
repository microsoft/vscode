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
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { toAction } from '../../../../base/common/actions.js';
import { distinct } from '../../../../base/common/arrays.js';
import { RunOnceScheduler, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isErrorWithActions } from '../../../../base/common/errorMessage.js';
import * as errors from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { deepClone, equals } from '../../../../base/common/objects.js';
import severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from '../../files/common/files.js';
import { ITestService } from '../../testing/common/testService.js';
import { CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_UX, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_HAS_DEBUGGED, CONTEXT_IN_DEBUG_MODE, DEBUG_MEMORY_SCHEME, DEBUG_SCHEME, REPL_VIEW_ID, VIEWLET_ID, debuggerDisabledMessage, getStateLabel } from '../common/debug.js';
import { DebugCompoundRoot } from '../common/debugCompoundRoot.js';
import { Breakpoint, DataBreakpoint, DebugModel, FunctionBreakpoint, InstructionBreakpoint } from '../common/debugModel.js';
import { Source } from '../common/debugSource.js';
import { DebugStorage } from '../common/debugStorage.js';
import { DebugTelemetry } from '../common/debugTelemetry.js';
import { getExtensionHostDebugSession, saveAllBeforeDebugStart } from '../common/debugUtils.js';
import { ViewModel } from '../common/debugViewModel.js';
import { DisassemblyViewInput } from '../common/disassemblyViewInput.js';
import { AdapterManager } from './debugAdapterManager.js';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from './debugCommands.js';
import { ConfigurationManager } from './debugConfigurationManager.js';
import { DebugMemoryFileSystemProvider } from './debugMemory.js';
import { DebugSession } from './debugSession.js';
import { DebugTaskRunner } from './debugTaskRunner.js';
let DebugService = class DebugService {
    constructor(editorService, paneCompositeService, viewsService, viewDescriptorService, notificationService, dialogService, layoutService, contextService, contextKeyService, lifecycleService, instantiationService, extensionService, fileService, configurationService, extensionHostDebugService, activityService, commandService, quickInputService, workspaceTrustRequestService, uriIdentityService, testService) {
        this.editorService = editorService;
        this.paneCompositeService = paneCompositeService;
        this.viewsService = viewsService;
        this.viewDescriptorService = viewDescriptorService;
        this.notificationService = notificationService;
        this.dialogService = dialogService;
        this.layoutService = layoutService;
        this.contextService = contextService;
        this.contextKeyService = contextKeyService;
        this.lifecycleService = lifecycleService;
        this.instantiationService = instantiationService;
        this.extensionService = extensionService;
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.extensionHostDebugService = extensionHostDebugService;
        this.activityService = activityService;
        this.commandService = commandService;
        this.quickInputService = quickInputService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.uriIdentityService = uriIdentityService;
        this.testService = testService;
        this.restartingSessions = new Set();
        this.disposables = new DisposableStore();
        this.initializing = false;
        this.sessionCancellationTokens = new Map();
        this.haveDoneLazySetup = false;
        this.breakpointsToSendOnResourceSaved = new Set();
        this._onDidChangeState = this.disposables.add(new Emitter());
        this._onDidNewSession = this.disposables.add(new Emitter());
        this._onWillNewSession = this.disposables.add(new Emitter());
        this._onDidEndSession = this.disposables.add(new Emitter());
        this.adapterManager = this.instantiationService.createInstance(AdapterManager, {
            onDidNewSession: this.onDidNewSession,
            configurationManager: () => this.configurationManager,
        });
        this.disposables.add(this.adapterManager);
        this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.adapterManager);
        this.disposables.add(this.configurationManager);
        this.debugStorage = this.disposables.add(this.instantiationService.createInstance(DebugStorage));
        this.chosenEnvironments = this.debugStorage.loadChosenEnvironments();
        this.model = this.instantiationService.createInstance(DebugModel, this.debugStorage);
        this.telemetry = this.instantiationService.createInstance(DebugTelemetry, this.model);
        this.viewModel = this.disposables.add(new ViewModel(contextKeyService));
        this.taskRunner = this.instantiationService.createInstance(DebugTaskRunner);
        this.disposables.add(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
        this.disposables.add(this.lifecycleService.onWillShutdown(this.dispose, this));
        this.disposables.add(this.extensionHostDebugService.onAttachSession(event => {
            const session = this.model.getSession(event.sessionId, true);
            if (session) {
                // EH was started in debug mode -> attach to it
                session.configuration.request = 'attach';
                session.configuration.port = event.port;
                session.setSubId(event.subId);
                this.launchOrAttachToSession(session);
            }
        }));
        this.disposables.add(this.extensionHostDebugService.onTerminateSession(event => {
            const session = this.model.getSession(event.sessionId);
            if (session && session.subId === event.subId) {
                session.disconnect();
            }
        }));
        this.disposables.add(this.viewModel.onDidFocusStackFrame(() => {
            this.onStateChange();
        }));
        this.disposables.add(this.viewModel.onDidFocusSession((session) => {
            this.onStateChange();
            if (session) {
                this.setExceptionBreakpointFallbackSession(session.getId());
            }
        }));
        this.disposables.add(Event.any(this.adapterManager.onDidRegisterDebugger, this.configurationManager.onDidSelectConfiguration)(() => {
            const debugUxValue = (this.state !== 0 /* State.Inactive */ || (this.configurationManager.getAllConfigurations().length > 0 && this.adapterManager.hasEnabledDebuggers())) ? 'default' : 'simple';
            this.debugUx.set(debugUxValue);
            this.debugStorage.storeDebugUxState(debugUxValue);
        }));
        this.disposables.add(this.model.onDidChangeCallStack(() => {
            const numberOfSessions = this.model.getSessions().filter(s => !s.parentSession).length;
            this.activity?.dispose();
            if (numberOfSessions > 0) {
                const viewContainer = this.viewDescriptorService.getViewContainerByViewId(CALLSTACK_VIEW_ID);
                if (viewContainer) {
                    this.activity = this.activityService.showViewContainerActivity(viewContainer.id, { badge: new NumberBadge(numberOfSessions, n => n === 1 ? nls.localize('1activeSession', "1 active session") : nls.localize('nActiveSessions', "{0} active sessions", n)) });
                }
            }
        }));
        this.disposables.add(editorService.onDidActiveEditorChange(() => {
            this.contextKeyService.bufferChangeEvents(() => {
                if (editorService.activeEditor === DisassemblyViewInput.instance) {
                    this.disassemblyViewFocus.set(true);
                }
                else {
                    // This key can be initialized a tick after this event is fired
                    this.disassemblyViewFocus?.reset();
                }
            });
        }));
        this.disposables.add(this.lifecycleService.onBeforeShutdown(() => {
            for (const editor of editorService.editors) {
                // Editors will not be valid on window reload, so close them.
                if (editor.resource?.scheme === DEBUG_MEMORY_SCHEME) {
                    editor.dispose();
                }
            }
        }));
        this.disposables.add(extensionService.onWillStop(evt => {
            evt.veto(this.model.getSessions().length > 0, nls.localize('active debug session', 'A debug session is still running that would terminate.'));
        }));
        this.initContextKeys(contextKeyService);
    }
    initContextKeys(contextKeyService) {
        queueMicrotask(() => {
            contextKeyService.bufferChangeEvents(() => {
                this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
                this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeyService);
                this.hasDebugged = CONTEXT_HAS_DEBUGGED.bindTo(contextKeyService);
                this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
                this.debugUx = CONTEXT_DEBUG_UX.bindTo(contextKeyService);
                this.debugUx.set(this.debugStorage.loadDebugUxState());
                this.breakpointsExist = CONTEXT_BREAKPOINTS_EXIST.bindTo(contextKeyService);
                // Need to set disassemblyViewFocus here to make it in the same context as the debug event handlers
                this.disassemblyViewFocus = CONTEXT_DISASSEMBLY_VIEW_FOCUS.bindTo(contextKeyService);
            });
            const setBreakpointsExistContext = () => this.breakpointsExist.set(!!(this.model.getBreakpoints().length || this.model.getDataBreakpoints().length || this.model.getFunctionBreakpoints().length));
            setBreakpointsExistContext();
            this.disposables.add(this.model.onDidChangeBreakpoints(() => setBreakpointsExistContext()));
        });
    }
    getModel() {
        return this.model;
    }
    getViewModel() {
        return this.viewModel;
    }
    getConfigurationManager() {
        return this.configurationManager;
    }
    getAdapterManager() {
        return this.adapterManager;
    }
    sourceIsNotAvailable(uri) {
        this.model.sourceIsNotAvailable(uri);
    }
    dispose() {
        this.disposables.dispose();
    }
    //---- state management
    get state() {
        const focusedSession = this.viewModel.focusedSession;
        if (focusedSession) {
            return focusedSession.state;
        }
        return this.initializing ? 1 /* State.Initializing */ : 0 /* State.Inactive */;
    }
    get initializingOptions() {
        return this._initializingOptions;
    }
    startInitializingState(options) {
        if (!this.initializing) {
            this.initializing = true;
            this._initializingOptions = options;
            this.onStateChange();
        }
    }
    endInitializingState() {
        if (this.initializing) {
            this.initializing = false;
            this._initializingOptions = undefined;
            this.onStateChange();
        }
    }
    cancelTokens(id) {
        if (id) {
            const token = this.sessionCancellationTokens.get(id);
            if (token) {
                token.cancel();
                this.sessionCancellationTokens.delete(id);
            }
        }
        else {
            this.sessionCancellationTokens.forEach(t => t.cancel());
            this.sessionCancellationTokens.clear();
        }
    }
    onStateChange() {
        const state = this.state;
        if (this.previousState !== state) {
            this.contextKeyService.bufferChangeEvents(() => {
                this.debugState.set(getStateLabel(state));
                this.inDebugMode.set(state !== 0 /* State.Inactive */);
                // Only show the simple ux if debug is not yet started and if no launch.json exists
                const debugUxValue = ((state !== 0 /* State.Inactive */ && state !== 1 /* State.Initializing */) || (this.adapterManager.hasEnabledDebuggers() && this.configurationManager.selectedConfiguration.name)) ? 'default' : 'simple';
                this.debugUx.set(debugUxValue);
                this.debugStorage.storeDebugUxState(debugUxValue);
            });
            this.previousState = state;
            this._onDidChangeState.fire(state);
        }
    }
    get onDidChangeState() {
        return this._onDidChangeState.event;
    }
    get onDidNewSession() {
        return this._onDidNewSession.event;
    }
    get onWillNewSession() {
        return this._onWillNewSession.event;
    }
    get onDidEndSession() {
        return this._onDidEndSession.event;
    }
    lazySetup() {
        if (!this.haveDoneLazySetup) {
            // Registering fs providers is slow
            // https://github.com/microsoft/vscode/issues/159886
            this.disposables.add(this.fileService.registerProvider(DEBUG_MEMORY_SCHEME, this.disposables.add(new DebugMemoryFileSystemProvider(this))));
            this.haveDoneLazySetup = true;
        }
    }
    //---- life cycle management
    /**
     * main entry point
     * properly manages compounds, checks for errors and handles the initializing state.
     */
    async startDebugging(launch, configOrName, options, saveBeforeStart = !options?.parentSession) {
        const message = options && options.noDebug ? nls.localize('runTrust', "Running executes build tasks and program code from your workspace.") : nls.localize('debugTrust', "Debugging executes build tasks and program code from your workspace.");
        const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({ message });
        if (!trust) {
            return false;
        }
        this.lazySetup();
        this.startInitializingState(options);
        this.hasDebugged.set(true);
        try {
            // make sure to save all files and that the configuration is up to date
            await this.extensionService.activateByEvent('onDebug');
            if (saveBeforeStart) {
                await saveAllBeforeDebugStart(this.configurationService, this.editorService);
            }
            await this.extensionService.whenInstalledExtensionsRegistered();
            let config;
            let compound;
            if (!configOrName) {
                configOrName = this.configurationManager.selectedConfiguration.name;
            }
            if (typeof configOrName === 'string' && launch) {
                config = launch.getConfiguration(configOrName);
                compound = launch.getCompound(configOrName);
            }
            else if (typeof configOrName !== 'string') {
                config = configOrName;
            }
            if (compound) {
                // we are starting a compound debug, first do some error checking and than start each configuration in the compound
                if (!compound.configurations) {
                    throw new Error(nls.localize({ key: 'compoundMustHaveConfigurations', comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] }, "Compound must have \"configurations\" attribute set in order to start multiple configurations."));
                }
                if (compound.preLaunchTask) {
                    const taskResult = await this.taskRunner.runTaskAndCheckErrors(launch?.workspace || this.contextService.getWorkspace(), compound.preLaunchTask);
                    if (taskResult === 0 /* TaskRunResult.Failure */) {
                        this.endInitializingState();
                        return false;
                    }
                }
                if (compound.stopAll) {
                    options = { ...options, compoundRoot: new DebugCompoundRoot() };
                }
                const values = await Promise.all(compound.configurations.map(configData => {
                    const name = typeof configData === 'string' ? configData : configData.name;
                    if (name === compound.name) {
                        return Promise.resolve(false);
                    }
                    let launchForName;
                    if (typeof configData === 'string') {
                        const launchesContainingName = this.configurationManager.getLaunches().filter(l => !!l.getConfiguration(name));
                        if (launchesContainingName.length === 1) {
                            launchForName = launchesContainingName[0];
                        }
                        else if (launch && launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
                            // If there are multiple launches containing the configuration give priority to the configuration in the current launch
                            launchForName = launch;
                        }
                        else {
                            throw new Error(launchesContainingName.length === 0 ? nls.localize('noConfigurationNameInWorkspace', "Could not find launch configuration '{0}' in the workspace.", name)
                                : nls.localize('multipleConfigurationNamesInWorkspace', "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name));
                        }
                    }
                    else if (configData.folder) {
                        const launchesMatchingConfigData = this.configurationManager.getLaunches().filter(l => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
                        if (launchesMatchingConfigData.length === 1) {
                            launchForName = launchesMatchingConfigData[0];
                        }
                        else {
                            throw new Error(nls.localize('noFolderWithName', "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound.name));
                        }
                    }
                    return this.createSession(launchForName, launchForName.getConfiguration(name), options);
                }));
                const result = values.every(success => !!success); // Compound launch is a success only if each configuration launched successfully
                this.endInitializingState();
                return result;
            }
            if (configOrName && !config) {
                const message = !!launch ? nls.localize('configMissing', "Configuration '{0}' is missing in 'launch.json'.", typeof configOrName === 'string' ? configOrName : configOrName.name) :
                    nls.localize('launchJsonDoesNotExist', "'launch.json' does not exist for passed workspace folder.");
                throw new Error(message);
            }
            const result = await this.createSession(launch, config, options);
            this.endInitializingState();
            return result;
        }
        catch (err) {
            // make sure to get out of initializing state, and propagate the result
            this.notificationService.error(err);
            this.endInitializingState();
            return Promise.reject(err);
        }
    }
    /**
     * gets the debugger for the type, resolves configurations by providers, substitutes variables and runs prelaunch tasks
     */
    async createSession(launch, config, options) {
        // We keep the debug type in a separate variable 'type' so that a no-folder config has no attributes.
        // Storing the type in the config would break extensions that assume that the no-folder case is indicated by an empty config.
        let type;
        if (config) {
            type = config.type;
        }
        else {
            // a no-folder workspace has no launch.config
            config = Object.create(null);
        }
        if (options && options.noDebug) {
            config.noDebug = true;
        }
        else if (options && typeof options.noDebug === 'undefined' && options.parentSession && options.parentSession.configuration.noDebug) {
            config.noDebug = true;
        }
        const unresolvedConfig = deepClone(config);
        let guess;
        let activeEditor;
        if (!type) {
            activeEditor = this.editorService.activeEditor;
            if (activeEditor && activeEditor.resource) {
                const chosen = this.chosenEnvironments[activeEditor.resource.toString()];
                if (chosen) {
                    type = chosen.type;
                    if (chosen.dynamicLabel) {
                        const dyn = await this.configurationManager.getDynamicConfigurationsByType(chosen.type);
                        const found = dyn.find(d => d.label === chosen.dynamicLabel);
                        if (found) {
                            launch = found.launch;
                            Object.assign(config, found.config);
                        }
                    }
                }
            }
            if (!type) {
                guess = await this.adapterManager.guessDebugger(false);
                if (guess) {
                    type = guess.debugger.type;
                    if (guess.withConfig) {
                        launch = guess.withConfig.launch;
                        Object.assign(config, guess.withConfig.config);
                    }
                }
            }
        }
        const initCancellationToken = new CancellationTokenSource();
        const sessionId = generateUuid();
        this.sessionCancellationTokens.set(sessionId, initCancellationToken);
        const configByProviders = await this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : undefined, type, config, initCancellationToken.token);
        // a falsy config indicates an aborted launch
        if (configByProviders && configByProviders.type) {
            try {
                let resolvedConfig = await this.substituteVariables(launch, configByProviders);
                if (!resolvedConfig) {
                    // User cancelled resolving of interactive variables, silently return
                    return false;
                }
                if (initCancellationToken.token.isCancellationRequested) {
                    // User cancelled, silently return
                    return false;
                }
                // Check for concurrent sessions before running preLaunchTask to avoid running the task if user cancels
                let userConfirmedConcurrentSession = false;
                if (options?.startedByUser && resolvedConfig && resolvedConfig.suppressMultipleSessionWarning !== true) {
                    // Check if there's already a session with the same launch configuration
                    const existingSessions = this.model.getSessions();
                    const workspace = launch?.workspace;
                    const existingSession = existingSessions.find(s => s.configuration.name === resolvedConfig.name &&
                        s.configuration.type === resolvedConfig.type &&
                        s.configuration.request === resolvedConfig.request &&
                        s.root === workspace);
                    if (existingSession) {
                        // There is already a session with the same configuration, prompt user before running preLaunchTask
                        const confirmed = await this.confirmConcurrentSession(existingSession.getLabel());
                        if (!confirmed) {
                            return false;
                        }
                        userConfirmedConcurrentSession = true;
                    }
                }
                const workspace = launch?.workspace || this.contextService.getWorkspace();
                const taskResult = await this.taskRunner.runTaskAndCheckErrors(workspace, resolvedConfig.preLaunchTask);
                if (taskResult === 0 /* TaskRunResult.Failure */) {
                    return false;
                }
                const cfg = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : undefined, resolvedConfig.type, resolvedConfig, initCancellationToken.token);
                if (!cfg) {
                    if (launch && type && cfg === null && !initCancellationToken.token.isCancellationRequested) { // show launch.json only for "config" being "null".
                        await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
                    }
                    return false;
                }
                resolvedConfig = cfg;
                const dbg = this.adapterManager.getDebugger(resolvedConfig.type);
                if (!dbg || (configByProviders.request !== 'attach' && configByProviders.request !== 'launch')) {
                    let message;
                    if (configByProviders.request !== 'attach' && configByProviders.request !== 'launch') {
                        message = configByProviders.request ? nls.localize('debugRequestNotSupported', "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", 'request', configByProviders.request)
                            : nls.localize('debugRequesMissing', "Attribute '{0}' is missing from the chosen debug configuration.", 'request');
                    }
                    else {
                        message = resolvedConfig.type ? nls.localize('debugTypeNotSupported', "Configured debug type '{0}' is not supported.", resolvedConfig.type) :
                            nls.localize('debugTypeMissing', "Missing property 'type' for the chosen launch configuration.");
                    }
                    const actionList = [];
                    actionList.push(toAction({
                        id: 'installAdditionalDebuggers',
                        label: nls.localize({ key: 'installAdditionalDebuggers', comment: ['Placeholder is the debug type, so for example "node", "python"'] }, "Install {0} Extension", resolvedConfig.type),
                        enabled: true,
                        run: async () => this.commandService.executeCommand('debug.installAdditionalDebuggers', resolvedConfig?.type)
                    }));
                    await this.showError(message, actionList);
                    return false;
                }
                if (!dbg.enabled) {
                    await this.showError(debuggerDisabledMessage(dbg.type), []);
                    return false;
                }
                const result = await this.doCreateSession(sessionId, launch?.workspace, { resolved: resolvedConfig, unresolved: unresolvedConfig }, options, userConfirmedConcurrentSession);
                if (result && guess && activeEditor && activeEditor.resource) {
                    // Remeber user choice of environment per active editor to make starting debugging smoother #124770
                    this.chosenEnvironments[activeEditor.resource.toString()] = { type: guess.debugger.type, dynamicLabel: guess.withConfig?.label };
                    this.debugStorage.storeChosenEnvironments(this.chosenEnvironments);
                }
                return result;
            }
            catch (err) {
                if (err && err.message) {
                    await this.showError(err.message);
                }
                else if (this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
                    await this.showError(nls.localize('noFolderWorkspaceDebugError', "The active file can not be debugged. Make sure it is saved and that you have a debug extension installed for that file type."));
                }
                if (launch && !initCancellationToken.token.isCancellationRequested) {
                    await launch.openConfigFile({ preserveFocus: true }, initCancellationToken.token);
                }
                return false;
            }
        }
        if (launch && type && configByProviders === null && !initCancellationToken.token.isCancellationRequested) { // show launch.json only for "config" being "null".
            await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
        }
        return false;
    }
    /**
     * instantiates the new session, initializes the session, registers session listeners and reports telemetry
     */
    async doCreateSession(sessionId, root, configuration, options, userConfirmedConcurrentSession = false) {
        const session = this.instantiationService.createInstance(DebugSession, sessionId, configuration, root, this.model, options);
        if (!userConfirmedConcurrentSession && options?.startedByUser && this.model.getSessions().some(s => s.configuration.name === configuration.resolved.name &&
            s.configuration.type === configuration.resolved.type &&
            s.configuration.request === configuration.resolved.request &&
            s.root === root) && configuration.resolved.suppressMultipleSessionWarning !== true) {
            // There is already a session with the same configuration, prompt user #127721
            const confirmed = await this.confirmConcurrentSession(session.getLabel());
            if (!confirmed) {
                return false;
            }
        }
        this.model.addSession(session);
        // since the Session is now properly registered under its ID and hooked, we can announce it
        // this event doesn't go to extensions
        this._onWillNewSession.fire(session);
        const openDebug = this.configurationService.getValue('debug').openDebug;
        // Open debug viewlet based on the visibility of the side bar and openDebug setting. Do not open for 'run without debug'
        if (!configuration.resolved.noDebug && (openDebug === 'openOnSessionStart' || (openDebug !== 'neverOpen' && this.viewModel.firstSessionStart)) && !session.suppressDebugView) {
            await this.paneCompositeService.openPaneComposite(VIEWLET_ID, 0 /* ViewContainerLocation.Sidebar */);
        }
        try {
            await this.launchOrAttachToSession(session);
            const internalConsoleOptions = session.configuration.internalConsoleOptions || this.configurationService.getValue('debug').internalConsoleOptions;
            if (internalConsoleOptions === 'openOnSessionStart' || (this.viewModel.firstSessionStart && internalConsoleOptions === 'openOnFirstSessionStart')) {
                this.viewsService.openView(REPL_VIEW_ID, false);
            }
            this.viewModel.firstSessionStart = false;
            const showSubSessions = this.configurationService.getValue('debug').showSubSessionsInToolBar;
            const sessions = this.model.getSessions();
            const shownSessions = showSubSessions ? sessions : sessions.filter(s => !s.parentSession);
            if (shownSessions.length > 1) {
                this.viewModel.setMultiSessionView(true);
            }
            // since the initialized response has arrived announce the new Session (including extensions)
            this._onDidNewSession.fire(session);
            return true;
        }
        catch (error) {
            if (errors.isCancellationError(error)) {
                // don't show 'canceled' error messages to the user #7906
                return false;
            }
            // Show the repl if some error got logged there #5870
            if (session && session.getReplElements().length > 0) {
                this.viewsService.openView(REPL_VIEW_ID, false);
            }
            if (session.configuration && session.configuration.request === 'attach' && session.configuration.__autoAttach) {
                // ignore attach timeouts in auto attach mode
                return false;
            }
            const errorMessage = error instanceof Error ? error.message : error;
            if (error.showUser !== false) {
                // Only show the error when showUser is either not defined, or is true #128484
                await this.showError(errorMessage, isErrorWithActions(error) ? error.actions : []);
            }
            return false;
        }
    }
    async confirmConcurrentSession(sessionLabel) {
        const result = await this.dialogService.confirm({
            message: nls.localize('multipleSession', "'{0}' is already running. Do you want to start another instance?", sessionLabel)
        });
        return result.confirmed;
    }
    async launchOrAttachToSession(session, forceFocus = false) {
        // register listeners as the very first thing!
        this.registerSessionListeners(session);
        const dbgr = this.adapterManager.getDebugger(session.configuration.type);
        try {
            await session.initialize(dbgr);
            await session.launchOrAttach(session.configuration);
            const launchJsonExists = !!session.root && !!this.configurationService.getValue('launch', { resource: session.root.uri });
            await this.telemetry.logDebugSessionStart(dbgr, launchJsonExists);
            if (forceFocus || !this.viewModel.focusedSession || (session.parentSession === this.viewModel.focusedSession && session.compact)) {
                await this.focusStackFrame(undefined, undefined, session);
            }
        }
        catch (err) {
            if (this.viewModel.focusedSession === session) {
                await this.focusStackFrame(undefined);
            }
            return Promise.reject(err);
        }
    }
    registerSessionListeners(session) {
        const listenerDisposables = new DisposableStore();
        this.disposables.add(listenerDisposables);
        const sessionRunningScheduler = listenerDisposables.add(new RunOnceScheduler(() => {
            // Do not immediatly defocus the stack frame if the session is running
            if (session.state === 3 /* State.Running */ && this.viewModel.focusedSession === session) {
                this.viewModel.setFocus(undefined, this.viewModel.focusedThread, session, false);
            }
        }, 200));
        listenerDisposables.add(session.onDidChangeState(() => {
            if (session.state === 3 /* State.Running */ && this.viewModel.focusedSession === session) {
                sessionRunningScheduler.schedule();
            }
            if (session === this.viewModel.focusedSession) {
                this.onStateChange();
            }
        }));
        listenerDisposables.add(this.onDidEndSession(e => {
            if (e.session === session) {
                this.disposables.delete(listenerDisposables);
            }
        }));
        listenerDisposables.add(session.onDidEndAdapter(async (adapterExitEvent) => {
            if (adapterExitEvent) {
                if (adapterExitEvent.error) {
                    this.notificationService.error(nls.localize('debugAdapterCrash', "Debug adapter process has terminated unexpectedly ({0})", adapterExitEvent.error.message || adapterExitEvent.error.toString()));
                }
                this.telemetry.logDebugSessionStop(session, adapterExitEvent);
            }
            // 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
            const extensionDebugSession = getExtensionHostDebugSession(session);
            if (extensionDebugSession && extensionDebugSession.state === 3 /* State.Running */ && extensionDebugSession.configuration.noDebug) {
                this.extensionHostDebugService.close(extensionDebugSession.getId());
            }
            if (session.configuration.postDebugTask) {
                const root = session.root ?? this.contextService.getWorkspace();
                try {
                    await this.taskRunner.runTask(root, session.configuration.postDebugTask);
                }
                catch (err) {
                    this.notificationService.error(err);
                }
            }
            this.endInitializingState();
            this.cancelTokens(session.getId());
            if (this.configurationService.getValue('debug').closeReadonlyTabsOnEnd) {
                const editorsToClose = this.editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */).filter(({ editor }) => {
                    return editor.resource?.scheme === DEBUG_SCHEME && session.getId() === Source.getEncodedDebugData(editor.resource).sessionId;
                });
                this.editorService.closeEditors(editorsToClose);
            }
            this._onDidEndSession.fire({ session, restart: this.restartingSessions.has(session) });
            const focusedSession = this.viewModel.focusedSession;
            if (focusedSession && focusedSession.getId() === session.getId()) {
                const { session, thread, stackFrame } = getStackFrameThreadAndSessionToFocus(this.model, undefined, undefined, undefined, focusedSession);
                this.viewModel.setFocus(stackFrame, thread, session, false);
            }
            if (this.model.getSessions().length === 0) {
                this.viewModel.setMultiSessionView(false);
                if (this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) && this.configurationService.getValue('debug').openExplorerOnEnd) {
                    this.paneCompositeService.openPaneComposite(EXPLORER_VIEWLET_ID, 0 /* ViewContainerLocation.Sidebar */);
                }
                // Data breakpoints that can not be persisted should be cleared when a session ends
                const dataBreakpoints = this.model.getDataBreakpoints().filter(dbp => !dbp.canPersist);
                dataBreakpoints.forEach(dbp => this.model.removeDataBreakpoints(dbp.getId()));
                if (this.configurationService.getValue('debug').console.closeOnEnd) {
                    const debugConsoleContainer = this.viewDescriptorService.getViewContainerByViewId(REPL_VIEW_ID);
                    if (debugConsoleContainer && this.viewsService.isViewContainerVisible(debugConsoleContainer.id)) {
                        this.viewsService.closeViewContainer(debugConsoleContainer.id);
                    }
                }
            }
            this.model.removeExceptionBreakpointsForSession(session.getId());
            // session.dispose(); TODO@roblourens
        }));
    }
    async restartSession(session, restartData) {
        if (session.saveBeforeRestart) {
            await saveAllBeforeDebugStart(this.configurationService, this.editorService);
        }
        const isAutoRestart = !!restartData;
        const runTasks = async () => {
            if (isAutoRestart) {
                // Do not run preLaunch and postDebug tasks for automatic restarts
                return Promise.resolve(1 /* TaskRunResult.Success */);
            }
            const root = session.root || this.contextService.getWorkspace();
            await this.taskRunner.runTask(root, session.configuration.preRestartTask);
            await this.taskRunner.runTask(root, session.configuration.postDebugTask);
            const taskResult1 = await this.taskRunner.runTaskAndCheckErrors(root, session.configuration.preLaunchTask);
            if (taskResult1 !== 1 /* TaskRunResult.Success */) {
                return taskResult1;
            }
            return this.taskRunner.runTaskAndCheckErrors(root, session.configuration.postRestartTask);
        };
        const extensionDebugSession = getExtensionHostDebugSession(session);
        if (extensionDebugSession) {
            const taskResult = await runTasks();
            if (taskResult === 1 /* TaskRunResult.Success */) {
                this.extensionHostDebugService.reload(extensionDebugSession.getId());
            }
            return;
        }
        // Read the configuration again if a launch.json has been changed, if not just use the inmemory configuration
        let needsToSubstitute = false;
        let unresolved;
        const launch = session.root ? this.configurationManager.getLaunch(session.root.uri) : undefined;
        if (launch) {
            unresolved = launch.getConfiguration(session.configuration.name);
            if (unresolved && !equals(unresolved, session.unresolvedConfiguration)) {
                unresolved.noDebug = session.configuration.noDebug;
                needsToSubstitute = true;
            }
        }
        let resolved = session.configuration;
        if (launch && needsToSubstitute && unresolved) {
            const initCancellationToken = new CancellationTokenSource();
            this.sessionCancellationTokens.set(session.getId(), initCancellationToken);
            const resolvedByProviders = await this.configurationManager.resolveConfigurationByProviders(launch.workspace ? launch.workspace.uri : undefined, unresolved.type, unresolved, initCancellationToken.token);
            if (resolvedByProviders) {
                resolved = await this.substituteVariables(launch, resolvedByProviders);
                if (resolved && !initCancellationToken.token.isCancellationRequested) {
                    resolved = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : undefined, resolved.type, resolved, initCancellationToken.token);
                }
            }
            else {
                resolved = resolvedByProviders;
            }
        }
        if (resolved) {
            session.setConfiguration({ resolved, unresolved });
        }
        session.configuration.__restart = restartData;
        const doRestart = async (fn) => {
            this.restartingSessions.add(session);
            let didRestart = false;
            try {
                didRestart = (await fn()) !== false;
            }
            catch (e) {
                didRestart = false;
                throw e;
            }
            finally {
                this.restartingSessions.delete(session);
                // we previously may have issued an onDidEndSession with restart: true,
                // assuming the adapter exited (in `registerSessionListeners`). But the
                // restart failed, so emit the final termination now.
                if (!didRestart) {
                    this._onDidEndSession.fire({ session, restart: false });
                }
            }
        };
        for (const breakpoint of this.model.getBreakpoints({ triggeredOnly: true })) {
            breakpoint.setSessionDidTrigger(session.getId(), false);
        }
        // For debug sessions spawned by test runs, cancel the test run and stop
        // the session, then start the test run again; tests have no notion of restarts.
        if (session.correlatedTestRun) {
            if (!session.correlatedTestRun.completedAt) {
                session.cancelCorrelatedTestRun();
                await Event.toPromise(session.correlatedTestRun.onComplete);
                // todo@connor4312 is there any reason to wait for the debug session to
                // terminate? I don't think so, test extension should already handle any
                // state conflicts...
            }
            this.testService.runResolvedTests(session.correlatedTestRun.request);
            return;
        }
        if (session.capabilities.supportsRestartRequest) {
            const taskResult = await runTasks();
            if (taskResult === 1 /* TaskRunResult.Success */) {
                await doRestart(async () => {
                    await session.restart();
                    return true;
                });
            }
            return;
        }
        const shouldFocus = !!this.viewModel.focusedSession && session.getId() === this.viewModel.focusedSession.getId();
        return doRestart(async () => {
            // If the restart is automatic  -> disconnect, otherwise -> terminate #55064
            if (isAutoRestart) {
                await session.disconnect(true);
            }
            else {
                await session.terminate(true);
            }
            return new Promise((c, e) => {
                setTimeout(async () => {
                    const taskResult = await runTasks();
                    if (taskResult !== 1 /* TaskRunResult.Success */) {
                        return c(false);
                    }
                    if (!resolved) {
                        return c(false);
                    }
                    try {
                        await this.launchOrAttachToSession(session, shouldFocus);
                        this._onDidNewSession.fire(session);
                        c(true);
                    }
                    catch (error) {
                        e(error);
                    }
                }, 300);
            });
        });
    }
    async stopSession(session, disconnect = false, suspend = false) {
        if (session) {
            return disconnect ? session.disconnect(undefined, suspend) : session.terminate();
        }
        const sessions = this.model.getSessions();
        if (sessions.length === 0) {
            this.taskRunner.cancel();
            // User might have cancelled starting of a debug session, and in some cases the quick pick is left open
            await this.quickInputService.cancel();
            this.endInitializingState();
            this.cancelTokens(undefined);
        }
        return Promise.all(sessions.map(s => disconnect ? s.disconnect(undefined, suspend) : s.terminate()));
    }
    async substituteVariables(launch, config) {
        const dbg = this.adapterManager.getDebugger(config.type);
        if (dbg) {
            let folder = undefined;
            if (launch && launch.workspace) {
                folder = launch.workspace;
            }
            else {
                const folders = this.contextService.getWorkspace().folders;
                if (folders.length === 1) {
                    folder = folders[0];
                }
            }
            try {
                return await dbg.substituteVariables(folder, config);
            }
            catch (err) {
                if (err.message !== errors.canceledName) {
                    this.showError(err.message, undefined, !!launch?.getConfiguration(config.name));
                }
                return undefined; // bail out
            }
        }
        return Promise.resolve(config);
    }
    async showError(message, errorActions = [], promptLaunchJson = true) {
        const configureAction = toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) });
        // Don't append the standard command if id of any provided action indicates it is a command
        const actions = errorActions.filter((action) => action.id.endsWith('.command')).length > 0 ?
            errorActions :
            [...errorActions, ...(promptLaunchJson ? [configureAction] : [])];
        await this.dialogService.prompt({
            type: severity.Error,
            message,
            buttons: actions.map(action => ({
                label: action.label,
                run: () => action.run()
            })),
            cancelButton: true
        });
    }
    //---- focus management
    async focusStackFrame(_stackFrame, _thread, _session, options) {
        const { stackFrame, thread, session } = getStackFrameThreadAndSessionToFocus(this.model, _stackFrame, _thread, _session);
        if (stackFrame) {
            const editor = await stackFrame.openInEditor(this.editorService, options?.preserveFocus ?? true, options?.sideBySide, options?.pinned);
            if (editor) {
                if (editor.input === DisassemblyViewInput.instance) {
                    // Go to address is invoked via setFocus
                }
                else {
                    const control = editor.getControl();
                    if (stackFrame && isCodeEditor(control) && control.hasModel()) {
                        const model = control.getModel();
                        const lineNumber = stackFrame.range.startLineNumber;
                        if (lineNumber >= 1 && lineNumber <= model.getLineCount()) {
                            const lineContent = control.getModel().getLineContent(lineNumber);
                            aria.alert(nls.localize({ key: 'debuggingPaused', comment: ['First placeholder is the file line content, second placeholder is the reason why debugging is stopped, for example "breakpoint", third is the stack frame name, and last is the line number.'] }, "{0}, debugging paused {1}, {2}:{3}", lineContent, thread && thread.stoppedDetails ? `, reason ${thread.stoppedDetails.reason}` : '', stackFrame.source ? stackFrame.source.name : '', stackFrame.range.startLineNumber));
                        }
                    }
                }
            }
        }
        if (session) {
            this.debugType.set(session.configuration.type);
        }
        else {
            this.debugType.reset();
        }
        this.viewModel.setFocus(stackFrame, thread, session, !!options?.explicit);
    }
    //---- watches
    addWatchExpression(name) {
        const we = this.model.addWatchExpression(name);
        if (!name) {
            this.viewModel.setSelectedExpression(we, false);
        }
        this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
    }
    renameWatchExpression(id, newName) {
        this.model.renameWatchExpression(id, newName);
        this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
    }
    moveWatchExpression(id, position) {
        this.model.moveWatchExpression(id, position);
        this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
    }
    removeWatchExpressions(id) {
        this.model.removeWatchExpressions(id);
        this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
    }
    //---- breakpoints
    canSetBreakpointsIn(model) {
        return this.adapterManager.canSetBreakpointsIn(model);
    }
    async enableOrDisableBreakpoints(enable, breakpoint) {
        if (breakpoint) {
            this.model.setEnablement(breakpoint, enable);
            this.debugStorage.storeBreakpoints(this.model);
            if (breakpoint instanceof Breakpoint) {
                await this.makeTriggeredBreakpointsMatchEnablement(enable, breakpoint);
                await this.sendBreakpoints(breakpoint.originalUri);
            }
            else if (breakpoint instanceof FunctionBreakpoint) {
                await this.sendFunctionBreakpoints();
            }
            else if (breakpoint instanceof DataBreakpoint) {
                await this.sendDataBreakpoints();
            }
            else if (breakpoint instanceof InstructionBreakpoint) {
                await this.sendInstructionBreakpoints();
            }
            else {
                await this.sendExceptionBreakpoints();
            }
        }
        else {
            this.model.enableOrDisableAllBreakpoints(enable);
            this.debugStorage.storeBreakpoints(this.model);
            await this.sendAllBreakpoints();
        }
        this.debugStorage.storeBreakpoints(this.model);
    }
    async addBreakpoints(uri, rawBreakpoints, ariaAnnounce = true) {
        const breakpoints = this.model.addBreakpoints(uri, rawBreakpoints);
        if (ariaAnnounce) {
            breakpoints.forEach(bp => aria.status(nls.localize('breakpointAdded', "Added breakpoint, line {0}, file {1}", bp.lineNumber, uri.fsPath)));
        }
        // In some cases we need to store breakpoints before we send them because sending them can take a long time
        // And after sending them because the debug adapter can attach adapter data to a breakpoint
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendBreakpoints(uri);
        this.debugStorage.storeBreakpoints(this.model);
        return breakpoints;
    }
    async updateBreakpoints(uri, data, sendOnResourceSaved) {
        this.model.updateBreakpoints(data);
        this.debugStorage.storeBreakpoints(this.model);
        if (sendOnResourceSaved) {
            this.breakpointsToSendOnResourceSaved.add(uri);
        }
        else {
            await this.sendBreakpoints(uri);
            this.debugStorage.storeBreakpoints(this.model);
        }
    }
    async removeBreakpoints(id) {
        const breakpoints = this.model.getBreakpoints();
        const toRemove = id === undefined
            ? breakpoints
            : id instanceof Array
                ? breakpoints.filter(bp => id.includes(bp.getId()))
                : breakpoints.filter(bp => bp.getId() === id);
        // note: using the debugger-resolved uri for aria to reflect UI state
        toRemove.forEach(bp => aria.status(nls.localize('breakpointRemoved', "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
        const urisToClear = new Set(toRemove.map(bp => bp.originalUri.toString()));
        this.model.removeBreakpoints(toRemove);
        this.unlinkTriggeredBreakpoints(breakpoints, toRemove).forEach(uri => urisToClear.add(uri.toString()));
        this.debugStorage.storeBreakpoints(this.model);
        await Promise.all([...urisToClear].map(uri => this.sendBreakpoints(URI.parse(uri))));
    }
    setBreakpointsActivated(activated) {
        this.model.setBreakpointsActivated(activated);
        return this.sendAllBreakpoints();
    }
    async addFunctionBreakpoint(opts, id) {
        this.model.addFunctionBreakpoint(opts ?? { name: '' }, id);
        // If opts not provided, sending the breakpoint is handled by a later to call to `updateFunctionBreakpoint`
        if (opts) {
            this.debugStorage.storeBreakpoints(this.model);
            await this.sendFunctionBreakpoints();
            this.debugStorage.storeBreakpoints(this.model);
        }
    }
    async updateFunctionBreakpoint(id, update) {
        this.model.updateFunctionBreakpoint(id, update);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendFunctionBreakpoints();
    }
    async removeFunctionBreakpoints(id) {
        this.model.removeFunctionBreakpoints(id);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendFunctionBreakpoints();
    }
    async addDataBreakpoint(opts) {
        this.model.addDataBreakpoint(opts);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendDataBreakpoints();
        this.debugStorage.storeBreakpoints(this.model);
    }
    async updateDataBreakpoint(id, update) {
        this.model.updateDataBreakpoint(id, update);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendDataBreakpoints();
    }
    async removeDataBreakpoints(id) {
        this.model.removeDataBreakpoints(id);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendDataBreakpoints();
    }
    async addInstructionBreakpoint(opts) {
        this.model.addInstructionBreakpoint(opts);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendInstructionBreakpoints();
        this.debugStorage.storeBreakpoints(this.model);
    }
    async removeInstructionBreakpoints(instructionReference, offset) {
        this.model.removeInstructionBreakpoints(instructionReference, offset);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendInstructionBreakpoints();
    }
    setExceptionBreakpointFallbackSession(sessionId) {
        this.model.setExceptionBreakpointFallbackSession(sessionId);
        this.debugStorage.storeBreakpoints(this.model);
    }
    setExceptionBreakpointsForSession(session, filters) {
        this.model.setExceptionBreakpointsForSession(session.getId(), filters);
        this.debugStorage.storeBreakpoints(this.model);
    }
    async setExceptionBreakpointCondition(exceptionBreakpoint, condition) {
        this.model.setExceptionBreakpointCondition(exceptionBreakpoint, condition);
        this.debugStorage.storeBreakpoints(this.model);
        await this.sendExceptionBreakpoints();
    }
    async sendAllBreakpoints(session) {
        const setBreakpointsPromises = distinct(this.model.getBreakpoints(), bp => bp.originalUri.toString())
            .map(bp => this.sendBreakpoints(bp.originalUri, false, session));
        // If sending breakpoints to one session which we know supports the configurationDone request, can make all requests in parallel
        if (session?.capabilities.supportsConfigurationDoneRequest) {
            await Promise.all([
                ...setBreakpointsPromises,
                this.sendFunctionBreakpoints(session),
                this.sendDataBreakpoints(session),
                this.sendInstructionBreakpoints(session),
                this.sendExceptionBreakpoints(session),
            ]);
        }
        else {
            await Promise.all(setBreakpointsPromises);
            await this.sendFunctionBreakpoints(session);
            await this.sendDataBreakpoints(session);
            await this.sendInstructionBreakpoints(session);
            // send exception breakpoints at the end since some debug adapters may rely on the order - this was the case before
            // the configurationDone request was introduced.
            await this.sendExceptionBreakpoints(session);
        }
    }
    /**
     * Removes the condition of triggered breakpoints that depended on
     * breakpoints in `removedBreakpoints`. Returns the URIs of resources that
     * had their breakpoints changed in this way.
     */
    unlinkTriggeredBreakpoints(allBreakpoints, removedBreakpoints) {
        const affectedUris = [];
        for (const removed of removedBreakpoints) {
            for (const existing of allBreakpoints) {
                if (!removedBreakpoints.includes(existing) && existing.triggeredBy === removed.getId()) {
                    this.model.updateBreakpoints(new Map([[existing.getId(), { triggeredBy: undefined }]]));
                    affectedUris.push(existing.originalUri);
                }
            }
        }
        return affectedUris;
    }
    async makeTriggeredBreakpointsMatchEnablement(enable, breakpoint) {
        if (enable) {
            /** If the breakpoint is being enabled, also ensure its triggerer is enabled */
            if (breakpoint.triggeredBy) {
                const trigger = this.model.getBreakpoints().find(bp => breakpoint.triggeredBy === bp.getId());
                if (trigger && !trigger.enabled) {
                    await this.enableOrDisableBreakpoints(enable, trigger);
                }
            }
        }
        /** Makes its triggeree states match the state of this breakpoint */
        await Promise.all(this.model.getBreakpoints()
            .filter(bp => bp.triggeredBy === breakpoint.getId() && bp.enabled !== enable)
            .map(bp => this.enableOrDisableBreakpoints(enable, bp)));
    }
    async sendBreakpoints(modelUri, sourceModified = false, session) {
        const breakpointsToSend = this.model.getBreakpoints({ originalUri: modelUri, enabledOnly: true });
        await sendToOneOrAllSessions(this.model, session, async (s) => {
            if (!s.configuration.noDebug) {
                const sessionBps = breakpointsToSend.filter(bp => !bp.triggeredBy || bp.getSessionDidTrigger(s.getId()));
                await s.sendBreakpoints(modelUri, sessionBps, sourceModified);
            }
        });
    }
    async sendFunctionBreakpoints(session) {
        const breakpointsToSend = this.model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
        await sendToOneOrAllSessions(this.model, session, async (s) => {
            if (s.capabilities.supportsFunctionBreakpoints && !s.configuration.noDebug) {
                await s.sendFunctionBreakpoints(breakpointsToSend);
            }
        });
    }
    async sendDataBreakpoints(session) {
        const breakpointsToSend = this.model.getDataBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
        await sendToOneOrAllSessions(this.model, session, async (s) => {
            if (s.capabilities.supportsDataBreakpoints && !s.configuration.noDebug) {
                await s.sendDataBreakpoints(breakpointsToSend);
            }
        });
    }
    async sendInstructionBreakpoints(session) {
        const breakpointsToSend = this.model.getInstructionBreakpoints().filter(fbp => fbp.enabled && this.model.areBreakpointsActivated());
        await sendToOneOrAllSessions(this.model, session, async (s) => {
            if (s.capabilities.supportsInstructionBreakpoints && !s.configuration.noDebug) {
                await s.sendInstructionBreakpoints(breakpointsToSend);
            }
        });
    }
    sendExceptionBreakpoints(session) {
        return sendToOneOrAllSessions(this.model, session, async (s) => {
            const enabledExceptionBps = this.model.getExceptionBreakpointsForSession(s.getId()).filter(exb => exb.enabled);
            if (s.capabilities.supportsConfigurationDoneRequest && (!s.capabilities.exceptionBreakpointFilters || s.capabilities.exceptionBreakpointFilters.length === 0)) {
                // Only call `setExceptionBreakpoints` as specified in dap protocol #90001
                return;
            }
            if (!s.configuration.noDebug) {
                await s.sendExceptionBreakpoints(enabledExceptionBps);
            }
        });
    }
    onFileChanges(fileChangesEvent) {
        const toRemove = this.model.getBreakpoints().filter(bp => fileChangesEvent.contains(bp.originalUri, 2 /* FileChangeType.DELETED */));
        if (toRemove.length) {
            this.model.removeBreakpoints(toRemove);
        }
        const toSend = [];
        for (const uri of this.breakpointsToSendOnResourceSaved) {
            if (fileChangesEvent.contains(uri, 0 /* FileChangeType.UPDATED */)) {
                toSend.push(uri);
            }
        }
        for (const uri of toSend) {
            this.breakpointsToSendOnResourceSaved.delete(uri);
            this.sendBreakpoints(uri, true);
        }
    }
    async runTo(uri, lineNumber, column) {
        let breakpointToRemove;
        let threadToContinue = this.getViewModel().focusedThread;
        const addTempBreakPoint = async () => {
            const bpExists = !!(this.getModel().getBreakpoints({ column, lineNumber, uri }).length);
            if (!bpExists) {
                const addResult = await this.addAndValidateBreakpoints(uri, lineNumber, column);
                if (addResult.thread) {
                    threadToContinue = addResult.thread;
                }
                if (addResult.breakpoint) {
                    breakpointToRemove = addResult.breakpoint;
                }
            }
            return { threadToContinue, breakpointToRemove };
        };
        const removeTempBreakPoint = (state) => {
            if (state === 2 /* State.Stopped */ || state === 0 /* State.Inactive */) {
                if (breakpointToRemove) {
                    this.removeBreakpoints(breakpointToRemove.getId());
                }
                return true;
            }
            return false;
        };
        await addTempBreakPoint();
        if (this.state === 0 /* State.Inactive */) {
            // If no session exists start the debugger
            const { launch, name, getConfig } = this.getConfigurationManager().selectedConfiguration;
            const config = await getConfig();
            const configOrName = config ? Object.assign(deepClone(config), {}) : name;
            const listener = this.onDidChangeState(state => {
                if (removeTempBreakPoint(state)) {
                    listener.dispose();
                }
            });
            await this.startDebugging(launch, configOrName, undefined, true);
        }
        if (this.state === 2 /* State.Stopped */) {
            const focusedSession = this.getViewModel().focusedSession;
            if (!focusedSession || !threadToContinue) {
                return;
            }
            const listener = threadToContinue.session.onDidChangeState(() => {
                if (removeTempBreakPoint(focusedSession.state)) {
                    listener.dispose();
                }
            });
            await threadToContinue.continue();
        }
    }
    async addAndValidateBreakpoints(uri, lineNumber, column) {
        const debugModel = this.getModel();
        const viewModel = this.getViewModel();
        const breakpoints = await this.addBreakpoints(uri, [{ lineNumber, column }], false);
        const breakpoint = breakpoints?.[0];
        if (!breakpoint) {
            return { breakpoint: undefined, thread: viewModel.focusedThread };
        }
        // If the breakpoint was not initially verified, wait up to 2s for it to become so.
        // Inherently racey if multiple sessions can verify async, but not solvable...
        if (!breakpoint.verified) {
            let listener;
            await raceTimeout(new Promise(resolve => {
                listener = debugModel.onDidChangeBreakpoints(() => {
                    if (breakpoint.verified) {
                        resolve();
                    }
                });
            }), 2000);
            listener.dispose();
        }
        // Look at paused threads for sessions that verified this bp. Prefer, in order:
        let Score;
        (function (Score) {
            /** The focused thread */
            Score[Score["Focused"] = 0] = "Focused";
            /** Any other stopped thread of a session that verified the bp */
            Score[Score["Verified"] = 1] = "Verified";
            /** Any thread that verified and paused in the same file */
            Score[Score["VerifiedAndPausedInFile"] = 2] = "VerifiedAndPausedInFile";
            /** The focused thread if it verified the breakpoint */
            Score[Score["VerifiedAndFocused"] = 3] = "VerifiedAndFocused";
        })(Score || (Score = {}));
        let bestThread = viewModel.focusedThread;
        let bestScore = 0 /* Score.Focused */;
        for (const sessionId of breakpoint.sessionsThatVerified) {
            const session = debugModel.getSession(sessionId);
            if (!session) {
                continue;
            }
            const threads = session.getAllThreads().filter(t => t.stopped);
            if (bestScore < 3 /* Score.VerifiedAndFocused */) {
                if (viewModel.focusedThread && threads.includes(viewModel.focusedThread)) {
                    bestThread = viewModel.focusedThread;
                    bestScore = 3 /* Score.VerifiedAndFocused */;
                }
            }
            if (bestScore < 2 /* Score.VerifiedAndPausedInFile */) {
                const pausedInThisFile = threads.find(t => {
                    const top = t.getTopStackFrame();
                    return top && this.uriIdentityService.extUri.isEqual(top.source.uri, uri);
                });
                if (pausedInThisFile) {
                    bestThread = pausedInThisFile;
                    bestScore = 2 /* Score.VerifiedAndPausedInFile */;
                }
            }
            if (bestScore < 1 /* Score.Verified */) {
                bestThread = threads[0];
                bestScore = 2 /* Score.VerifiedAndPausedInFile */;
            }
        }
        return { thread: bestThread, breakpoint };
    }
};
DebugService = __decorate([
    __param(0, IEditorService),
    __param(1, IPaneCompositePartService),
    __param(2, IViewsService),
    __param(3, IViewDescriptorService),
    __param(4, INotificationService),
    __param(5, IDialogService),
    __param(6, IWorkbenchLayoutService),
    __param(7, IWorkspaceContextService),
    __param(8, IContextKeyService),
    __param(9, ILifecycleService),
    __param(10, IInstantiationService),
    __param(11, IExtensionService),
    __param(12, IFileService),
    __param(13, IConfigurationService),
    __param(14, IExtensionHostDebugService),
    __param(15, IActivityService),
    __param(16, ICommandService),
    __param(17, IQuickInputService),
    __param(18, IWorkspaceTrustRequestService),
    __param(19, IUriIdentityService),
    __param(20, ITestService)
], DebugService);
export { DebugService };
export function getStackFrameThreadAndSessionToFocus(model, stackFrame, thread, session, avoidSession) {
    if (!session) {
        if (stackFrame || thread) {
            session = stackFrame ? stackFrame.thread.session : thread.session;
        }
        else {
            const sessions = model.getSessions();
            const stoppedSession = sessions.find(s => s.state === 2 /* State.Stopped */);
            // Make sure to not focus session that is going down
            session = stoppedSession || sessions.find(s => s !== avoidSession && s !== avoidSession?.parentSession) || (sessions.length ? sessions[0] : undefined);
        }
    }
    if (!thread) {
        if (stackFrame) {
            thread = stackFrame.thread;
        }
        else {
            const threads = session ? session.getAllThreads() : undefined;
            const stoppedThread = threads && threads.find(t => t.stopped);
            thread = stoppedThread || (threads && threads.length ? threads[0] : undefined);
        }
    }
    if (!stackFrame && thread) {
        stackFrame = thread.getTopStackFrame();
    }
    return { session, thread, stackFrame };
}
async function sendToOneOrAllSessions(model, session, send) {
    if (session) {
        await send(session);
    }
    else {
        await Promise.all(model.getSessions().map(s => send(s)));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLElBQUksTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQVcsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RSxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdkUsT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBYyxNQUFNLGdDQUFnQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFM0UsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENB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