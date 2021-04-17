/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDefaultShellAndArgsRequest } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal as XTermTerminal } from 'xterm';
import type { SearchAddon as XTermSearchAddon } from 'xterm-addon-search';
import type { Unicode11Addon as XTermUnicode11Addon } from 'xterm-addon-unicode11';
import type { WebglAddon as XTermWebglAddon } from 'xterm-addon-webgl';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { Emitter } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';

let Terminal: typeof XTermTerminal;
let SearchAddon: typeof XTermSearchAddon;
let Unicode11Addon: typeof XTermUnicode11Addon;
let WebglAddon: typeof XTermWebglAddon;

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	public _serviceBrand: undefined;

	protected readonly _onRequestDefaultShellAndArgs = this._register(new Emitter<IDefaultShellAndArgsRequest>());
	readonly onRequestDefaultShellAndArgs = this._onRequestDefaultShellAndArgs.event;

	public async getXtermConstructor(): Promise<typeof XTermTerminal> {
		if (!Terminal) {
			Terminal = (await import('xterm')).Terminal;
		}
		return Terminal;
	}

	public async getXtermSearchConstructor(): Promise<typeof XTermSearchAddon> {
		if (!SearchAddon) {
			SearchAddon = (await import('xterm-addon-search')).SearchAddon;
		}
		return SearchAddon;
	}

	public async getXtermUnicode11Constructor(): Promise<typeof XTermUnicode11Addon> {
		if (!Unicode11Addon) {
			Unicode11Addon = (await import('xterm-addon-unicode11')).Unicode11Addon;
		}
		return Unicode11Addon;
	}

	public async getXtermWebglConstructor(): Promise<typeof XTermWebglAddon> {
		if (!WebglAddon) {
			WebglAddon = (await import('xterm-addon-webgl')).WebglAddon;
		}
		return WebglAddon;
	}

	public async getMainProcessParentEnv(): Promise<IProcessEnvironment> {
		return {};
	}
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
