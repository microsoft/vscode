/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, workspace } from 'vscode';
import { filterEvent, IDisposable } from './util';

export interface ITerminalEnvironmentProvider {
	getTerminalEnv(): { [key: string]: string };
}

export class TerminalEnvironmentManager {

	private readonly disposable: IDisposable;

	constructor(private readonly context: ExtensionContext, private readonly envProviders: (ITerminalEnvironmentProvider | undefined)[]) {
		this.disposable = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git'))
			(this.refresh, this);

		this.refresh();
	}

	private refresh(): void {
		const config = workspace.getConfiguration('git', null);
		this.context.environmentVariableCollection.clear();

		if (!config.get<boolean>('enabled', true)) {
			return;
		}

		for (const envProvider of this.envProviders) {
			const terminalEnv = envProvider?.getTerminalEnv() ?? {};

			for (const name of Object.keys(terminalEnv)) {
				this.context.environmentVariableCollection.replace(name, terminalEnv[name]);
			}
		}
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
