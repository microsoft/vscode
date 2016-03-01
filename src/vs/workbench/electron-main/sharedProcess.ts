/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { IEnvironment } from 'vs/platform/workspace/common/workspace';
import env = require('vs/workbench/electron-main/env');
import { manager as SettingsManager } from 'vs/workbench/electron-main/settings';
import { Instance as UpdateManager } from 'vs/workbench/electron-main/update-manager';

const boostrapPath = URI.parse(require.toUrl('bootstrap')).fsPath;

function getEnvironment(): IEnvironment {
	let configuration: IEnvironment = assign({}, env.cliArgs);
	configuration.execPath = process.execPath;
	configuration.appName = env.product.nameLong;
	configuration.appRoot = env.appRoot;
	configuration.version = env.version;
	configuration.commitHash = env.product.commit;
	configuration.appSettingsHome = env.appSettingsHome;
	configuration.appSettingsPath = env.appSettingsPath;
	configuration.appKeybindingsPath = env.appKeybindingsPath;
	configuration.userExtensionsHome = env.userExtensionsHome;
	configuration.isBuilt = env.isBuilt;
	configuration.updateFeedUrl = UpdateManager.feedUrl;
	configuration.updateChannel = UpdateManager.channel;
	configuration.extensionsGallery = env.product.extensionsGallery;

	return configuration;
}

function _spawnSharedProcess(): cp.ChildProcess {
	// Make sure the nls configuration travels to the shared process.
	const opts = {
		env: assign(assign({}, process.env), {
			AMD_ENTRYPOINT: 'vs/workbench/electron-main/sharedProcessMain'
		})
	};

	const result = cp.fork(boostrapPath, ['--type=SharedProcess'], opts);

	// handshake
	result.once('message', () => {
		result.send({
			configuration: {
				env: getEnvironment()
			},
			contextServiceOptions: {
				globalSettings: SettingsManager.globalSettings
			}
		});
	});

	return result;
}

let spawnCount = 0;

export function spawnSharedProcess(): IDisposable {
	let child: cp.ChildProcess;

	const spawn = () => {
		if (++spawnCount > 10) {
			return;
		}

		child = _spawnSharedProcess();
		child.on('exit', spawn);
	};

	spawn();

	return {
		dispose: () => {
			if (child) {
				child.removeListener('exit', spawn);
				child.kill();
				child = null;
			}
		}
	};
}