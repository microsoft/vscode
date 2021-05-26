/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNullAsUndefined } from 'vs/base/common/types';
import { generateUuid } from 'vs/base/common/uuid';
import { TerminalLaunchConfig } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { BaseExtHostTerminalService, ExtHostTerminal, ITerminalInternalOptions } from 'vs/workbench/api/common/extHostTerminalService';
import type * as vscode from 'vscode';

export class ExtHostTerminalService extends BaseExtHostTerminalService {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		super(true, extHostRpc);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): vscode.Terminal {
		return this.createTerminalFromOptions({ name, shellPath, shellArgs });
	}

	public createTerminalFromOptions(options: vscode.TerminalOptions, internalOptions?: ITerminalInternalOptions): vscode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
		this._terminals.push(terminal);
		// TODO: Pass in options instead of individual props
		terminal.create(
			withNullAsUndefined(options.shellPath),
			withNullAsUndefined(options.shellArgs),
			withNullAsUndefined(options.cwd),
			withNullAsUndefined(options.env),
			withNullAsUndefined(options.iconPath),
			withNullAsUndefined(options.message),
			/*options.waitOnExit*/ undefined,
			withNullAsUndefined(options.strictEnv),
			withNullAsUndefined(options.hideFromUser),
			withNullAsUndefined(internalOptions?.isFeatureTerminal),
			true,
			withNullAsUndefined(internalOptions?.useShellEnvironment),
			withNullAsUndefined(internalOptions?.isSplitTerminal)
		);
		return terminal.value;
	}
}
