/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, ExtensionContext, workspace } from 'vscode';
import { findGit, Git } from './git';

export function log(...args: any[]): void {
	console.log.apply(console, ['git:', ...args]);
}

export function activate(context: ExtensionContext): any {
	if (!workspace) {
		return;
	}

	const pathHint = workspace.getConfiguration('git').get<string>('path');

	findGit(pathHint).then(info => {
		log(`Using git ${info.version} from ${info.path}`);

		const git = new Git({ gitPath: info.path, version: info.version });

		const scmProvider = scm.createSCMProvider('git', {
			getOriginalResource: uri => {
				if (uri.scheme !== 'file') {
					return null;
				}

				return uri.with({ scheme: 'git-index' });
			}
		});

		const contentProvider = workspace.registerTextDocumentContentProvider('git-index', {
			provideTextDocumentContent: uri => {
				return git.exec(workspace.rootPath, ['show', uri.fsPath]).then(result => {
					if (result.exitCode !== 0) {
						return null;
					}

					return result.stdout;
				});
			}
		});

		context.subscriptions.push(scmProvider, contentProvider);
	});
}