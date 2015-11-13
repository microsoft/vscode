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

import path = require('path');
import fs = require('fs');

class NativeRawGitService extends rawgitservice.RawGitService {

	constructor(gitPath: string, basePath: string, defaultEncoding: string, exePath: string) {
		if (!gitPath) {
			super(null);
			return;
		}

		var gitRootPath = uri.parse(require.toUrl('vs/workbench/parts/git/electron-main')).fsPath;

		var env = objects.assign(objects.assign({}, process.env), {
			GIT_ASKPASS: path.join(gitRootPath, 'askpass.sh'),
			VSCODE_GIT_ASKPASS_BOOTSTRAP: path.join(path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(gitRootPath))))), 'bootstrap.js'),
			VSCODE_GIT_ASKPASS_NODE: exePath,
			VSCODE_GIT_ASKPASS_MODULE_ID: 'vs/workbench/parts/git/electron-main/askpass'
		});

		var git = new gitlib.Git({
			gitPath: gitPath,
			tmpPath: tmpdirSync(), // TODO@Joao os.tmpdir()???
			defaultEncoding: defaultEncoding,
			env: env
		});

		super(git.open(path.normalize(basePath)));
	}
}

function tmpdirSync(): string {
	var path: string;
	var paths = /^win/i.test(process.platform) ? [process.env.TMP, process.env.TEMP] : ['/tmp', '/var/tmp', '/private/tmp', '/private/var/tmp'];

	for (var i = 0; i < paths.length; i++) {
		path = paths[i];
		try {
			if (fs.statSync(path).isDirectory()) {
				return path;
			}
		} catch (e) {
			// Ignore
		}
	}

	throw new Error('Temp dir not found');
}

const server = new Server();
server.registerService('GitService', new NativeRawGitService(process.argv[2], process.argv[3], process.argv[4], process.argv[5]));