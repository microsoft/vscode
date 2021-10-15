/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const { createModuleDescription, createEditorWorkerModuleDescription } = require('../base/buildfile');

exports.collectModules = function () {
	return [
		createModuleDescription('vs/workbench/services/search/node/searchApp'),

		createModuleDescription('vs/platform/files/node/watcher/unix/watcherApp'),
		createModuleDescription('vs/platform/files/node/watcher/nsfw/watcherApp'),
		createModuleDescription('vs/platform/files/node/watcher/parcel/watcherApp'),

		createModuleDescription('vs/platform/terminal/node/ptyHostMain'),

		createModuleDescription('vs/workbench/services/extensions/node/extensionHostProcess'),
	];
};
