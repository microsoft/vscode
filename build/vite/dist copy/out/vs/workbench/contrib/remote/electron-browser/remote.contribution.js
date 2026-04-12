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
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from '../../../services/remote/common/remoteAgentService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Extensions as WorkbenchContributionsExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../base/common/network.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { OpenLocalFileFolderCommand, OpenLocalFileCommand, OpenLocalFolderCommand, SaveLocalFileCommand, RemoteFileDialogContext } from '../../../services/dialogs/browser/simpleFileDialog.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IContextKeyService, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IRemoteExplorerService, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_OUTPUT } from '../../../services/remote/common/remoteExplorerService.js';
import { TunnelCloseReason } from '../../../services/remote/common/tunnelModel.js';
import { localize } from '../../../../nls.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
let RemoteAgentDiagnosticListener = class RemoteAgentDiagnosticListener {
    constructor(remoteAgentService, labelService) {
        ipcRenderer.on('vscode:getDiagnosticInfo', (event, ...args) => {
            const request = args[0];
            const connection = remoteAgentService.getConnection();
            if (connection) {
                const hostName = labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
                remoteAgentService.getDiagnosticInfo(request.args)
                    .then(info => {
                    if (info) {
                        info.hostName = hostName;
                        if (remoteConnectionLatencyMeasurer.latency?.high) {
                            info.latency = {
                                average: remoteConnectionLatencyMeasurer.latency.average,
                                current: remoteConnectionLatencyMeasurer.latency.current
                            };
                        }
                    }
                    ipcRenderer.send(request.replyChannel, info);
                })
                    .catch(e => {
                    const errorMessage = e && e.message ? `Connection to '${hostName}' could not be established  ${e.message}` : `Connection to '${hostName}' could not be established `;
                    ipcRenderer.send(request.replyChannel, { hostName, errorMessage });
                });
            }
            else {
                ipcRenderer.send(request.replyChannel);
            }
        });
    }
};
RemoteAgentDiagnosticListener = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, ILabelService)
], RemoteAgentDiagnosticListener);
let RemoteExtensionHostEnvironmentUpdater = class RemoteExtensionHostEnvironmentUpdater extends Disposable {
    constructor(remoteAgentService, remoteResolverService, extensionService) {
        super();
        const connection = remoteAgentService.getConnection();
        if (connection) {
            this._register(connection.onDidStateChange(async (e) => {
                if (e.type === 4 /* PersistentConnectionEventType.ConnectionGain */) {
                    const resolveResult = await remoteResolverService.resolveAuthority(connection.remoteAuthority);
                    if (resolveResult.options && resolveResult.options.extensionHostEnv) {
                        await extensionService.setRemoteEnvironment(resolveResult.options.extensionHostEnv);
                    }
                }
            }));
        }
    }
};
RemoteExtensionHostEnvironmentUpdater = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IRemoteAuthorityResolverService),
    __param(2, IExtensionService)
], RemoteExtensionHostEnvironmentUpdater);
let RemoteTelemetryEnablementUpdater = class RemoteTelemetryEnablementUpdater extends Disposable {
    static { this.ID = 'workbench.contrib.remoteTelemetryEnablementUpdater'; }
    constructor(remoteAgentService, configurationService) {
        super();
        this.remoteAgentService = remoteAgentService;
        this.configurationService = configurationService;
        this.updateRemoteTelemetryEnablement();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(TELEMETRY_SETTING_ID)) {
                this.updateRemoteTelemetryEnablement();
            }
        }));
    }
    updateRemoteTelemetryEnablement() {
        return this.remoteAgentService.updateTelemetryLevel(getTelemetryLevel(this.configurationService));
    }
};
RemoteTelemetryEnablementUpdater = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IConfigurationService)
], RemoteTelemetryEnablementUpdater);
let RemoteEmptyWorkbenchPresentation = class RemoteEmptyWorkbenchPresentation extends Disposable {
    static { this.ID = 'workbench.contrib.remoteEmptyWorkbenchPresentation'; }
    constructor(environmentService, remoteAuthorityResolverService, configurationService, commandService, contextService) {
        super();
        function shouldShowExplorer() {
            const startupEditor = configurationService.getValue('workbench.startupEditor');
            return startupEditor !== 'welcomePage' && startupEditor !== 'welcomePageInEmptyWorkbench';
        }
        function shouldShowTerminal() {
            return shouldShowExplorer();
        }
        const { remoteAuthority, filesToDiff, filesToMerge, filesToOpenOrCreate, filesToWait } = environmentService;
        if (remoteAuthority && contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ && !filesToDiff?.length && !filesToMerge?.length && !filesToOpenOrCreate?.length && !filesToWait) {
            remoteAuthorityResolverService.resolveAuthority(remoteAuthority).then(() => {
                if (shouldShowExplorer()) {
                    commandService.executeCommand('workbench.view.explorer');
                }
                if (shouldShowTerminal()) {
                    commandService.executeCommand('workbench.action.terminal.toggleTerminal');
                }
            });
        }
    }
};
RemoteEmptyWorkbenchPresentation = __decorate([
    __param(0, INativeWorkbenchEnvironmentService),
    __param(1, IRemoteAuthorityResolverService),
    __param(2, IConfigurationService),
    __param(3, ICommandService),
    __param(4, IWorkspaceContextService)
], RemoteEmptyWorkbenchPresentation);
/**
 * Sets the 'wslFeatureInstalled' context key if the WSL feature is or was installed on this machine.
 */
