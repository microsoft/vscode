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
var TelemetryContribution_1;
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { language } from '../../../../base/common/platform.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import ErrorTelemetry from '../../../../platform/telemetry/browser/errorTelemetry.js';
import { supportsTelemetry, TelemetryLogGroup, telemetryLogId, TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ConfigurationTargetToString, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { extname, basename, isEqual, isEqualOrParent } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { getMimeTypes } from '../../../../editor/common/services/languagesAssociations.js';
import { hash } from '../../../../base/common/hash.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { isBoolean, isNumber, isString } from '../../../../base/common/types.js';
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey } from '../../extensions/common/extensions.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { ILoggerService, LogLevel } from '../../../../platform/log/common/log.js';
import { VerifyExtensionSignatureConfigKey } from '../../../../platform/extensionManagement/common/extensionManagement.js';
let TelemetryContribution = class TelemetryContribution extends Disposable {
    static { TelemetryContribution_1 = this; }
    static { this.ALLOWLIST_JSON = ['package.json', 'package-lock.json', 'tsconfig.json', 'jsconfig.json', 'bower.json', '.eslintrc.json', 'tslint.json', 'composer.json']; }
    static { this.ALLOWLIST_WORKSPACE_JSON = ['settings.json', 'extensions.json', 'tasks.json', 'launch.json']; }
    constructor(telemetryService, contextService, lifecycleService, editorService, keybindingsService, themeService, environmentService, userDataProfileService, paneCompositeService, productService, loggerService, outputService, textFileService) {
        super();
        this.telemetryService = telemetryService;
        this.contextService = contextService;
        this.userDataProfileService = userDataProfileService;
        this.loggerService = loggerService;
        this.outputService = outputService;
        const { filesToOpenOrCreate, filesToDiff, filesToMerge } = environmentService;
        const activeViewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        telemetryService.publicLog2('workspaceLoad', {
            windowSize: { innerHeight: mainWindow.innerHeight, innerWidth: mainWindow.innerWidth, outerHeight: mainWindow.outerHeight, outerWidth: mainWindow.outerWidth },
            emptyWorkbench: contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */,
            'workbench.filesToOpenOrCreate': filesToOpenOrCreate && filesToOpenOrCreate.length || 0,
            'workbench.filesToDiff': filesToDiff && filesToDiff.length || 0,
            'workbench.filesToMerge': filesToMerge && filesToMerge.length || 0,
            customKeybindingsCount: keybindingsService.customKeybindingsCount(),
            theme: themeService.getColorTheme().id,
            language,
            pinnedViewlets: paneCompositeService.getPinnedPaneCompositeIds(0 /* ViewContainerLocation.Sidebar */),
            restoredViewlet: activeViewlet ? activeViewlet.getId() : undefined,
            restoredEditors: editorService.visibleEditors.length,
            startupKind: lifecycleService.startupKind
        });
        // Error Telemetry
        this._register(new ErrorTelemetry(telemetryService));
        //  Files Telemetry
        this._register(textFileService.files.onDidResolve(e => this.onTextFileModelResolved(e)));
        this._register(textFileService.files.onDidSave(e => this.onTextFileModelSaved(e)));
        // Lifecycle
        this._register(lifecycleService.onDidShutdown(() => this.dispose()));
        if (supportsTelemetry(productService, environmentService)) {
            this.handleTelemetryOutputVisibility();
        }
    }
    onTextFileModelResolved(e) {
        const settingsType = this.getTypeIfSettings(e.model.resource);
        if (!settingsType) {
            this.telemetryService.publicLog2('fileGet', this.getTelemetryData(e.model.resource, e.reason));
        }
    }
    onTextFileModelSaved(e) {
        const settingsType = this.getTypeIfSettings(e.model.resource);
        if (!settingsType) {
            this.telemetryService.publicLog2('filePUT', this.getTelemetryData(e.model.resource, e.reason));
        }
    }
    getTypeIfSettings(resource) {
        if (extname(resource) !== '.json') {
            return '';
        }
        // Check for global settings file
        if (isEqual(resource, this.userDataProfileService.currentProfile.settingsResource)) {
            return 'global-settings';
        }
        // Check for keybindings file
        if (isEqual(resource, this.userDataProfileService.currentProfile.keybindingsResource)) {
            return 'keybindings';
        }
        // Check for snippets
        if (isEqualOrParent(resource, this.userDataProfileService.currentProfile.snippetsHome)) {
            return 'snippets';
        }
        // Check for workspace settings file
        const folders = this.contextService.getWorkspace().folders;
        for (const folder of folders) {
            if (isEqualOrParent(resource, folder.toResource('.vscode'))) {
                const filename = basename(resource);
                if (TelemetryContribution_1.ALLOWLIST_WORKSPACE_JSON.indexOf(filename) > -1) {
                    return `.vscode/${filename}`;
                }
            }
        }
        return '';
    }
    getTelemetryData(resource, reason) {
        let ext = extname(resource);
        // Remove query parameters from the resource extension
        const queryStringLocation = ext.indexOf('?');
        ext = queryStringLocation !== -1 ? ext.substr(0, queryStringLocation) : ext;
        const fileName = basename(resource);
        const path = resource.scheme === Schemas.file ? resource.fsPath : resource.path;
        const telemetryData = {
            mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(', ')),
            ext,
            path: hash(path),
            reason,
            allowlistedjson: undefined
        };
        if (ext === '.json' && TelemetryContribution_1.ALLOWLIST_JSON.indexOf(fileName) > -1) {
            telemetryData['allowlistedjson'] = fileName;
        }
        return telemetryData;
    }
    async handleTelemetryOutputVisibility() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: 'workbench.action.showTelemetry',
                    title: localize2('showTelemetry', "Show Telemetry"),
                    category: Categories.Developer,
                    f1: true
                });
            }
            async run() {
                for (const logger of that.loggerService.getRegisteredLoggers()) {
                    if (logger.group?.id === TelemetryLogGroup.id) {
                        that.loggerService.setLogLevel(logger.resource, LogLevel.Trace);
                        that.loggerService.setVisibility(logger.resource, true);
                    }
                }
                that.outputService.showChannel(TelemetryLogGroup.id);
            }
        }));
        if (![...this.loggerService.getRegisteredLoggers()].find(logger => logger.id === telemetryLogId)) {
            await Event.toPromise(Event.filter(this.loggerService.onDidChangeLoggers, e => [...e.added].some(logger => logger.id === telemetryLogId)));
        }
        let showTelemetry = false;
        for (const logger of this.loggerService.getRegisteredLoggers()) {
            if (logger.id === telemetryLogId) {
                showTelemetry = this.loggerService.getLogLevel() === LogLevel.Trace || !logger.hidden;
                if (showTelemetry) {
                    this.loggerService.setVisibility(logger.id, true);
                }
                break;
            }
        }
        if (showTelemetry) {
            const showExtensionTelemetry = (loggers) => {
                for (const logger of loggers) {
                    if (logger.group?.id === TelemetryLogGroup.id) {
                        that.loggerService.setLogLevel(logger.resource, LogLevel.Trace);
                        this.loggerService.setVisibility(logger.id, true);
                    }
                }
            };
            showExtensionTelemetry(this.loggerService.getRegisteredLoggers());
            this._register(this.loggerService.onDidChangeLoggers(e => showExtensionTelemetry(e.added)));
        }
    }
};
TelemetryContribution = TelemetryContribution_1 = __decorate([
    __param(0, ITelemetryService),
    __param(1, IWorkspaceContextService),
    __param(2, ILifecycleService),
    __param(3, IEditorService),
    __param(4, IKeybindingService),
    __param(5, IWorkbenchThemeService),
    __param(6, IWorkbenchEnvironmentService),
    __param(7, IUserDataProfileService),
    __param(8, IPaneCompositePartService),
    __param(9, IProductService),
    __param(10, ILoggerService),
    __param(11, IOutputService),
    __param(12, ITextFileService)
], TelemetryContribution);
export { TelemetryContribution };
let ConfigurationTelemetryContribution = class ConfigurationTelemetryContribution extends Disposable {
    constructor(configurationService, userDataProfilesService, telemetryService) {
        super();
        this.configurationService = configurationService;
        this.userDataProfilesService = userDataProfilesService;
        this.telemetryService = telemetryService;
        this.configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        const { user, workspace } = configurationService.keys();
        for (const setting of user) {
            this.reportTelemetry(setting, 3 /* ConfigurationTarget.USER_LOCAL */);
        }
        for (const setting of workspace) {
            this.reportTelemetry(setting, 5 /* ConfigurationTarget.WORKSPACE */);
        }
    }
    /**
     * Report value of a setting only if it is an enum, boolean, or number or an array of those.
     */
    getValueToReport(key, target) {
        const inpsectData = this.configurationService.inspect(key);
        const value = target === 3 /* ConfigurationTarget.USER_LOCAL */ ? inpsectData.user?.value : inpsectData.workspace?.value;
        if (isNumber(value) || isBoolean(value)) {
            return value.toString();
        }
        const schema = this.configurationRegistry.getConfigurationProperties()[key];
        if (isString(value)) {
            if (schema?.enum?.includes(value)) {
                return value;
            }
            return undefined;
        }
        if (Array.isArray(value)) {
            if (value.every(v => isNumber(v) || isBoolean(v) || (isString(v) && schema?.enum?.includes(v)))) {
                return JSON.stringify(value);
            }
        }
        return undefined;
    }
    reportTelemetry(key, target) {
        const source = ConfigurationTargetToString(target);
        switch (key) {
            case "workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */:
                this.telemetryService.publicLog2('workbench.activityBar.location', { settingValue: this.getValueToReport(key, target), source });
                return;
            case AutoUpdateConfigurationKey:
                this.telemetryService.publicLog2('extensions.autoUpdate', { settingValue: this.getValueToReport(key, target), source });
                return;
            case 'editor.stickyScroll.enabled':
                this.telemetryService.publicLog2('editor.stickyScroll.enabled', { settingValue: this.getValueToReport(key, target), source });
                return;
            case 'typescript.experimental.expandableHover':
                this.telemetryService.publicLog2('typescript.experimental.expandableHover', { settingValue: this.getValueToReport(key, target), source });
                return;
            case 'window.titleBarStyle':
                this.telemetryService.publicLog2('window.titleBarStyle', { settingValue: this.getValueToReport(key, target), source });
                return;
            case 'workbench.secondarySideBar.defaultVisibility':
                this.telemetryService.publicLog2('workbench.secondarySideBar.defaultVisibility', { settingValue: this.getValueToReport(key, target), source });
                return;
            case VerifyExtensionSignatureConfigKey:
                this.telemetryService.publicLog2('extensions.verifySignature', { settingValue: this.getValueToReport(key, target), source });
                return;
            case 'window.newWindowProfile':
                {
                    const valueToReport = this.getValueToReport(key, target);
                    const settingValue = valueToReport === null ? 'null'
                        : valueToReport === this.userDataProfilesService.defaultProfile.name
                            ? 'default'
                            : 'custom';
                    this.telemetryService.publicLog2('window.newWindowProfile', { settingValue, source });
                    return;
                }
            case AutoRestartConfigurationKey:
                this.telemetryService.publicLog2('extensions.autoRestart', { settingValue: this.getValueToReport(key, target), source });
                return;
            case "chat.tools.terminal.outputLocation" /* TerminalContribSettingId.OutputLocation */:
                this.telemetryService.publicLog2('terminal.integrated.chatAgentTools.outputLocation', { settingValue: this.getValueToReport(key, target), source });
                return;
            case "terminal.integrated.suggest.enabled" /* TerminalContribSettingId.SuggestEnabled */:
                this.telemetryService.publicLog2('terminal.integrated.suggest.enabled', { settingValue: this.getValueToReport(key, target), source });
                return;
            case "chat.agent.sandbox.enabled" /* TerminalContribSettingId.AgentSandboxEnabled */:
            case "chat.agent.sandbox" /* TerminalContribSettingId.DeprecatedAgentSandboxEnabled */:
                this.telemetryService.publicLog2('chat.agent.sandbox', { settingValue: this.getValueToReport(key, target), source });
                return;
        }
    }
};
ConfigurationTelemetryContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IUserDataProfilesService),
    __param(2, ITelemetryService)
], ConfigurationTelemetryContribution);
const workbenchContributionRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContributionRegistry.registerWorkbenchContribution(TelemetryContribution, 3 /* LifecyclePhase.Restored */);
workbenchContributionRegistry.registerWorkbenchContribution(ConfigurationTelemetryContribution, 4 /* LifecyclePhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3RlbGVtZXRyeS9icm93c2VyL3RlbGVtZXRyeS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixFQUEyRCxNQUFNLGtDQUFrQyxDQUFDO0FBQzlJLE9BQU8sRUFBa0IsaUJBQWlCLEVBQWUsTUFBTSxpREFBaUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsd0JBQXdCLEVBQWtCLE1BQU0sb0RBQW9ELENBQUM7QUFDOUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sY0FBYyxNQUFNLDBEQUEwRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN0SixPQUFPLEVBQXVC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