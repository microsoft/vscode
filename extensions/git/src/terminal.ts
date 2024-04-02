/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, l10n, workspace } from 'vscode';
import { filterEvent, IDisposable } from './util';

export interface ITerminalEnvironmentProvider {
	featureDescription?: string;
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

		const features: string[] = [];
		for (const envProvider of this.envProviders) {
			const terminalEnv = envProvider?.getTerminalEnv() ?? {};

			for (const name of Object.keys(terminalEnv)) {
				this.context.environmentVariableCollection.replace(name, terminalEnv[name]);
			}
			if (envProvider?.featureDescription && Object.keys(terminalEnv).length > 0) {
				features.push(envProvider.featureDescription);
			}
		}
		if (features.length) {
			this.context.environmentVariableCollection.description = l10n.t('Enables the following features: {0}', features.join(', '));
		}
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