let WSLContextKeyInitializer = class WSLContextKeyInitializer extends Disposable {
    static { this.ID = 'workbench.contrib.wslContextKeyInitializer'; }
    constructor(contextKeyService, nativeHostService, storageService, lifecycleService) {
        super();
        const contextKeyId = 'wslFeatureInstalled';
        const storageKey = 'remote.wslFeatureInstalled';
        const defaultValue = storageService.getBoolean(storageKey, -1 /* StorageScope.APPLICATION */, undefined);
        const hasWSLFeatureContext = new RawContextKey(contextKeyId, !!defaultValue, nls.localize('wslFeatureInstalled', "Whether the platform has the WSL feature installed"));
        const contextKey = hasWSLFeatureContext.bindTo(contextKeyService);
        if (defaultValue === undefined) {
            lifecycleService.when(4 /* LifecyclePhase.Eventually */).then(async () => {
                nativeHostService.hasWSLFeatureInstalled().then(res => {
                    if (res) {
                        contextKey.set(true);
                        // once detected, set to true
                        storageService.store(storageKey, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                    }
                });
            });
        }
    }
};
WSLContextKeyInitializer = __decorate([
    __param(0, IContextKeyService),
    __param(1, INativeHostService),
    __param(2, IStorageService),
    __param(3, ILifecycleService)
], WSLContextKeyInitializer);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteAgentDiagnosticListener, 4 /* LifecyclePhase.Eventually */);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteExtensionHostEnvironmentUpdater, 4 /* LifecyclePhase.Eventually */);
registerWorkbenchContribution2(RemoteTelemetryEnablementUpdater.ID, RemoteTelemetryEnablementUpdater, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(RemoteEmptyWorkbenchPresentation.ID, RemoteEmptyWorkbenchPresentation, 2 /* WorkbenchPhase.BlockRestore */);
if (isWindows) {
    registerWorkbenchContribution2(WSLContextKeyInitializer.ID, WSLContextKeyInitializer, 2 /* WorkbenchPhase.BlockRestore */);
}
Registry.as(ConfigurationExtensions.Configuration)
    .registerConfiguration({
    id: 'remote',
    title: nls.localize('remote', "Remote"),
    type: 'object',
    properties: {
        'remote.downloadExtensionsLocally': {
            type: 'boolean',
            markdownDescription: nls.localize('remote.downloadExtensionsLocally', "When enabled extensions are downloaded locally and installed on remote."),
            default: false
        },
    }
});
if (isMacintosh) {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: OpenLocalFileFolderCommand.ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        primary: 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */,
        when: RemoteFileDialogContext,
        metadata: { description: OpenLocalFileFolderCommand.LABEL, args: [] },
        handler: OpenLocalFileFolderCommand.handler()
    });
}
else {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: OpenLocalFileCommand.ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        primary: 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */,
        when: RemoteFileDialogContext,
        metadata: { description: OpenLocalFileCommand.LABEL, args: [] },
        handler: OpenLocalFileCommand.handler()
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: OpenLocalFolderCommand.ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 45 /* KeyCode.KeyO */),
        when: RemoteFileDialogContext,
        metadata: { description: OpenLocalFolderCommand.LABEL, args: [] },
        handler: OpenLocalFolderCommand.handler()
    });
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SaveLocalFileCommand.ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 49 /* KeyCode.KeyS */,
    when: RemoteFileDialogContext,
    metadata: { description: SaveLocalFileCommand.LABEL, args: [] },
    handler: SaveLocalFileCommand.handler()
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.remote.action.closeUnusedPorts',
            title: localize('remote.actions.closeUnusedPorts', 'Close Unused Forwarded Ports'),
            category: localize('remote.category', 'Remote'),
            menu: [{
                    id: MenuId.CommandPalette
                }],
            precondition: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${PORT_AUTO_SOURCE_SETTING}`, PORT_AUTO_SOURCE_SETTING_OUTPUT), RemoteNameContext)
        });
    }
    async run(accessor) {
        const remoteExplorerService = accessor.get(IRemoteExplorerService);
        const ports = [];
        // collect all forwarded ports and filter out those who do not have a process running
        const forwarded = remoteExplorerService.tunnelModel.forwarded;
        for (const [_, tunnel] of forwarded) {
            if (tunnel.hasRunningProcess === false) {
                ports.push(tunnel);
            }
        }
        // Close the collected unused ports
        if (ports.length) {
            for (const port of ports) {
                await remoteExplorerService.close({
                    host: port.remoteHost,
                    port: port.remotePort
                }, TunnelCloseReason.User);
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9lbGVjdHJvbi1icm93c2VyL3JlbW90ZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0gsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0UsT0FBTyxFQUFVLFFBQVEsRUFBVyxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBb0IsTUFBTSwrREFBK0QsQ0FBQztBQUN0SCxPQUFPLEVBQTJFLFVBQVUsSUFBSSxnQ0FBZ0MsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNNLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFekYsT0FBTyxFQUFFLGtD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