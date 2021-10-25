/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as fs from 'fs';
import * as net from 'net';
import { FileAccess } from 'vs/base/common/network';
import { run as runCli } from 'vs/server/remoteExtensionHostAgentCli';
import { createServer as doCreateServer, IServerAPI } from 'vs/server/remoteExtensionHostAgentServer';
import { parseArgs, ErrorReporter } from 'vs/platform/environment/node/argv';
import { join, dirname } from 'vs/base/common/path';
import { performance } from 'perf_hooks';
import { serverOptions } from 'vs/server/serverEnvironmentService';
import * as perf from 'vs/base/common/performance';

perf.mark('code/server/codeLoaded');
(<any>global).vscodeServerCodeLoadedTime = performance.now();

const errorReporter: ErrorReporter = {
	onMultipleValues: (id: string, usedValue: string) => {
		console.error(`Option ${id} can only be defined once. Using value ${usedValue}.`);
	},

	onUnknownOption: (id: string) => {
		console.error(`Ignoring option ${id}: not supported for server.`);
	}
};

const args = parseArgs(process.argv.slice(2), serverOptions, errorReporter);

const REMOTE_DATA_FOLDER = process.env['VSCODE_AGENT_FOLDER'] || join(os.homedir(), '.vscode-remote');
const USER_DATA_PATH = join(REMOTE_DATA_FOLDER, 'data');
const APP_SETTINGS_HOME = join(USER_DATA_PATH, 'User');
const GLOBAL_STORAGE_HOME = join(APP_SETTINGS_HOME, 'globalStorage');
const MACHINE_SETTINGS_HOME = join(USER_DATA_PATH, 'Machine');
args['user-data-dir'] = USER_DATA_PATH;
const APP_ROOT = dirname(FileAccess.asFileUri('', require).fsPath);
const BUILTIN_EXTENSIONS_FOLDER_PATH = join(APP_ROOT, 'extensions');
args['builtin-extensions-dir'] = BUILTIN_EXTENSIONS_FOLDER_PATH;
args['extensions-dir'] = args['extensions-dir'] || join(REMOTE_DATA_FOLDER, 'extensions');

[REMOTE_DATA_FOLDER, args['extensions-dir'], USER_DATA_PATH, APP_SETTINGS_HOME, MACHINE_SETTINGS_HOME, GLOBAL_STORAGE_HOME].forEach(f => {
	try {
		if (!fs.existsSync(f)) {
			fs.mkdirSync(f);
		}
	} catch (err) { console.error(err); }
});

/**
 * invoked by vs/server/main.js
 */
export function spawnCli() {
	runCli(args, REMOTE_DATA_FOLDER);
}

/**
 * invoked by vs/server/main.js
 */
export function createServer(address: string | net.AddressInfo | null): Promise<IServerAPI> {
	return doCreateServer(address, args, REMOTE_DATA_FOLDER);
}
