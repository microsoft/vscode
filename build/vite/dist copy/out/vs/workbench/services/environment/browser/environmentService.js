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
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { memoize } from '../../../../base/common/decorators.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { parseLineAndColumnAware } from '../../../../base/common/extpath.js';
import { LogLevelToString } from '../../../../platform/log/common/log.js';
import { isUndefined } from '../../../../base/common/types.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from '../../../../platform/environment/common/environmentService.js';
export const IBrowserWorkbenchEnvironmentService = refineServiceDecorator(IEnvironmentService);
export class BrowserWorkbenchEnvironmentService {
    get remoteAuthority() { return this.options.remoteAuthority; }
    get expectsResolverExtension() {
        return !!this.options.remoteAuthority?.includes('+') && !this.options.webSocketFactory;
    }
    get isBuilt() { return !!this.productService.commit; }
    get logLevel() {
        const logLevelFromPayload = this.payload?.get('logLevel');
        if (logLevelFromPayload) {
            return logLevelFromPayload.split(',').find(entry => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry));
        }
        return this.options.developmentOptions?.logLevel !== undefined ? LogLevelToString(this.options.developmentOptions?.logLevel) : undefined;
    }
    get extensionLogLevel() {
        const logLevelFromPayload = this.payload?.get('logLevel');
        if (logLevelFromPayload) {
            const result = [];
            for (const entry of logLevelFromPayload.split(',')) {
                const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
                if (matches?.[1] && matches[2]) {
                    result.push([matches[1], matches[2]]);
                }
            }
            return result.length ? result : undefined;
        }
        return this.options.developmentOptions?.extensionLogLevel !== undefined ? this.options.developmentOptions?.extensionLogLevel.map(([extension, logLevel]) => ([extension, LogLevelToString(logLevel)])) : undefined;
    }
    get profDurationMarkers() {
        const profDurationMarkersFromPayload = this.payload?.get('profDurationMarkers');
        if (profDurationMarkersFromPayload) {
            const result = [];
            for (const entry of profDurationMarkersFromPayload.split(',')) {
                result.push(entry);
            }
            return result.length === 2 ? result : undefined;
        }
        return undefined;
    }
    get windowLogsPath() { return this.logsHome; }
    get logFile() { return joinPath(this.windowLogsPath, 'window.log'); }
    get userRoamingDataHome() { return URI.file('/User').with({ scheme: Schemas.vscodeUserData }); }
    get argvResource() { return joinPath(this.userRoamingDataHome, 'argv.json'); }
    get cacheHome() { return joinPath(this.userRoamingDataHome, 'caches'); }
    get workspaceStorageHome() { return joinPath(this.userRoamingDataHome, 'workspaceStorage'); }
    get localHistoryHome() { return joinPath(this.userRoamingDataHome, 'History'); }
    get stateResource() { return joinPath(this.userRoamingDataHome, 'State', 'storage.json'); }
    /**
     * In Web every workspace can potentially have scoped user-data
     * and/or extensions and if Sync state is shared then it can make
     * Sync error prone - say removing extensions from another workspace.
     * Hence scope Sync state per workspace. Sync scoped to a workspace
     * is capable of handling opening same workspace in multiple windows.
     */
    get userDataSyncHome() { return joinPath(this.userRoamingDataHome, 'sync', this.workspaceId); }
    get sync() { return undefined; }
    get keyboardLayoutResource() { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }
    get untitledWorkspacesHome() { return joinPath(this.userRoamingDataHome, 'Workspaces'); }
    get serviceMachineIdResource() { return joinPath(this.userRoamingDataHome, 'machineid'); }
    get extHostLogsPath() { return joinPath(this.logsHome, 'exthost'); }
    get agentPluginsHome() { return joinPath(this.userRoamingDataHome, 'agent-plugins'); }
    get debugExtensionHost() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.params;
    }
    get isExtensionDevelopment() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.isExtensionDevelopment;
    }
    get extensionDevelopmentLocationURI() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
    }
    get extensionDevelopmentLocationKind() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.extensionDevelopmentKind;
    }
    get extensionTestsLocationURI() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.extensionTestsLocationURI;
    }
    get extensionEnabledProposedApi() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.extensionEnabledProposedApi;
    }
    get debugRenderer() {
        if (!this.extensionHostDebugEnvironment) {
            this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
        }
        return this.extensionHostDebugEnvironment.debugRenderer;
    }
    get enableSmokeTestDriver() { return this.options.developmentOptions?.enableSmokeTestDriver; }
    get disableExtensions() { return this.payload?.get('disableExtensions') === 'true'; }
    get enableExtensions() { return this.options.enabledExtensions; }
    get webviewExternalEndpoint() {
        const endpoint = this.options.webviewEndpoint
            || this.productService.webviewContentExternalBaseUrlTemplate
            || 'https://{{uuid}}.vscode-cdn.net/{{quality}}/{{commit}}/out/vs/workbench/contrib/webview/browser/pre/';
        const webviewExternalEndpointCommit = this.payload?.get('webviewExternalEndpointCommit');
        return endpoint
            .replace('{{commit}}', webviewExternalEndpointCommit ?? this.productService.commit ?? 'ef65ac1ba57f57f2a3961bfe94aa20481caca4c6')
            .replace('{{quality}}', (webviewExternalEndpointCommit ? 'insider' : this.productService.quality) ?? 'insider');
    }
    get extensionTelemetryLogResource() { return joinPath(this.logsHome, 'extensionTelemetry.log'); }
    get disableTelemetry() { return false; }
    get disableExperiments() { return false; }
    get verbose() { return this.payload?.get('verbose') === 'true'; }
    get logExtensionHostCommunication() { return this.payload?.get('logExtensionHostCommunication') === 'true'; }
    get skipReleaseNotes() { return this.payload?.get('skipReleaseNotes') === 'true'; }
    get skipWelcome() { return this.payload?.get('skipWelcome') === 'true'; }
    get disableWorkspaceTrust() { return !this.options.enableWorkspaceTrust; }
    get isSessionsWindow() { return this.payload?.get('isSessionsWindow') === 'true'; }
    get profile() { return this.payload?.get('profile'); }
    get editSessionId() { return this.options.editSessionId; }
    constructor(workspaceId, logsHome, options, productService) {
        this.workspaceId = workspaceId;
        this.logsHome = logsHome;
        this.options = options;
        this.productService = productService;
        this.extensionHostDebugEnvironment = undefined;
        if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
            try {
                this.payload = new Map(options.workspaceProvider.payload);
            }
            catch (error) {
                onUnexpectedError(error); // possible invalid payload for map
            }
        }
    }
    resolveExtensionHostDebugEnvironment() {
        const extensionHostDebugEnvironment = {
            params: {
                port: null,
                break: false
            },
            debugRenderer: false,
            isExtensionDevelopment: false,
            extensionDevelopmentLocationURI: undefined,
            extensionDevelopmentKind: undefined
        };
        // Fill in selected extra environmental properties
        if (this.payload) {
            for (const [key, value] of this.payload) {
                switch (key) {
                    case 'extensionDevelopmentPath':
                        if (!extensionHostDebugEnvironment.extensionDevelopmentLocationURI) {
                            extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [];
                        }
                        extensionHostDebugEnvironment.extensionDevelopmentLocationURI.push(URI.parse(value));
                        extensionHostDebugEnvironment.isExtensionDevelopment = true;
                        break;
                    case 'extensionDevelopmentKind':
                        extensionHostDebugEnvironment.extensionDevelopmentKind = [value];
                        break;
                    case 'extensionTestsPath':
                        extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
                        break;
                    case 'debugRenderer':
                        extensionHostDebugEnvironment.debugRenderer = value === 'true';
                        break;
                    case 'debugId':
                        extensionHostDebugEnvironment.params.debugId = value;
                        break;
                    case 'inspect-brk-extensions':
                        extensionHostDebugEnvironment.params.port = parseInt(value);
                        extensionHostDebugEnvironment.params.break = true;
                        break;
                    case 'inspect-extensions':
                        extensionHostDebugEnvironment.params.port = parseInt(value);
                        break;
                    case 'extensionEnvironment':
                        try {
                            extensionHostDebugEnvironment.params.env = JSON.parse(value);
                        }
                        catch (error) {
                            onUnexpectedError(error);
                        }
                        break;
                    case 'enableProposedApi':
                        extensionHostDebugEnvironment.extensionEnabledProposedApi = [];
                        break;
                }
            }
        }
        const developmentOptions = this.options.developmentOptions;
        if (developmentOptions && !extensionHostDebugEnvironment.isExtensionDevelopment) {
            if (developmentOptions.extensions?.length) {
                extensionHostDebugEnvironment.extensionDevelopmentLocationURI = developmentOptions.extensions.map(e => URI.revive(e));
                extensionHostDebugEnvironment.isExtensionDevelopment = true;
            }
            if (developmentOptions.extensionTestsPath) {
                extensionHostDebugEnvironment.extensionTestsLocationURI = URI.revive(developmentOptions.extensionTestsPath);
            }
        }
        return extensionHostDebugEnvironment;
    }
    get filesToOpenOrCreate() {
        if (this.payload) {
            const fileToOpen = this.payload.get('openFile');
            if (fileToOpen) {
                const fileUri = URI.parse(fileToOpen);
                // Support: --goto parameter to open on line/col
                if (this.payload.has('gotoLineMode')) {
                    const pathColumnAware = parseLineAndColumnAware(fileUri.path);
                    return [{
                            fileUri: fileUri.with({ path: pathColumnAware.path }),
                            options: {
                                selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : undefined
                            }
                        }];
                }
                return [{ fileUri }];
            }
        }
        return undefined;
    }
    get filesToDiff() {
        if (this.payload) {
            const fileToDiffPrimary = this.payload.get('diffFilePrimary');
            const fileToDiffSecondary = this.payload.get('diffFileSecondary');
            if (fileToDiffPrimary && fileToDiffSecondary) {
                return [
                    { fileUri: URI.parse(fileToDiffSecondary) },
                    { fileUri: URI.parse(fileToDiffPrimary) }
                ];
            }
        }
        return undefined;
    }
    get filesToMerge() {
        if (this.payload) {
            const fileToMerge1 = this.payload.get('mergeFile1');
            const fileToMerge2 = this.payload.get('mergeFile2');
            const fileToMergeBase = this.payload.get('mergeFileBase');
            const fileToMergeResult = this.payload.get('mergeFileResult');
            if (fileToMerge1 && fileToMerge2 && fileToMergeBase && fileToMergeResult) {
                return [
                    { fileUri: URI.parse(fileToMerge1) },
                    { fileUri: URI.parse(fileToMerge2) },
                    { fileUri: URI.parse(fileToMergeBase) },
                    { fileUri: URI.parse(fileToMergeResult) }
                ];
            }
        }
        return undefined;
    }
}
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "remoteAuthority", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "expectsResolverExtension", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "isBuilt", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "logLevel", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "windowLogsPath", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "logFile", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "userRoamingDataHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "argvResource", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "cacheHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "workspaceStorageHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "localHistoryHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "stateResource", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "userDataSyncHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "sync", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "keyboardLayoutResource", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "untitledWorkspacesHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "serviceMachineIdResource", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extHostLogsPath", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "agentPluginsHome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugExtensionHost", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "isExtensionDevelopment", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationURI", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationKind", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTestsLocationURI", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionEnabledProposedApi", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugRenderer", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableSmokeTestDriver", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExtensions", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableExtensions", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "webviewExternalEndpoint", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTelemetryLogResource", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableTelemetry", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExperiments", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "verbose", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "logExtensionHostCommunication", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipReleaseNotes", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipWelcome", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableWorkspaceTrust", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "isSessionsWindow", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "profile", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "editSessionId", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToOpenOrCreate", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToDiff", null);
__decorate([
    memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToMerge", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBaUIsbUJBQW1CLEVBQTZCLE1BQU0sd0RBQXdELENBQUM7QUFLdkksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVwRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVwSCxNQUFNLENBQUMsTUFBTSxtQ0FBbUMsR0FBRyxzQkFBc0IsQ0FBMkQsbUJBQW1CLENBQUMsQ0FBQztBQW1CekosTUFBTSxPQUFPLGtDQUFrQztJQUs5QyxJQUFJLGVBQWUsS0FBeUIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7SUFHbEYsSUFBSSx3QkFBd0I7UUFDM0IsT0FBTyxDQUFDLENBQUMs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