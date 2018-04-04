/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { CommitsProvider } from './commitsProvider';
import { PRProvider } from './prProvider';
import { Repository } from './common/models/repository';
import { getRemotes, parseRemote } from './common/remote';

export async function activate(context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.rootPath;
	const remotes = await getRemotes(rootPath);
	const remoteUrls = remotes.map(remote => parseRemote(remote.url));
	const repository = new Repository(rootPath, remoteUrls);
	new CommitsProvider().activate(context, rootPath, repository);
	new PRProvider().activate(context, rootPath, repository);
}