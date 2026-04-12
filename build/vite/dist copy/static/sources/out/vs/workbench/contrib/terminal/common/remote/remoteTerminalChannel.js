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
import { IWorkbenchConfigurationService } from '../../../../services/configuration/common/configuration.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariableShared.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { SideBySideEditor, EditorResourceAccessor } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEnvironmentVariableService } from '../environmentVariable.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { ConfigurationResolverExpression } from '../../../../services/configurationResolver/common/configurationResolverExpression.js';
export const REMOTE_TERMINAL_CHANNEL_NAME = 'remoteterminal';
let RemoteTerminalChannelClient = class RemoteTerminalChannelClient {
    get onPtyHostExit() {
        return this._channel.listen("$onPtyHostExitEvent" /* RemoteTerminalChannelEvent.OnPtyHostExitEvent */);
    }
    get onPtyHostStart() {
        return this._channel.listen("$onPtyHostStartEvent" /* RemoteTerminalChannelEvent.OnPtyHostStartEvent */);
    }
    get onPtyHostUnresponsive() {
        return this._channel.listen("$onPtyHostUnresponsiveEvent" /* RemoteTerminalChannelEvent.OnPtyHostUnresponsiveEvent */);
    }
    get onPtyHostResponsive() {
        return this._channel.listen("$onPtyHostResponsiveEvent" /* RemoteTerminalChannelEvent.OnPtyHostResponsiveEvent */);
    }
    get onPtyHostRequestResolveVariables() {
        return this._channel.listen("$onPtyHostRequestResolveVariablesEvent" /* RemoteTerminalChannelEvent.OnPtyHostRequestResolveVariablesEvent */);
    }
    get onProcessData() {
        return this._channel.listen("$onProcessDataEvent" /* RemoteTerminalChannelEvent.OnProcessDataEvent */);
    }
    get onProcessExit() {
        return this._channel.listen("$onProcessExitEvent" /* RemoteTerminalChannelEvent.OnProcessExitEvent */);
    }
    get onProcessReady() {
        return this._channel.listen("$onProcessReadyEvent" /* RemoteTerminalChannelEvent.OnProcessReadyEvent */);
    }
    get onProcessReplay() {
        return this._channel.listen("$onProcessReplayEvent" /* RemoteTerminalChannelEvent.OnProcessReplayEvent */);
    }
    get onProcessOrphanQuestion() {
        return this._channel.listen("$onProcessOrphanQuestion" /* RemoteTerminalChannelEvent.OnProcessOrphanQuestion */);
    }
    get onExecuteCommand() {
        return this._channel.listen("$onExecuteCommand" /* RemoteTerminalChannelEvent.OnExecuteCommand */);
    }
    get onDidRequestDetach() {
        return this._channel.listen("$onDidRequestDetach" /* RemoteTerminalChannelEvent.OnDidRequestDetach */);
    }
    get onDidChangeProperty() {
        return this._channel.listen("$onDidChangeProperty" /* RemoteTerminalChannelEvent.OnDidChangeProperty */);
    }
    constructor(_remoteAuthority, _channel, _configurationService, _workspaceContextService, _resolverService, _environmentVariableService, _remoteAuthorityResolverService, _logService, _editorService, _labelService, _environmentService) {
        this._remoteAuthority = _remoteAuthority;
        this._channel = _channel;
        this._configurationService = _configurationService;
        this._workspaceContextService = _workspaceContextService;
        this._resolverService = _resolverService;
        this._environmentVariableService = _environmentVariableService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._logService = _logService;
        this._editorService = _editorService;
        this._labelService = _labelService;
        this._environmentService = _environmentService;
    }
    restartPtyHost() {
        return this._channel.call("$restartPtyHost" /* RemoteTerminalChannelRequest.RestartPtyHost */, []);
    }
    async createProcess(shellLaunchConfig, configuration, activeWorkspaceRootUri, options, shouldPersistTerminal, cols, rows, unicodeVersion) {
        // Be sure to first wait for the remote configuration
        await this._configurationService.whenRemoteConfigurationLoaded();
        // We will use the resolver service to resolve all the variables in the config / launch config
        // But then we will keep only some variables, since the rest need to be resolved on the remote side
        const resolvedVariables = Object.create(null);
        const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
        const expr = ConfigurationResolverExpression.parse({ shellLaunchConfig, configuration });
        try {
            await this._resolverService.resolveAsync(lastActiveWorkspace, expr);
        }
        catch (err) {
            this._logService.error(err);
        }
        for (const [{ inner }, resolved] of expr.resolved()) {
            if (/^config:/.test(inner) || inner === 'selectedText' || inner === 'lineNumber') {
                resolvedVariables[inner] = resolved.value;
            }
        }
        const envVariableCollections = [];
        for (const [k, v] of this._environmentVariableService.collections.entries()) {
            envVariableCollections.push([k, serializeEnvironmentVariableCollection(v.map), serializeEnvironmentDescriptionMap(v.descriptionMap)]);
        }
        const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(this._remoteAuthority);
        const resolverEnv = {
            /**
             * If the extension host was spawned via a launch configuration,
             * include the environment provided by that launch configuration.
             */
            ...(this._environmentService.debugExtensionHost.env ?? {}), ...resolverResult.options?.extensionHostEnv
        };
        const workspace = this._workspaceContextService.getWorkspace();
        const workspaceFolders = workspace.folders;
        const activeWorkspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) : null;
        const activeFileResource = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor, {
            supportSideBySide: SideBySideEditor.PRIMARY,
            filterByScheme: [Schemas.file, Schemas.vscodeUserData, Schemas.vscodeRemote]
        });
        const args = {
            configuration,
            resolvedVariables,
            envVariableCollections,
            shellLaunchConfig,
            workspaceId: workspace.id,
            workspaceName: this._labelService.getWorkspaceLabel(workspace),
            workspaceFolders,
            activeWorkspaceFolder,
            activeFileResource,
            shouldPersistTerminal,
            options,
            cols,
            rows,
            unicodeVersion,
            resolverEnv
        };
        return await this._channel.call("$createProcess" /* RemoteTerminalChannelRequest.CreateProcess */, args);
    }
    requestDetachInstance(workspaceId, instanceId) {
        return this._channel.call("$requestDetachInstance" /* RemoteTerminalChannelRequest.RequestDetachInstance */, [workspaceId, instanceId]);
    }
    acceptDetachInstanceReply(requestId, persistentProcessId) {
        return this._channel.call("$acceptDetachInstanceReply" /* RemoteTerminalChannelRequest.AcceptDetachInstanceReply */, [requestId, persistentProcessId]);
    }
    attachToProcess(id) {
        return this._channel.call("$attachToProcess" /* RemoteTerminalChannelRequest.AttachToProcess */, [id]);
    }
    detachFromProcess(id, forcePersist) {
        return this._channel.call("$detachFromProcess" /* RemoteTerminalChannelRequest.DetachFromProcess */, [id, forcePersist]);
    }
    listProcesses() {
        return this._channel.call("$listProcesses" /* RemoteTerminalChannelRequest.ListProcesses */);
    }
    getLatency() {
        return this._channel.call("$getLatency" /* RemoteTerminalChannelRequest.GetLatency */);
    }
    getPerformanceMarks() {
        return this._channel.call("$getPerformanceMarks" /* RemoteTerminalChannelRequest.GetPerformanceMarks */);
    }
    reduceConnectionGraceTime() {
        return this._channel.call("$reduceConnectionGraceTime" /* RemoteTerminalChannelRequest.ReduceConnectionGraceTime */);
    }
    processBinary(id, data) {
        return this._channel.call("$processBinary" /* RemoteTerminalChannelRequest.ProcessBinary */, [id, data]);
    }
    start(id) {
        return this._channel.call("$start" /* RemoteTerminalChannelRequest.Start */, [id]);
    }
    input(id, data) {
        return this._channel.call("$input" /* RemoteTerminalChannelRequest.Input */, [id, data]);
    }
    sendSignal(id, signal) {
        return this._channel.call("$sendSignal" /* RemoteTerminalChannelRequest.SendSignal */, [id, signal]);
    }
    acknowledgeDataEvent(id, charCount) {
        return this._channel.call("$acknowledgeDataEvent" /* RemoteTerminalChannelRequest.AcknowledgeDataEvent */, [id, charCount]);
    }
    setUnicodeVersion(id, version) {
        return this._channel.call("$setUnicodeVersion" /* RemoteTerminalChannelRequest.SetUnicodeVersion */, [id, version]);
    }
    setNextCommandId(id, commandLine, commandId) {
        return this._channel.call("$setNextCommandId" /* RemoteTerminalChannelRequest.SetNextCommandId */, [id, commandLine, commandId]);
    }
    shutdown(id, immediate) {
        return this._channel.call("$shutdown" /* RemoteTerminalChannelRequest.Shutdown */, [id, immediate]);
    }
    resize(id, cols, rows, pixelWidth, pixelHeight) {
        return this._channel.call("$resize" /* RemoteTerminalChannelRequest.Resize */, [id, cols, rows, pixelWidth, pixelHeight]);
    }
    clearBuffer(id) {
        return this._channel.call("$clearBuffer" /* RemoteTerminalChannelRequest.ClearBuffer */, [id]);
    }
    getInitialCwd(id) {
        return this._channel.call("$getInitialCwd" /* RemoteTerminalChannelRequest.GetInitialCwd */, [id]);
    }
    getCwd(id) {
        return this._channel.call("$getCwd" /* RemoteTerminalChannelRequest.GetCwd */, [id]);
    }
    orphanQuestionReply(id) {
        return this._channel.call("$orphanQuestionReply" /* RemoteTerminalChannelRequest.OrphanQuestionReply */, [id]);
    }
    sendCommandResult(reqId, isError, payload) {
        return this._channel.call("$sendCommandResult" /* RemoteTerminalChannelRequest.SendCommandResult */, [reqId, isError, payload]);
    }
    freePortKillProcess(port) {
        return this._channel.call("$freePortKillProcess" /* RemoteTerminalChannelRequest.FreePortKillProcess */, [port]);
    }
    getDefaultSystemShell(osOverride) {
        return this._channel.call("$getDefaultSystemShell" /* RemoteTerminalChannelRequest.GetDefaultSystemShell */, [osOverride]);
    }
    getProfiles(profiles, defaultProfile, includeDetectedProfiles) {
        return this._channel.call("$getProfiles" /* RemoteTerminalChannelRequest.GetProfiles */, [this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles]);
    }
    acceptPtyHostResolvedVariables(requestId, resolved) {
        return this._channel.call("$acceptPtyHostResolvedVariables" /* RemoteTerminalChannelRequest.AcceptPtyHostResolvedVariables */, [requestId, resolved]);
    }
    getEnvironment() {
        return this._channel.call("$getEnvironment" /* RemoteTerminalChannelRequest.GetEnvironment */);
    }
    getWslPath(original, direction) {
        return this._channel.call("$getWslPath" /* RemoteTerminalChannelRequest.GetWslPath */, [original, direction]);
    }
    setTerminalLayoutInfo(layout) {
        const workspace = this._workspaceContextService.getWorkspace();
        const args = {
            workspaceId: workspace.id,
            tabs: layout ? layout.tabs : [],
            background: layout ? layout.background : null
        };
        return this._channel.call("$setTerminalLayoutInfo" /* RemoteTerminalChannelRequest.SetTerminalLayoutInfo */, args);
    }
    updateTitle(id, title, titleSource) {
        return this._channel.call("$updateTitle" /* RemoteTerminalChannelRequest.UpdateTitle */, [id, title, titleSource]);
    }
    updateIcon(id, userInitiated, icon, color) {
        return this._channel.call("$updateIcon" /* RemoteTerminalChannelRequest.UpdateIcon */, [id, userInitiated, icon, color]);
    }
    refreshProperty(id, property) {
        return this._channel.call("$refreshProperty" /* RemoteTerminalChannelRequest.RefreshProperty */, [id, property]);
    }
    updateProperty(id, property, value) {
        return this._channel.call("$updateProperty" /* RemoteTerminalChannelRequest.UpdateProperty */, [id, property, value]);
    }
    getTerminalLayoutInfo() {
        const workspace = this._workspaceContextService.getWorkspace();
        const args = {
            workspaceId: workspace.id,
        };
        return this._channel.call("$getTerminalLayoutInfo" /* RemoteTerminalChannelRequest.GetTerminalLayoutInfo */, args);
    }
    reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate) {
        return this._channel.call("$reviveTerminalProcesses" /* RemoteTerminalChannelRequest.ReviveTerminalProcesses */, [workspaceId, state, dateTimeFormatLocate]);
    }
    getRevivedPtyNewId(id) {
        return this._channel.call("$getRevivedPtyNewId" /* RemoteTerminalChannelRequest.GetRevivedPtyNewId */, [id]);
    }
    serializeTerminalState(ids) {
        return this._channel.call("$serializeTerminalState" /* RemoteTerminalChannelRequest.SerializeTerminalState */, [ids]);
    }
    // #region Pty service contribution RPC calls
    installAutoReply(match, reply) {
        return this._channel.call("$installAutoReply" /* RemoteTerminalChannelRequest.InstallAutoReply */, [match, reply]);
    }
    uninstallAllAutoReplies() {
        return this._channel.call("$uninstallAllAutoReplies" /* RemoteTerminalChannelRequest.UninstallAllAutoReplies */, []);
    }
};
RemoteTerminalChannelClient = __decorate([
    __param(2, IWorkbenchConfigurationService),
    __param(3, IWorkspaceContextService),
    __param(4, IConfigurationResolverService),
    __param(5, IEnvironmentVariableService),
    __param(6, IRemoteAuthorityResolverService),
    __param(7, ITerminalLogService),
    __param(8, IEditorService),
    __param(9, ILabelService),
    __param(10, IWorkbenchEnvironmentService)
], RemoteTerminalChannelClient);
export { RemoteTerminalChannelClient };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVGVybWluYWxDaGFubmVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3JlbW90ZS9yZW1vdGVUZXJtaW5hbENoYW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFLaEcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUcsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDbkgsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDN0csT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDakcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLHNDQUFzQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDbEssT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDM0gsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHNCQUFzQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDeEUsT0FBTyxFQUEwVixtQkFBbUIsRUFBcUQsTUFBTSxxREFBcUQsQ0FBQztBQVFyZSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxzRkFBc0YsQ0FBQztBQUV2SSxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxnQkFBZ0IsQ0FBQztBQWlDdEQsSUFBTSwyQkFBMkIs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