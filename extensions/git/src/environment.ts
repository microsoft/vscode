/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import { IIPCServer } from './ipc/ipcServer';
import { filterEvent, IDisposable } from './util';

export class EnvironmentManager implements IDisposable {

	private readonly env: { [key: string]: string };
	private readonly disposable: IDisposable;

	constructor(private readonly context: ExtensionContext, ipc?: IIPCServer) {
		this.env = {
			...ipc?.getEnv(),
			// VSCODE_GIT_ASKPASS
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_EXTRA_ARGS: (process.versions['electron'] && process.versions['microsoft-build']) ? '--ms-enable-electron-run-as-node' : '',
			// VSCODE_GIT_EDITOR
			VSCODE_GIT_EDITOR_NODE: process.execPath,
			VSCODE_GIT_EDITOR_EXTRA_ARGS: (process.versions['electron'] && process.versions['microsoft-build']) ? '--ms-enable-electron-run-as-node' : '',
		};

		const config = workspace.getConfiguration('git');

		if (config.get<boolean>('useIntegratedAskPass')) {
			this.env.GIT_ASKPASS = path.join(__dirname, ipc ? 'askpass.sh' : 'askpass-empty.sh');
		}
		if (config.get<boolean>('useEditorAsCommitInput')) {
			this.env.GIT_EDITOR = `"${path.join(__dirname, ipc ? 'git-editor.sh' : 'git-editor-empty.sh')}"`;
		}

		this.disposable = filterEvent(workspace.onDidChangeConfiguration, e =>
			e.affectsConfiguration('git.enabled') ||
			e.affectsConfiguration('git.terminalAuthentication') ||
			e.affectsConfiguration('git.terminalGitEditor')
		)(this.refreshTerminalEnv, this);

		this.refreshTerminalEnv();
	}

	public getEnv(): { [key: string]: string } {
		return this.env;
	}

	private refreshTerminalEnv(): void {
		this.context.environmentVariableCollection.clear();
		const config = workspace.getConfiguration('git');

		if (!config.get<boolean>('enabled', true)) {
			return;
		}

		for (const name of Object.keys(this.env)) {
			if ((name.toUpperCase() !== 'GIT_ASKPASS' && name.toUpperCase() !== 'GIT_EDITOR') ||
				(name.toUpperCase() === 'GIT_ASKPASS' && config.get<boolean>('terminalAuthentication', true)) ||
				(name.toUpperCase() === 'GIT_EDITOR' && config.get<boolean>('terminalGitEditor', true))) {
				this.context.environmentVariableCollection.replace(name, this.env[name]);
			}
		}
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
