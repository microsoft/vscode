/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext, workspace, window, Disposable, commands, Uri } from 'vscode';
import { findGit, Git } from './git';
import { Model } from './model';
import { GitSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { StatusBarCommands } from './statusbar';
import { GitContentProvider } from './contentProvider';
import { AutoFetcher } from './autofetch';
import { MergeDecorator } from './merge';
import { Askpass } from './askpass';
import TelemetryReporter from 'vscode-extension-telemetry';
import * as nls from 'vscode-nls';

const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();

async function init(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
	const { name, version, aiKey } = require(context.asAbsolutePath('./package.json')) as { name: string, version: string, aiKey: string };
	const telemetryReporter: TelemetryReporter = new TelemetryReporter(name, version, aiKey);
	disposables.push(telemetryReporter);

	const outputChannel = window.createOutputChannel('Git');
	disposables.push(outputChannel);

	const config = workspace.getConfiguration('git');
	const enabled = config.get<boolean>('enabled') === true;
	const workspaceRootPath = workspace.rootPath;

	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint);
	const askpass = new Askpass();
	const env = await askpass.getEnv();
	const git = new Git({ gitPath: info.path, version: info.version, env });

	if (!workspaceRootPath || !enabled) {
		const commandCenter = new CommandCenter(git, undefined, outputChannel, telemetryReporter);
		disposables.push(commandCenter);
		return;
	}

	const model = new Model(git, workspaceRootPath);

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));
	git.onOutput(str => outputChannel.append(str), null, disposables);

	const commandCenter = new CommandCenter(git, model, outputChannel, telemetryReporter);
	const statusBarCommands = new StatusBarCommands(model);
	const provider = new GitSCMProvider(model, commandCenter, statusBarCommands);
	const contentProvider = new GitContentProvider(model);
	const autoFetcher = new AutoFetcher(model);
	const mergeDecorator = new MergeDecorator(model);

	disposables.push(
		commandCenter,
		provider,
		contentProvider,
		autoFetcher,
		mergeDecorator,
		model
	);

	if (/^[01]/.test(info.version)) {
		const update = localize('updateGit', "Update Git");
		const choice = await window.showWarningMessage(localize('git20', "You seem to have git {0} installed. Code works best with git >= 2", info.version), update);

		if (choice === update) {
			commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
		}
	}
}

export function activate(context: ExtensionContext): any {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	init(context, disposables)
		.catch(err => console.error(err));
}