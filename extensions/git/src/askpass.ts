/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, InputBoxOptions } from 'vscode';
import { IDisposable } from './util';
import * as path from 'path';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';

export interface AskpassEnvironment {
	GIT_ASKPASS: string;
	ELECTRON_RUN_AS_NODE?: string;
	VSCODE_GIT_ASKPASS_NODE?: string;
	VSCODE_GIT_ASKPASS_MAIN?: string;
	VSCODE_GIT_ASKPASS_HANDLE?: string;
}

export class Askpass implements IIPCHandler {

	private disposable: IDisposable;

	static getDisabledEnv(): AskpassEnvironment {
		return {
			GIT_ASKPASS: path.join(__dirname, 'askpass-empty.sh')
		};
	}

	constructor(ipc: IIPCServer) {
		this.disposable = ipc.registerHandler('askpass', this);
	}

	async handle({ request, host }: { request: string, host: string }): Promise<string> {
		const options: InputBoxOptions = {
			password: /password/i.test(request),
			placeHolder: request,
			prompt: `Git: ${host}`,
			ignoreFocusOut: true
		};

		return await window.showInputBox(options) || '';
	}

	getEnv(): AskpassEnvironment {
		return {
			ELECTRON_RUN_AS_NODE: '1',
			GIT_ASKPASS: path.join(__dirname, 'askpass.sh'),
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, 'askpass-main.js')
		};
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
