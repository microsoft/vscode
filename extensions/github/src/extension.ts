/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, ExtensionContext, extensions } from 'vscode';
import { GithubRemoteSourceProvider } from './remoteSourceProvider';
import { GitExtension } from './typings/git';
import { registerCommands } from './commands';
import { GithubCredentialProviderManager } from './credentialProvider';
import { dispose, combinedDisposable } from './util';
import { GithubPushErrorHandler } from './pushErrorHandler';
import { GitBaseExtension } from './typings/git-base';
import { GithubRemoteSourcePublisher } from './remoteSourcePublisher';

export function activate(context: ExtensionContext): void {
	context.subscriptions.push(initializeGitBaseExtension());
	context.subscriptions.push(initializeGitExtension());
}

function initializeGitBaseExtension(): Disposable {
	const disposables = new Set<Disposable>();

	const initialize = () => {
		try {
			const gitBaseAPI = gitBaseExtension.getAPI(1);

			disposables.add(gitBaseAPI.registerRemoteSourceProvider(new GithubRemoteSourceProvider()));
		}
		catch (err) {
			console.error('Could not initialize GitHub extension');
			console.warn(err);
		}
	};

	const onDidChangeGitBaseExtensionEnablement = (enabled: boolean) => {
		if (!enabled) {
			dispose(disposables);
			disposables.clear();
		} else {
			initialize();
		}
	};

	const gitBaseExtension = extensions.getExtension<GitBaseExtension>('vscode.git-base')!.exports;
	disposables.add(gitBaseExtension.onDidChangeEnablement(onDidChangeGitBaseExtensionEnablement));
	onDidChangeGitBaseExtensionEnablement(gitBaseExtension.enabled);

	return combinedDisposable(disposables);
}

function initializeGitExtension(): Disposable {
	const disposables = new Set<Disposable>();

	let gitExtension = extensions.getExtension<GitExtension>('vscode.git');

	const initialize = () => {
		gitExtension!.activate()
			.then(extension => {
				const onDidChangeGitExtensionEnablement = (enabled: boolean) => {
					if (enabled) {
						const gitAPI = extension.getAPI(1);

						disposables.add(registerCommands(gitAPI));
						disposables.add(new GithubCredentialProviderManager(gitAPI));
						disposables.add(gitAPI.registerPushErrorHandler(new GithubPushErrorHandler()));
						disposables.add(gitAPI.registerRemoteSourcePublisher(new GithubRemoteSourcePublisher(gitAPI)));

						commands.executeCommand('setContext', 'git-base.gitEnabled', true);
					} else {
						dispose(disposables);
						disposables.clear();
					}
				};

				disposables.add(extension.onDidChangeEnablement(onDidChangeGitExtensionEnablement));
				onDidChangeGitExtensionEnablement(extension.enabled);
			});
	};

	if (gitExtension) {
		initialize();
	} else {
		const disposable = extensions.onDidChange(() => {
			if (!gitExtension && extensions.getExtension<GitExtension>('vscode.git')) {
				gitExtension = extensions.getExtension<GitExtension>('vscode.git');
				initialize();

				dispose(disposable);
			}
		});
		disposables.add(disposable);
	}

	return combinedDisposable(disposables);
}
