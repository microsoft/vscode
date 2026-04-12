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
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { ModesRegistry } from '../../../../editor/common/languages/modesRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { OutputService } from './outputServices.js';
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_VIEW_ID, IOutputService, CONTEXT_IN_OUTPUT, LOG_MODE_ID, LOG_MIME, CONTEXT_OUTPUT_SCROLL_LOCK, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, Extensions, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, OUTPUT_FILTER_FOCUS_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor } from '../../../services/output/common/output.js';
import { OutputViewPane } from './outputView.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Disposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ILoggerService, LogLevel, LogLevelToLocalizedString, LogLevelToString } from '../../../../platform/log/common/log.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { IsWindowsContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { viewFilterSubmenu } from '../../../browser/parts/views/viewFilter.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { basename } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { IDefaultLogLevelsService } from '../../../services/log/common/defaultLogLevels.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { OutputAccessibilityHelp } from './outputAccessibilityHelp.js';
const IMPORTED_LOG_ID_PREFIX = 'importedLog.';
// Register Service
registerSingleton(IOutputService, OutputService, 1 /* InstantiationType.Delayed */);
// Register Accessibility Help
AccessibleViewRegistry.register(new OutputAccessibilityHelp());
// Register Output Mode
ModesRegistry.registerLanguage({
    id: OUTPUT_MODE_ID,
    extensions: [],
    mimetypes: [OUTPUT_MIME]
});
// Register Log Output Mode
ModesRegistry.registerLanguage({
    id: LOG_MODE_ID,
    extensions: [],
    mimetypes: [LOG_MIME]
});
// register output container
const outputViewIcon = registerIcon('output-view-icon', Codicon.output, nls.localize('outputViewIcon', 'View icon of the output view.'));
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: OUTPUT_VIEW_ID,
    title: nls.localize2('output', "Output"),
    icon: outputViewIcon,
    order: 1,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [OUTPUT_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: OUTPUT_VIEW_ID,
    hideIfEmpty: true,
}, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
        id: OUTPUT_VIEW_ID,
        name: nls.localize2('output', "Output"),
        containerIcon: outputViewIcon,
        canMoveView: true,
        canToggleVisibility: true,
        ctorDescriptor: new SyncDescriptor(OutputViewPane),
        openCommandActionDescriptor: {
            id: 'workbench.action.output.toggleOutput',
            mnemonicTitle: nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output"),
            keybindings: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 51 /* KeyCode.KeyU */,
                linux: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 38 /* KeyCode.KeyH */) // On Ubuntu Ctrl+Shift+U is taken by some global OS command
                }
            },
            order: 1,
        }
    }], VIEW_CONTAINER);
