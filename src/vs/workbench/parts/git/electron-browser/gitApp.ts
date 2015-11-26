/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Server } from 'vs/base/node/service.cp';
import objects = require('vs/base/common/objects');
import uri from 'vs/base/common/uri';
import gitlib = require('vs/workbench/parts/git/node/git.lib');
import rawgitservice = require('vs/workbench/parts/git/node/rawGitService');

import { join, dirname, normalize } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';

class IPCRawGitService extends rawgitservice.RawGitService {

	constructor(gitPath: string, basePath: string, defaultEncoding: string, exePath: string) {
		if (!gitPath) {
			super(null);
		} else {
			const gitRootPath = uri.parse(require.toUrl('vs/workbench/parts/git/electron-main')).fsPath;
			const bootstrapPath = `${ uri.parse(require.toUrl('bootstrap')).fsPath }.js`;

			const env = objects.assign({}, process.env, {
				GIT_ASKPASS: join(gitRootPath, 'askpass.sh'),
				VSCODE_GIT_ASKPASS_BOOTSTRAP: bootstrapPath,
				VSCODE_GIT_ASKPASS_NODE: exePath,
				VSCODE_GIT_ASKPASS_MODULE_ID: 'vs/workbench/parts/git/electron-main/askpass'
			});

			const git = new gitlib.Git({
				gitPath: gitPath,
				tmpPath: tmpdir(),
				defaultEncoding: defaultEncoding,
				env: env
			});

			super(git.open(normalize(basePath)));
		}
	}
}

const server = new Server();
server.registerService('GitService', new IPCRawGitService(process.argv[2], process.argv[3], process.argv[4], process.argv[5]));