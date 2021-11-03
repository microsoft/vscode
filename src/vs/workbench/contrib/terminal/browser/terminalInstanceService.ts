/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal as XTermTerminal } from 'xterm';
import type { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import type { Unicode11Addon as XTermUnicode11Addon } from 'xterm-addon-unicode11';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalProfile, TerminalLocation, TerminalShellType, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { escapeNonWindowsPath } from 'vs/platform/terminal/common/terminalEnvironment';
import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalBackend, ITerminalBackendRegistry, TerminalExtensions } from 'vs/workbench/contrib/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { Registry } from 'vs/platform/registry/common/platform';

let Terminal: typeof XTermTerminal;
let SearchAddon: typeof XTermSearchAddon;
let Unicode11Addon: typeof XTermUnicode11Addon;

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	declare _serviceBrand: undefined;
	private _terminalFocusContextKey: IContextKey<boolean>;
	private _terminalHasFixedWidth: IContextKey<boolean>;
	private _terminalShellTypeContextKey: IContextKey<string>;
	private _terminalAltBufferActiveContextKey: IContextKey<boolean>;
	private _configHelper: TerminalConfigHelper;

	private readonly _onDidCreateInstance = new Emitter<ITerminalInstance>();
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._terminalFocusContextKey = TerminalContextKeys.focus.bindTo(this._contextKeyService);
		this._terminalHasFixedWidth = TerminalContextKeys.terminalHasFixedWidth.bindTo(this._contextKeyService);
		this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
		this._terminalAltBufferActiveContextKey = TerminalContextKeys.altBufferActive.bindTo(this._contextKeyService);
		this._configHelper = _instantiationService.createInstance(TerminalConfigHelper);
	}

	createInstance(profile: ITerminalProfile, target?: TerminalLocation, resource?: URI): ITerminalInstance;
	createInstance(shellLaunchConfig: IShellLaunchConfig, target?: TerminalLocation, resource?: URI): ITerminalInstance;
	createInstance(config: IShellLaunchConfig | ITerminalProfile, target?: TerminalLocation, resource?: URI): ITerminalInstance {
		const shellLaunchConfig = this._convertProfileToShellLaunchConfig(config);
		const instance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalFocusContextKey,
			this._terminalHasFixedWidth,
			this._terminalShellTypeContextKey,
			this._terminalAltBufferActiveContextKey,
			this._configHelper,
			shellLaunchConfig,
			resource
		);
		instance.target = target;
		this._onDidCreateInstance.fire(instance);
		return instance;
	}

	private _convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig {
		// Profile was provided
		if (shellLaunchConfigOrProfile && 'profileName' in shellLaunchConfigOrProfile) {
			const profile = shellLaunchConfigOrProfile;
			return {
				executable: profile.path,
				args: profile.args,
				env: profile.env,
				icon: profile.icon,
				color: profile.color,
				name: profile.overrideName ? profile.profileName : undefined,
				cwd
			};
		}

		// Shell launch config was provided
		if (shellLaunchConfigOrProfile) {
			if (cwd) {
				shellLaunchConfigOrProfile.cwd = cwd;
			}
			return shellLaunchConfigOrProfile;
		}

		// Return empty shell launch config
		return {};
	}

	async getXtermConstructor(): Promise<typeof XTermTerminal> {
		if (!Terminal) {
			Terminal = (await import('xterm')).Terminal;
		}
		return Terminal;
	}

	async getXtermSearchConstructor(): Promise<typeof XTermSearchAddon> {
		if (!SearchAddon) {
			SearchAddon = (await import('xterm-addon-search')).SearchAddon;
		}
		return SearchAddon;
	}

	async getXtermUnicode11Constructor(): Promise<typeof XTermUnicode11Addon> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await import('xterm-addon-unicode11')).Unicode11Addon;
		}
		return Unicode11Addon;
	}

	async preparePathForTerminalAsync(originalPath: string, executable: string | undefined, title: string, shellType: TerminalShellType, remoteAuthority: string | undefined): Promise<string> {
		return new Promise<string>(c => {
			if (!executable) {
				c(originalPath);
				return;
			}

			const hasSpace = originalPath.indexOf(' ') !== -1;
			const hasParens = originalPath.indexOf('(') !== -1 || originalPath.indexOf(')') !== -1;

			const pathBasename = basename(executable, '.exe');
			const isPowerShell = pathBasename === 'pwsh' ||
				title === 'pwsh' ||
				pathBasename === 'powershell' ||
				title === 'powershell';

			if (isPowerShell && (hasSpace || originalPath.indexOf('\'') !== -1)) {
				c(`& '${originalPath.replace(/'/g, '\'\'')}'`);
				return;
			}

			if (hasParens && isPowerShell) {
				c(`& '${originalPath}'`);
				return;
			}

			if (isWindows) {
				// 17063 is the build number where wsl path was introduced.
				// Update Windows uriPath to be executed in WSL.
				if (shellType !== undefined) {
					if (shellType === WindowsShellType.GitBash) {
						c(originalPath.replace(/\\/g, '/'));
					}
					else if (shellType === WindowsShellType.Wsl) {
						const offProcService = this.getBackend(remoteAuthority);
						c(offProcService?.getWslPath(originalPath) || originalPath);
					}

					else if (hasSpace) {
						c('"' + originalPath + '"');
					} else {
						c(originalPath);
					}
				} else {
					const lowerExecutable = executable.toLowerCase();
					if (lowerExecutable.indexOf('wsl') !== -1 || (lowerExecutable.indexOf('bash.exe') !== -1 && lowerExecutable.toLowerCase().indexOf('git') === -1)) {
						const offProcService = this.getBackend(remoteAuthority);
						c(offProcService?.getWslPath(originalPath) || originalPath);
					} else if (hasSpace) {
						c('"' + originalPath + '"');
					} else {
						c(originalPath);
					}
				}

				return;
			}

			c(escapeNonWindowsPath(originalPath));
		});
	}

	getBackend(remoteAuthority?: string): ITerminalBackend | undefined {
		return Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).getTerminalBackend(remoteAuthority);
	}
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