let OutputContribution = class OutputContribution extends Disposable {
    constructor(outputService, editorService) {
        super();
        this.outputService = outputService;
        this.editorService = editorService;
        this.registerActions();
    }
    registerActions() {
        this.registerSwitchOutputAction();
        this.registerAddCompoundLogAction();
        this.registerRemoveLogAction();
        this.registerShowOutputChannelsAction();
        this.registerClearOutputAction();
        this.registerToggleAutoScrollAction();
        this.registerOpenActiveOutputFileAction();
        this.registerOpenActiveOutputFileInAuxWindowAction();
        this.registerSaveActiveOutputAsAction();
        this.registerShowLogsAction();
        this.registerOpenLogFileAction();
        this.registerConfigureActiveOutputLogLevelAction();
        this.registerLogLevelFilterActions();
        this.registerClearFilterActions();
        this.registerExportLogsAction();
        this.registerImportLogAction();
    }
    registerSwitchOutputAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.output.action.switchBetweenOutputs`,
                    title: nls.localize('switchBetweenOutputs.label', "Switch Output"),
                });
            }
            async run(accessor, channelId) {
                if (channelId) {
                    accessor.get(IOutputService).showChannel(channelId, true);
                }
            }
        }));
        const switchOutputMenu = new MenuId('workbench.output.menu.switchOutput');
        this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
            submenu: switchOutputMenu,
            title: nls.localize('switchToOutput.label', "Switch Output"),
            group: 'navigation',
            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
            order: 1,
            isSelection: true
        }));
        const registeredChannels = new Map();
        this._register(toDisposable(() => dispose(registeredChannels.values())));
        const registerOutputChannels = (channels) => {
            for (const channel of channels) {
                const title = channel.label;
                const group = channel.user ? '2_user_outputchannels' : channel.extensionId ? '0_ext_outputchannels' : '1_core_outputchannels';
                registeredChannels.set(channel.id, registerAction2(class extends Action2 {
                    constructor() {
                        super({
                            id: `workbench.action.output.show.${channel.id}`,
                            title,
                            toggled: ACTIVE_OUTPUT_CHANNEL_CONTEXT.isEqualTo(channel.id),
                            menu: {
                                id: switchOutputMenu,
                                group,
                            }
                        });
                    }
                    async run(accessor) {
                        return accessor.get(IOutputService).showChannel(channel.id, true);
                    }
                }));
            }
        };
        registerOutputChannels(this.outputService.getChannelDescriptors());
        const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
        this._register(outputChannelRegistry.onDidRegisterChannel(e => {
            const channel = this.outputService.getChannelDescriptor(e);
            if (channel) {
                registerOutputChannels([channel]);
            }
        }));
        this._register(outputChannelRegistry.onDidRemoveChannel(e => {
            registeredChannels.get(e.id)?.dispose();
            registeredChannels.delete(e.id);
        }));
    }
    registerAddCompoundLogAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.output.addCompoundLog',
                    title: nls.localize2('addCompoundLog', "Add Compound Log..."),
                    category: nls.localize2('output', "Output"),
                    f1: true,
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: '2_add',
                        }],
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const extensionLogs = [], logs = [];
                for (const channel of outputService.getChannelDescriptors()) {
                    if (channel.log && !channel.user) {
                        if (channel.extensionId) {
                            extensionLogs.push(channel);
                        }
                        else {
                            logs.push(channel);
                        }
                    }
                }
                const entries = [];
                for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
                    entries.push(log);
                }
                if (extensionLogs.length && logs.length) {
                    entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
                }
                for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
                    entries.push(log);
                }
                const result = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log"), canPickMany: true });
                if (result?.length) {
                    outputService.showChannel(outputService.registerCompoundLogChannel(result));
                }
            }
        }));
    }
    registerRemoveLogAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.output.remove',
                    title: nls.localize2('removeLog', "Remove Output..."),
                    category: nls.localize2('output', "Output"),
                    f1: true
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const notificationService = accessor.get(INotificationService);
                const entries = outputService.getChannelDescriptors().filter(channel => channel.user);
                if (entries.length === 0) {
                    notificationService.info(nls.localize('nocustumoutput', "No custom outputs to remove."));
                    return;
                }
                const result = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log"), canPickMany: true });
                if (!result?.length) {
                    return;
                }
                const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
                for (const channel of result) {
                    outputChannelRegistry.removeChannel(channel.id);
                }
            }
        }));
    }
    registerShowOutputChannelsAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.showOutputChannels',
                    title: nls.localize2('showOutputChannels', "Show Output Channels..."),
                    category: nls.localize2('output', "Output"),
                    f1: true
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const extensionChannels = [], coreChannels = [];
                for (const channel of outputService.getChannelDescriptors()) {
                    if (channel.extensionId) {
                        extensionChannels.push(channel);
                    }
                    else {
                        coreChannels.push(channel);
                    }
                }
                const entries = [];
                for (const { id, label } of extensionChannels) {
                    entries.push({ id, label });
                }
                if (extensionChannels.length && coreChannels.length) {
                    entries.push({ type: 'separator' });
                }
                for (const { id, label } of coreChannels) {
                    entries.push({ id, label });
                }
                const entry = await quickInputService.pick(entries, { placeHolder: nls.localize('selectOutput', "Select Output Channel") });
                if (entry) {
                    return outputService.showChannel(entry.id);
                }
            }
        }));
    }
    registerClearOutputAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.output.action.clearOutput`,
                    title: nls.localize2('clearOutput.label', "Clear Output"),
                    category: Categories.View,
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: 'navigation',
                            order: 2
                        }, {
                            id: MenuId.CommandPalette
                        }, {
                            id: MenuId.EditorContext,
                            when: CONTEXT_IN_OUTPUT
                        }],
                    icon: Codicon.clearAll
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
                const activeChannel = outputService.getActiveChannel();
                if (activeChannel) {
                    activeChannel.clear();
                    accessibilitySignalService.playSignal(AccessibilitySignal.clear);
                }
            }
        }));
    }
    registerToggleAutoScrollAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.output.action.toggleAutoScroll`,
                    title: nls.localize2('toggleAutoScroll', "Toggle Auto Scrolling"),
                    tooltip: nls.localize('outputScrollOff', "Turn Auto Scrolling Off"),
                    menu: {
                        id: MenuId.ViewTitle,
                        when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID)),
                        group: 'navigation',
                        order: 3,
                    },
                    icon: Codicon.lock,
                    toggled: {
                        condition: CONTEXT_OUTPUT_SCROLL_LOCK,
                        icon: Codicon.unlock,
                        tooltip: nls.localize('outputScrollOn', "Turn Auto Scrolling On")
                    }
                });
            }
            async run(accessor) {
                const outputView = accessor.get(IViewsService).getActiveViewWithId(OUTPUT_VIEW_ID);
                outputView.scrollLock = !outputView.scrollLock;
            }
        }));
    }
    registerOpenActiveOutputFileAction() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.openActiveLogOutputFile`,
                    title: nls.localize2('openActiveOutputFile', "Open Output in Editor"),
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: 'navigation',
                            order: 4,
                            isHiddenByDefault: true
                        }],
                    icon: Codicon.goToFile,
                });
            }
            async run() {
                that.openActiveOutput();
            }
        }));
    }
    registerOpenActiveOutputFileInAuxWindowAction() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.openActiveLogOutputFileInNewWindow`,
                    title: nls.localize2('openActiveOutputFileInNewWindow', "Open Output in New Window"),
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: 'navigation',
                            order: 5,
                            isHiddenByDefault: true
                        }],
                    icon: Codicon.emptyWindow,
                });
            }
            async run() {
                that.openActiveOutput(AUX_WINDOW_GROUP);
            }
        }));
    }
    registerSaveActiveOutputAsAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.saveActiveLogOutputAs`,
                    title: nls.localize2('saveActiveOutputAs', "Save Output As..."),
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: '1_export',
                            order: 1
                        }],
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const channel = outputService.getActiveChannel();
                if (channel) {
                    const descriptor = outputService.getChannelDescriptors().find(c => c.id === channel.id);
                    if (descriptor) {
                        await outputService.saveOutputAs(undefined, descriptor);
                    }
                }
            }
        }));
    }
    async openActiveOutput(group) {
        const channel = this.outputService.getActiveChannel();
        if (channel) {
            await this.editorService.openEditor({
                resource: channel.uri,
                options: {
                    pinned: true,
                },
            }, group);
        }
    }
    registerConfigureActiveOutputLogLevelAction() {
        const logLevelMenu = new MenuId('workbench.output.menu.logLevel');
        this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
            submenu: logLevelMenu,
            title: nls.localize('logLevel.label', "Set Log Level..."),
            group: 'navigation',
            when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID), CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE),
            icon: Codicon.gear,
            order: 6
        }));
        let order = 0;
        const registerLogLevel = (logLevel) => {
            this._register(registerAction2(class extends Action2 {
                constructor() {
                    super({
                        id: `workbench.action.output.activeOutputLogLevel.${logLevel}`,
                        title: LogLevelToLocalizedString(logLevel).value,
                        toggled: CONTEXT_ACTIVE_OUTPUT_LEVEL.isEqualTo(LogLevelToString(logLevel)),
                        menu: {
                            id: logLevelMenu,
                            order: order++,
                            group: '0_level'
                        }
                    });
                }
                async run(accessor) {
                    const outputService = accessor.get(IOutputService);
                    const channel = outputService.getActiveChannel();
                    if (channel) {
                        const channelDescriptor = outputService.getChannelDescriptor(channel.id);
                        if (channelDescriptor) {
                            outputService.setLogLevel(channelDescriptor, logLevel);
                        }
                    }
                }
            }));
        };
        registerLogLevel(LogLevel.Trace);
        registerLogLevel(LogLevel.Debug);
        registerLogLevel(LogLevel.Info);
        registerLogLevel(LogLevel.Warning);
        registerLogLevel(LogLevel.Error);
        registerLogLevel(LogLevel.Off);
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.output.activeOutputLogLevelDefault`,
                    title: nls.localize('logLevelDefault.label', "Set As Default"),
                    menu: {
                        id: logLevelMenu,
                        order,
                        group: '1_default'
                    },
                    precondition: CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.negate()
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const loggerService = accessor.get(ILoggerService);
                const defaultLogLevelsService = accessor.get(IDefaultLogLevelsService);
                const channel = outputService.getActiveChannel();
                if (channel) {
                    const channelDescriptor = outputService.getChannelDescriptor(channel.id);
                    if (channelDescriptor && isSingleSourceOutputChannelDescriptor(channelDescriptor)) {
                        const logLevel = loggerService.getLogLevel(channelDescriptor.source.resource);
                        return await defaultLogLevelsService.setDefaultLogLevel(logLevel, channelDescriptor.extensionId);
                    }
                }
            }
        }));
    }
    registerShowLogsAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.showLogs',
                    title: nls.localize2('showLogs', "Show Logs..."),
                    category: Categories.Developer,
                    menu: {
                        id: MenuId.CommandPalette,
                    },
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const extensionLogs = [], logs = [];
                for (const channel of outputService.getChannelDescriptors()) {
                    if (channel.log) {
                        if (channel.extensionId) {
                            extensionLogs.push(channel);
                        }
                        else {
                            logs.push(channel);
                        }
                    }
                }
                const entries = [];
                for (const { id, label } of logs) {
                    entries.push({ id, label });
                }
                if (extensionLogs.length && logs.length) {
                    entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
                }
                for (const { id, label } of extensionLogs) {
                    entries.push({ id, label });
                }
                const entry = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log") });
                if (entry) {
                    return outputService.showChannel(entry.id);
                }
            }
        }));
    }
    registerOpenLogFileAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.openLogFile',
                    title: nls.localize2('openLogFile', "Open Log..."),
                    category: Categories.Developer,
                    menu: {
                        id: MenuId.CommandPalette,
                    },
                    metadata: {
                        description: 'workbench.action.openLogFile',
                        args: [{
                                name: 'logFile',
                                schema: {
                                    markdownDescription: nls.localize('logFile', "The id of the log file to open, for example `\"window\"`. Currently the best way to get this is to get the ID by checking the `workbench.action.output.show.<id>` commands"),
                                    type: 'string'
                                }
                            }]
                    },
                });
            }
            async run(accessor, args) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const editorService = accessor.get(IEditorService);
                let entry;
                const argName = args && typeof args === 'string' ? args : undefined;
                const extensionChannels = [];
                const coreChannels = [];
                for (const c of outputService.getChannelDescriptors()) {
                    if (c.log) {
                        const e = { id: c.id, label: c.label };
                        if (c.extensionId) {
                            extensionChannels.push(e);
                        }
                        else {
                            coreChannels.push(e);
                        }
                        if (e.id === argName) {
                            entry = e;
                        }
                    }
                }
                if (!entry) {
                    const entries = [...extensionChannels.sort((a, b) => a.label.localeCompare(b.label))];
                    if (entries.length && coreChannels.length) {
                        entries.push({ type: 'separator' });
                        entries.push(...coreChannels.sort((a, b) => a.label.localeCompare(b.label)));
                    }
                    entry = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlogFile', "Select Log File") });
                }
                if (entry?.id) {
                    const channel = outputService.getChannel(entry.id);
                    if (channel) {
                        await editorService.openEditor({
                            resource: channel.uri,
                            options: {
                                pinned: true,
                            }
                        });
                    }
                }
            }
        }));
    }
    registerLogLevelFilterActions() {
        let order = 0;
        const registerLogLevel = (logLevel, toggled) => {
            this._register(registerAction2(class extends ViewAction {
                constructor() {
                    super({
                        id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${LogLevelToString(logLevel)}`,
                        title: LogLevelToLocalizedString(logLevel).value,
                        metadata: {
                            description: localize2('toggleTraceDescription', "Show or hide {0} messages in the output", LogLevelToString(logLevel))
                        },
                        toggled,
                        menu: {
                            id: viewFilterSubmenu,
                            group: '2_log_filter',
                            when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID), CONTEXT_ACTIVE_LOG_FILE_OUTPUT),
                            order: order++
                        },
                        viewId: OUTPUT_VIEW_ID
                    });
                }
                async runInView(serviceAccessor, view) {
                    this.toggleLogLevelFilter(serviceAccessor.get(IOutputService), logLevel);
                }
                toggleLogLevelFilter(outputService, logLevel) {
                    switch (logLevel) {
                        case LogLevel.Trace:
                            outputService.filters.trace = !outputService.filters.trace;
                            break;
                        case LogLevel.Debug:
                            outputService.filters.debug = !outputService.filters.debug;
                            break;
                        case LogLevel.Info:
                            outputService.filters.info = !outputService.filters.info;
                            break;
                        case LogLevel.Warning:
                            outputService.filters.warning = !outputService.filters.warning;
                            break;
                        case LogLevel.Error:
                            outputService.filters.error = !outputService.filters.error;
                            break;
                    }
                }
            }));
        };
        registerLogLevel(LogLevel.Trace, SHOW_TRACE_FILTER_CONTEXT);
        registerLogLevel(LogLevel.Debug, SHOW_DEBUG_FILTER_CONTEXT);
        registerLogLevel(LogLevel.Info, SHOW_INFO_FILTER_CONTEXT);
        registerLogLevel(LogLevel.Warning, SHOW_WARNING_FILTER_CONTEXT);
        registerLogLevel(LogLevel.Error, SHOW_ERROR_FILTER_CONTEXT);
    }
    registerClearFilterActions() {
        this._register(registerAction2(class extends ViewAction {
            constructor() {
                super({
                    id: `workbench.actions.${OUTPUT_VIEW_ID}.clearFilterText`,
                    title: localize('clearFiltersText', "Clear filters text"),
                    keybinding: {
                        when: OUTPUT_FILTER_FOCUS_CONTEXT,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: 9 /* KeyCode.Escape */
                    },
                    viewId: OUTPUT_VIEW_ID
                });
            }
            async runInView(serviceAccessor, outputView) {
                outputView.clearFilterText();
            }
        }));
    }
    registerExportLogsAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.exportLogs`,
                    title: nls.localize2('exportLogs', "Export Logs..."),
                    f1: true,
                    category: Categories.Developer,
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: '1_export',
                            order: 2,
                        }],
                });
            }
            async run(accessor, arg) {
                const outputService = accessor.get(IOutputService);
                const quickInputService = accessor.get(IQuickInputService);
                const extensionLogs = [], logs = [], userLogs = [];
                for (const channel of outputService.getChannelDescriptors()) {
                    if (channel.log) {
                        if (channel.extensionId) {
                            extensionLogs.push(channel);
                        }
                        else if (channel.user) {
                            userLogs.push(channel);
                        }
                        else {
                            logs.push(channel);
                        }
                    }
                }
                const entries = [];
                for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
                    entries.push(log);
                }
                if (extensionLogs.length && logs.length) {
                    entries.push({ type: 'separator', label: nls.localize('extensionLogs', "Extension Logs") });
                }
                for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
                    entries.push(log);
                }
                if (userLogs.length && (extensionLogs.length || logs.length)) {
                    entries.push({ type: 'separator', label: nls.localize('userLogs', "User Logs") });
                }
                for (const log of userLogs.sort((a, b) => a.label.localeCompare(b.label))) {
                    entries.push(log);
                }
                let selectedOutputChannels;
                if (arg?.outputChannelIds) {
                    const requestedIdsNormalized = arg.outputChannelIds.map(id => id.trim().toLowerCase());
                    const candidates = entries.filter((e) => {
                        const isSeparator = hasKey(e, { type: true }) && e.type === 'separator';
                        return !isSeparator;
                    });
                    if (requestedIdsNormalized.includes('*')) {
                        selectedOutputChannels = candidates;
                    }
                    else {
                        selectedOutputChannels = candidates.filter(candidate => requestedIdsNormalized.includes(candidate.id.toLowerCase()));
                    }
                }
                else {
                    selectedOutputChannels = await quickInputService.pick(entries, { placeHolder: nls.localize('selectlog', "Select Log"), canPickMany: true });
                }
                if (selectedOutputChannels?.length) {
                    await outputService.saveOutputAs(arg?.outputPath, ...selectedOutputChannels);
                }
            }
        }));
    }
    registerImportLogAction() {
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: `workbench.action.importLog`,
                    title: nls.localize2('importLog', "Import Log..."),
                    f1: true,
                    category: Categories.Developer,
                    menu: [{
                            id: MenuId.ViewTitle,
                            when: ContextKeyExpr.equals('view', OUTPUT_VIEW_ID),
                            group: '2_add',
                            order: 2,
                        }],
                });
            }
            async run(accessor) {
                const outputService = accessor.get(IOutputService);
                const fileDialogService = accessor.get(IFileDialogService);
                const result = await fileDialogService.showOpenDialog({
                    title: nls.localize('importLogFile', "Import Log File"),
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: true,
                    filters: [{
                            name: nls.localize('logFiles', "Log Files"),
                            extensions: ['log']
                        }]
                });
                if (result?.length) {
                    const channelName = basename(result[0]);
                    const channelId = `${IMPORTED_LOG_ID_PREFIX}${Date.now()}`;
                    // Register and show the channel
                    Registry.as(Extensions.OutputChannels).registerChannel({
                        id: channelId,
                        label: channelName,
                        log: true,
                        user: true,
                        source: result.length === 1
                            ? { resource: result[0] }
                            : result.map(resource => ({ resource, name: basename(resource).split('.')[0] }))
                    });
                    outputService.showChannel(channelId);
                }
            }
        }));
    }
};
OutputContribution = __decorate([
    __param(0, IOutputService),
    __param(1, IEditorService)
], OutputContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(OutputContribution, 3 /* LifecyclePhase.Restored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    id: 'output',
    order: 30,
    title: nls.localize('output', "Output"),
    type: 'object',
    properties: {
        'output.smartScroll.enabled': {
            type: 'boolean',
            description: nls.localize('output.smartScroll.enabled', "Enable/disable the ability of smart scrolling in the output view. Smart scrolling allows you to lock scrolling automatically when you click in the output view and unlocks when you click in the last line."),
            default: true,
            scope: 4 /* ConfigurationScope.WINDOW */,
            tags: ['output']
        }
    }
});
KeybindingsRegistry.registerKeybindingRule({
    id: 'cursorWordAccessibilityLeft',
    when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */
});
KeybindingsRegistry.registerKeybindingRule({
    id: 'cursorWordAccessibilityLeftSelect',
    when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */
});
KeybindingsRegistry.registerKeybindingRule({
    id: 'cursorWordAccessibilityRight',
    when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */
});
KeybindingsRegistry.registerKeybindingRule({
    id: 'cursorWordAccessibilityRightSelect',
    when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL291dHB1dC9icm93c2VyL291dHB1dC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQVUsUUFBUSxFQUFXLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLGlCQUFpQixFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsMEJBQTBCLEVBQTRCLDZCQUE2QixFQUFFLG9DQUFvQyxFQUEwQixVQUFVLEVBQUUsMkJBQTJCLEVBQUUsc0NBQXNDLEVBQUUsd0JBQXdCLEVBQUUseUJBQXlCLEVBQUUseUJBQXlCLEVBQUUseUJBQXlCLEVBQUUsMkJBQTJCLEVBQUUsMkJBQTJCLEVBQUUsOEJBQThCLEVBQUUscUNBQXFDLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsbkIsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQW1DLFVBQVUsSUFBSSxtQkFBbUIsRUFBMEIsTUFBTSxrQ0FBa0MsQ0FBQztBQUc5SSxPQUFPLEVBQWlFLFVBQVUsSUFBSSx1QkFBdUIsRUFBa0IsTUFBTSwwQkFBMEIsQ0FBQztBQUNoSyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQXNCLE1BQU0sb0VBQW9FLENBQUM7QUFDdkssT0FBTyxFQUFrQixrQkFBa0IsRUFBdUMsTUFBTSxzREFBc0QsQ0FBQztBQUMvSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQXlCLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxjQUFjLEVBQXdCLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFDbEosT0FBTyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUseUJBQXlCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvSCxPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUM5RyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RSxNQUFNLHNCQUFzQixHQUFHLGNBQWMsQ0FBQztBQUU5QyxtQkFBbUI7QUFDbkIsaUJBQWlCLENBQUMsY0FBYyxFQUFFLGFBQWEsb0NBQTRCLENBQUM7QUFFNUUsOEJBQThCO0FBQzlCLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztBQUUvRCx1QkFBdUI7QUFDdkIsYUFBYSxDQUFDLGdCQUFnQixDQUFDO0lBQzlCLEVBQUUsRUFBRSxjQUFjO0lBQ2xCLFVBQVUsRUFBRSxFQUFFO0lBQ2QsU0FBUyxFQUFFLENBQUMsV0FBVyxDQUFDO0NBQ3hCLENBQUMsQ0FBQztBQUVILDJCQUEyQjtBQUMzQixhQUFhLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsRUFBRSxFQUFFLFdBQVc7SUFDZixVQUFVLEVBQUUsRUFBRTtJQUNkLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQztDQUNyQixDQUFDLENBQUM7QUFFSCw0QkFBNEI7QUFDNUIsTUFBTSxjQUFjLEdBQUcsWUFBWSxDQUFDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLENBQUM7QUFDekksTUFBTSxjQUFjLEdBQWtCLFFBQVEsQ0FBQyxFQUFFLENBQTBCLHVCQUF1QixDQUFDLHNCQUFzQixDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDaEosRUFBRSxFQUFFLGNBQWM7SUFDbEIsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQztJQUN4QyxJQUFJLEVBQUUsY0FBYztJQUNwQixLQUFLLEVBQUUsQ0FBQztJQUNSLGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLGNBQWMsRUFBRSxFQUFFLG9DQUFvQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDdkgsU0FBUyxFQUFFLGNBQWM7SUFDekIsV0FBVyxFQUFFLElBQUk7Q0FDakIsdUNBQStCLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUVwRSxRQUFRLENBQUMsRUFBRSxDQUFpQix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRixFQUFFLEVBQUUsY0FBYztRQUNsQixJQUFJLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO1FBQ3ZDLGFBQWEsRUFBRSxjQUFjO1FBQzdCLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLG1CQUFtQixFQUFFLElBQUk7UUFDekIsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLGNBQWMsQ0FBQztRQUNsRCwyQkFBMkIsRUFBRTtZQUM1QixFQUFFLEVBQUUsc0NBQXNDO1lBQzFDLGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxVQUFVLENBQUM7WUFDdEcsV0FBVyxFQUFFO2dCQUNaLE9BQU8sRUFBRSxtREFBNkIsd0JBQWU7Z0JBQ3JELEtBQUssRUFBRTtvQkFDTixPQUFPLEVBQUUsUUFBUSxDQUFDLGlEQUE2QixFQUFFLGlEQUE2QixDQUFDLENBQUUsNERBQTREO2lCQUM3STthQUNEO1lBQ0QsS0FBSyxFQUFFLENBQUM7U0FDUjtLQUNELENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUVwQixJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFDMUMsWUFDa0MsYUFBNkIsRUFDN0IsYUFBNkI7UUFFOUQsS0FBSyxFQUFFLENBQUM7UUFIeUIsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQzdCLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUc5RCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDeEIsQ0FBQztJQUVPLGVBQWU7UUFDdEIsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLENBQUM7UUFDeEMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLDhCQUE4QixFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLENBQUM7UUFDckQsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLENBQUM7UUFDeEMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLENBQUM7UUFDbkQsSUFBSSxDQUFDLDZCQUE2QixFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVPLDBCQUEwQjtRQUNqQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztZQUNuRDtnQkFDQyxLQUFLLENBQUM7b0JBQ0wsRUFBRSxFQUFFLDhDQUE4QztvQkFDbEQsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsZUFBZSxDQUFDO2lCQUNsRSxDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLFNBQWlCO2dCQUN0RCxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNmLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDM0QsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRTtZQUM1RCxPQUFPLEVBQUUsZ0JBQWdCO1lBQ3pCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGVBQWUsQ0FBQztZQUM1RCxLQUFLLEVBQUUsWUFBWTtZQUNuQixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDO1lBQ25ELEtBQUssRUFBRSxDQUFDO1lBQ1IsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQyxDQUFDLENBQUM7UUFDSixNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6RSxNQUFNLHNCQUFzQixHQUFHLENBQUMsUUFBb0MsRUFBRSxFQUFFO1lBQ3ZFLEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7Z0JBQzVCLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUM7Z0JBQzlILGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztvQkFDdkU7d0JBQ0MsS0FBSyxDQUFDOzRCQUNMLEVBQUUsRUFBRSxnQ0FBZ0MsT0FBTyxDQUFDLEVBQUUsRUFBRTs0QkFDaEQsS0FBSzs0QkFDTCxPQUFPLEVBQUUsNkJBQTZCLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7NEJBQzVELElBQUksRUFBRTtnQ0FDTCxFQUFFLEVBQUUsZ0JBQWdCO2dDQUNwQixLQUFLOzZCQUNMO3lCQUNELENBQUMsQ0FBQztvQkFDSixDQUFDO29CQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7d0JBQ25DLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDbkUsQ0FBQztpQkFDRCxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDLENBQUM7UUFDRixzQkFBc0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUNuRSxNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM3RixJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzdELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0QsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixzQkFBc0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzNELGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDRCQUE0QjtRQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztZQUNuRDtnQkFDQyxLQUFLLENBQUM7b0JBQ0wsRUFBRSxFQUFFLHdDQUF3QztvQkFDNUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLENBQUM7b0JBQzdELFFBQVEsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUM7b0JBQzNDLEVBQUUsRUFBRSxJQUFJO29CQUNSLElBQUksRUFBRSxDQUFDOzRCQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUzs0QkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQzs0QkFDbkQsS0FBSyxFQUFFLE9BQU87eUJBQ2QsQ0FBQztpQkFDRixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtnQkFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRTNELE1BQU0sYUFBYSxHQUErQixFQUFFLEVBQUUsSUFBSSxHQUErQixFQUFFLENBQUM7Z0JBQzVGLEtBQUssTUFBTSxPQUFPLElBQUksYUFBYSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztvQkFDN0QsSUFBSSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNsQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0QkFDekIsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDN0IsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQ3BCLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO2dCQUNELE1BQU0sT0FBTyxHQUEwRCxFQUFFLENBQUM7Z0JBQzFFLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZFLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25CLENBQUM7Z0JBQ0QsSUFBSSxhQUFhLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDekMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RixDQUFDO2dCQUNELEtBQUssTUFBTSxHQUFHLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2hGLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25CLENBQUM7Z0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUNsSSxJQUFJLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztvQkFDcEIsYUFBYSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDN0UsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyx1QkFBdUI7UUFDOUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDbkQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSxnQ0FBZ0M7b0JBQ3BDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQztvQkFDckQsUUFBUSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQztvQkFDM0MsRUFBRSxFQUFFLElBQUk7aUJBQ1IsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7Z0JBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLG1CQUFtQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxPQUFPLEdBQW9DLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkgsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUMxQixtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7b0JBQ3pGLE9BQU87Z0JBQ1IsQ0FBQztnQkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ2xJLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUM7b0JBQ3JCLE9BQU87Z0JBQ1IsQ0FBQztnQkFDRCxNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDN0YsS0FBSyxNQUFNLE9BQU8sSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDOUIscUJBQXFCLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakQsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxnQ0FBZ0M7UUFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDbkQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSxxQ0FBcUM7b0JBQ3pDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLG9CQUFvQixFQUFFLHlCQUF5QixDQUFDO29CQUNyRSxRQUFRLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO29CQUMzQyxFQUFFLEVBQUUsSUFBSTtpQkFDUixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtnQkFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzNELE1BQU0saUJBQWlCLEdBQUcsRUFBRSxFQUFFLFlBQVksR0FBRyxFQUFFLENBQUM7Z0JBQ2hELEtBQUssTUFBTSxPQUFPLElBQUksYUFBYSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztvQkFDN0QsSUFBSSxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3pCLGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDakMsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzVCLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxNQUFNLE9BQU8sR0FBNEQsRUFBRSxDQUFDO2dCQUM1RSxLQUFLLE1BQU0sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksaUJBQWlCLEVBQUUsQ0FBQztvQkFDL0MsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO2dCQUNELElBQUksaUJBQWlCLENBQUMsTUFBTSxJQUFJLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDckQsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQyxDQUFDO2dCQUNELEtBQUssTUFBTSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDMUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO2dCQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUgsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDWCxPQUFPLGFBQWEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLHlCQUF5QjtRQUNoQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztZQUNuRDtnQkFDQyxLQUFLLENBQUM7b0JBQ0wsRUFBRSxFQUFFLHFDQUFxQztvQkFDekMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQUUsY0FBYyxDQUFDO29CQUN6RCxRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7b0JBQ3pCLElBQUksRUFBRSxDQUFDOzRCQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUzs0QkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQzs0QkFDbkQsS0FBSyxFQUFFLFlBQVk7NEJBQ25CLEtBQUssRUFBRSxDQUFDO3lCQUNSLEVBQUU7NEJBQ0YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO3lCQUN6QixFQUFFOzRCQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTs0QkFDeEIsSUFBSSxFQUFFLGlCQUFpQjt5QkFDdkIsQ0FBQztvQkFDRixJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7aUJBQ3RCLENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO2dCQUNuQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLDBCQUEwQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDN0UsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3ZELElBQUksYUFBYSxFQUFFLENBQUM7b0JBQ25CLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDdEIsMEJBQTBCLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNsRSxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDhCQUE4QjtRQUNyQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztZQUNuRDtnQkFDQyxLQUFLLENBQUM7b0JBQ0wsRUFBRSxFQUFFLDBDQUEwQztvQkFDOUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEVBQUUsdUJBQXVCLENBQUM7b0JBQ2pFLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLHlCQUF5QixDQUFDO29CQUNuRSxJQUFJLEVBQUU7d0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTO3dCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQzt3QkFDdkUsS0FBSyxFQUFFLFlBQVk7d0JBQ25CLEtBQUssRUFBRSxDQUFDO3FCQUNSO29CQUNELElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtvQkFDbEIsT0FBTyxFQUFFO3dCQUNSLFNBQVMsRUFBRSwwQkFBMEI7d0JBQ3JDLElBQUksRUFBRSxPQUFPLENBQUMsTUFBTTt3QkFDcEIsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsd0JBQXdCLENBQUM7cUJBQ2pFO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO2dCQUNuQyxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLG1CQUFtQixDQUFpQixjQUFjLENBQUUsQ0FBQztnQkFDcEcsVUFBVSxDQUFDLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7WUFDaEQsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGtDQUFrQztRQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDbkQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSwwQ0FBMEM7b0JBQzlDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHNCQUFzQixFQUFFLHVCQUF1QixDQUFDO29CQUNyRSxJQUFJLEVBQUUsQ0FBQzs0QkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVM7NEJBQ3BCLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUM7NEJBQ25ELEtBQUssRUFBRSxZQUFZOzRCQUNuQixLQUFLLEVBQUUsQ0FBQzs0QkFDUixpQkFBaUIsRUFBRSxJQUFJO3lCQUN2QixDQUFDO29CQUNGLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUTtpQkFDdEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELEtBQUssQ0FBQyxHQUFHO2dCQUNSLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3pCLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyw2Q0FBNkM7UUFDcEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO1lBQ25EO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUscURBQXFEO29CQUN6RCxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxpQ0FBaUMsRUFBRSwyQkFBMkIsQ0FBQztvQkFDcEYsSUFBSSxFQUFFLENBQUM7NEJBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTOzRCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDOzRCQUNuRCxLQUFLLEVBQUUsWUFBWTs0QkFDbkIsS0FBSyxFQUFFLENBQUM7NEJBQ1IsaUJBQWlCLEVBQUUsSUFBSTt5QkFDdkIsQ0FBQztvQkFDRixJQUFJLEVBQUUsT0FBTyxDQUFDLFdBQVc7aUJBQ3pCLENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRztnQkFDUixJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUN6QyxDQUFDO1NBQ0QsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sZ0NBQWdDO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO1lBQ25EO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUsd0NBQXdDO29CQUM1QyxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxtQkFBbUIsQ0FBQztvQkFDL0QsSUFBSSxFQUFFLENBQUM7NEJBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTOzRCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDOzRCQUNuRCxLQUFLLEVBQUUsVUFBVTs0QkFDakIsS0FBSyxFQUFFLENBQUM7eUJBQ1IsQ0FBQztpQkFDRixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtnQkFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2pELElBQUksT0FBTyxFQUFFLENBQUM7b0JBQ2IsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ3hGLElBQUksVUFBVSxFQUFFLENBQUM7d0JBQ2hCLE1BQU0sYUFBYSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7b0JBQ3pELENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBNkI7UUFDM0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3RELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDO2dCQUNuQyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUc7Z0JBQ3JCLE9BQU8sRUFBRTtvQkFDUixNQUFNLEVBQUUsSUFBSTtpQkFDWjthQUNELEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVPLDJDQUEyQztRQUNsRCxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFO1lBQzVELE9BQU8sRUFBRSxZQUFZO1lBQ3JCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGtCQUFrQixDQUFDO1lBQ3pELEtBQUssRUFBRSxZQUFZO1lBQ25CLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxFQUFFLG9DQUFvQyxDQUFDO1lBQzdHLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtZQUNsQixLQUFLLEVBQUUsQ0FBQztTQUNSLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLFFBQWtCLEVBQUUsRUFBRTtZQUMvQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztnQkFDbkQ7b0JBQ0MsS0FBSyxDQUFDO3dCQUNMLEVBQUUsRUFBRSxnREFBZ0QsUUFBUSxFQUFFO3dCQUM5RCxLQUFLLEVBQUUseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSzt3QkFDaEQsT0FBTyxFQUFFLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDMUUsSUFBSSxFQUFFOzRCQUNMLEVBQUUsRUFBRSxZQUFZOzRCQUNoQixLQUFLLEVBQUUsS0FBSyxFQUFFOzRCQUNkLEtBQUssRUFBRSxTQUFTO3lCQUNoQjtxQkFDRCxDQUFDLENBQUM7Z0JBQ0osQ0FBQztnQkFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO29CQUNuQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO29CQUNuRCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDakQsSUFBSSxPQUFPLEVBQUUsQ0FBQzt3QkFDYixNQUFNLGlCQUFpQixHQUFHLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ3pFLElBQUksaUJBQWlCLEVBQUUsQ0FBQzs0QkFDdkIsYUFBYSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQzt3QkFDeEQsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7YUFDRCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRS9CLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO1lBQ25EO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUscURBQXFEO29CQUN6RCxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxnQkFBZ0IsQ0FBQztvQkFDOUQsSUFBSSxFQUFFO3dCQUNMLEVBQUUsRUFBRSxZQUFZO3dCQUNoQixLQUFLO3dCQUNMLEtBQUssRUFBRSxXQUFXO3FCQUNsQjtvQkFDRCxZQUFZLEVBQUUsc0NBQXNDLENBQUMsTUFBTSxFQUFFO2lCQUM3RCxDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtnQkFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7Z0JBQ3ZFLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNqRCxJQUFJLE9BQU8sRUFBRSxDQUFDO29CQUNiLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDekUsSUFBSSxpQkFBaUIsSUFBSSxxQ0FBcUMsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7d0JBQ25GLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUM5RSxPQUFPLE1BQU0sdUJBQXVCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO29CQUNsRyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sc0JBQXNCO1FBQzdCLElBQUksQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEtBQU0sU0FBUSxPQUFPO1lBQ25EO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUsMkJBQTJCO29CQUMvQixLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO29CQUNoRCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7b0JBQzlCLElBQUksRUFBRTt3QkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLGNBQWM7cUJBQ3pCO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO2dCQUNuQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDM0QsTUFBTSxhQUFhLEdBQUcsRUFBRSxFQUFFLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQ3BDLEtBQUssTUFBTSxPQUFPLElBQUksYUFBYSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztvQkFDN0QsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQ2pCLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDOzRCQUN6QixhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUM3QixDQUFDOzZCQUFNLENBQUM7NEJBQ1AsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDcEIsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsTUFBTSxPQUFPLEdBQTRELEVBQUUsQ0FBQztnQkFDNUUsS0FBSyxNQUFNLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDO29CQUNsQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQzdCLENBQUM7Z0JBQ0QsSUFBSSxhQUFhLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDekMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3RixDQUFDO2dCQUNELEtBQUssTUFBTSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxhQUFhLEVBQUUsQ0FBQztvQkFDM0MsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixDQUFDO2dCQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlHLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ1gsT0FBTyxhQUFhLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUMsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyx5QkFBeUI7UUFDaEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDbkQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSw4QkFBOEI7b0JBQ2xDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUM7b0JBQ2xELFFBQVEsRUFBRSxVQUFVLENBQUMsU0FBUztvQkFDOUIsSUFBSSxFQUFFO3dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsY0FBYztxQkFDekI7b0JBQ0QsUUFBUSxFQUFFO3dCQUNULFdBQVcsRUFBRSw4QkFBOEI7d0JBQzNDLElBQUksRUFBRSxDQUFDO2dDQUNOLElBQUksRUFBRSxTQUFTO2dDQUNmLE1BQU0sRUFBRTtvQ0FDUCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSw0S0FBNEssQ0FBQztvQ0FDMU4sSUFBSSxFQUFFLFFBQVE7aUNBQ2Q7NkJBQ0QsQ0FBQztxQkFDRjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQixFQUFFLElBQWM7Z0JBQ25ELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuRCxJQUFJLEtBQWlDLENBQUM7Z0JBQ3RDLE1BQU0sT0FBTyxHQUFHLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUNwRSxNQUFNLGlCQUFpQixHQUFxQixFQUFFLENBQUM7Z0JBQy9DLE1BQU0sWUFBWSxHQUFxQixFQUFFLENBQUM7Z0JBQzFDLEtBQUssTUFBTSxDQUFDLElBQUksYUFBYSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztvQkFDdkQsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQ1gsTUFBTSxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUN2QyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0QkFDbkIsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMzQixDQUFDOzZCQUFNLENBQUM7NEJBQ1AsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDdEIsQ0FBQzt3QkFDRCxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssT0FBTyxFQUFFLENBQUM7NEJBQ3RCLEtBQUssR0FBRyxDQUFDLENBQUM7d0JBQ1gsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNaLE1BQU0sT0FBTyxHQUFxQixDQUFDLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEcsSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDM0MsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO3dCQUNwQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlFLENBQUM7b0JBQ0QsS0FBSyxHQUErQixNQUFNLGlCQUFpQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlJLENBQUM7Z0JBQ0QsSUFBSSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUM7b0JBQ2YsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ25ELElBQUksT0FBTyxFQUFFLENBQUM7d0JBQ2IsTUFBTSxhQUFhLENBQUMsVUFBVSxDQUFDOzRCQUM5QixRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUc7NEJBQ3JCLE9BQU8sRUFBRTtnQ0FDUixNQUFNLEVBQUUsSUFBSTs2QkFDWjt5QkFDRCxDQUFDLENBQUM7b0JBQ0osQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLDZCQUE2QjtRQUNwQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLGdCQUFnQixHQUFHLENBQUMsUUFBa0IsRUFBRSxPQUE2QixFQUFFLEVBQUU7WUFDOUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLFVBQTBCO2dCQUN0RTtvQkFDQyxLQUFLLENBQUM7d0JBQ0wsRUFBRSxFQUFFLHFCQUFxQixjQUFjLFdBQVcsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEVBQUU7d0JBQzlFLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLO3dCQUNoRCxRQUFRLEVBQUU7NEJBQ1QsV0FBVyxFQUFFLFNBQVMsQ0FBQyx3QkFBd0IsRUFBRSx5Q0FBeUMsRUFBRSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQzt5QkFDdkg7d0JBQ0QsT0FBTzt3QkFDUCxJQUFJLEVBQUU7NEJBQ0wsRUFBRSxFQUFFLGlCQUFpQjs0QkFDckIsS0FBSyxFQUFFLGNBQWM7NEJBQ3JCLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxFQUFFLDhCQUE4QixDQUFDOzRCQUN2RyxLQUFLLEVBQUUsS0FBSyxFQUFFO3lCQUNkO3dCQUNELE1BQU0sRUFBRSxjQUFjO3FCQUN0QixDQUFDLENBQUM7Z0JBQ0osQ0FBQztnQkFDRCxLQUFLLENBQUMsU0FBUyxDQUFDLGVBQWlDLEVBQUUsSUFBb0I7b0JBQ3RFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUMxRSxDQUFDO2dCQUNPLG9CQUFvQixDQUFDLGFBQTZCLEVBQUUsUUFBa0I7b0JBQzdFLFFBQVEsUUFBUSxFQUFFLENBQUM7d0JBQ2xCLEtBQUssUUFBUSxDQUFDLEtBQUs7NEJBQ2xCLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7NEJBQzNELE1BQU07d0JBQ1AsS0FBSyxRQUFRLENBQUMsS0FBSzs0QkFDbEIsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQzs0QkFDM0QsTUFBTTt3QkFDUCxLQUFLLFFBQVEsQ0FBQyxJQUFJOzRCQUNqQixhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDOzRCQUN6RCxNQUFNO3dCQUNQLEtBQUssUUFBUSxDQUFDLE9BQU87NEJBQ3BCLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7NEJBQy9ELE1BQU07d0JBQ1AsS0FBSyxRQUFRLENBQUMsS0FBSzs0QkFDbEIsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQzs0QkFDM0QsTUFBTTtvQkFDUixDQUFDO2dCQUNGLENBQUM7YUFDRCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUM1RCxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFDNUQsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQzFELGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUNoRSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLHlCQUF5QixDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVPLDBCQUEwQjtRQUNqQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsVUFBMEI7WUFDdEU7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSxxQkFBcUIsY0FBYyxrQkFBa0I7b0JBQ3pELEtBQUssRUFBRSxRQUFRLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUM7b0JBQ3pELFVBQVUsRUFBRTt3QkFDWCxJQUFJLEVBQUUsMkJBQTJCO3dCQUNqQyxNQUFNLDZDQUFtQzt3QkFDekMsT0FBTyx3QkFBZ0I7cUJBQ3ZCO29CQUNELE1BQU0sRUFBRSxjQUFjO2lCQUN0QixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsS0FBSyxDQUFDLFNBQVMsQ0FBQyxlQUFpQyxFQUFFLFVBQTBCO2dCQUM1RSxVQUFVLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDOUIsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLHdCQUF3QjtRQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztZQUNuRDtnQkFDQyxLQUFLLENBQUM7b0JBQ0wsRUFBRSxFQUFFLDZCQUE2QjtvQkFDakMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDO29CQUNwRCxFQUFFLEVBQUUsSUFBSTtvQkFDUixRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7b0JBQzlCLElBQUksRUFBRSxDQUFDOzRCQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUzs0QkFDcEIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQzs0QkFDbkQsS0FBSyxFQUFFLFVBQVU7NEJBQ2pCLEtBQUssRUFBRSxDQUFDO3lCQUNSLENBQUM7aUJBQ0YsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxHQUF1RDtnQkFDNUYsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDbkQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzNELE1BQU0sYUFBYSxHQUErQixFQUFFLEVBQUUsSUFBSSxHQUErQixFQUFFLEVBQUUsUUFBUSxHQUErQixFQUFFLENBQUM7Z0JBQ3ZJLEtBQUssTUFBTSxPQUFPLElBQUksYUFBYSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQztvQkFDN0QsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7d0JBQ2pCLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDOzRCQUN6QixhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUM3QixDQUFDOzZCQUFNLElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUN6QixRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUN4QixDQUFDOzZCQUFNLENBQUM7NEJBQ1AsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDcEIsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsTUFBTSxPQUFPLEdBQTBELEVBQUUsQ0FBQztnQkFDMUUsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDdkUsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkIsQ0FBQztnQkFDRCxJQUFJLGFBQWEsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN6QyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzdGLENBQUM7Z0JBQ0QsS0FBSyxNQUFNLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDaEYsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkIsQ0FBQztnQkFDRCxJQUFJLFFBQVEsQ0FBQyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUM5RCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRixDQUFDO2dCQUNELEtBQUssTUFBTSxHQUFHLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQzNFLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25CLENBQUM7Z0JBRUQsSUFBSSxzQkFBOEQsQ0FBQztnQkFDbkUsSUFBSSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDM0IsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7b0JBQ3ZGLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQWlDLEVBQUU7d0JBQ3RFLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFdBQVcsQ0FBQzt3QkFDeEUsT0FBTyxDQUFDLFdBQVcsQ0FBQztvQkFDckIsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsSUFBSSxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDMUMsc0JBQXNCLEdBQUcsVUFBVSxDQUFDO29CQUNyQyxDQUFDO3lCQUFNLENBQUM7d0JBQ1Asc0JBQXNCLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDdEgsQ0FBQztnQkFDRixDQUFDO3FCQUFNLENBQUM7b0JBQ1Asc0JBQXNCLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUM3SSxDQUFDO2dCQUVELElBQUksc0JBQXNCLEVBQUUsTUFBTSxFQUFFLENBQUM7b0JBQ3BDLE1BQU0sYUFBYSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLEdBQUcsc0JBQXNCLENBQUMsQ0FBQztnQkFDOUUsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyx1QkFBdUI7UUFDOUIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBTSxTQUFRLE9BQU87WUFDbkQ7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSw0QkFBNEI7b0JBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUM7b0JBQ2xELEVBQUUsRUFBRSxJQUFJO29CQUNSLFFBQVEsRUFBRSxVQUFVLENBQUMsU0FBUztvQkFDOUIsSUFBSSxFQUFFLENBQUM7NEJBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTOzRCQUNwQixJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDOzRCQUNuRCxLQUFLLEVBQUUsT0FBTzs0QkFDZCxLQUFLLEVBQUUsQ0FBQzt5QkFDUixDQUFDO2lCQUNGLENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO2dCQUNuQyxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuRCxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDM0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxjQUFjLENBQUM7b0JBQ3JELEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQztvQkFDdkQsY0FBYyxFQUFFLElBQUk7b0JBQ3BCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGFBQWEsRUFBRSxJQUFJO29CQUNuQixPQUFPLEVBQUUsQ0FBQzs0QkFDVCxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDOzRCQUMzQyxVQUFVLEVBQUUsQ0FBQyxLQUFLLENBQUM7eUJBQ25CLENBQUM7aUJBQ0YsQ0FBQyxDQUFDO2dCQUVILElBQUksTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO29CQUNwQixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3hDLE1BQU0sU0FBUyxHQUFHLEdBQUcsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7b0JBQzNELGdDQUFnQztvQkFDaEMsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsVUFBVSxDQUFDLGNBQWMsQ0FBQyxDQUFDLGVBQWUsQ0FBQzt3QkFDOUUsRUFBRSxFQUFFLFNBQVM7d0JBQ2IsS0FBSyxFQUFFLFdBQVc7d0JBQ2xCLEdBQUcsRUFBRSxJQUFJO3dCQUNULElBQUksRUFBRSxJQUFJO3dCQUNWLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7NEJBQzFCLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUU7NEJBQ3pCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7cUJBQ2pGLENBQUMsQ0FBQztvQkFDSCxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNELENBQUE7QUF4dEJLLGtCQUFrQjtJQUVyQixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsY0FBYyxDQUFBO0dBSFgsa0JBQWtCLENBd3RCdkI7QUFFRCxRQUFRLENBQUMsRUFBRSxDQUFrQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyw2QkFBNkIsQ0FBQyxrQkFBa0Isa0NBQTBCLENBQUM7QUFFdkosUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUM7SUFDaEcsRUFBRSxFQUFFLFFBQVE7SUFDWixLQUFLLEVBQUUsRUFBRTtJQUNULEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUM7SUFDdkMsSUFBSSxFQUFFLFFBQVE7SUFDZCxVQUFVLEVBQUU7UUFDWCw0QkFBNEIsRUFBRTtZQUM3QixJQUFJLEVBQUUsU0FBUztZQUNmLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLDZNQUE2TSxDQUFDO1lBQ3RRLE9BQU8sRUFBRSxJQUFJO1lBQ2IsS0FBSyxtQ0FBMkI7WUFDaEMsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDO1NBQ2hCO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSCxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQztJQUMxQyxFQUFFLEVBQUUsNkJBQTZCO0lBQ2pDLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRSxrQ0FBa0MsRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUMvSyxPQUFPLEVBQUUsc0RBQWtDO0lBQzNDLE1BQU0sNkNBQW1DO0NBQ3pDLENBQUMsQ0FBQztBQUNILG1CQUFtQixDQUFDLHNCQUFzQixDQUFDO0lBQzFDLEVBQUUsRUFBRSxtQ0FBbUM7SUFDdkMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsY0FBYyxFQUFFLGtDQUFrQyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQy9LLE9BQU8sRUFBRSxtREFBNkIsNkJBQW9CO0lBQzFELE1BQU0sNkNBQW1DO0NBQ3pDLENBQUMsQ0FBQztBQUNILG1CQUFtQixDQUFDLHNCQUFzQixDQUFDO0lBQzFDLEVBQUUsRUFBRSw4QkFBOEI7SUFDbEMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsY0FBYyxFQUFFLGtDQUFrQyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQy9LLE9BQU8sRUFBRSx1REFBbUM7SUFDNUMsTUFBTSw2Q0FBbUM7Q0FDekMsQ0FBQyxDQUFDO0FBQ0gsbUJBQW1CLENBQUMsc0JBQXNCLENBQUM7SUFDMUMsRUFBRSxFQUFFLG9DQUFvQztJQUN4QyxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsa0NBQWtDLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDL0ssT0FBTyxFQUFFLG1EQUE2Qiw4QkFBcUI7SUFDM0QsTUFBTSw2Q0FBbUM7Q0FDekMsQ0FBQyxDQUFDIn0=