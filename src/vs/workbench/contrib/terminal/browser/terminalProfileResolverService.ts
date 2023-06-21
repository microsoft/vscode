/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { env } from 'vs/base/common/process';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IProcessEnvironment, OperatingSystem, OS } from 'vs/base/common/platform';
import { IShellLaunchConfig, ITerminalProfile, TerminalIcon, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IShellLaunchConfigResolveOptions, ITerminalProfileResolverService, ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import * as path from 'vs/base/common/path';
import { Codicon } from 'vs/base/common/codicons';
import { getIconRegistry, IIconRegistry } from 'vs/platform/theme/common/iconRegistry';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { debounce } from 'vs/base/common/decorators';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { equals } from 'vs/base/common/arrays';
import { deepClone } from 'vs/base/common/objects';
import { terminalProfileArgsMatch, isUriComponents } from 'vs/platform/terminal/common/terminalProfiles';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';

export interface IProfileContextProvider {
	getDefaultSystemShell: (remoteAuthority: string | undefined, os: OperatingSystem) => Promise<string>;
	getEnvironment: (remoteAuthority: string | undefined) => Promise<IProcessEnvironment>;
}

const generatedProfileName = 'Generated';

/*
 * Resolves terminal shell launch config and terminal profiles for the given operating system,
 * environment, and user configuration.
 */
export abstract class BaseTerminalProfileResolverService implements ITerminalProfileResolverService {
	declare _serviceBrand: undefined;

	private _primaryBackendOs: OperatingSystem | undefined;

	private readonly _iconRegistry: IIconRegistry = getIconRegistry();

	private _defaultProfileName: string | undefined;
	get defaultProfileName(): string | undefined { return this._defaultProfileName; }

	constructor(
		private readonly _context: IProfileContextProvider,
		private readonly _configurationService: IConfigurationService,
		private readonly _configurationResolverService: IConfigurationResolverService,
		private readonly _historyService: IHistoryService,
		private readonly _logService: ILogService,
		private readonly _terminalProfileService: ITerminalProfileService,
		private readonly _workspaceContextService: IWorkspaceContextService,
		private readonly _remoteAgentService: IRemoteAgentService
	) {
		if (this._remoteAgentService.getConnection()) {
			this._remoteAgentService.getEnvironment().then(env => this._primaryBackendOs = env?.os || OS);
		} else {
			this._primaryBackendOs = OS;
		}
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.DefaultProfileWindows) ||
				e.affectsConfiguration(TerminalSettingId.DefaultProfileMacOs) ||
				e.affectsConfiguration(TerminalSettingId.DefaultProfileLinux)) {
				this._refreshDefaultProfileName();
			}
		});
		this._terminalProfileService.onDidChangeAvailableProfiles(() => this._refreshDefaultProfileName());
	}

	@debounce(200)
	private async _refreshDefaultProfileName() {
		if (this._primaryBackendOs) {
			this._defaultProfileName = (await this.getDefaultProfile({
				remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority,
				os: this._primaryBackendOs
			}))?.profileName;
		}
	}

	resolveIcon(shellLaunchConfig: IShellLaunchConfig, os: OperatingSystem): void {
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

	getDefaultIcon(resource?: URI): TerminalIcon & ThemeIcon {
		return this._iconRegistry.getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon, { resource })) || Codicon.terminal;
	}

	async resolveShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): Promise<void> {
		// Resolve the shell and shell args
		let resolvedProfile: ITerminalProfile;
		if (shellLaunchConfig.executable) {
			resolvedProfile = await this._resolveProfile({
				path: shellLaunchConfig.executable,
				args: shellLaunchConfig.args,
				profileName: generatedProfileName,
				isDefault: false
			}, options);
		} else {
			resolvedProfile = await this.getDefaultProfile(options);
		}
		shellLaunchConfig.executable = resolvedProfile.path;
		shellLaunchConfig.args = resolvedProfile.args;
		if (resolvedProfile.env) {
			if (shellLaunchConfig.env) {
				shellLaunchConfig.env = { ...shellLaunchConfig.env, ...resolvedProfile.env };
			} else {
				shellLaunchConfig.env = resolvedProfile.env;
			}
		}

		// Verify the icon is valid, and fallback correctly to the generic terminal id if there is
		// an issue
		const resource = shellLaunchConfig === undefined || typeof shellLaunchConfig.cwd === 'string' ? undefined : shellLaunchConfig.cwd;
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
			|| this._configurationService.getValue(TerminalSettingId.TabsDefaultColor, { resource });

		// Resolve useShellEnvironment based on the setting if it's not set
		if (shellLaunchConfig.useShellEnvironment === undefined) {
			shellLaunchConfig.useShellEnvironment = this._configurationService.getValue(TerminalSettingId.InheritEnv);
		}
	}

	async getDefaultShell(options: IShellLaunchConfigResolveOptions): Promise<string> {
		return (await this.getDefaultProfile(options)).path;
	}

	async getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): Promise<string | string[]> {
		return (await this.getDefaultProfile(options)).args || [];
	}

	async getDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
		return this._resolveProfile(await this._getUnresolvedDefaultProfile(options), options);
	}

	getEnvironment(remoteAuthority: string | undefined): Promise<IProcessEnvironment> {
		return this._context.getEnvironment(remoteAuthority);
	}

	private _getCustomIcon(icon?: unknown): TerminalIcon | undefined {
		if (!icon) {
			return undefined;
		}
		if (typeof icon === 'string') {
			return ThemeIcon.fromId(icon);
		}
		if (ThemeIcon.isThemeIcon(icon)) {
			return icon;
		}
		if (URI.isUri(icon) || isUriComponents(icon)) {
			return URI.revive(icon);
		}
		if (typeof icon === 'object' && 'light' in icon && 'dark' in icon) {
			const castedIcon = (icon as { light: unknown; dark: unknown });
			if ((URI.isUri(castedIcon.light) || isUriComponents(castedIcon.light)) && (URI.isUri(castedIcon.dark) || isUriComponents(castedIcon.dark))) {
				return { light: URI.revive(castedIcon.light), dark: URI.revive(castedIcon.dark) };
			}
		}
		return undefined;
	}

	private async _getUnresolvedDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
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

	private _setIconForAutomation(options: IShellLaunchConfigResolveOptions, profile: ITerminalProfile): ITerminalProfile {
		if (options.allowAutomationShell) {
			const profileClone = deepClone(profile);
			profileClone.icon = Codicon.tools;
			return profileClone;
		}
		return profile;
	}

	private _getUnresolvedRealDefaultProfile(os: OperatingSystem): ITerminalProfile | undefined {
		return this._terminalProfileService.getDefaultProfile(os);
	}

	private async _getUnresolvedFallbackDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
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
		let args: string | string[] | undefined;
		if (options.os === OperatingSystem.Macintosh && path.parse(executable).name.match(/(zsh|bash)/)) {
			// macOS should launch a login shell by default
			args = ['--login'];
		} else {
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

	private _getUnresolvedAutomationShellProfile(options: IShellLaunchConfigResolveOptions): ITerminalProfile | undefined {
		const automationProfile = this._configurationService.getValue(`terminal.integrated.automationProfile.${this._getOsKey(options.os)}`);
		if (this._isValidAutomationProfile(automationProfile, options.os)) {
			automationProfile.icon = this._getCustomIcon(automationProfile.icon) || Codicon.tools;
			return automationProfile;
		}

		return undefined;
	}

	private async _resolveProfile(profile: ITerminalProfile, options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
		if (options.os === OperatingSystem.Windows) {
			// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
			// safe to assume that this was used by accident as Sysnative does not
			// exist and will break the terminal in non-WoW64 environments.
			const env = await this._context.getEnvironment(options.remoteAuthority);
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
		const env = await this._context.getEnvironment(options.remoteAuthority);
		const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(options.remoteAuthority ? Schemas.vscodeRemote : Schemas.file);
		const lastActiveWorkspace = activeWorkspaceRootUri ? withNullAsUndefined(this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		profile.path = await this._resolveVariables(profile.path, env, lastActiveWorkspace);

		// Resolve args variables
		if (profile.args) {
			if (typeof profile.args === 'string') {
				profile.args = await this._resolveVariables(profile.args, env, lastActiveWorkspace);
			} else {
				profile.args = await Promise.all(profile.args.map(arg => this._resolveVariables(arg, env, lastActiveWorkspace)));
			}
		}

		return profile;
	}

	private async _resolveVariables(value: string, env: IProcessEnvironment, lastActiveWorkspace: IWorkspaceFolder | undefined) {
		try {
			value = await this._configurationResolverService.resolveWithEnvironment(env, lastActiveWorkspace, value);
		} catch (e) {
			this._logService.error(`Could not resolve shell`, e);
		}
		return value;
	}

	private _getOsKey(os: OperatingSystem): string {
		switch (os) {
			case OperatingSystem.Linux: return 'linux';
			case OperatingSystem.Macintosh: return 'osx';
			case OperatingSystem.Windows: return 'windows';
		}
	}

	private _guessProfileIcon(shell: string): ThemeIcon | undefined {
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

	private _isValidShellArgs(shellArgs: unknown, os: OperatingSystem): shellArgs is string | string[] | undefined {
		if (shellArgs === undefined) {
			return true;
		}
		if (os === OperatingSystem.Windows && typeof shellArgs === 'string') {
			return true;
		}
		if (Array.isArray(shellArgs) && shellArgs.every(e => typeof e === 'string')) {
			return true;
		}
		return false;
	}

	async createProfileFromShellAndShellArgs(shell?: unknown, shellArgs?: unknown): Promise<ITerminalProfile | string> {
		const detectedProfile = this._terminalProfileService.availableProfiles?.find(p => {
			if (p.path !== shell) {
				return false;
			}
			if (p.args === undefined || typeof p.args === 'string') {
				return p.args === shellArgs;
			}
			return p.path === shell && equals(p.args, (shellArgs || []) as string[]);
		});
		const fallbackProfile = (await this.getDefaultProfile({
			remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority,
			os: this._primaryBackendOs!
		}));
		fallbackProfile.profileName = `${fallbackProfile.path} (migrated)`;
		const profile = detectedProfile || fallbackProfile;
		const args = this._isValidShellArgs(shellArgs, this._primaryBackendOs!) ? shellArgs : profile.args;
		const createdProfile = {
			profileName: profile.profileName,
			path: profile.path,
			args,
			isDefault: true
		};
		if (detectedProfile && detectedProfile.profileName === createdProfile.profileName && detectedProfile.path === createdProfile.path && terminalProfileArgsMatch(detectedProfile.args, createdProfile.args)) {
			return detectedProfile.profileName;
		}
		return createdProfile;
	}

	private _isValidAutomationProfile(profile: unknown, os: OperatingSystem): profile is ITerminalProfile {
		if (profile === null || profile === undefined || typeof profile !== 'object') {
			return false;
		}
		if ('path' in profile && typeof (profile as { path: unknown }).path === 'string') {
			return true;
		}
		return false;
	}
}

export class BrowserTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService,
		@ITerminalProfileService terminalProfileService: ITerminalProfileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		super(
			{
				getDefaultSystemShell: async (remoteAuthority, os) => {
					const backend = await terminalInstanceService.getBackend(remoteAuthority);
					if (!remoteAuthority || !backend) {
						// Just return basic values, this is only for serverless web and wouldn't be used
						return os === OperatingSystem.Windows ? 'pwsh' : 'bash';
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
			},
			configurationService,
			configurationResolverService,
			historyService,
			logService,
			terminalProfileService,
			workspaceContextService,
			remoteAgentService
		);
	}
}
