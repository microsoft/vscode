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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname, posix, win32 } from '../../../../base/common/path.js';
import { OS } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTargetToString } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpResourceScannerService } from '../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
export const IMcpSandboxService = createDecorator('mcpSandboxService');
let McpSandboxService = class McpSandboxService extends Disposable {
    constructor(_fileService, _environmentService, _logService, _mcpResourceScannerService, _remoteAgentService) {
        super();
        this._fileService = _fileService;
        this._environmentService = _environmentService;
        this._logService = _logService;
        this._mcpResourceScannerService = _mcpResourceScannerService;
        this._remoteAgentService = _remoteAgentService;
        this._defaultAllowedDomains = ['registry.npmjs.org']; // Default allowed domains that are commonly needed for MCP servers, even if the user doesn't specify them in their sandbox config
        this._defaultAllowWritePaths = ['~/.npm'];
        this._sandboxConfigPerConfigurationTarget = new Map();
        this._pathJoin = (os, ...segments) => {
            const path = os === 1 /* OperatingSystem.Windows */ ? win32 : posix;
            return path.join(...segments);
        };
        this._getPathDelimiter = async (remoteAuthority) => {
            const os = await this._getOperatingSystem(remoteAuthority);
            return os === 1 /* OperatingSystem.Windows */ ? win32.delimiter : posix.delimiter;
        };
        this._sandboxSettingsId = generateUuid();
        this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();
    }
    async isEnabled(serverDef, remoteAuthority) {
        const os = await this._getOperatingSystem(remoteAuthority);
        if (os === 1 /* OperatingSystem.Windows */) {
            return false;
        }
        return !!serverDef.sandboxEnabled;
    }
    async launchInSandboxIfEnabled(serverDef, launch, remoteAuthority, configTarget) {
        if (launch.type !== 1 /* McpServerTransportType.Stdio */) {
            return launch;
        }
        if (await this.isEnabled(serverDef, remoteAuthority)) {
            this._logService.trace(`McpSandboxService: Launching with config target ${configTarget}`);
            const launchDetails = await this._resolveSandboxLaunchDetails(configTarget, remoteAuthority, launch.sandbox, launch.cwd);
            const quotedCommand = this._quoteShellArgument(launch.command);
            const quotedArgs = launch.args.map(arg => this._quoteShellArgument(arg));
            const sandboxArgs = this._getSandboxCommandArgs(quotedCommand, quotedArgs, launchDetails.sandboxConfigPath);
            const sandboxEnv = await this._getSandboxEnvVariables(launch.env, launchDetails.tempDir, launchDetails.rgPath, remoteAuthority);
            if (launchDetails.srtPath) {
                if (launchDetails.execPath) {
                    return {
                        ...launch,
                        command: launchDetails.execPath,
                        args: [launchDetails.srtPath, ...sandboxArgs],
                        env: sandboxEnv,
                        type: 1 /* McpServerTransportType.Stdio */,
                    };
                }
                else {
                    return {
                        ...launch,
                        command: launchDetails.srtPath,
                        args: sandboxArgs,
                        env: sandboxEnv,
                        type: 1 /* McpServerTransportType.Stdio */,
                    };
                }
            }
            if (!launchDetails.execPath) {
                this._logService.warn('McpSandboxService: execPath is unavailable, launching without sandbox runtime wrapper');
            }
            this._logService.debug(`McpSandboxService: launch details for server ${serverDef.label} - command: ${launch.command}, args: ${launch.args.join(' ')}`);
        }
        return launch;
    }
    getSandboxConfigSuggestionMessage(serverLabel, potentialBlocks, existingSandboxConfig) {
        const suggestions = this._getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig);
        if (!suggestions) {
            return undefined;
        }
        const allowWriteList = suggestions.allowWrite;
        const allowedDomainsList = suggestions.allowedDomains;
        const suggestionLines = [];
        if (allowedDomainsList.length) {
            const shown = allowedDomainsList.map(domain => `"${domain}"`).join(', ');
            suggestionLines.push(localize('mcpSandboxSuggestion.allowedDomains', "Add to `sandbox.network.allowedDomains`: {0}", shown));
        }
        if (allowWriteList.length) {
            const shown = allowWriteList.map(path => `"${path}"`).join(', ');
            suggestionLines.push(localize('mcpSandboxSuggestion.allowWrite', "Add to `sandbox.filesystem.allowWrite`: {0}", shown));
        }
        const sandboxConfig = {};
        if (allowedDomainsList.length) {
            sandboxConfig.network = { allowedDomains: [...allowedDomainsList] };
        }
        if (allowWriteList.length) {
            sandboxConfig.filesystem = { allowWrite: [...allowWriteList] };
        }
        return {
            message: localize('mcpSandboxSuggestion.message', "The MCP server {0} reported potential sandbox blocks. VS Code found possible sandbox configuration updates:\n{1}", serverLabel, suggestionLines.join('\n')),
            sandboxConfig,
        };
    }
    async applySandboxConfigSuggestion(serverDef, mcpResource, configTarget, potentialBlocks, suggestedSandboxConfig) {
        const scanTarget = this._toMcpResourceTarget(configTarget);
        let didChange = false;
        await this._mcpResourceScannerService.updateSandboxConfig(data => {
            const existingSandbox = data.sandbox;
            const suggestedAllowedDomains = suggestedSandboxConfig?.network?.allowedDomains ?? [];
            const suggestedAllowWrite = suggestedSandboxConfig?.filesystem?.allowWrite ?? [];
            const currentAllowedDomains = new Set(existingSandbox?.network?.allowedDomains ?? []);
            for (const domain of suggestedAllowedDomains) {
                if (domain && !currentAllowedDomains.has(domain)) {
                    currentAllowedDomains.add(domain);
                }
            }
            const currentAllowWrite = new Set(existingSandbox?.filesystem?.allowWrite ?? []);
            for (const path of suggestedAllowWrite) {
                if (path && !currentAllowWrite.has(path)) {
                    currentAllowWrite.add(path);
                }
            }
            if (suggestedAllowedDomains.length === 0 && suggestedAllowWrite.length === 0) {
                return data;
            }
            didChange = true;
            const nextSandboxConfig = {};
            if (currentAllowedDomains.size > 0) {
                nextSandboxConfig.network = {
                    ...existingSandbox?.network,
                    allowedDomains: [...currentAllowedDomains]
                };
            }
            if (currentAllowWrite.size > 0) {
                nextSandboxConfig.filesystem = {
                    ...existingSandbox?.filesystem,
                    allowWrite: [...currentAllowWrite],
                };
            }
            return {
                ...data,
                sandbox: nextSandboxConfig,
            };
        }, mcpResource, scanTarget);
        return didChange;
    }
    _getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig) {
        if (!potentialBlocks.length) {
            return undefined;
        }
        const allowWrite = new Set();
        const allowedDomains = new Set();
        const existingAllowWrite = new Set(existingSandboxConfig?.filesystem?.allowWrite ?? []);
        const existingAllowedDomains = new Set(existingSandboxConfig?.network?.allowedDomains ?? []);
        for (const block of potentialBlocks) {
            if (block.kind === 'network' && block.host && !existingAllowedDomains.has(block.host)) {
                allowedDomains.add(block.host);
            }
            if (block.kind === 'filesystem' && block.path && !existingAllowWrite.has(block.path)) {
                allowWrite.add(block.path);
            }
        }
        if (!allowWrite.size && !allowedDomains.size) {
            return undefined;
        }
        return {
            allowWrite: [...allowWrite],
            allowedDomains: [...allowedDomains],
        };
    }
    _toMcpResourceTarget(configTarget) {
        switch (configTarget) {
            case 2 /* ConfigurationTarget.USER */:
            case 3 /* ConfigurationTarget.USER_LOCAL */:
            case 4 /* ConfigurationTarget.USER_REMOTE */:
                return 2 /* ConfigurationTarget.USER */;
            case 5 /* ConfigurationTarget.WORKSPACE */:
                return 5 /* ConfigurationTarget.WORKSPACE */;
            case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
            default:
                return 2 /* ConfigurationTarget.USER */;
        }
    }
    async _resolveSandboxLaunchDetails(configTarget, remoteAuthority, sandboxConfig, launchCwd) {
        const os = await this._getOperatingSystem(remoteAuthority);
        if (os === 1 /* OperatingSystem.Windows */) {
            return { execPath: undefined, srtPath: undefined, rgPath: undefined, sandboxConfigPath: undefined, tempDir: undefined };
        }
        const appRoot = await this._getAppRoot(remoteAuthority);
        const execPath = await this._getExecPath(os, appRoot, remoteAuthority);
        const tempDir = await this._getTempDir(remoteAuthority);
        const srtPath = this._pathJoin(os, appRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'dist', 'cli.js');
        const rgPath = this._pathJoin(os, appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg');
        const sandboxConfigPath = tempDir ? await this._updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) : undefined;
        this._logService.debug(`McpSandboxService: Updated sandbox config path: ${sandboxConfigPath}`);
        return { execPath, srtPath, rgPath, sandboxConfigPath, tempDir };
    }
    async _getExecPath(os, appRoot, remoteAuthority) {
        if (remoteAuthority) {
            return this._pathJoin(os, appRoot, 'node');
        }
        return undefined; // Use Electron executable as the default exec path for local development, which will run the sandbox runtime wrapper with Electron in node mode. For remote, we need to specify the node executable to ensure it runs with Node.js.
    }
    async _getSandboxEnvVariables(baseEnv, tempDir, rgPath, remoteAuthority) {
        let env = { ...baseEnv };
        if (tempDir) {
            env = { ...env, TMPDIR: tempDir.path, SRT_DEBUG: 'true', NODE_USE_ENV_PROXY: '1' };
        }
        if (rgPath) {
            env = { ...env, PATH: env['PATH'] ? `${env['PATH']}${await this._getPathDelimiter(remoteAuthority)}${dirname(rgPath)}` : dirname(rgPath) };
        }
        if (!remoteAuthority) {
            // Add any remote-specific environment variables here
            env = { ...env, ELECTRON_RUN_AS_NODE: '1' };
        }
        // Ensure VSCODE_INSPECTOR_OPTIONS is not inherited by the sandboxed process, as it can cause issues with sandboxing.
        env['VSCODE_INSPECTOR_OPTIONS'] = null;
        return env;
    }
    _getSandboxCommandArgs(command, args, sandboxConfigPath) {
        const result = [];
        if (sandboxConfigPath) {
            result.push('--settings', sandboxConfigPath);
            result.push('--');
        }
        result.push(command, ...args);
        return result;
    }
    async _getRemoteEnv(remoteAuthority) {
        if (!remoteAuthority) {
            return null;
        }
        return this._remoteEnvDetailsPromise;
    }
    async _getOperatingSystem(remoteAuthority) {
        const remoteEnv = await this._getRemoteEnv(remoteAuthority);
        if (remoteEnv) {
            return remoteEnv.os;
        }
        return OS;
    }
    async _getAppRoot(remoteAuthority) {
        const remoteEnv = await this._getRemoteEnv(remoteAuthority);
        if (remoteEnv) {
            return remoteEnv.appRoot.path;
        }
        return dirname(FileAccess.asFileUri('').path);
    }
    async _getTempDir(remoteAuthority) {
        const remoteEnv = await this._getRemoteEnv(remoteAuthority);
        if (remoteEnv) {
            return remoteEnv.tmpDir;
        }
        const environmentService = this._environmentService;
        const tempDir = environmentService.tmpDir;
        if (!tempDir) {
            this._logService.warn('McpSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment');
        }
        return tempDir;
    }
    async _updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) {
        const normalizedSandboxConfig = this._withDefaultSandboxConfig(sandboxConfig, launchCwd);
        let configFileUri;
        const configTargetKey = ConfigurationTargetToString(configTarget);
        if (this._sandboxConfigPerConfigurationTarget.has(configTargetKey)) {
            configFileUri = URI.parse(this._sandboxConfigPerConfigurationTarget.get(configTargetKey));
        }
        else {
            configFileUri = URI.joinPath(tempDir, `vscode-${configTargetKey}-mcp-sandbox-settings-${this._sandboxSettingsId}.json`);
            this._sandboxConfigPerConfigurationTarget.set(configTargetKey, configFileUri.toString());
        }
        await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(normalizedSandboxConfig, null, '\t')), { overwrite: true });
        return configFileUri.path;
    }
    // this method merges the default allowWrite paths and allowedDomains with the ones provided in the sandbox config, to ensure that the default necessary paths and domains are always included in the sandbox config used for launching,
    //  even if they are not explicitly specified in the config provided by the user or the MCP server config.
    _withDefaultSandboxConfig(sandboxConfig, launchCwd) {
        const mergedAllowWrite = new Set(sandboxConfig?.filesystem?.allowWrite ?? []);
        for (const defaultAllowWrite of this._getDefaultAllowWrite(launchCwd ? [launchCwd] : undefined)) {
            if (defaultAllowWrite) {
                mergedAllowWrite.add(defaultAllowWrite);
            }
        }
        const mergedAllowedDomains = new Set(sandboxConfig?.network?.allowedDomains ?? []);
        for (const defaultAllowedDomain of this._defaultAllowedDomains) {
            if (defaultAllowedDomain) {
                mergedAllowedDomains.add(defaultAllowedDomain);
            }
        }
        return {
            ...sandboxConfig,
            network: {
                allowedDomains: [...mergedAllowedDomains],
                deniedDomains: sandboxConfig?.network?.deniedDomains ?? [],
            },
            filesystem: {
                allowWrite: [...mergedAllowWrite],
                denyRead: sandboxConfig?.filesystem?.denyRead ?? [],
                denyWrite: sandboxConfig?.filesystem?.denyWrite ?? [],
            },
        };
    }
    _getDefaultAllowWrite(directories) {
        for (const launchCwd of directories ?? []) {
            const trimmed = launchCwd.trim();
            if (trimmed) {
                this._defaultAllowWritePaths.push(trimmed);
            }
        }
        return this._defaultAllowWritePaths;
    }
    _quoteShellArgument(value) {
        return `'${value.replace(/'/g, `'\\''`)}'`;
    }
};
McpSandboxService = __decorate([
    __param(0, IFileService),
    __param(1, IEnvironmentService),
    __param(2, ILogService),
    __param(3, IMcpResourceScannerService),
    __param(4, IRemoteAgentService)
], McpSandboxService);
export { McpSandboxService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2FuZGJveFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFNhbmRib3hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hFLE9BQU8sRUFBbUIsRUFBRSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUF1QiwyQkFBMkIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzlILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSwwQkFBMEIsRUFBcUIsTUFBTSw4REFBOEQsQ0FBQztBQUU3SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUs1RixNQUFNLENB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