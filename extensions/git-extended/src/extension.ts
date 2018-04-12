/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PRProvider } from './prProvider';
import { Repository } from './common/models/repository';
import { Configuration } from './configuration';
import { Resource } from './common/resources';
import { GitContentProvider } from './contentProvider';
import { ReviewMode } from './common/models/reviewMode';
import { CredentialStore } from './credentials';

export async function activate(context: vscode.ExtensionContext) {
	// initialize resources
	Resource.initialize(context);

	const rootPath = vscode.workspace.rootPath;

	const config = vscode.workspace.getConfiguration('github');
	const configuration = new Configuration(
		config.get<string>('username'),
		config.get<string>('host'),
		config.get<string>('accessToken')
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(() => {
			const config = vscode.workspace.getConfiguration('github');
			configuration.update(
				config.get<string>('username'),
				config.get<string>('host'),
				config.get<string>('accessToken')
			);
		})
	);

	let gitExt = vscode.extensions.getExtension('vscode.git');
	let importedGitApi = gitExt.exports;
	let repos = await importedGitApi.getRepositories();
	let repo;

	if (!repos || !repos.length) {
		let waitForRepo = new Promise((resolve, reject) => {
			importedGitApi.onDidOpenRepository(repository => {
				resolve(repository);
			});
		});

		repo = await waitForRepo;
	} else {
		repo = repos[0];
	}


	const repository = new Repository(rootPath, context.workspaceState);
	let repositoryInitialized = false;
	repository.onDidRunGitStatus(async e => {
		if (repositoryInitialized) {
			return;
		}
		repositoryInitialized = true;
		let credentialStore = new CredentialStore(configuration);
		let reviewMode = new ReviewMode(repository, credentialStore, context.workspaceState, repo);
		// tslint:disable-next-line:no-unused-expression
		new GitContentProvider(repository);
		await (new PRProvider(configuration, credentialStore)).activate(context, rootPath, repository, repo);
	});
}
