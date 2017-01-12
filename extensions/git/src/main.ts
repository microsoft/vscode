/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext, workspace, Uri, window, Disposable, Event } from 'vscode';
import { findGit, Git } from './git';
import { Model } from './model';
import { GitSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { CheckoutStatusBar, SyncStatusBar } from './statusbar';
import { filterEvent, anyEvent, throttle } from './util';
import { GitContentProvider } from './contentProvider';
import * as nls from 'vscode-nls';
import { decorate, debounce } from 'core-decorators';

nls.config();

class Watcher {

	private listener: Disposable;

	constructor(private model: Model, onWorkspaceChange: Event<Uri>) {
		this.listener = onWorkspaceChange(this.eventuallyUpdateModel, this);
	}

	@debounce(1000)
	private eventuallyUpdateModel(): void {
		this.updateModelAndWait();
	}

	@decorate(throttle)
	private async updateModelAndWait(): Promise<void> {
		await this.model.update();
		await new Promise(c => setTimeout(c, 8000));
	}

	dispose(): void {
		this.listener.dispose();
	}
}

async function init(disposables: Disposable[]): Promise<void> {
	const rootPath = workspace.rootPath;

	if (!rootPath) {
		return;
	}

	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint);
	const git = new Git({ gitPath: info.path, version: info.version });
	const repository = git.open(rootPath);
	const repositoryRoot = await repository.getRoot();
	const model = new Model(repositoryRoot, repository);

	const outputChannel = window.createOutputChannel('git');
	outputChannel.appendLine(`Using git ${info.version} from ${info.path}`);
	git.onOutput(str => outputChannel.append(str), null, disposables);

	const commandCenter = new CommandCenter(model, outputChannel);
	const provider = new GitSCMProvider(model, commandCenter);

	const fsWatcher = workspace.createFileSystemWatcher('**');
	const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
	const onGitChange = filterEvent(onWorkspaceChange, uri => /^\.git\//.test(workspace.asRelativePath(uri)));

	const watcher = new Watcher(model, onWorkspaceChange);
	const contentProvider = new GitContentProvider(git, rootPath, onGitChange);

	const checkoutStatusBar = new CheckoutStatusBar(model);
	const syncStatusBar = new SyncStatusBar(model);

	disposables.push(
		commandCenter,
		provider,
		contentProvider,
		outputChannel,
		fsWatcher,
		watcher,
		checkoutStatusBar,
		syncStatusBar
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