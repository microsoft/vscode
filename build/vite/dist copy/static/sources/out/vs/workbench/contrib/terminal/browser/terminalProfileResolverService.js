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
import { Schemas } from '../../../../base/common/network.js';
import { env } from '../../../../base/common/process.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { OS } from '../../../../base/common/platform.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { ITerminalProfileService } from '../common/terminal.js';
import * as path from '../../../../base/common/path.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { debounce } from '../../../../base/common/decorators.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../../base/common/uri.js';
import { deepClone } from '../../../../base/common/objects.js';
import { ITerminalInstanceService } from './terminal.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isString } from '../../../../base/common/types.js';
const generatedProfileName = 'Generated';
/*
 * Resolves terminal shell launch config and terminal profiles for the given operating system,
 * environment, and user configuration.
 */
export class BaseTerminalProfileResolverService extends Disposable {
    get defaultProfileName() { return this._defaultProfileName; }
    constructor(_context, _configurationService, _configurationResolverService, _historyService, _logService, _terminalProfileService, _workspaceContextService, _remoteAgentService) {
        super();
        this._context = _context;
        this._configurationService = _configurationService;
        this._configurationResolverService = _configurationResolverService;
        this._historyService = _historyService;
        this._logService = _logService;
        this._terminalProfileService = _terminalProfileService;
        this._workspaceContextService = _workspaceContextService;
        this._remoteAgentService = _remoteAgentService;
        this._iconRegistry = getIconRegistry();
        if (this._remoteAgentService.getConnection()) {
            this._remoteAgentService.getEnvironment().then(env => this._primaryBackendOs = env?.os || OS);
        }
        else {
            this._primaryBackendOs = OS;
        }
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.defaultProfile.windows" /* TerminalSettingId.DefaultProfileWindows */) ||
                e.affectsConfiguration("terminal.integrated.defaultProfile.osx" /* TerminalSettingId.DefaultProfileMacOs */) ||
                e.affectsConfiguration("terminal.integrated.defaultProfile.linux" /* TerminalSettingId.DefaultProfileLinux */)) {
                this._refreshDefaultProfileName();
            }
        }));
        this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._refreshDefaultProfileName()));
    }
    async _refreshDefaultProfileName() {
        if (this._primaryBackendOs) {
            this._defaultProfileName = (await this.getDefaultProfile({
                remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority,
                os: this._primaryBackendOs
            }))?.profileName;
        }
    }
    resolveIcon(shellLaunchConfig, os) {
        if (shellLaunchConfig.icon) {
            shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon) || this.getDefaultIcon();
            return;
        }
        if (shellLaunchConfig.customPtyImplementation) {
            shellLaunchConfig.icon = this.getDefaultIcon();
            return;
        }
        if (shellLaunchConfig.executable) {
            return;
        }
        const defaultProfile = this._getUnresolvedRealDefaultProfile(os);
        if (defaultProfile) {
            shellLaunchConfig.icon = defaultProfile.icon;
        }
        if (!shellLaunchConfig.icon) {
            shellLaunchConfig.icon = this.getDefaultIcon();
        }
    }
    getDefaultIcon(resource) {
        return this._iconRegistry.getIcon(this._configurationService.getValue("terminal.integrated.tabs.defaultIcon" /* TerminalSettingId.TabsDefaultIcon */, { resource })) || Codicon.terminal;
    }
    async resolveShellLaunchConfig(shellLaunchConfig, options) {
        // Resolve the shell and shell args
        let resolvedProfile;
        if (shellLaunchConfig.executable) {
            resolvedProfile = await this._resolveProfile({
                path: shellLaunchConfig.executable,
                args: shellLaunchConfig.args,
                profileName: generatedProfileName,
                isDefault: false
            }, options);
        }
        else {
            resolvedProfile = await this.getDefaultProfile(options);
        }
        shellLaunchConfig.executable = resolvedProfile.path;
        shellLaunchConfig.args = resolvedProfile.args;
        if (resolvedProfile.env) {
            if (shellLaunchConfig.env) {
                shellLaunchConfig.env = { ...shellLaunchConfig.env, ...resolvedProfile.env };
            }
            else {
                shellLaunchConfig.env = resolvedProfile.env;
            }
        }
        // Verify the icon is valid, and fallback correctly to the generic terminal id if there is
        // an issue
        const resource = shellLaunchConfig === undefined || isString(shellLaunchConfig.cwd) ? undefined : shellLaunchConfig.cwd;
        shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon)
            || this._getCustomIcon(resolvedProfile.icon)
            || this.getDefaultIcon(resource);
        // Override the name if specified
        if (resolvedProfile.overrideName) {
            shellLaunchConfig.name = resolvedProfile.profileName;
        }
        // Apply the color
        shellLaunchConfig.color = shellLaunchConfig.color
            || resolvedProfile.color
            || this._configurationService.getValue("terminal.integrated.tabs.defaultColor" /* TerminalSettingId.TabsDefaultColor */, { resource });
        // Resolve useShellEnvironment based on the setting if it's not set
        if (shellLaunchConfig.useShellEnvironment === undefined) {
            shellLaunchConfig.useShellEnvironment = this._configurationService.getValue("terminal.integrated.inheritEnv" /* TerminalSettingId.InheritEnv */);
        }
    }
    async getDefaultShell(options) {
        return (await this.getDefaultProfile(options)).path;
    }
    async getDefaultShellArgs(options) {
        return (await this.getDefaultProfile(options)).args || [];
    }
    async getDefaultProfile(options) {
        return this._resolveProfile(await this._getUnresolvedDefaultProfile(options), options);
    }
    getEnvironment(remoteAuthority) {
        return this._context.getEnvironment(remoteAuthority);
    }
    _getCustomIcon(icon) {
        if (!icon) {
            return undefined;
        }
        if (isString(icon)) {
            return ThemeIcon.fromId(icon);
        }
        if (ThemeIcon.isThemeIcon(icon)) {
            return icon;
        }
        if (URI.isUri(icon) || isUriComponents(icon)) {
            return URI.revive(icon);
        }
        if ((URI.isUri(icon.light) || isUriComponents(icon.light)) && (URI.isUri(icon.dark) || isUriComponents(icon.dark))) {
            return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
        }
        return undefined;
    }
    async _getUnresolvedDefaultProfile(options) {
        // If automation shell is allowed, prefer that
        if (options.allowAutomationShell) {
            const automationShellProfile = this._getUnresolvedAutomationShellProfile(options);
            if (automationShellProfile) {
                return automationShellProfile;
            }
        }
        // Return the real default profile if it exists and is valid, wait for profiles to be ready
        // if the window just opened
        await this._terminalProfileService.profilesReady;
        const defaultProfile = this._getUnresolvedRealDefaultProfile(options.os);
        if (defaultProfile) {
            return this._setIconForAutomation(options, defaultProfile);
        }
        // If there is no real default profile, create a fallback default profile based on the shell
        // and shellArgs settings in addition to the current environment.
        return this._setIconForAutomation(options, await this._getUnresolvedFallbackDefaultProfile(options));
    }
    _setIconForAutomation(options, profile) {
        if (options.allowAutomationShell) {
            const profileClone = deepClone(profile);
            profileClone.icon = Codicon.tools;
            return profileClone;
        }
        return profile;
    }
    _getUnresolvedRealDefaultProfile(os) {
        return this._terminalProfileService.getDefaultProfile(os);
    }
    async _getUnresolvedFallbackDefaultProfile(options) {
        const executable = await this._context.getDefaultSystemShell(options.remoteAuthority, options.os);
        // Try select an existing profile to fallback to, based on the default system shell, only do
        // this when it is NOT a local terminal in a remote window where the front and back end OS
        // differs (eg. Windows -> WSL, Mac -> Linux)
        if (options.os === OS) {
            let existingProfile = this._terminalProfileService.availableProfiles.find(e => path.parse(e.path).name === path.parse(executable).name);
            if (existingProfile) {
                if (options.allowAutomationShell) {
                    existingProfile = deepClone(existingProfile);
                    existingProfile.icon = Codicon.tools;
                }
                return existingProfile;
            }
        }
        // Finally fallback to a generated profile
        let args;
        if (options.os === 2 /* OperatingSystem.Macintosh */ && path.parse(executable).name.match(/(zsh|bash)/)) {
            // macOS should launch a login shell by default
            args = ['--login'];
        }
        else {
            // Resolve undefined to []
            args = [];
        }
        const icon = this._guessProfileIcon(executable);
        return {
            profileName: generatedProfileName,
            path: executable,
            args,
            icon,
            isDefault: false
        };
    }
    _getUnresolvedAutomationShellProfile(options) {
        const automationProfile = this._configurationService.getValue(`terminal.integrated.automationProfile.${this._getOsKey(options.os)}`);
        if (this._isValidAutomationProfile(automationProfile, options.os)) {
            automationProfile.icon = this._getCustomIcon(automationProfile.icon) || Codicon.tools;
            return automationProfile;
        }
        return undefined;
    }
    async _resolveProfile(profile, options) {
        const env = await this._context.getEnvironment(options.remoteAuthority);
        if (options.os === 1 /* OperatingSystem.Windows */) {
            // Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
            // safe to assume that this was used by accident as Sysnative does not
            // exist and will break the terminal in non-WoW64 environments.
            const isWoW64 = !!env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
            const windir = env.windir;
            if (!isWoW64 && windir) {
                const sysnativePath = path.join(windir, 'Sysnative').replace(/\//g, '\\').toLowerCase();
                if (profile.path && profile.path.toLowerCase().indexOf(sysnativePath) === 0) {
                    profile.path = path.join(windir, 'System32', profile.path.substr(sysnativePath.length + 1));
                }
            }
            // Convert / to \ on Windows for convenience
            if (profile.path) {
                profile.path = profile.path.replace(/\//g, '\\');
            }
        }
        // Resolve path variables
        const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(options.remoteAuthority ? Schemas.vscodeRemote : Schemas.file);
        const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
        profile.path = await this._resolveVariables(profile.path, env, lastActiveWorkspace);
        // Resolve args variables
        if (profile.args) {
            if (isString(profile.args)) {
                profile.args = await this._resolveVariables(profile.args, env, lastActiveWorkspace);
            }
            else {
                profile.args = await Promise.all(profile.args.map(arg => this._resolveVariables(arg, env, lastActiveWorkspace)));
            }
        }
        return profile;
    }
    async _resolveVariables(value, env, lastActiveWorkspace) {
        try {
            value = await this._configurationResolverService.resolveWithEnvironment(env, lastActiveWorkspace, value);
        }
        catch (e) {
            this._logService.error(`Could not resolve shell`, e);
        }
        return value;
    }
    _getOsKey(os) {
        switch (os) {
            case 3 /* OperatingSystem.Linux */: return 'linux';
            case 2 /* OperatingSystem.Macintosh */: return 'osx';
            case 1 /* OperatingSystem.Windows */: return 'windows';
        }
    }
    _guessProfileIcon(shell) {
        const file = path.parse(shell).name;
        switch (file) {
            case 'bash':
                return Codicon.terminalBash;
            case 'pwsh':
            case 'powershell':
                return Codicon.terminalPowershell;
            case 'tmux':
                return Codicon.terminalTmux;
            case 'cmd':
                return Codicon.terminalCmd;
            default:
                return undefined;
        }
    }
    _isValidAutomationProfile(profile, os) {
        if (profile === null || profile === undefined || typeof profile !== 'object') {
            return false;
        }
        if ('path' in profile && isString(profile.path)) {
            return true;
        }
        return false;
    }
}
__decorate([
    debounce(200)
], BaseTerminalProfileResolverService.prototype, "_refreshDefaultProfileName", null);
let BrowserTerminalProfileResolverService = class BrowserTerminalProfileResolverService extends BaseTerminalProfileResolverService {
    constructor(configurationResolverService, configurationService, historyService, logService, terminalInstanceService, terminalProfileService, workspaceContextService, remoteAgentService) {
        super({
            getDefaultSystemShell: async (remoteAuthority, os) => {
                const backend = await terminalInstanceService.getBackend(remoteAuthority);
                if (!remoteAuthority || !backend) {
                    // Just return basic values, this is only for serverless web and wouldn't be used
                    return os === 1 /* OperatingSystem.Windows */ ? 'pwsh' : 'bash';
                }
                return backend.getDefaultSystemShell(os);
            },
            getEnvironment: async (remoteAuthority) => {
                const backend = await terminalInstanceService.getBackend(remoteAuthority);
                if (!remoteAuthority || !backend) {
                    return env;
                }
                return backend.getEnvironment();
            }
        }, configurationService, configurationResolverService, historyService, logService, terminalProfileService, workspaceContextService, remoteAgentService);
    }
};
BrowserTerminalProfileResolverService = __decorate([
    __param(0, IConfigurationResolverService),
    __param(1, IConfigurationService),
    __param(2, IHistoryService),
    __param(3, ITerminalLogService),
    __param(4, ITerminalInstanceService),
    __param(5, ITerminalProfileService),
    __param(6, IWorkspaceContextService),
    __param(7, IRemoteAgentService)
], BrowserTerminalProfileResolverService);
export { BrowserTerminalProfileResolverService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sb0RBQW9ELENBQUM7QUFDaEgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDeEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBd0MsRUFBRSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0YsT0FBTyxFQUFzQixtQkFBbUIsRUFBcUQsTUFBTSxrREFBa0QsQ0FBQztBQUM5SixPQUFPLEVBQXFFLHVCQUF1QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDbkksT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBaUIsTUFBTSxtREFBbUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFD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