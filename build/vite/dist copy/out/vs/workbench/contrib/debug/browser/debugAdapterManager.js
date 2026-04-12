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
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import * as strings from '../../../../base/common/strings.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import * as nls from '../../../../nls.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Breakpoints } from '../common/breakpoints.js';
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, INTERNAL_CONSOLE_OPTIONS_SCHEMA } from '../common/debug.js';
import { Debugger } from '../common/debugger.js';
import { breakpointsExtPoint, debuggersExtPoint, launchSchema, presentationSchema } from '../common/debugSchemas.js';
import { TaskDefinitionRegistry } from '../../tasks/common/taskDefinitionRegistry.js';
import { ITaskService } from '../../tasks/common/taskService.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
let AdapterManager = class AdapterManager extends Disposable {
    constructor(delegate, editorService, configurationService, quickInputService, instantiationService, commandService, extensionService, contextKeyService, languageService, dialogService, lifecycleService, tasksService, menuService) {
        super();
        this.delegate = delegate;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.commandService = commandService;
        this.extensionService = extensionService;
        this.contextKeyService = contextKeyService;
        this.languageService = languageService;
        this.dialogService = dialogService;
        this.lifecycleService = lifecycleService;
        this.tasksService = tasksService;
        this.menuService = menuService;
        this.debugAdapterFactories = new Map();
        this._onDidRegisterDebugger = this._register(new Emitter());
        this._onDidDebuggersExtPointRead = this._register(new Emitter());
        this.breakpointContributions = [];
        this.debuggerWhenKeys = new Set();
        this.taskLabels = [];
        this.usedDebugTypes = new Set();
        this.adapterDescriptorFactories = [];
        this.debuggers = [];
        this.registerListeners();
        this.contextKeyService.bufferChangeEvents(() => {
            this.debuggersAvailable = CONTEXT_DEBUGGERS_AVAILABLE.bindTo(contextKeyService);
            this.debugExtensionsAvailable = CONTEXT_DEBUG_EXTENSION_AVAILABLE.bindTo(contextKeyService);
        });
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(this.debuggerWhenKeys)) {
                this.debuggersAvailable.set(this.hasEnabledDebuggers());
                this.updateDebugAdapterSchema();
            }
        }));
        this._register(this.onDidDebuggersExtPointRead(() => {
            this.debugExtensionsAvailable.set(this.debuggers.length > 0);
        }));
        // generous debounce since this will end up calling `resolveTask` internally
        const updateTaskScheduler = this._register(new RunOnceScheduler(() => this.updateTaskLabels(), 5000));
        this._register(Event.any(tasksService.onDidChangeTaskConfig, tasksService.onDidChangeTaskProviders)(() => {
            updateTaskScheduler.cancel();
            updateTaskScheduler.schedule();
        }));
        this.lifecycleService.when(4 /* LifecyclePhase.Eventually */)
            .then(() => this.debugExtensionsAvailable.set(this.debuggers.length > 0)); // If no extensions with a debugger contribution are loaded
        this._register(delegate.onDidNewSession(s => {
            this.usedDebugTypes.add(s.configuration.type);
        }));
        updateTaskScheduler.schedule();
    }
    registerListeners() {
        debuggersExtPoint.setHandler((extensions, delta) => {
            delta.added.forEach(added => {
                added.value.forEach(rawAdapter => {
                    if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
                        added.collector.error(nls.localize('debugNoType', "Debugger 'type' can not be omitted and must be of type 'string'."));
                    }
                    if (rawAdapter.type !== '*') {
                        const existing = this.getDebugger(rawAdapter.type);
                        if (existing) {
                            existing.merge(rawAdapter, added.description);
                        }
                        else {
                            const dbg = this.instantiationService.createInstance(Debugger, this, rawAdapter, added.description);
                            dbg.when?.keys().forEach(key => this.debuggerWhenKeys.add(key));
                            this.debuggers.push(dbg);
                        }
                    }
                });
            });
            // take care of all wildcard contributions
            extensions.forEach(extension => {
                extension.value.forEach(rawAdapter => {
                    if (rawAdapter.type === '*') {
                        this.debuggers.forEach(dbg => dbg.merge(rawAdapter, extension.description));
                    }
                });
            });
            delta.removed.forEach(removed => {
                const removedTypes = removed.value.map(rawAdapter => rawAdapter.type);
                this.debuggers = this.debuggers.filter(d => removedTypes.indexOf(d.type) === -1);
            });
            this.updateDebugAdapterSchema();
            this._onDidDebuggersExtPointRead.fire();
        });
        breakpointsExtPoint.setHandler(extensions => {
            this.breakpointContributions = extensions.flatMap(ext => ext.value.map(breakpoint => this.instantiationService.createInstance(Breakpoints, breakpoint)));
        });
    }
    updateTaskLabels() {
        this.tasksService.getKnownTasks().then(tasks => {
            this.taskLabels = tasks.map(task => task._label);
            this.updateDebugAdapterSchema();
        });
    }
    updateDebugAdapterSchema() {
        // update the schema to include all attributes, snippets and types from extensions.
        const items = launchSchema.properties['configurations'].items;
        const taskSchema = TaskDefinitionRegistry.getJsonSchema();
        const definitions = {
            'common': {
                properties: {
                    'name': {
                        type: 'string',
                        description: nls.localize('debugName', "Name of configuration; appears in the launch configuration dropdown menu."),
                        default: 'Launch'
                    },
                    'debugServer': {
                        type: 'number',
                        description: nls.localize('debugServer', "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode"),
                        default: 4711
                    },
                    'preLaunchTask': {
                        anyOf: [taskSchema, {
                                type: ['string']
                            }],
                        default: '',
                        defaultSnippets: [{ body: { task: '', type: '' } }],
                        description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts."),
                        examples: this.taskLabels,
                    },
                    'postDebugTask': {
                        anyOf: [taskSchema, {
                                type: ['string'],
                            }],
                        default: '',
                        defaultSnippets: [{ body: { task: '', type: '' } }],
                        description: nls.localize('debugPostDebugTask', "Task to run after debug session ends."),
                        examples: this.taskLabels,
                    },
                    'presentation': presentationSchema,
                    'internalConsoleOptions': INTERNAL_CONSOLE_OPTIONS_SCHEMA,
                    'suppressMultipleSessionWarning': {
                        type: 'boolean',
                        description: nls.localize('suppressMultipleSessionWarning', "Disable the warning when trying to start the same debug configuration more than once."),
                        default: true
                    }
                }
            }
        };
        launchSchema.definitions = definitions;
        items.oneOf = [];
        items.defaultSnippets = [];
        this.debuggers.forEach(adapter => {
            const schemaAttributes = adapter.getSchemaAttributes(definitions);
            if (schemaAttributes && items.oneOf) {
                items.oneOf.push(...schemaAttributes);
            }
            const configurationSnippets = adapter.configurationSnippets;
            if (configurationSnippets && items.defaultSnippets) {
                items.defaultSnippets.push(...configurationSnippets);
            }
        });
        jsonRegistry.registerSchema(launchSchemaId, launchSchema);
    }
    registerDebugAdapterFactory(debugTypes, debugAdapterLauncher) {
        debugTypes.forEach(debugType => this.debugAdapterFactories.set(debugType, debugAdapterLauncher));
        this.debuggersAvailable.set(this.hasEnabledDebuggers());
        this._onDidRegisterDebugger.fire();
        return {
            dispose: () => {
                debugTypes.forEach(debugType => this.debugAdapterFactories.delete(debugType));
            }
        };
    }
    hasEnabledDebuggers() {
        for (const [type] of this.debugAdapterFactories) {
            const dbg = this.getDebugger(type);
            if (dbg && dbg.enabled) {
                return true;
            }
        }
        return false;
    }
    createDebugAdapter(session) {
        const factory = this.debugAdapterFactories.get(session.configuration.type);
        if (factory) {
            return factory.createDebugAdapter(session);
        }
        return undefined;
    }
    substituteVariables(debugType, folder, config) {
        const factory = this.debugAdapterFactories.get(debugType);
        if (factory) {
            return factory.substituteVariables(folder, config);
        }
        return Promise.resolve(config);
    }
    runInTerminal(debugType, args, sessionId) {
        const factory = this.debugAdapterFactories.get(debugType);
        if (factory) {
            return factory.runInTerminal(args, sessionId);
        }
        return Promise.resolve(void 0);
    }
    registerDebugAdapterDescriptorFactory(debugAdapterProvider) {
        this.adapterDescriptorFactories.push(debugAdapterProvider);
        return {
            dispose: () => {
                this.unregisterDebugAdapterDescriptorFactory(debugAdapterProvider);
            }
        };
    }
    unregisterDebugAdapterDescriptorFactory(debugAdapterProvider) {
        const ix = this.adapterDescriptorFactories.indexOf(debugAdapterProvider);
        if (ix >= 0) {
            this.adapterDescriptorFactories.splice(ix, 1);
        }
    }
    getDebugAdapterDescriptor(session) {
        const config = session.configuration;
        const providers = this.adapterDescriptorFactories.filter(p => p.type === config.type && p.createDebugAdapterDescriptor);
        if (providers.length === 1) {
            return providers[0].createDebugAdapterDescriptor(session);
        }
        else {
            // TODO@AW handle n > 1 case
        }
        return Promise.resolve(undefined);
    }
    getDebuggerLabel(type) {
        const dbgr = this.getDebugger(type);
        if (dbgr) {
            return dbgr.label;
        }
        return undefined;
    }
    get onDidRegisterDebugger() {
        return this._onDidRegisterDebugger.event;
    }
    get onDidDebuggersExtPointRead() {
        return this._onDidDebuggersExtPointRead.event;
    }
    canSetBreakpointsIn(model) {
        const languageId = model.getLanguageId();
        if (!languageId || languageId === 'jsonc' || languageId === 'log') {
            // do not allow breakpoints in our settings files and output
            return false;
        }
        if (this.configurationService.getValue('debug').allowBreakpointsEverywhere) {
            return true;
        }
        return this.breakpointContributions.some(breakpoints => breakpoints.language === languageId && breakpoints.enabled);
    }
    getDebugger(type) {
        return this.debuggers.find(dbg => strings.equalsIgnoreCase(dbg.type, type));
    }
    getEnabledDebugger(type) {
        const adapter = this.getDebugger(type);
        return adapter && adapter.enabled ? adapter : undefined;
    }
    someDebuggerInterestedInLanguage(languageId) {
        return !!this.debuggers
            .filter(d => d.enabled)
            .find(a => a.interestedInLanguage(languageId));
    }
    async guessDebugger(gettingConfigurations) {
        const activeTextEditorControl = this.editorService.activeTextEditorControl;
        let candidates = [];
        let languageLabel = null;
        let model = null;
        if (isCodeEditor(activeTextEditorControl)) {
            model = activeTextEditorControl.getModel();
            const language = model ? model.getLanguageId() : undefined;
            if (language) {
                languageLabel = this.languageService.getLanguageName(language);
            }
            const adapters = this.debuggers
                .filter(a => a.enabled)
                .filter(a => language && a.interestedInLanguage(language));
            if (adapters.length === 1) {
                return { debugger: adapters[0] };
            }
            if (adapters.length > 1) {
                candidates = adapters;
            }
        }
        // We want to get the debuggers that have configuration providers in the case we are fetching configurations
        // Or if a breakpoint can be set in the current file (good hint that an extension can handle it)
        if ((!languageLabel || gettingConfigurations || (model && this.canSetBreakpointsIn(model))) && candidates.length === 0) {
            await this.activateDebuggers('onDebugInitialConfigurations');
            candidates = this.debuggers
                .filter(a => a.enabled)
                .filter(dbg => dbg.hasInitialConfiguration() || dbg.hasDynamicConfigurationProviders() || dbg.hasConfigurationProvider());
        }
        if (candidates.length === 0 && languageLabel) {
            if (languageLabel.indexOf(' ') >= 0) {
                languageLabel = `'${languageLabel}'`;
            }
            const { confirmed } = await this.dialogService.confirm({
                type: Severity.Warning,
                message: nls.localize('CouldNotFindLanguage', "You don't have an extension for debugging {0}. Should we find a {0} extension in the Marketplace?", languageLabel),
                primaryButton: nls.localize({ key: 'findExtension', comment: ['&& denotes a mnemonic'] }, "&&Find {0} extension", languageLabel)
            });
            if (confirmed) {
                await this.commandService.executeCommand('debug.installAdditionalDebuggers', languageLabel);
            }
            return undefined;
        }
        this.initExtensionActivationsIfNeeded();
        candidates.sort((first, second) => first.label.localeCompare(second.label));
        candidates = candidates.filter(a => !a.isHiddenFromDropdown);
        const suggestedCandidates = [];
        const otherCandidates = [];
        candidates.forEach(d => {
            const descriptor = d.getMainExtensionDescriptor();
            if (descriptor.id && !!this.earlyActivatedExtensions?.has(descriptor.id)) {
                // Was activated early
                suggestedCandidates.push(d);
            }
            else if (this.usedDebugTypes.has(d.type)) {
                // Was used already
                suggestedCandidates.push(d);
            }
            else {
                otherCandidates.push(d);
            }
        });
        const picks = [];
        const dynamic = await this.delegate.configurationManager().getDynamicProviders();
        if (suggestedCandidates.length > 0) {
            picks.push({ type: 'separator', label: nls.localize('suggestedDebuggers', "Suggested") }, ...suggestedCandidates.map(c => ({ label: c.label, pick: () => ({ debugger: c }) })));
        }
        if (otherCandidates.length > 0) {
            if (picks.length > 0) {
                picks.push({ type: 'separator', label: '' });
            }
            picks.push(...otherCandidates.map(c => ({ label: c.label, pick: () => ({ debugger: c }) })));
        }
        if (dynamic.length) {
            if (picks.length) {
                picks.push({ type: 'separator', label: '' });
            }
            for (const d of dynamic) {
                picks.push({
                    label: nls.localize('moreOptionsForDebugType', "More {0} options...", d.label),
                    pick: async () => {
                        const cfg = await d.pick();
                        if (!cfg) {
                            return undefined;
                        }
                        return cfg && { debugger: this.getDebugger(d.type), withConfig: cfg };
                    },
                });
            }
        }
        picks.push({ type: 'separator', label: '' }, { label: languageLabel ? nls.localize('installLanguage', "Install an extension for {0}...", languageLabel) : nls.localize('installExt', "Install extension...") });
        const contributed = this.menuService.getMenuActions(MenuId.DebugCreateConfiguration, this.contextKeyService);
        for (const [, action] of contributed) {
            for (const item of action) {
                picks.push(item);
            }
        }
        const placeHolder = nls.localize('selectDebug', "Select debugger");
        return this.quickInputService.pick(picks, { activeItem: picks[0], placeHolder }).then(async (picked) => {
            if (picked && 'pick' in picked && typeof picked.pick === 'function') {
                return await picked.pick();
            }
            if (picked instanceof MenuItemAction) {
                picked.run();
                return;
            }
            if (picked) {
                this.commandService.executeCommand('debug.installAdditionalDebuggers', languageLabel);
            }
            return undefined;
        });
    }
    initExtensionActivationsIfNeeded() {
        if (!this.earlyActivatedExtensions) {
            this.earlyActivatedExtensions = new Set();
            const status = this.extensionService.getExtensionsStatus();
            for (const id in status) {
                if (!!status[id].activationTimes) {
                    this.earlyActivatedExtensions.add(id);
                }
            }
        }
    }
    async activateDebuggers(activationEvent, debugType) {
        this.initExtensionActivationsIfNeeded();
        const promises = [
            this.extensionService.activateByEvent(activationEvent),
            this.extensionService.activateByEvent('onDebug')
        ];
        if (debugType) {
            promises.push(this.extensionService.activateByEvent(`${activationEvent}:${debugType}`));
        }
        await Promise.all(promises);
    }
};
AdapterManager = __decorate([
    __param(1, IEditorService),
    __param(2, IConfigurationService),
    __param(3, IQuickInputService),
    __param(4, IInstantiationService),
    __param(5, ICommandService),
    __param(6, IExtensionService),
    __param(7, IContextKeyService),
    __param(8, ILanguageService),
    __param(9, IDialogService),
    __param(10, ILifecycleService),
    __param(11, ITaskService),
    __param(12, IMenuService)
], AdapterManager);
export { AdapterManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdBZGFwdGVyTWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdBZGFwdGVyTWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEtBQUssT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUVuRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsSUFBSSxjQUFjLEVBQTZCLE1BQU0scUVBQXFFLENBQUM7QUFDOUks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