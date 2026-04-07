/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

require('tsx/cjs');
const { enableHotReload, hotRequire } = require("@hediet/node-reload");

enableHotReload({ entryModule: module });

/**
 * @param {import("vscode").ExtensionContext} context
 */
function activate(context) {
	context.subscriptions.push(hotRequire(module, "./extension", ext => new ext.Extension()));
}

module.exports = { activate };
