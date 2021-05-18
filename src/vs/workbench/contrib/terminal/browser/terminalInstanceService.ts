/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteTerminalService, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal as XTermTerminal } from 'xterm';
import type { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import type { Unicode11Addon as XTermUnicode11Addon } from 'xterm-addon-unicode11';
import type { WebglAddon as XTermWebglAddon } from 'xterm-addon-webgl';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILocalTerminalService, TerminalShellType, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { escapeNonWindowsPath } from 'vs/platform/terminal/common/terminalEnvironment';
import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';

let Terminal: typeof XTermTerminal;
let SearchAddon: typeof XTermSearchAddon;
let Unicode11Addon: typeof XTermUnicode11Addon;
let WebglAddon: typeof XTermWebglAddon;

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	declare _serviceBrand: undefined;
	private readonly _localTerminalService?: ILocalTerminalService;
	constructor(
		@IRemoteTerminalService private readonly _remoteTerminalService: IRemoteTerminalService,
		@optional(ILocalTerminalService) localTerminalService: ILocalTerminalService
	) {
		super();
		this._localTerminalService = localTerminalService;
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

	async getXtermWebglConstructor(): Promise<typeof XTermWebglAddon> {
		if (!WebglAddon) {
			WebglAddon = (await import('xterm-addon-webgl')).WebglAddon;
		}
		return WebglAddon;
	}

	async preparePathForTerminalAsync(originalPath: string, executable: string | undefined, title: string, shellType: TerminalShellType, isRemote: boolean): Promise<string> {
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
						const offProcService = isRemote ? this._remoteTerminalService : this._localTerminalService;
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
						const offProcService = isRemote ? this._remoteTerminalService : this._localTerminalService;
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
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
