/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Platform } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { ITerminalProfile } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import * as path from 'vs/base/common/path';
import { ILogService } from 'vs/platform/log/common/log';

export interface IShellLaunchConfigResolverService {
	/**
	 * Resolves a shell launch config
	 */
	resolve(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): void;
	// getDefaultProfile(): ITerminalProfile | undefined;
	getDefaultShell(options: IShellLaunchConfigResolveOptions): string;
	getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): string | string[];
}

export interface IShellLaunchConfigResolveOptions {
	platform: Platform;
	allowAutomationShell: boolean;
}

export abstract class BaseShellLaunchConfigResolverService implements IShellLaunchConfigResolverService {
	constructor(
		private readonly _configurationService: IConfigurationService,
		private readonly _configurationResolverService: IConfigurationResolverService,
		private readonly _getAvailableProfiles: () => ITerminalProfile[],
		private readonly _logService: ILogService
	) {
	}

	resolve(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): void {
	}

	getDefaultShell(options: IShellLaunchConfigResolveOptions): string {
		return this._getResolvedDefaultProfile(options).path;
	}

	getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): string | string[] {
		return this._getResolvedDefaultProfile(options).args || [];
	}

	private _getResolvedDefaultProfile(options: IShellLaunchConfigResolveOptions): ITerminalProfile {
		return this._resolveProfile(this._getUnresolvedDefaultProfile(options), options);
	}

	private _getUnresolvedDefaultProfile(options: IShellLaunchConfigResolveOptions): ITerminalProfile {
		// TODO: Resolve variables

		// If automation shell is allowed, prefer that
		if (options.allowAutomationShell) {
			const automationShellProfile = this._getAutomationShellProfile(options);
			if (automationShellProfile) {
				return automationShellProfile;
			}
		}

		// Return the real default profile if it exists and is valid
		const defaultProfileName = this._configurationService.getValue(`terminal.integrated.defaultProfile.${this._getPlatformKey(options.platform)}`);
		if (defaultProfileName && typeof defaultProfileName === 'string') {
			const profiles = this._getAvailableProfiles();
			const defaultProfile = profiles.find(e => e.profileName === defaultProfileName);
			if (defaultProfile) {
				return defaultProfile;
			}
		}

		// If there is no real default profile, create a synthetic default profile based on the
		// shell and shellArgs settings in addition to the current environment.
		return this._getSyntheticDefaultProfile(options);
	}

	private _getSyntheticDefaultProfile(options: IShellLaunchConfigResolveOptions): ITerminalProfile {
		let executable: string;
		let args: string | string[] | undefined;
		const shellSetting = this._configurationService.getValue(`terminal.integrated.shell.${this._getPlatformKey(options.platform)}`);
		if (this._isValidShell(shellSetting)) {
			executable = shellSetting;
			const shellArgsSetting = this._configurationService.getValue(`terminal.integrated.shellArgs.${this._getPlatformKey(options.platform)}`);
			if (this._isValidShellArgs(shellArgsSetting, options.platform)) {
				args = shellArgsSetting || [];
			}
		} else {
			executable = this._getDefaultSystemShell(options.platform);
		}

		return {
			profileName: 'Default Profile',
			path: executable,
			args
		};
	}

	private _getAutomationShellProfile(options: IShellLaunchConfigResolveOptions): ITerminalProfile | undefined {
		const automationShell = this._configurationService.getValue(`terminal.integrated.automationShell.${this._getPlatformKey(options.platform)}`);
		if (!automationShell || typeof automationShell !== 'string') {
			return undefined;
		}
		return {
			path: automationShell,
			profileName: 'Automation Shell'
		};
	}

	private _getDefaultSystemShell(platform: Platform): string {
		// TODO: How to implement? Needs node access?
		// TODO: Cache after first
		return 'NYI';
	}

	private _resolveProfile(profile: ITerminalProfile, options: IShellLaunchConfigResolveOptions): ITerminalProfile {
		if (options.platform === Platform.Windows) {
			// TODO: Use shell environment service instead of process.env
			// const env = await this._shellEnvironmentService.getShellEnv();

			// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
			// safe to assume that this was used by accident as Sysnative does not
			// exist and will break the terminal in non-WoW64 environments.
			const isWoW64 = !!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
			const windir = process.env.windir;
			if (!isWoW64 && windir) {
				const sysnativePath = path.join(windir, 'Sysnative').replace(/\//g, '\\').toLowerCase();
				if (profile.path && profile.path.toLowerCase().indexOf(sysnativePath) === 0) {
					profile.path = path.join(windir, 'System32', profile.path.substr(sysnativePath.length + 1));
				}
			}

			// Convert / to \ on Windows for convenience
			if (profile.path && options.platform === Platform.Windows) {
				profile.path = profile.path.replace(/\//g, '\\');
			}
		}

		// Resolve path variables
		profile.path = this._resolveVariables(profile.path);

		// Resolve args variables
		if (profile.args) {
			if (typeof profile.args === 'string') {
				profile.args = this._resolveVariables(profile.args);
			} else {
				for (let i = 0; i < profile.args.length; i++) {
					profile.args[i] = this._resolveVariables(profile.args[i]);
				}
			}
		}

		return profile;
	}

	private _resolveVariables(value: string) {
		try {
			// TODO: Move off deprecated API
			// TODO: Specify workspace folder
			value = this._configurationResolverService.resolve(undefined, value);
		} catch (e) {
			this._logService.error(`Could not resolve shell`, e);
		}
		return value;
	}

	private _getPlatformKey(platform: Platform): string {
		switch (platform) {
			case Platform.Linux: return 'linux';
			case Platform.Mac: return 'osx';
			case Platform.Windows: return 'windows';
			default: return '';
		}
	}

	private _isValidShell(shell: unknown): shell is string {
		if (!shell) {
			return false;
		}
		return typeof shell === 'string';
	}

	private _isValidShellArgs(shellArgs: unknown, platform: Platform): shellArgs is string | string[] | undefined {
		if (shellArgs === undefined) {
			return true;
		}
		if (platform === Platform.Windows && typeof shellArgs === 'string') {
			return true;
		}
		if (Array.isArray(shellArgs) && shellArgs.every(e => typeof e === 'string')) {
			return true;
		}
		return false;
	}
}
