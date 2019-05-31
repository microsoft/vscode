/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as minimist from 'minimist';
import * as fs from 'fs';
import { URI } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { RemoteExtensionManagementCli } from 'vs/agent/remoteExtensionManagement';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { RemoteExtensionHostAgentServer } from 'vs/agent/remoteExtensionHostAgentServer';

const args = minimist(process.argv.slice(2), {
	string: [
		'port',
		'disable-telemetry',
		'folder'
	]
}) as ParsedArgs;

const REMOTE_DATA_FOLDER = process.env['VSCODE_AGENT_FOLDER'] || path.join(os.homedir(), '.vscode-remote');
const USER_DATA_PATH = path.join(REMOTE_DATA_FOLDER, 'data');
const APP_SETTINGS_HOME = path.join(USER_DATA_PATH, 'User');
const GLOBAL_STORAGE_HOME = path.join(APP_SETTINGS_HOME, 'globalStorage');
const MACHINE_SETTINGS_HOME = path.join(USER_DATA_PATH, 'Machine');
args['user-data-dir'] = USER_DATA_PATH;
const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);
const BUILTIN_EXTENSIONS_FOLDER_PATH = path.join(APP_ROOT, 'extensions');
args['builtin-extensions-dir'] = BUILTIN_EXTENSIONS_FOLDER_PATH;
const PORT = args['port'] || 8000;

const EXTENSIONS_PATH = path.join(REMOTE_DATA_FOLDER, 'extensions');
args['extensions-dir'] = EXTENSIONS_PATH;

[REMOTE_DATA_FOLDER, EXTENSIONS_PATH, USER_DATA_PATH, APP_SETTINGS_HOME, MACHINE_SETTINGS_HOME, GLOBAL_STORAGE_HOME].forEach(f => {
	try {
		if (!fs.existsSync(f)) {
			fs.mkdirSync(f);
		}
	} catch (err) { console.error(err); }
});
console.log(`Remote configuration data at ${REMOTE_DATA_FOLDER}`);

const environmentService = new EnvironmentService(args, process.execPath);

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

if (RemoteExtensionManagementCli.shouldSpawnCli(args)) {
	RemoteExtensionManagementCli.instantiate(environmentService).run(args)
		.then(() => eventuallyExit(0))
		.then(null, err => {
			console.error(err.message || err.stack || err);
			eventuallyExit(1);
		});
} else {
	console.log(`

*
* Visual Studio Code Server
*
* Reminder: You may only use this software with Visual Studio family products,
* as described in the license https://aka.ms/vscode-remote/license
*

`);
	const server = new RemoteExtensionHostAgentServer(environmentService);
	server.start(PORT);
	process.on('exit', () => {
		server.dispose();
	});
}