/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { IEnvironment } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/workbench/electron-main/env';
import { ISettingsService } from 'vs/workbench/electron-main/settings';
import { IUpdateService } from 'vs/workbench/electron-main/update-manager';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';

const boostrapPath = URI.parse(require.toUrl('bootstrap')).fsPath;

function getEnvironment(envService: IEnvironmentService, updateManager: IUpdateService): IEnvironment {
	let configuration: IEnvironment = assign({}, envService.cliArgs);
	configuration.execPath = process.execPath;
	configuration.appName = envService.product.nameLong;
	configuration.appRoot = envService.appRoot;
	configuration.version = envService.version;
	configuration.commitHash = envService.product.commit;
	configuration.appSettingsHome = envService.appSettingsHome;
	configuration.appSettingsPath = envService.appSettingsPath;
	configuration.appKeybindingsPath = envService.appKeybindingsPath;
	configuration.userExtensionsHome = envService.userExtensionsHome;
	configuration.isBuilt = envService.isBuilt;
	configuration.updateFeedUrl = updateManager.feedUrl;
	configuration.updateChannel = updateManager.channel;
	configuration.extensionsGallery = envService.product.extensionsGallery;

	return configuration;
}

function _spawnSharedProcess(envService: IEnvironmentService, updateManager: IUpdateService, settingsManager: ISettingsService): cp.ChildProcess {
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
				env: getEnvironment(envService, updateManager)
			},
			contextServiceOptions: {
				globalSettings: settingsManager.globalSettings
			}
		});
	});

	return result;
}

let spawnCount = 0;

export function spawnSharedProcess(accessor: ServicesAccessor): IDisposable {
	const envService = accessor.get(IEnvironmentService);
	const updateManager = accessor.get(IUpdateService);
	const settingsManager = accessor.get(ISettingsService);

	let child: cp.ChildProcess;

	const spawn = () => {
		if (++spawnCount > 10) {
			return;
		}

		child = _spawnSharedProcess(envService, updateManager, settingsManager);
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