/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as fs from 'fs';
import * as net from 'net';
import { FileAccess } from 'vs/base/common/network';
import { run as runCli } from 'vs/server/node/remoteExtensionHostAgentCli';
import { createServer as doCreateServer, IServerAPI } from 'vs/server/node/remoteExtensionHostAgentServer';
import { parseArgs, ErrorReporter } from 'vs/platform/environment/node/argv';
import { join, dirname } from 'vs/base/common/path';
import { performance } from 'perf_hooks';
import { serverOptions } from 'vs/server/node/serverEnvironmentService';
import product from 'vs/platform/product/common/product';
import * as perf from 'vs/base/common/performance';

perf.mark('code/server/codeLoaded');
(<any>global).vscodeServerCodeLoadedTime = performance.now();

const errorReporter: ErrorReporter = {
	onMultipleValues: (id: string, usedValue: string) => {
		console.error(`Option '${id}' can only be defined once. Using value ${usedValue}.`);
	},
	onEmptyValue: (id) => {
		console.error(`Ignoring option '${id}': Value must not be empty.`);
	},
	onUnknownOption: (id: string) => {
		console.error(`Ignoring option '${id}': not supported for server.`);
	},
	onDeprecatedOption: (deprecatedOption: string, message) => {
		console.warn(`Option '${deprecatedOption}' is deprecated: ${message}`);
	}
};

const args = parseArgs(process.argv.slice(2), serverOptions, errorReporter);

const REMOTE_DATA_FOLDER = args['server-data-dir'] || process.env['VSCODE_AGENT_FOLDER'] || join(os.homedir(), product.serverDataFolderName || '.vscode-remote');
const USER_DATA_PATH = args['user-data-dir'] || join(REMOTE_DATA_FOLDER, 'data');
const APP_SETTINGS_HOME = join(USER_DATA_PATH, 'User');
const GLOBAL_STORAGE_HOME = join(APP_SETTINGS_HOME, 'globalStorage');
const LOCAL_HISTORY_HOME = join(APP_SETTINGS_HOME, 'History');
const MACHINE_SETTINGS_HOME = join(USER_DATA_PATH, 'Machine');
const APP_ROOT = dirname(FileAccess.asFileUri('').fsPath);
const BUILTIN_EXTENSIONS_FOLDER_PATH = join(APP_ROOT, 'extensions');
args['user-data-dir'] = USER_DATA_PATH;
args['builtin-extensions-dir'] = BUILTIN_EXTENSIONS_FOLDER_PATH;
args['extensions-dir'] = args['extensions-dir'] || join(REMOTE_DATA_FOLDER, 'extensions');

[REMOTE_DATA_FOLDER, args['extensions-dir'], USER_DATA_PATH, APP_SETTINGS_HOME, MACHINE_SETTINGS_HOME, GLOBAL_STORAGE_HOME, LOCAL_HISTORY_HOME].forEach(f => {
	try {
		if (!fs.existsSync(f)) {
			fs.mkdirSync(f, { mode: 0o700 });
		}
	} catch (err) { console.error(err); }
});

/**
 * invoked by server-main.js
 */
export function spawnCli() {
	runCli(args, REMOTE_DATA_FOLDER, serverOptions);
}

/**
 * invoked by server-main.js
 */
export function createServer(address: string | net.AddressInfo | null): Promise<IServerAPI> {
	return doCreateServer(address, args, REMOTE_DATA_FOLDER);
}
