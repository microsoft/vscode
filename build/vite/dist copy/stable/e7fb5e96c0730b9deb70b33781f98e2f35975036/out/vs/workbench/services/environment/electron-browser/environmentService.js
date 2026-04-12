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
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AbstractNativeEnvironmentService } from '../../../../platform/environment/common/environmentService.js';
import { memoize } from '../../../../base/common/decorators.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
export const INativeWorkbenchEnvironmentService = refineServiceDecorator(IEnvironmentService);
export class NativeWorkbenchEnvironmentService extends AbstractNativeEnvironmentService {
    get mainPid() { return this.configuration.mainPid; }
    get machineId() { return this.configuration.machineId; }
    get sqmId() { return this.configuration.sqmId; }
    get devDeviceId() { return this.configuration.devDeviceId; }
    get isPortable() { return this.configuration.isPortable; }
    get remoteAuthority() { return this.configuration.remoteAuthority; }
    get expectsResolverExtension() { return !!this.configuration.remoteAuthority?.includes('+'); }
    get execPath() { return this.configuration.execPath; }
    get backupPath() { return this.configuration.backupPath; }
    get window() {
        return {
            id: this.configuration.windowId,
            handle: this.configuration.handle,
            colorScheme: this.configuration.colorScheme,
            maximized: this.configuration.maximized,
            accessibilitySupport: this.configuration.accessibilitySupport,
            perfMarks: this.configuration.perfMarks,
            isInitialStartup: this.configuration.isInitialStartup,
            isCodeCaching: typeof this.configuration.codeCachePath === 'string'
        };
    }
    get windowLogsPath() { return joinPath(this.logsHome, `window${this.configuration.windowId}`); }
    get logFile() { return joinPath(this.windowLogsPath, `renderer.log`); }
    get extHostLogsPath() { return joinPath(this.windowLogsPath, 'exthost'); }
    get webviewExternalEndpoint() { return `${Schemas.vscodeWebview}://{{uuid}}`; }
    get skipReleaseNotes() { return !!this.args['skip-release-notes']; }
    get skipWelcome() { return !!this.args['skip-welcome']; }
    get logExtensionHostCommunication() { return !!this.args.logExtensionHostCommunication; }
    get enableSmokeTestDriver() { return !!this.args['enable-smoke-test-driver']; }
    get extensionEnabledProposedApi() {
        if (Array.isArray(this.args['enable-proposed-api'])) {
            return this.args['enable-proposed-api'];
        }
        if ('enable-proposed-api' in this.args) {
            return [];
        }
        return undefined;
    }
    get os() { return this.configuration.os; }
    get filesToOpenOrCreate() { return this.configuration.filesToOpenOrCreate; }
    get filesToDiff() { return this.configuration.filesToDiff; }
    get filesToMerge() { return this.configuration.filesToMerge; }
    get filesToWait() { return this.configuration.filesToWait; }
    get isSessionsWindow() { return !!this.configuration.isSessionsWindow; }
    get agentPluginsHome() { return URI.file(this.agentPluginsPath); }
    constructor(configuration, productService) {
        super(configuration, { homeDir: configuration.homeDir, tmpDir: configuration.tmpDir, userDataDir: configuration.userDataDir }, productService);
        this.configuration = configuration;
    }
}
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "mainPid", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "machineId", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "sqmId", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "devDeviceId", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "isPortable", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "remoteAuthority", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "expectsResolverExtension", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "execPath", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "backupPath", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "window", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "windowLogsPath", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "logFile", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "extHostLogsPath", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "webviewExternalEndpoint", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "skipReleaseNotes", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "skipWelcome", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "logExtensionHostCommunication", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "enableSmokeTestDriver", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "extensionEnabledProposedApi", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "os", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "filesToOpenOrCreate", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "filesToDiff", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "filesToMerge", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "filesToWait", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "isSessionsWindow", null);
__decorate([
    memoize
], NativeWorkbenchEnvironmentService.prototype, "agentPluginsHome", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7O0FBS2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBNkIsTUFBTSx3REFBd0QsQ0FBQztBQUN4SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNqSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHaEUsTUFBTSxDQUFDLE1BQU0sa0NBQWtDLEdBQUcsc0JBQXNCLENBQTBELG1CQUFtQixDQUFDLENBQUM7QUF3Q3ZKLE1BQU0sT0FBTyxpQ0FBa0MsU0FBUSxnQ0FBZ0M7SUFHdEYsSUFBSSxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFHcEQsSUFBSSxTQUFTLEtBQUssT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFHeEQsSUFBSSxLQUFLLEtBQUssT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFHaEQsSUFBSSxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7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