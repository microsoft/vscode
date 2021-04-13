import { Platform } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { ITerminalProfile } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import * as path from 'vs/base/common/path';

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
		// private readonly _workspacesService: IWorkspacesService
	) {
		// this._workspacesService.getWorkspaceFolders2()
	}

	resolve(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): void {
	}

	getDefaultShell(options: IShellLaunchConfigResolveOptions): string {
		let maybeExecutable: string | null = null;
		if (options.allowAutomationShell) {
			// If automationShell is specified, this should override the normal setting
			maybeExecutable = getShellSetting(fetchSetting, isWorkspaceShellAllowed, 'automationShell', platformOverride);
		}
		if (!maybeExecutable) {
			const defaultProfile = this._getDefaultProfile();
			if (defaultProfile) {
				maybeExecutable = defaultProfile.path;
			}
		}
		if (!maybeExecutable) {
			maybeExecutable = getShellSetting(fetchSetting, isWorkspaceShellAllowed, 'shell', platformOverride);
		}
		let executable: string = maybeExecutable || this._getDefaultSystemShell(options.platform);

		// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
		// safe to assume that this was used by accident as Sysnative does not
		// exist and will break the terminal in non-WoW64 environments.
		if ((options.platform === Platform.Windows) && !isWoW64 && windir) {
			const sysnativePath = path.join(windir, 'Sysnative').replace(/\//g, '\\').toLowerCase();
			if (executable && executable.toLowerCase().indexOf(sysnativePath) === 0) {
				executable = path.join(windir, 'System32', executable.substr(sysnativePath.length + 1));
			}
		}

		// Convert / to \ on Windows for convenience
		if (executable && options.platform === Platform.Windows) {
			executable = executable.replace(/\//g, '\\');
		}

		// if (variableResolver) {
		// 	try {
		// 		executable = this._configurationResolverService.resolveAsync((executable);
		// 	} catch (e) {
		// 		logService.error(`Could not resolve shell`, e);
		// 	}
		// }

		return executable;
	}

	getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): string | string[] {
		const defaultProfile = this._getDefaultProfile();
		if (defaultProfile) {
			return defaultProfile.args || [];
		}
	}

	private _getDefaultSystemShell(platform: Platform): string {
		// TODO: How to implement? Needs node access?
		// TODO: Cache after first
	}

	private _getDefaultProfile(): ITerminalProfile | undefined {
	}
}
