/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { CancellationToken, commands, Disposable, scm, SourceControl, SourceControlResourceGroup, SourceControlResourceState, Uri, workspace } from 'vscode';
import { IChangeStore } from './stores';
import { GitHubApi } from './github/api';

interface ScmProvider {
	sourceControl: SourceControl,
	groups: SourceControlResourceGroup[]
}

export class VirtualSCM implements Disposable {
	private readonly providers: ScmProvider[] = [];

	private disposable: Disposable;

	constructor(
		private readonly originalScheme: string,
		private readonly github: GitHubApi,
		private readonly changeStore: IChangeStore,
	) {
		this.registerCommands();

		// TODO@eamodio listen for workspace folder changes
		for (const folder of workspace.workspaceFolders ?? []) {
			this.createScmProvider(folder.uri, folder.name);
		}

		this.disposable = Disposable.from(
			changeStore.onDidChange(e => this.update(e.rootUri, e.uri)),
		);

		for (const { uri } of workspace.workspaceFolders ?? []) {
			for (const change of changeStore.getChanges(uri)) {
				this.update(uri, change.uri);
			}
		}
	}

	dispose() {
		this.disposable.dispose();
	}

	private registerCommands() {
		commands.registerCommand('githubBrowser.commit', (...args: any[]) => this.commitChanges(args[0]));

		commands.registerCommand('githubBrowser.discardChanges', (resourceState: SourceControlResourceState) =>
			this.discardChanges(resourceState.resourceUri)
		);

		commands.registerCommand('githubBrowser.openChanges', (resourceState: SourceControlResourceState) =>
			this.openChanges(resourceState.resourceUri)
		);

		commands.registerCommand('githubBrowser.openFile', (resourceState: SourceControlResourceState) =>
			this.openFile(resourceState.resourceUri)
		);
	}

	async commitChanges(sourceControl: SourceControl): Promise<void> {
		const rootPath = sourceControl.rootUri!.fsPath;
		const files = this.changeStore
			.getChanges(sourceControl.rootUri!)
			.map<{ path: string; content: string }>(c => ({ path: c.uri.fsPath.substr(rootPath.length + 1), content: this.changeStore.getContent(c.uri)! }));
		if (!files.length) {
			// TODO@eamodio show message
			return;
		}

		const message = sourceControl.inputBox.value;
		if (message) {
			const sha = await this.github.commit(this.getOriginalResource(sourceControl.rootUri!), message, files);
			if (sha !== undefined) {
				this.changeStore.acceptAll(sourceControl.rootUri!);
				sourceControl.inputBox.value = '';
			}
		}
	}

	discardChanges(uri: Uri): Promise<void> {
		return this.changeStore.discardChanges(uri);
	}

	openChanges(uri: Uri) {
		return this.changeStore.openChanges(uri, this.getOriginalResource(uri));
	}

	openFile(uri: Uri) {
		return this.changeStore.openFile(uri);
	}

	private update(rootUri: Uri, uri: Uri) {
		const folder = workspace.getWorkspaceFolder(uri);
		if (folder === undefined) {
			return;
		}

		const provider = this.createScmProvider(rootUri, folder.name);
		const group = this.createChangesGroup(provider);
		group.resourceStates = this.changeStore.getChanges(rootUri).map<SourceControlResourceState>(c => {
			const rs: SourceControlResourceState = {
				resourceUri: c.uri,
				command: {
					command: 'githubBrowser.openChanges',
					title: 'Open Changes',
				}
			};
			rs.command!.arguments = [rs];
			return rs;
		});
	}

	private createScmProvider(rootUri: Uri, name: string) {
		let provider = this.providers.find(sc => sc.sourceControl.rootUri?.toString() === rootUri.toString());
		if (provider === undefined) {
			const sourceControl = scm.createSourceControl('github', name, rootUri);
			sourceControl.quickDiffProvider = { provideOriginalResource: uri => this.getOriginalResource(uri) };
			sourceControl.acceptInputCommand = {
				command: 'githubBrowser.commit',
				title: 'Commit',
				arguments: [sourceControl]
			};
			sourceControl.inputBox.placeholder = `Message (Ctrl+Enter to commit '${name}')`;
			// sourceControl.inputBox.validateInput = value => value ? undefined : 'Invalid commit message';

			provider = { sourceControl: sourceControl, groups: [] };
			this.createChangesGroup(provider);
			this.providers.push(provider);
		}

		return provider;
	}

	private createChangesGroup(provider: ScmProvider) {
		let group = provider.groups.find(g => g.id === 'github.changes');
		if (group === undefined) {
			group = provider.sourceControl.createResourceGroup('github.changes', 'Changes');
			provider.groups.push(group);
		}

		return group;
	}

	private getOriginalResource(uri: Uri, _token?: CancellationToken): Uri {
		return uri.with({ scheme: this.originalScheme });
	}
}
