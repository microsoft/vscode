/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI } from './typings/git';
import { getOctokit } from './octokit';

function sanitizeRepositoryName(value: string): string {
	return value.trim().replace(/[^a-z0-9_.]/ig, '-');
}

export function registerCommands(gitAPI: GitAPI): vscode.Disposable[] {
	async function publish(): Promise<void> {
		if (!vscode.workspace.workspaceFolders?.length) {
			return;
		}

		const folder = vscode.workspace.workspaceFolders[0]; // TODO

		const quickpick = vscode.window.createQuickPick<vscode.QuickPickItem & { repo?: string, auth?: 'https' | 'ssh' }>();
		quickpick.ignoreFocusOut = true;

		quickpick.placeholder = 'Repository Name';
		quickpick.value = folder.name;
		quickpick.show();
		quickpick.busy = true;

		const octokit = await getOctokit();
		const user = await octokit.users.getAuthenticated({});
		const owner = user.data.login;
		quickpick.busy = false;

		let repo: string | undefined;

		const onDidChangeValue = async () => {
			const sanitizedRepo = sanitizeRepositoryName(quickpick.value);

			if (!sanitizedRepo) {
				quickpick.items = [];
			} else {
				quickpick.items = [{ label: `$(repo) Create private repository`, description: `$(github) ${owner}/${sanitizedRepo}`, alwaysShow: true, repo: sanitizedRepo }];
			}
		};

		onDidChangeValue();

		while (true) {
			const listener = quickpick.onDidChangeValue(onDidChangeValue);
			const pick = await getPick(quickpick);
			listener.dispose();

			repo = pick?.repo;

			if (repo) {
				try {
					quickpick.busy = true;
					await octokit.repos.get({ owner, repo: repo });
					quickpick.items = [{ label: `$(error) Repository already exists`, description: `$(github) ${owner}/${repo}`, alwaysShow: true }];
				} catch {
					break;
				} finally {
					quickpick.busy = false;
				}
			}
		}

		quickpick.dispose();

		if (!repo) {
			return;
		}

		const githubRepository = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: false, title: 'Publish to GitHub' }, async progress => {
			progress.report({ message: 'Creating private repository in GitHub', increment: 25 });

			const res = await octokit.repos.createForAuthenticatedUser({
				name: repo!,
				private: true
			});

			const createdGithubRepository = res.data;

			progress.report({ message: 'Creating first commit', increment: 25 });
			const repository = await gitAPI.init(folder.uri);

			if (!repository) {
				return;
			}

			await repository.commit('first commit', { all: true });

			progress.report({ message: 'Uploading files', increment: 25 });
			await repository.addRemote('origin', createdGithubRepository.clone_url);
			await repository.push('origin', 'master', true);

			return createdGithubRepository;
		});

		if (!githubRepository) {
			return;
		}

		const openInGitHub = 'Open In GitHub';
		const action = await vscode.window.showInformationMessage(`Successfully published the '${owner}/${repo}' repository on GitHub.`, openInGitHub);

		if (action === openInGitHub) {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(githubRepository.html_url));
		}
	}

	const disposables = [];

	disposables.push(vscode.commands.registerCommand('github.publish', async () => {
		try {
			publish();
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	}));

	return disposables;
}

function getPick<T extends vscode.QuickPickItem>(quickpick: vscode.QuickPick<T>): Promise<T | undefined> {
	return Promise.race<T | undefined>([
		new Promise<T>(c => quickpick.onDidAccept(() => quickpick.selectedItems.length > 0 && c(quickpick.selectedItems[0]))),
		new Promise<undefined>(c => quickpick.onDidHide(() => c(undefined)))
	]);
}
