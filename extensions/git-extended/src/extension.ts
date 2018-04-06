/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PRProvider } from './prProvider';
import { Repository } from './common/models/repository';
import { getRemotes, parseRemote } from './common/remote';
import { Configuration as IConfiguration } from './configuration';

class Configuration implements IConfiguration {
	onDidChange: vscode.Event<IConfiguration>;

	private emitter: vscode.EventEmitter<IConfiguration>;

	constructor(
		public username: string | undefined,
		public host: string = 'github.com',
		public accessToken: string
	) {
		this.emitter = new vscode.EventEmitter<IConfiguration>();
		this.onDidChange = this.emitter.event;
	}

	update(username, host = 'github.com', accessToken) {
		if (
			username !== this.username ||
			host !== this.host ||
			accessToken !== this.accessToken
		) {
			this.username = username;
			this.host = host;
			this.accessToken = accessToken;
			this.emitter.fire(this);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.rootPath;
	const remotes = await getRemotes(rootPath);

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
		let model = await importedGitApi.getModel();
		let waitForRepo = new Promise((resolve, reject) => {
			model.onDidOpenRepository(repository => {
				resolve(repository);
			});
		});
		repo = await waitForRepo;
	} else {
		repo = repos[0];
	}

	const remoteInfos = remotes.map(remote => parseRemote(remote.name, remote.url));
	const repository = new Repository(rootPath, remoteInfos);
	new PRProvider(configuration).activate(context, rootPath, repository, repo);
}
