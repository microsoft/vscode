/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import objects = require('vs/base/common/objects');
import uri from 'vs/base/common/uri';
import { GitErrorCodes, IRawGitService } from 'vs/workbench/parts/git/common/git';
import gitlib = require('vs/workbench/parts/git/node/git.lib');
import { RawGitService } from 'vs/workbench/parts/git/node/rawGitService';
import { join, normalize } from 'path';
import { tmpdir } from 'os';
import { realpath } from 'vs/base/node/pfs';
import { GitChannel } from 'vs/workbench/parts/git/common/gitIpc';

function createRawGitService(gitPath: string, workspaceRoot: string, defaultEncoding: string, exePath: string, version: string): TPromise<IRawGitService> {
	if (!gitPath) {
		return TPromise.as(new RawGitService(null));
	}

	const gitRootPath = uri.parse(require.toUrl('vs/workbench/parts/git/node')).fsPath;
	const bootstrapPath = `${ uri.parse(require.toUrl('bootstrap')).fsPath }.js`;
	workspaceRoot = normalize(workspaceRoot);

	const env = objects.assign({}, process.env, {
		GIT_ASKPASS: join(gitRootPath, 'askpass.sh'),
		VSCODE_GIT_ASKPASS_BOOTSTRAP: bootstrapPath,
		VSCODE_GIT_ASKPASS_NODE: exePath,
		VSCODE_GIT_ASKPASS_MODULE_ID: 'vs/workbench/parts/git/node/askpass'
	});

	const git = new gitlib.Git({
		gitPath, version,
		tmpPath: tmpdir(),
		defaultEncoding: defaultEncoding,
		env: env
	});

	const repo = git.open(workspaceRoot);

	return repo.getRoot()
		.then<string>(null, (err: gitlib.GitError) => {
			if (err instanceof gitlib.GitError && err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
				return workspaceRoot;
			}

			return TPromise.wrapError(err);
		})
		.then(root => realpath(root))
		.then(root => git.open(root))
		.then(repo => new RawGitService(repo));
}

const server = new Server();
const service = createRawGitService(process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv[6]);
const channel = new GitChannel(service);
server.registerChannel('git', channel);
