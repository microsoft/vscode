/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, l10n, LogOutputChannel, TerminalShellExecutionEndEvent, window, workspace } from 'vscode';
import { dispose, filterEvent, IDisposable } from './util';
import { Model } from './model';

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

export class TerminalShellExecutionManager {
	private readonly subcommands = new Set<string>([
		'add', 'branch', 'checkout', 'cherry-pick', 'clean', 'commit', 'fetch', 'merge',
		'mv', 'rebase', 'reset', 'restore', 'revert', 'rm', 'pull', 'push', 'stash', 'switch']);

	private readonly disposables: IDisposable[] = [];

	constructor(
		private readonly model: Model,
		private readonly logger: LogOutputChannel
	) {
		window.onDidEndTerminalShellExecution(this.onDidEndTerminalShellExecution, this, this.disposables);
	}

	private onDidEndTerminalShellExecution(e: TerminalShellExecutionEndEvent): void {
		const { execution, exitCode, shellIntegration } = e;
		const [executable, subcommand] = execution.commandLine.value.split(/\s+/);
		const cwd = execution.cwd ?? shellIntegration.cwd;

		if (executable.toLowerCase() !== 'git' || !this.subcommands.has(subcommand?.toLowerCase()) || !cwd || exitCode !== 0) {
			return;
		}

		this.logger.trace(`[TerminalShellExecutionManager][onDidEndTerminalShellExecution] Matched git subcommand: ${subcommand}`);

		const repository = this.model.getRepository(cwd);
		if (!repository) {
			this.logger.trace(`[TerminalShellExecutionManager][onDidEndTerminalShellExecution] Unable to find repository for current working directory: ${cwd.toString()}`);
			return;
		}

		repository.status();
	}

	dispose(): void {
		dispose(this.disposables);
	}
}
