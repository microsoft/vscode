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
import { toLocalISOString } from '../../../base/common/date.js';
import { memoize } from '../../../base/common/decorators.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { dirname, join, normalize, resolve } from '../../../base/common/path.js';
import { env } from '../../../base/common/process.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
export const EXTENSION_IDENTIFIER_WITH_LOG_REGEX = /^([^.]+\..+)[:=](.+)$/;
export class AbstractNativeEnvironmentService {
    get appRoot() { return dirname(FileAccess.asFileUri('').fsPath); }
    get userHome() { return URI.file(this.paths.homeDir); }
    get userDataPath() { return this.paths.userDataDir; }
    get appSettingsHome() { return URI.file(join(this.userDataPath, 'User')); }
    get tmpDir() { return URI.file(this.paths.tmpDir); }
    get cacheHome() { return URI.file(this.userDataPath); }
    get stateResource() { return joinPath(this.appSettingsHome, 'globalStorage', 'storage.json'); }
    get userRoamingDataHome() { return this.appSettingsHome.with({ scheme: Schemas.vscodeUserData }); }
    get userDataSyncHome() { return joinPath(this.appSettingsHome, 'sync'); }
    get logsHome() {
        if (!this.args.logsPath) {
            const key = toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '');
            this.args.logsPath = join(this.userDataPath, 'logs', key);
        }
        return URI.file(this.args.logsPath);
    }
    get sync() { return this.args.sync; }
    get workspaceStorageHome() { return joinPath(this.appSettingsHome, 'workspaceStorage'); }
    get localHistoryHome() { return joinPath(this.appSettingsHome, 'History'); }
    get keyboardLayoutResource() { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }
    get argvResource() {
        const vscodePortable = env['VSCODE_PORTABLE'];
        if (vscodePortable) {
            return URI.file(join(vscodePortable, 'argv.json'));
        }
        return joinPath(this.userHome, this.productService.dataFolderName, 'argv.json');
    }
    get isExtensionDevelopment() { return !!this.args.extensionDevelopmentPath; }
    get untitledWorkspacesHome() { return URI.file(join(this.userDataPath, 'Workspaces')); }
    get builtinExtensionsPath() {
        const cliBuiltinExtensionsDir = this.args['builtin-extensions-dir'];
        if (cliBuiltinExtensionsDir) {
            return resolve(cliBuiltinExtensionsDir);
        }
        return normalize(join(FileAccess.asFileUri('').fsPath, '..', 'extensions'));
    }
    get extensionsDownloadLocation() {
        const cliExtensionsDownloadDir = this.args['extensions-download-dir'];
        if (cliExtensionsDownloadDir) {
            return URI.file(resolve(cliExtensionsDownloadDir));
        }
        return URI.file(join(this.userDataPath, 'CachedExtensionVSIXs'));
    }
    get extensionsPath() {
        const cliExtensionsDir = this.args['extensions-dir'];
        if (cliExtensionsDir) {
            return resolve(cliExtensionsDir);
        }
        const vscodeExtensions = env['VSCODE_EXTENSIONS'];
        if (vscodeExtensions) {
            return vscodeExtensions;
        }
        const vscodePortable = env['VSCODE_PORTABLE'];
        if (vscodePortable) {
            return join(vscodePortable, 'extensions');
        }
        return joinPath(this.userHome, this.productService.dataFolderName, 'extensions').fsPath;
    }
    get agentPluginsPath() {
        const cliAgentPluginsDir = this.args['agent-plugins-dir'];
        if (cliAgentPluginsDir) {
            return resolve(cliAgentPluginsDir);
        }
        const vscodeAgentPlugins = env['VSCODE_AGENT_PLUGINS'];
        if (vscodeAgentPlugins) {
            return vscodeAgentPlugins;
        }
        const vscodePortable = env['VSCODE_PORTABLE'];
        if (vscodePortable) {
            return join(vscodePortable, 'agent-plugins');
        }
        return joinPath(this.userHome, this.productService.dataFolderName, 'agent-plugins').fsPath;
    }
    get extensionDevelopmentLocationURI() {
        const extensionDevelopmentPaths = this.args.extensionDevelopmentPath;
        if (Array.isArray(extensionDevelopmentPaths)) {
            return extensionDevelopmentPaths.map(extensionDevelopmentPath => {
                if (/^[^:/?#]+?:\/\//.test(extensionDevelopmentPath)) {
                    return URI.parse(extensionDevelopmentPath);
                }
                return URI.file(normalize(extensionDevelopmentPath));
            });
        }
        return undefined;
    }
    get extensionDevelopmentKind() {
        return this.args.extensionDevelopmentKind?.map(kind => kind === 'ui' || kind === 'workspace' || kind === 'web' ? kind : 'workspace');
    }
    get extensionTestsLocationURI() {
        const extensionTestsPath = this.args.extensionTestsPath;
        if (extensionTestsPath) {
            if (/^[^:/?#]+?:\/\//.test(extensionTestsPath)) {
                return URI.parse(extensionTestsPath);
            }
            return URI.file(normalize(extensionTestsPath));
        }
        return undefined;
    }
    get disableExtensions() {
        if (this.args['disable-extensions']) {
            return true;
        }
        const disableExtensions = this.args['disable-extension'];
        if (disableExtensions) {
            if (typeof disableExtensions === 'string') {
                return [disableExtensions];
            }
            if (Array.isArray(disableExtensions) && disableExtensions.length > 0) {
                return disableExtensions;
            }
        }
        return false;
    }
    get debugExtensionHost() { return parseExtensionHostDebugPort(this.args, this.isBuilt); }
    get debugRenderer() { return !!this.args.debugRenderer; }
    get isBuilt() { return !env['VSCODE_DEV']; }
    get verbose() { return !!this.args.verbose; }
    get logLevel() { return this.args.log?.find(entry => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry)); }
    get extensionLogLevel() {
        const result = [];
        for (const entry of this.args.log || []) {
            const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
            if (matches?.[1] && matches[2]) {
                result.push([matches[1], matches[2]]);
            }
        }
        return result.length ? result : undefined;
    }
    get serviceMachineIdResource() { return joinPath(URI.file(this.userDataPath), 'machineid'); }
    get crashReporterId() { return this.args['crash-reporter-id']; }
    get crashReporterDirectory() { return this.args['crash-reporter-directory']; }
    get disableTelemetry() { return !!this.args['disable-telemetry']; }
    get disableExperiments() { return !!this.args['disable-experiments']; }
    get disableWorkspaceTrust() { return !!this.args['disable-workspace-trust']; }
    get useInMemorySecretStorage() { return !!this.args['use-inmemory-secretstorage']; }
    get policyFile() {
        if (this.args['__enable-file-policy']) {
            const vscodePortable = env['VSCODE_PORTABLE'];
            if (vscodePortable) {
                return URI.file(join(vscodePortable, 'policy.json'));
            }
            return joinPath(this.userHome, this.productService.dataFolderName, 'policy.json');
        }
        return undefined;
    }
    get agentSessionsWorkspace() {
        return joinPath(this.appSettingsHome, 'agent-sessions.code-workspace');
    }
    get editSessionId() { return this.args['editSessionId']; }
    get exportPolicyData() {
        return this.args['export-policy-data'];
    }
    get exportDefaultKeybindings() {
        return this.args['export-default-keybindings'];
    }
    get continueOn() {
        return this.args['continueOn'];
    }
    set continueOn(value) {
        this.args['continueOn'] = value;
    }
    get args() { return this._args; }
    constructor(_args, paths, productService) {
        this._args = _args;
        this.paths = paths;
        this.productService = productService;
    }
}
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "appRoot", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "userHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "userDataPath", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "appSettingsHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "tmpDir", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "cacheHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "stateResource", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "userRoamingDataHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "userDataSyncHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "sync", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "workspaceStorageHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "localHistoryHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "keyboardLayoutResource", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "argvResource", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "isExtensionDevelopment", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "untitledWorkspacesHome", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "builtinExtensionsPath", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionsDownloadLocation", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionsPath", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "agentPluginsPath", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionDevelopmentLocationURI", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionDevelopmentKind", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionTestsLocationURI", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "debugExtensionHost", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "logLevel", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "extensionLogLevel", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "serviceMachineIdResource", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "disableTelemetry", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "disableExperiments", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "disableWorkspaceTrust", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "useInMemorySecretStorage", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "policyFile", null);
__decorate([
    memoize
], AbstractNativeEnvironmentService.prototype, "agentSessionsWorkspace", null);
export function parseExtensionHostDebugPort(args, isBuilt) {
    return parseDebugParams(args['inspect-extensions'], args['inspect-brk-extensions'], 5870, isBuilt, args.debugId, args.extensionEnvironment);
}
export function parseDebugParams(debugArg, debugBrkArg, defaultBuildPort, isBuilt, debugId, environmentString) {
    const portStr = debugBrkArg || debugArg;
    const port = Number(portStr) || (!isBuilt ? defaultBuildPort : null);
    const brk = port ? Boolean(!!debugBrkArg) : false;
    let env;
    if (environmentString) {
        try {
            env = JSON.parse(environmentString);
        }
        catch {
            // ignore
        }
    }
    return { port, break: brk, debugId, env };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFLbEQsTUFBTSxDQUFDLE1BQU0sbUNBQW1DLEdBQUcsdUJBQXVCLENBQUM7QUF5QjNFLE1BQU0sT0FBZ0IsZ0NBQWdDO0lBS3JELElBQUksT0FBTyxLQUFhLE9BQU8sT0FBTyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRzFFLElBQUksUUFBUSxLQUFVLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUc1RCxJQUFJLFlBQVksS0FBYSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUc3RCxJQUFJLGVBQWUsS0FBVSxPQUFP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