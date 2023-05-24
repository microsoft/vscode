/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, ExtensionContext, extensions, l10n, LogLevel, LogOutputChannel, window } from 'vscode';
import { GithubRemoteSourceProvider } from './remoteSourceProvider';
import { API, GitExtension } from './typings/git';
import { registerCommands } from './commands';
import { GithubCredentialProviderManager } from './credentialProvider';
import { DisposableStore, repositoryHasGitHubRemote } from './util';
import { GithubPushErrorHandler } from './pushErrorHandler';
import { GitBaseExtension } from './typings/git-base';
import { GithubRemoteSourcePublisher } from './remoteSourcePublisher';
import { GithubBranchProtectionProviderManager } from './branchProtection';
import { GitHubCanonicalUriProvider } from './canonicalUriProvider';
import { VscodeDevShareProvider } from './shareProviders';

export function activate(context: ExtensionContext): void {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	const logger = window.createOutputChannel('GitHub', { log: true });
	disposables.push(logger);

	const onDidChangeLogLevel = (logLevel: LogLevel) => {
		logger.appendLine(l10n.t('Log level: {0}', LogLevel[logLevel]));
	};
	disposables.push(logger.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(logger.logLevel);

	disposables.push(initializeGitBaseExtension());
	disposables.push(initializeGitExtension(context, logger));
}

function initializeGitBaseExtension(): Disposable {
	const disposables = new DisposableStore();

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
			disposables.dispose();
		} else {
			initialize();
		}
	};

	const gitBaseExtension = extensions.getExtension<GitBaseExtension>('vscode.git-base')!.exports;
	disposables.add(gitBaseExtension.onDidChangeEnablement(onDidChangeGitBaseExtensionEnablement));
	onDidChangeGitBaseExtensionEnablement(gitBaseExtension.enabled);

	return disposables;
}

function setGitHubContext(gitAPI: API, disposables: DisposableStore) {
	if (gitAPI.repositories.find(repo => repositoryHasGitHubRemote(repo))) {
		commands.executeCommand('setContext', 'github.hasGitHubRepo', true);
	} else {
		const openRepoDisposable = gitAPI.onDidOpenRepository(async e => {
			await e.status();
			if (repositoryHasGitHubRemote(e)) {
				commands.executeCommand('setContext', 'github.hasGitHubRepo', true);
				openRepoDisposable.dispose();
			}
		});
		disposables.add(openRepoDisposable);
	}
}

function initializeGitExtension(context: ExtensionContext, logger: LogOutputChannel): Disposable {
	const disposables = new DisposableStore();

	let gitExtension = extensions.getExtension<GitExtension>('vscode.git');

	const initialize = () => {
		gitExtension!.activate()
			.then(extension => {
				const onDidChangeGitExtensionEnablement = (enabled: boolean) => {
					if (enabled) {
						const gitAPI = extension.getAPI(1);

						disposables.add(registerCommands(gitAPI));
						disposables.add(new GithubCredentialProviderManager(gitAPI));
						disposables.add(new GithubBranchProtectionProviderManager(gitAPI, context.globalState, logger));
						disposables.add(gitAPI.registerPushErrorHandler(new GithubPushErrorHandler()));
						disposables.add(gitAPI.registerRemoteSourcePublisher(new GithubRemoteSourcePublisher(gitAPI)));
						disposables.add(new GitHubCanonicalUriProvider(gitAPI));
						disposables.add(new VscodeDevShareProvider(gitAPI));
						setGitHubContext(gitAPI, disposables);

						commands.executeCommand('setContext', 'git-base.gitEnabled', true);
					} else {
						disposables.dispose();
					}
				};

				disposables.add(extension.onDidChangeEnablement(onDidChangeGitExtensionEnablement));
				onDidChangeGitExtensionEnablement(extension.enabled);
			});
	};

	if (gitExtension) {
		initialize();
	} else {
		const listener = extensions.onDidChange(() => {
			if (!gitExtension && extensions.getExtension<GitExtension>('vscode.git')) {
				gitExtension = extensions.getExtension<GitExtension>('vscode.git');
				initialize();
				listener.dispose();
			}
		});
		disposables.add(listener);
	}

	return disposables;
}
