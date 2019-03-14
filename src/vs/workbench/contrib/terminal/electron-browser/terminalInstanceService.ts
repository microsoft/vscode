/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Terminal as XTermTerminal } from 'vscode-xterm';
import { ITerminalInstance, IWindowsShellHelper, ITerminalConfigHelper, ITerminalProcessManager, IShellLaunchConfig, ITerminalChildProcess } from 'vs/workbench/contrib/terminal/common/terminal';
import { WindowsShellHelper } from 'vs/workbench/contrib/terminal/node/windowsShellHelper';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalProcessManager } from 'vs/workbench/contrib/terminal/browser/terminalProcessManager';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import { TerminalProcess } from 'vs/workbench/contrib/terminal/node/terminalProcess';
import { IRemoteAgentService, IRemoteAgentEnvironment } from 'vs/workbench/services/remote/node/remoteAgentService';
import { URI } from 'vs/base/common/uri';

let Terminal: typeof XTermTerminal;

/**
 * A service used by TerminalInstance (and components owned by it) that allows it to break its
 * dependency on electron-browser and node layers, while at the same time avoiding a cyclic
 * dependency on ITerminalService.
 */
export class TerminalInstanceService implements ITerminalInstanceService {
	public _serviceBrand: any;

	private _remoteAgentEnvironment: IRemoteAgentEnvironment | undefined | null;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService
	) {
	}

	public async getXtermConstructor(): Promise<typeof XTermTerminal> {
		if (!Terminal) {
			Terminal = (await import('vscode-xterm')).Terminal;
			// Enable xterm.js addons
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/search/search'));
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/webLinks/webLinks'));
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/winptyCompat/winptyCompat'));
			// Localize strings
			Terminal.strings.blankLine = nls.localize('terminal.integrated.a11yBlankLine', 'Blank line');
			Terminal.strings.promptLabel = nls.localize('terminal.integrated.a11yPromptLabel', 'Terminal input');
			Terminal.strings.tooMuchOutput = nls.localize('terminal.integrated.a11yTooMuchOutput', 'Too much output to announce, navigate to rows manually to read');
		}
		return Terminal;
	}

	public createWindowsShellHelper(shellProcessId: number, instance: ITerminalInstance, xterm: XTermTerminal): IWindowsShellHelper {
		return new WindowsShellHelper(shellProcessId, instance, xterm);
	}

	public createTerminalProcessManager(id: number, configHelper: ITerminalConfigHelper): ITerminalProcessManager {
		return this._instantiationService.createInstance(TerminalProcessManager, id, configHelper);
	}

	public createTerminalProcess(shellLaunchConfig: IShellLaunchConfig, cwd: string, cols: number, rows: number, env: IProcessEnvironment, windowsEnableConpty: boolean): ITerminalChildProcess {
		return new TerminalProcess(shellLaunchConfig, cwd, cols, rows, env, windowsEnableConpty);
	}

	private async _fetchRemoteAgentEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (this._remoteAgentEnvironment === undefined) {
			const connection = await this._remoteAgentService.getConnection();
			if (!connection) {
				this._remoteAgentEnvironment = null;
				return this._remoteAgentEnvironment;
			}
			this._remoteAgentEnvironment = await connection.getEnvironment();
		}
		return this._remoteAgentEnvironment;
	}

	public async getRemoteUserHome(): Promise<URI | undefined> {
		const env = await this._fetchRemoteAgentEnvironment();
		if (env === null) {
			return undefined;
		}
		return env.userHome;
	}

	public async getRemoteOperatingSystem(): Promise<OperatingSystem | undefined> {
		const env = await this._fetchRemoteAgentEnvironment();
		if (env === null) {
			return undefined;
		}
		return env.os;
	}
}