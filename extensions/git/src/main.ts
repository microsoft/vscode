/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext, workspace, window, Disposable } from 'vscode';
import { findGit, Git } from './git';
import { Model } from './model';
import { GitSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { CheckoutStatusBar, SyncStatusBar } from './statusbar';
import { GitContentProvider } from './contentProvider';
import { AutoFetcher } from './autofetch';
import { MergeDecorator } from './merge';
import { CommitController } from './commit';
import * as nls from 'vscode-nls';

const localize = nls.config()();

async function init(disposables: Disposable[]): Promise<void> {
	const outputChannel = window.createOutputChannel('Git');
	disposables.push(outputChannel);

	const config = workspace.getConfiguration('git');
	const enabled = config.get<boolean>('enabled') === true;
	const rootPath = workspace.rootPath;

	if (!rootPath || !enabled) {
		const commandCenter = new CommandCenter(undefined, outputChannel);
		disposables.push(commandCenter);
		return;
	}

	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint);
	const git = new Git({ gitPath: info.path, version: info.version });
	const model = new Model(git, rootPath);

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));
	git.onOutput(str => outputChannel.append(str), null, disposables);

	const commitHandler = new CommitController();
	const commandCenter = new CommandCenter(model, outputChannel);
	const provider = new GitSCMProvider(model, commandCenter);
	const contentProvider = new GitContentProvider(model);
	const checkoutStatusBar = new CheckoutStatusBar(model);
	const syncStatusBar = new SyncStatusBar(model);
	const autoFetcher = new AutoFetcher(model);
	const mergeDecorator = new MergeDecorator(model);

	disposables.push(
		commitHandler,
		commandCenter,
		provider,
		contentProvider,
		checkoutStatusBar,
		syncStatusBar,
		autoFetcher,
		mergeDecorator,
		model
	);
}

export function activate(context: ExtensionContext): any {
	if (!workspace.rootPath) {
		return;
	}

	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	init(disposables)
		.catch(err => console.error(err));
}