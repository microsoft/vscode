/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, ExtensionContext, workspace, Uri } from 'vscode';
import * as path from 'path';
import { findGit, Git } from './git';
import { registerCommands } from './commands';

export function log(...args: any[]): void {
	console.log.apply(console, ['git:', ...args]);
}

class GitSCMProvider {
	resourceGroups = [];
	onDidChangeResourceGroup: any = null;

	getOriginalResource(uri: Uri): Uri | undefined {
		if (uri.scheme !== 'file') {
			return void 0;
		}

		return uri.with({ scheme: 'git-index' });
	}
}

export function activate(context: ExtensionContext): any {
	if (!workspace.rootPath) {
		return;
	}

	const rootPath = workspace.rootPath;
	const pathHint = workspace.getConfiguration('git').get<string>('path');

	findGit(pathHint).then(info => {
		log(`Using git ${info.version} from ${info.path}`);

		const git = new Git({ gitPath: info.path, version: info.version });
		const provider = new GitSCMProvider();
		const providerDisposable = scm.registerSCMProvider('git', provider);

		const contentProvider = workspace.registerTextDocumentContentProvider('git-index', {
			provideTextDocumentContent: uri => {
				const relativePath = path.relative(rootPath, uri.fsPath);

				return git.exec(rootPath, ['show', `HEAD:${relativePath}`]).then(result => {
					if (result.exitCode !== 0) {
						return null;
					}

					return result.stdout;
				});
			}
		});

		const commands = registerCommands();

		context.subscriptions.push(providerDisposable, contentProvider, commands);
	});
}