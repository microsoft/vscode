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
import { toAction } from '../../../base/common/actions.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { transformErrorFromSerialization } from '../../../base/common/errors.js';
import { FileAccess } from '../../../base/common/network.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { areSameExtensions } from '../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { ManagedRemoteConnection, WebSocketRemoteConnection } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IExtensionsWorkbenchService } from '../../contrib/extensions/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService } from '../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IHostService } from '../../services/host/browser/host.js';
import { ITimerService } from '../../services/timer/browser/timerService.js';
let MainThreadExtensionService = class MainThreadExtensionService {
    constructor(extHostContext, _extensionService, _notificationService, _extensionsWorkbenchService, _hostService, _extensionEnablementService, _timerService, _commandService, _environmentService) {
        this._extensionService = _extensionService;
        this._notificationService = _notificationService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._hostService = _hostService;
        this._extensionEnablementService = _extensionEnablementService;
        this._timerService = _timerService;
        this._commandService = _commandService;
        this._environmentService = _environmentService;
        this._extensionHostKind = extHostContext.extensionHostKind;
        const internalExtHostContext = extHostContext;
        this._internalExtensionService = internalExtHostContext.internalExtensionService;
        internalExtHostContext._setExtensionHostProxy(new ExtensionHostProxy(extHostContext.getProxy(ExtHostContext.ExtHostExtensionService)));
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        internalExtHostContext._setAllMainProxyIdentifiers(Object.keys(MainContext).map((key) => MainContext[key]));
    }
    dispose() {
    }
    $getExtension(extensionId) {
        return this._extensionService.getExtension(extensionId);
    }
    $activateExtension(extensionId, reason) {
        return this._internalExtensionService._activateById(extensionId, reason);
    }
    async $onWillActivateExtension(extensionId) {
        this._internalExtensionService._onWillActivateExtension(extensionId);
    }
    $onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) {
        this._internalExtensionService._onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason);
    }
    $onExtensionRuntimeError(extensionId, data) {
        const error = transformErrorFromSerialization(data);
        this._internalExtensionService._onExtensionRuntimeError(extensionId, error);
        console.error(`[${extensionId.value}]${error.message}`);
        console.error(error.stack);
    }
    async $onExtensionActivationError(extensionId, data, missingExtensionDependency) {
        const error = transformErrorFromSerialization(data);
        this._internalExtensionService._onDidActivateExtensionError(extensionId, error);
        if (missingExtensionDependency) {
            const extension = await this._extensionService.getExtension(extensionId.value);
            if (extension) {
                const local = await this._extensionsWorkbenchService.queryLocal();
                const installedDependency = local.find(i => areSameExtensions(i.identifier, { id: missingExtensionDependency.dependency }));
                if (installedDependency?.local) {
                    await this._handleMissingInstalledDependency(extension, installedDependency.local);
                    return;
                }
                else {
                    await this._handleMissingNotInstalledDependency(extension, missingExtensionDependency.dependency);
                    return;
                }
            }
        }
        const isDev = !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment;
        if (isDev) {
            this._notificationService.error(error);
            return;
        }
        console.error(error.message);
    }
    async _handleMissingInstalledDependency(extension, missingInstalledDependency) {
        const extName = extension.displayName || extension.name;
        if (this._extensionEnablementService.isEnabled(missingInstalledDependency)) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('reload window', "Cannot activate the '{0}' extension because it depends on the '{1}' extension, which is not loaded. Would you like to reload the window to load the extension?", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
                actions: {
                    primary: [toAction({ id: 'reload', label: localize('reload', "Reload Window"), run: () => this._hostService.reload() })]
                }
            });
        }
        else {
            const enablementState = this._extensionEnablementService.getEnablementState(missingInstalledDependency);
            if (enablementState === 5 /* EnablementState.DisabledByVirtualWorkspace */) {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('notSupportedInWorkspace', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is not supported in the current workspace", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
                });
            }
            else if (enablementState === 0 /* EnablementState.DisabledByTrustRequirement */) {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('restrictedMode', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is not supported in Restricted Mode", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
                    actions: {
                        primary: [toAction({ id: 'manageWorkspaceTrust', label: localize('manageWorkspaceTrust', "Manage Workspace Trust"), run: () => this._commandService.executeCommand('workbench.trust.manage') })]
                    }
                });
            }
            else if (this._extensionEnablementService.canChangeEnablement(missingInstalledDependency)) {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('disabledDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is disabled. Would you like to enable the extension and reload the window?", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
                    actions: {
                        primary: [toAction({
                                id: 'enable', label: localize('enable dep', "Enable and Reload"), enabled: true,
                                run: () => this._extensionEnablementService.setEnablement([missingInstalledDependency], enablementState === 10 /* EnablementState.DisabledGlobally */ ? 12 /* EnablementState.EnabledGlobally */ : 13 /* EnablementState.EnabledWorkspace */)
                                    .then(() => this._hostService.reload(), e => this._notificationService.error(e))
                            })]
                    }
                });
            }
            else {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('disabledDepNoAction', "Cannot activate the '{0}' extension because it depends on the '{1}' extension which is disabled.", extName, missingInstalledDependency.manifest.displayName || missingInstalledDependency.manifest.name),
                });
            }
        }
    }
    async _handleMissingNotInstalledDependency(extension, missingDependency) {
        const extName = extension.displayName || extension.name;
        let dependencyExtension = null;
        try {
            dependencyExtension = (await this._extensionsWorkbenchService.getExtensions([{ id: missingDependency }], CancellationToken.None))[0];
        }
        catch (err) {
        }
        if (dependencyExtension) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('uninstalledDep', "Cannot activate the '{0}' extension because it depends on the '{1}' extension from '{2}', which is not installed. Would you like to install the extension and reload the window?", extName, dependencyExtension.displayName, dependencyExtension.publisherDisplayName),
                actions: {
                    primary: [toAction({
                            id: 'install',
                            label: localize('install missing dep', "Install and Reload"),
                            run: () => this._extensionsWorkbenchService.install(dependencyExtension)
                                .then(() => this._hostService.reload(), e => this._notificationService.error(e))
                        })]
                }
            });
        }
        else {
            this._notificationService.error(localize('unknownDep', "Cannot activate the '{0}' extension because it depends on an unknown '{1}' extension.", extName, missingDependency));
        }
    }
    async $setPerformanceMarks(marks) {
        if (this._extensionHostKind === 1 /* ExtensionHostKind.LocalProcess */) {
            this._timerService.setPerformanceMarks('localExtHost', marks);
        }
        else if (this._extensionHostKind === 2 /* ExtensionHostKind.LocalWebWorker */) {
            this._timerService.setPerformanceMarks('workerExtHost', marks);
        }
        else {
            this._timerService.setPerformanceMarks('remoteExtHost', marks);
        }
    }
    async $asBrowserUri(uri) {
        return FileAccess.uriToBrowserUri(URI.revive(uri));
    }
};
MainThreadExtensionService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadExtensionService),
    __param(1, IExtensionService),
    __param(2, INotificationService),
    __param(3, IExtensionsWorkbenchService),
    __param(4, IHostService),
    __param(5, IWorkbenchExtensionEnablementService),
    __param(6, ITimerService),
    __param(7, ICommandService),
    __param(8, IWorkbenchEnvironmentService)
], MainThreadExtensionService);
export { MainThreadExtensionService };
class ExtensionHostProxy {
    constructor(_actual) {
        this._actual = _actual;
    }
    async resolveAuthority(remoteAuthority, resolveAttempt) {
        const resolved = reviveResolveAuthorityResult(await this._actual.$resolveAuthority(remoteAuthority, resolveAttempt));
        return resolved;
    }
    async getCanonicalURI(remoteAuthority, uri) {
        const uriComponents = await this._actual.$getCanonicalURI(remoteAuthority, uri);
        return (uriComponents ? URI.revive(uriComponents) : uriComponents);
    }
    startExtensionHost(extensionsDelta) {
        return this._actual.$startExtensionHost(extensionsDelta);
    }
    extensionTestsExecute() {
        return this._actual.$extensionTestsExecute();
    }
    activateByEvent(activationEvent, activationKind) {
        return this._actual.$activateByEvent(activationEvent, activationKind);
    }
    activate(extensionId, reason) {
        return this._actual.$activate(extensionId, reason);
    }
    setRemoteEnvironment(env) {
        return this._actual.$setRemoteEnvironment(env);
    }
    updateRemoteConnectionData(connectionData) {
        return this._actual.$updateRemoteConnectionData(connectionData);
    }
    deltaExtensions(extensionsDelta) {
        return this._actual.$deltaExtensions(extensionsDelta);
    }
    test_latency(n) {
        return this._actual.$test_latency(n);
    }
    test_up(b) {
        return this._actual.$test_up(b);
    }
    test_down(size) {
        return this._actual.$test_down(size);
    }
}
function reviveResolveAuthorityResult(result) {
    if (result.type === 'ok') {
        return {
            type: 'ok',
            value: {
                ...result.value,
                authority: reviveResolvedAuthority(result.value.authority),
            }
        };
    }
    else {
        return result;
    }
}
function reviveResolvedAuthority(resolvedAuthority) {
    return {
        ...resolvedAuthority,
        connectTo: reviveConnection(resolvedAuthority.connectTo),
    };
}
function reviveConnection(connection) {
    if (connection.type === 0 /* RemoteConnectionType.WebSocket */) {
        return new WebSocketRemoteConnection(connection.host, connection.port);
    }
    return new ManagedRemoteConnection(connection.id);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEV4dGVuc2lvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEV4dGVuc2lvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBbUIsK0JBQStCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRWhGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBRTVHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBeUIsdUJBQXVCLEVBQTZELHlCQUF5QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbE4sT0FBTyxFQUFFLGNBQWMsRUFBZ0MsV0FBVyxFQUFtQyxNQUFNLCtCQUErQixDQUFDO0FBQzNJLE9BQU8sRUFBYywyQkFBMkIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBbUIsb0NBQW9DLEVBQUUsTUFBTSxrRUFBa0UsQ0FB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