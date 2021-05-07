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
import { IRemoteTerminalService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IProcessEnvironment, OperatingSystem, OS } from 'vs/base/common/platform';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { IShellLaunchConfigResolveOptions, ITerminalProfile, ITerminalProfileResolverService, TerminalSettingId } from 'vs/workbench/contrib/terminal/common/terminal';
import * as path from 'vs/base/common/path';
import { Codicon, iconRegistry } from 'vs/base/common/codicons';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { debounce } from 'vs/base/common/decorators';

export interface IProfileContextProvider {
	getDefaultSystemShell: (remoteAuthority: string | undefined, os: OperatingSystem) => Promise<string>;
	getEnvironment: (remoteAuthority: string | undefined) => Promise<IProcessEnvironment>;
}

const generatedProfileName = 'Generated';

export abstract class BaseTerminalProfileResolverService implements ITerminalProfileResolverService {
	declare _serviceBrand: undefined;

	private _primaryBackendOs: OperatingSystem | undefined;

	private _defaultProfileName: string | undefined;
	get defaultProfileName(): string | undefined { return this._defaultProfileName; }

	constructor(
		private readonly _context: IProfileContextProvider,
		private readonly _configurationService: IConfigurationService,
		private readonly _configurationResolverService: IConfigurationResolverService,
		private readonly _historyService: IHistoryService,
		private readonly _logService: ILogService,
		private readonly _terminalService: ITerminalService,
		private readonly _workspaceContextService: IWorkspaceContextService,
		private readonly _remoteAgentService: IRemoteAgentService,
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
		this._terminalService.onDidChangeAvailableProfiles(() => this._refreshDefaultProfileName());
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
		if (shellLaunchConfig.executable) {
			return;
		}

		const defaultProfile = this._getUnresolvedRealDefaultProfile(os);
		if (defaultProfile) {
			shellLaunchConfig.icon = defaultProfile.icon;
		}
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
		shellLaunchConfig.icon = this._verifyIcon(shellLaunchConfig.icon) || this._verifyIcon(resolvedProfile.icon) || Codicon.terminal.id;

		// Resolve useShellEnvironment based on the setting if it's not set
		if (shellLaunchConfig.useShellEnvironment === undefined) {
			shellLaunchConfig.useShellEnvironment = this._configurationService.getValue(TerminalSettingId.InheritEnv);
		}
	}

	private _verifyIcon(iconId?: string): string | undefined {
		if (!iconId || !iconRegistry.get(iconId)) {
			return undefined;
		}
		return iconId;
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

	private async _getUnresolvedDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
		// If automation shell is allowed, prefer that
		if (options.allowAutomationShell) {
			const automationShellProfile = this._getUnresolvedAutomationShellProfile(options);
			if (automationShellProfile) {
				return automationShellProfile;
			}
		}

		// If either shell or shellArgs are specified, they will take priority for now until we
		// allow users to migrate, see https://github.com/microsoft/vscode/issues/123171
		const shellSettingProfile = await this._getUnresolvedShellSettingDefaultProfile(options);
		if (shellSettingProfile) {
			return shellSettingProfile;
		}

		// Return the real default profile if it exists and is valid
		const defaultProfile = this._getUnresolvedRealDefaultProfile(options.os);
		if (defaultProfile) {
			return defaultProfile;
		}

		// If there is no real default profile, create a fallback default profile based on the shell
		// and shellArgs settings in addition to the current environment.
		return this._getUnresolvedFallbackDefaultProfile(options);
	}

	private _getUnresolvedRealDefaultProfile(os: OperatingSystem): ITerminalProfile | undefined {
		const defaultProfileName = this.getSafeConfigValue('defaultProfile', os);
		if (defaultProfileName && typeof defaultProfileName === 'string') {
			return this._terminalService.availableProfiles.find(e => e.profileName === defaultProfileName);
		}
		return undefined;
	}

	private async _getUnresolvedShellSettingDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile | undefined> {
		let executable = this.getSafeConfigValue('shell', options.os) as string | null;
		if (!this._isValidShell(executable) && !this.getSafeConfigValue('shellArgs', options.os, false)) {
			return undefined;
		}

		if (!executable || !this._isValidShell(executable)) {
			executable = await this._context.getDefaultSystemShell(options.remoteAuthority, options.os);
		}

		let args: string | string[] | undefined;
		const shellArgsSetting = this.getSafeConfigValue('shellArgs', options.os);
		if (this._isValidShellArgs(shellArgsSetting, options.os)) {
			args = shellArgsSetting;
		}
		if (args === undefined) {
			if (options.os === OperatingSystem.Macintosh && args === undefined) {
				// macOS should launch a login shell by default
				args = ['--login'];
			} else {
				// Resolve undefined to []
				args = [];
			}
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

	private async _getUnresolvedFallbackDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
		const executable = await this._context.getDefaultSystemShell(options.remoteAuthority, options.os);

		// Try select an existing profile to fallback to, based on the default system shell
		const existingProfile = this._terminalService.availableProfiles.find(e => path.parse(e.path).name === path.parse(executable).name);
		if (existingProfile) {
			return existingProfile;
		}

		// Finally fallback to a generated profile
		let args: string | string[] | undefined;
		if (options.os === OperatingSystem.Macintosh && args === undefined) {
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
		const automationShell = this.getSafeConfigValue('automationShell', options.os);
		if (!automationShell || typeof automationShell !== 'string') {
			return undefined;
		}
		return {
			path: automationShell,
			profileName: generatedProfileName,
			isDefault: false
		};
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
		const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.file);
		const lastActiveWorkspace = activeWorkspaceRootUri ? withNullAsUndefined(this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
		profile.path = this._resolveVariables(profile.path, env, lastActiveWorkspace);

		// Resolve args variables
		if (profile.args) {
			if (typeof profile.args === 'string') {
				profile.args = this._resolveVariables(profile.args, env, lastActiveWorkspace);
			} else {
				for (let i = 0; i < profile.args.length; i++) {
					profile.args[i] = this._resolveVariables(profile.args[i], env, lastActiveWorkspace);
				}
			}
		}

		return profile;
	}

	private _resolveVariables(value: string, env: IProcessEnvironment, lastActiveWorkspace: IWorkspaceFolder | undefined) {
		try {
			value = this._configurationResolverService.resolveWithEnvironment(env, lastActiveWorkspace, value);
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

	private _guessProfileIcon(shell: string): string | undefined {
		const file = path.parse(shell).name;
		switch (file) {
			case 'bash':
				return Codicon.terminalBash.id;
			case 'pwsh':
			case 'powershell':
				return Codicon.terminalPowershell.id;
			case 'tmux':
				return Codicon.terminalTmux.id;
			case 'cmd':
				return Codicon.terminalCmd.id;
			default:
				return undefined;
		}
	}

	private _isValidShell(shell: unknown): shell is string {
		if (!shell) {
			return false;
		}
		return typeof shell === 'string';
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

	// TODO: Remove when workspace trust is enabled
	getSafeConfigValue(key: string, os: OperatingSystem, useDefaultValue: boolean = true): unknown | undefined {
		return this.getSafeConfigValueFullKey(`terminal.integrated.${key}.${this._getOsKey(os)}`, useDefaultValue);
	}
	getSafeConfigValueFullKey(key: string, useDefaultValue: boolean = true): unknown | undefined {
		const isWorkspaceConfigAllowed = this._configurationService.getValue(TerminalSettingId.AllowWorkspaceConfiguration);
		const config = this._configurationService.inspect(key);
		let value: unknown | undefined;
		if (isWorkspaceConfigAllowed) {
			value = config.user?.value || config.workspace?.value;
		} else {
			value = config.user?.value;
		}
		if (value === undefined && useDefaultValue) {
			value = config.default?.value;
		}
		// Clone if needed to allow extensibility
		if (Array.isArray(value)) {
			return value.slice();
		}
		if (value !== null && typeof value === 'object') {
			return { ...value };
		}
		return value;
	}
}

export class BrowserTerminalProfileResolverService extends BaseTerminalProfileResolverService {

	constructor(
		@IConfigurationResolverService configurationResolverService: IConfigurationResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IHistoryService historyService: IHistoryService,
		@ILogService logService: ILogService,
		@IRemoteTerminalService remoteTerminalService: IRemoteTerminalService,
		@ITerminalService terminalService: ITerminalService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
	) {
		super(
			{
				getDefaultSystemShell: async (remoteAuthority, os) => {
					if (!remoteAuthority) {
						// Just return basic values, this is only for serverless web and wouldn't be used
						return os === OperatingSystem.Windows ? 'pwsh' : 'bash';
					}
					return remoteTerminalService.getDefaultSystemShell(os);
				},
				getEnvironment: async (remoteAuthority) => {
					if (!remoteAuthority) {
						return env;
					}
					return remoteTerminalService.getEnvironment();
				}
			},
			configurationService,
			configurationResolverService,
			historyService,
			logService,
			terminalService,
			workspaceContextService,
			remoteAgentService
		);
	}
}
