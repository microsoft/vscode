/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext, workspace, window, Disposable, commands, Uri, scm } from 'vscode';
import { findGit, Git } from './git';
import { Model } from './model';
import { GitSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { CheckoutStatusBar, SyncStatusBar } from './statusbar';
import { GitContentProvider } from './contentProvider';
import { AutoFetcher } from './autofetch';
import { MergeDecorator } from './merge';
import { Askpass } from './askpass';
import TelemetryReporter from 'vscode-extension-telemetry';
import * as nls from 'vscode-nls';

const localize = nls.config()();

async function init(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
	const { name, version, aiKey } = require(context.asAbsolutePath('./package.json')) as { name: string, version: string, aiKey: string };
	const telemetryReporter: TelemetryReporter = new TelemetryReporter(name, version, aiKey);
	disposables.push(telemetryReporter);

	const outputChannel = window.createOutputChannel('Git');
	disposables.push(outputChannel);

	const config = workspace.getConfiguration('git');
	const enabled = config.get<boolean>('enabled') === true;
	const rootPath = workspace.rootPath;

	if (!rootPath || !enabled) {
		const commandCenter = new CommandCenter(undefined, outputChannel, telemetryReporter);
		disposables.push(commandCenter);
		return;
	}

	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint);
	const git = new Git({ gitPath: info.path, version: info.version });
	const askpass = new Askpass();
	const model = new Model(git, rootPath, askpass);

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));
	git.onOutput(str => outputChannel.append(str), null, disposables);

	const commandCenter = new CommandCenter(model, outputChannel, telemetryReporter);
	const provider = new GitSCMProvider(model, commandCenter);
	const contentProvider = new GitContentProvider(model);
	const checkoutStatusBar = new CheckoutStatusBar(model);
	const syncStatusBar = new SyncStatusBar(model);
	const autoFetcher = new AutoFetcher(model);
	const mergeDecorator = new MergeDecorator(model);

	disposables.push(
		commandCenter,
		provider,
		contentProvider,
		checkoutStatusBar,
		syncStatusBar,
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

	scm.inputBox.value = await model.getCommitTemplate();
}

export function activate(context: ExtensionContext): any {
	if (!workspace.rootPath) {
		return;
	}

	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	init(context, disposables)
		.catch(err => console.error(err));
}