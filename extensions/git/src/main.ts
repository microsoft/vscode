/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, ExtensionContext, workspace, Uri, window, Disposable, Event, EventEmitter } from 'vscode';
import * as path from 'path';
import { findGit, Git } from './git';
import { Model } from './model';
import { GitSCMProvider } from './scmProvider';
import { registerCommands } from './commands';
import { CheckoutStatusBar, SyncStatusBar } from './statusbar';
import { filterEvent, anyEvent, throttle } from './util';
import * as nls from 'vscode-nls';
import { decorate, debounce } from 'core-decorators';

nls.config();

class TextDocumentContentProvider {

	private listener: Disposable;

	private onDidChangeEmitter = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> { return this.onDidChangeEmitter.event; }

	private uris = new Set<Uri>();

	constructor(private git: Git, private rootPath: string, onGitChange: Event<Uri>) {
		this.listener = onGitChange(this.fireChangeEvents, this);
	}

	private fireChangeEvents(): void {
		for (let uri of this.uris) {
			this.onDidChangeEmitter.fire(uri);
		}
	}

	async provideTextDocumentContent(uri: Uri): Promise<string> {
		const relativePath = path.relative(this.rootPath, uri.fsPath);

		try {
			const result = await this.git.exec(this.rootPath, ['show', `HEAD:${relativePath}`]);

			if (result.exitCode !== 0) {
				this.uris.delete(uri);
				return '';
			}

			this.uris.add(uri);
			return result.stdout;
		} catch (err) {
			this.uris.delete(uri);
			return '';
		}
	}

	dispose(): void {
		this.listener.dispose();
	}
}

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
	const provider = new GitSCMProvider(model);

	const outputChannel = window.createOutputChannel('git');
	outputChannel.appendLine(`Using git ${info.version} from ${info.path}`);
	git.onOutput(str => outputChannel.append(str), null, disposables);

	const fsWatcher = workspace.createFileSystemWatcher('**');
	const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
	const onGitChange = filterEvent(onWorkspaceChange, uri => /^\.git\//.test(workspace.asRelativePath(uri)));

	const watcher = new Watcher(model, onWorkspaceChange);
	const textDocumentContentProvider = new TextDocumentContentProvider(git, rootPath, onGitChange);

	const checkoutStatusBar = new CheckoutStatusBar(model);
	const syncStatusBar = new SyncStatusBar(model);

	disposables.push(
		registerCommands(model, outputChannel),
		scm.registerSCMProvider('git', provider),
		workspace.registerTextDocumentContentProvider('git-index', textDocumentContentProvider),
		textDocumentContentProvider,
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