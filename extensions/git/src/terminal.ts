/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, workspace } from 'vscode';
import { filterEvent, IDisposable } from './util';

export class TerminalEnvironmentManager {

	private readonly disposable: IDisposable;

	constructor(private readonly context: ExtensionContext, private readonly env: { [key: string]: string }) {
		this.disposable = filterEvent(workspace.onDidChangeConfiguration, e =>
			e.affectsConfiguration('git.enabled') ||
			e.affectsConfiguration('git.terminalAuthentication') ||
			e.affectsConfiguration('git.terminalGitEditor')
		)(this.refresh, this);

		this.refresh();
	}

	private refresh(): void {
		this.context.environmentVariableCollection.clear();
		const config = workspace.getConfiguration('git', null);

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
