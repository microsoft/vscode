/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vs/base/common/uri';
import { run as runCli, shouldSpawnCli } from 'vs/server/remoteExtensionManagement';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { RemoteExtensionHostAgentServer } from 'vs/server/remoteExtensionHostAgentServer';
import { getLogLevel, ILogService } from 'vs/platform/log/common/log';
import { RemoteExtensionLogFileName } from 'vs/workbench/services/remote/common/remoteAgentService';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';
import { generateUuid } from 'vs/base/common/uuid';
import { parseArgs, OPTIONS, OptionDescriptions, ErrorReporter } from 'vs/platform/environment/node/argv';

const serverOptions: OptionDescriptions<ServerParsedArgs> = {
	'port': { type: 'string' },
	'connectionToken': { type: 'string' },
	'host': { type: 'string' },

	'fileWatcherPolling': { type: 'boolean' },
	'enable-remote-auto-shutdown': { type: 'boolean' },

	'disable-telemetry': OPTIONS['disable-telemetry'],

	'extensions-dir': OPTIONS['extensions-dir'],
	'install-extension': OPTIONS['install-extension'],
	'uninstall-extension': OPTIONS['uninstall-extension'],
	'locate-extension': OPTIONS['locate-extension'],
	'list-extensions': OPTIONS['list-extensions'],
	'force': OPTIONS['force'],

	'folder': { type: 'string' },
	'workspace': { type: 'string' },
	'client': { type: 'string' },
	'web-user-data-dir': { type: 'string' },

	_: OPTIONS['_']
};

export interface ServerParsedArgs {
	port?: string;
	connectionToken?: string;
	host?: string;
	'disable-telemetry'?: boolean;
	fileWatcherPolling?: boolean;
	'enable-remote-auto-shutdown'?: boolean;

	'extensions-dir'?: string;
	'install-extension'?: string[];
	'uninstall-extension'?: string[];
	'list-extensions'?: boolean;
	'locate-extension'?: string[];

	force?: boolean; // used by install-extension

	'user-data-dir'?: string;
	'builtin-extensions-dir'?: string;

	// web
	workspace: string;
	folder: string;
	client: string;
	'web-user-data-dir'?: string;

	_: string[];
}

export class ServerEnvironmentService extends EnvironmentService {
	constructor(public args: ServerParsedArgs, _execPath: string) {
		super(args, _execPath);
	}
}

const errorReporter: ErrorReporter = {
	onMultipleValues: (id: string, usedValue: string) => {
		console.error(`Option ${id} can only be defined once. Using value ${usedValue}.`);
	},

	onUnknownOption: (id: string) => {
		console.error(`Ignoring option ${id}: not supported for server.`);
	}
};

const args = parseArgs(process.argv.slice(2), serverOptions, errorReporter);

const REMOTE_DATA_FOLDER = process.env['VSCODE_AGENT_FOLDER'] || path.join(os.homedir(), '.vscode-remote');
const USER_DATA_PATH = path.join(REMOTE_DATA_FOLDER, 'data');
const APP_SETTINGS_HOME = path.join(USER_DATA_PATH, 'User');
const GLOBAL_STORAGE_HOME = path.join(APP_SETTINGS_HOME, 'globalStorage');
const MACHINE_SETTINGS_HOME = path.join(USER_DATA_PATH, 'Machine');
args['user-data-dir'] = USER_DATA_PATH;
const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);
const BUILTIN_EXTENSIONS_FOLDER_PATH = path.join(APP_ROOT, 'extensions');
args['builtin-extensions-dir'] = BUILTIN_EXTENSIONS_FOLDER_PATH;
const CONNECTION_AUTH_TOKEN = args['connectionToken'] || generateUuid();
const HOST = args.host;

let PORT: number = 8000;
try {
	if (args.port) {
		PORT = parseInt(args.port);
	}
} catch (e) {
	console.log('Port is not a number, using 8000 instead.');
}

args['extensions-dir'] = args['extensions-dir'] || path.join(REMOTE_DATA_FOLDER, 'extensions');

[REMOTE_DATA_FOLDER, args['extensions-dir'], USER_DATA_PATH, APP_SETTINGS_HOME, MACHINE_SETTINGS_HOME, GLOBAL_STORAGE_HOME].forEach(f => {
	try {
		if (!fs.existsSync(f)) {
			fs.mkdirSync(f);
		}
	} catch (err) { console.error(err); }
});

const environmentService = new ServerEnvironmentService(args, process.execPath);
const logService: ILogService = new SpdLogService(RemoteExtensionLogFileName, environmentService.logsPath, getLogLevel(environmentService));
logService.trace(`Remote configuration data at ${REMOTE_DATA_FOLDER}`);
logService.trace('process arguments:', args);

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

if (shouldSpawnCli(args)) {
	runCli(args, environmentService, logService)
		.then(() => eventuallyExit(0))
		.then(null, err => {
			logService.error(err.message || err.stack || err);
			eventuallyExit(1);
		});
} else {
	const license = `

*
* Visual Studio Code Server
*
* Reminder: You may only use this software with Visual Studio family products,
* as described in the license https://aka.ms/vscode-remote/license
*

`;
	logService.info(license);
	console.log(license);
	const server = new RemoteExtensionHostAgentServer(CONNECTION_AUTH_TOKEN, environmentService, logService);
	server.start(HOST, PORT);
	process.on('exit', () => {
		server.dispose();
	});
}
