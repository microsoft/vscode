/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../nls.js';

import { NativeEnvironmentService } from '../../platform/environment/node/environmentService.js';
import { OPTIONS, OptionDescriptions } from '../../platform/environment/node/argv.js';
import { refineServiceDecorator } from '../../platform/instantiation/common/instantiation.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../platform/environment/common/environment.js';
import { memoize } from '../../base/common/decorators.js';
import { URI } from '../../base/common/uri.js';

export const serverOptions: OptionDescriptions<Required<ServerParsedArgs>> = {

	/* ----- server setup ----- */

	'host': { type: 'string', cat: 'o', args: 'ip-address', description: nls.localize('host', "The host name or IP address the server should listen to. If not set, defaults to 'localhost'.") },
	'port': { type: 'string', cat: 'o', args: 'port | port range', description: nls.localize('port', "The port the server should listen to. If 0 is passed a random free port is picked. If a range in the format num-num is passed, a free port from the range (end inclusive) is selected.") },
	'socket-path': { type: 'string', cat: 'o', args: 'path', description: nls.localize('socket-path', "The path to a socket file for the server to listen to.") },
	'server-base-path': { type: 'string', cat: 'o', args: 'path', description: nls.localize('server-base-path', "The path under which the web UI and the code server is provided. Defaults to '/'.`") },
	'connection-token': { type: 'string', cat: 'o', args: 'token', deprecates: ['connectionToken'], description: nls.localize('connection-token', "A secret that must be included with all requests.") },
	'connection-token-file': { type: 'string', cat: 'o', args: 'path', deprecates: ['connection-secret', 'connectionTokenFile'], description: nls.localize('connection-token-file', "Path to a file that contains the connection token.") },
	'without-connection-token': { type: 'boolean', cat: 'o', description: nls.localize('without-connection-token', "Run without a connection token. Only use this if the connection is secured by other means.") },
	'disable-websocket-compression': { type: 'boolean' },
	'print-startup-performance': { type: 'boolean' },
	'print-ip-address': { type: 'boolean' },
	'accept-server-license-terms': { type: 'boolean', cat: 'o', description: nls.localize('acceptLicenseTerms', "If set, the user accepts the server license terms and the server will be started without a user prompt.") },
	'server-data-dir': { type: 'string', cat: 'o', description: nls.localize('serverDataDir', "Specifies the directory that server data is kept in.") },
	'telemetry-level': { type: 'string', cat: 'o', args: 'level', description: nls.localize('telemetry-level', "Sets the initial telemetry level. Valid levels are: 'off', 'crash', 'error' and 'all'. If not specified, the server will send telemetry until a client connects, it will then use the clients telemetry setting. Setting this to 'off' is equivalent to --disable-telemetry") },

	/* ----- vs code options ---	-- */

	'user-data-dir': OPTIONS['user-data-dir'],
	'enable-smoke-test-driver': OPTIONS['enable-smoke-test-driver'],
	'disable-telemetry': OPTIONS['disable-telemetry'],
	'disable-workspace-trust': OPTIONS['disable-workspace-trust'],
	'file-watcher-polling': { type: 'string', deprecates: ['fileWatcherPolling'] },
	'log': OPTIONS['log'],
	'logsPath': OPTIONS['logsPath'],
	'force-disable-user-env': OPTIONS['force-disable-user-env'],

	/* ----- vs code web options ----- */

	'folder': { type: 'string', deprecationMessage: 'No longer supported. Folder needs to be provided in the browser URL or with `default-folder`.' },
	'workspace': { type: 'string', deprecationMessage: 'No longer supported. Workspace needs to be provided in the browser URL or with `default-workspace`.' },

	'default-folder': { type: 'string', description: nls.localize('default-folder', 'The workspace folder to open when no input is specified in the browser URL. A relative or absolute path resolved against the current working directory.') },
	'default-workspace': { type: 'string', description: nls.localize('default-workspace', 'The workspace to open when no input is specified in the browser URL. A relative or absolute path resolved against the current working directory.') },

	'enable-sync': { type: 'boolean' },
	'github-auth': { type: 'string' },
	'use-test-resolver': { type: 'boolean' },

	/* ----- extension management ----- */

	'extensions-dir': OPTIONS['extensions-dir'],
	'extensions-download-dir': OPTIONS['extensions-download-dir'],
	'builtin-extensions-dir': OPTIONS['builtin-extensions-dir'],
	'install-extension': OPTIONS['install-extension'],
	'install-builtin-extension': OPTIONS['install-builtin-extension'],
	'update-extensions': OPTIONS['update-extensions'],
	'uninstall-extension': OPTIONS['uninstall-extension'],
	'list-extensions': OPTIONS['list-extensions'],
	'locate-extension': OPTIONS['locate-extension'],

	'show-versions': OPTIONS['show-versions'],
	'category': OPTIONS['category'],
	'force': OPTIONS['force'],
	'do-not-sync': OPTIONS['do-not-sync'],
	'do-not-include-pack-dependencies': OPTIONS['do-not-include-pack-dependencies'],
	'pre-release': OPTIONS['pre-release'],
	'start-server': { type: 'boolean', cat: 'e', description: nls.localize('start-server', "Start the server when installing or uninstalling extensions. To be used in combination with 'install-extension', 'install-builtin-extension' and 'uninstall-extension'.") },


	/* ----- remote development options ----- */

	'enable-remote-auto-shutdown': { type: 'boolean' },
	'remote-auto-shutdown-without-delay': { type: 'boolean' },

	'use-host-proxy': { type: 'boolean' },
	'without-browser-env-var': { type: 'boolean' },

	/* ----- server cli ----- */

	'help': OPTIONS['help'],
	'version': OPTIONS['version'],
	'locate-shell-integration-path': OPTIONS['locate-shell-integration-path'],

	'compatibility': { type: 'string' },

	_: OPTIONS['_']
};

export interface ServerParsedArgs {

	/* ----- server setup ----- */

	host?: string;
	/**
	 * A port or a port range
	 */
	port?: string;
	'socket-path'?: string;

	/**
	 * The path under which the web UI and the code server is provided.
	 * By defaults it is '/'.`
	 */
	'server-base-path'?: string;

	/**
	 * A secret token that must be provided by the web client with all requests.
	 * Use only `[0-9A-Za-z\-]`.
	 *
	 * By default, a UUID will be generated every time the server starts up.
	 *
	 * If the server is running on a multi-user system, then consider
	 * using `--connection-token-file` which has the advantage that the token cannot
	 * be seen by other users using `ps` or similar commands.
	 */
	'connection-token'?: string;
	/**
	 * A path to a filename which will be read on startup.
	 * Consider placing this file in a folder readable only by the same user (a `chmod 0700` directory).
	 *
	 * The contents of the file will be used as the connection token. Use only `[0-9A-Z\-]` as contents in the file.
	 * The file can optionally end in a `\n` which will be ignored.
	 *
	 * This secret must be communicated to any vscode instance via the resolver or embedder API.
	 */
	'connection-token-file'?: string;

	/**
	 * Run the server without a connection token
	 */
	'without-connection-token'?: boolean;

	'disable-websocket-compression'?: boolean;

	'print-startup-performance'?: boolean;
	'print-ip-address'?: boolean;

	'accept-server-license-terms': boolean;

	'server-data-dir'?: string;

	'telemetry-level'?: string;

	'disable-workspace-trust'?: boolean;

	/* ----- vs code options ----- */

	'user-data-dir'?: string;

	'enable-smoke-test-driver'?: boolean;

	'disable-telemetry'?: boolean;
	'file-watcher-polling'?: string;

	'log'?: string[];
	'logsPath'?: string;

	'force-disable-user-env'?: boolean;

	/* ----- vs code web options ----- */

	'default-workspace'?: string;
	'default-folder'?: string;

	/** @deprecated use default-workspace instead */
	workspace: string;
	/** @deprecated use default-folder instead */
	folder: string;


	'enable-sync'?: boolean;
	'github-auth'?: string;
	'use-test-resolver'?: boolean;

	/* ----- extension management ----- */

	'extensions-dir'?: string;
	'extensions-download-dir'?: string;
	'builtin-extensions-dir'?: string;
	'install-extension'?: string[];
	'install-builtin-extension'?: string[];
	'update-extensions'?: boolean;
	'uninstall-extension'?: string[];
	'list-extensions'?: boolean;
	'locate-extension'?: string[];
	'show-versions'?: boolean;
	'category'?: string;
	force?: boolean; // used by install-extension
	'do-not-sync'?: boolean; // used by install-extension
	'pre-release'?: boolean; // used by install-extension
	'do-not-include-pack-dependencies'?: boolean; // used by install-extension


	'start-server'?: boolean;

	/* ----- remote development options ----- */

	'enable-remote-auto-shutdown'?: boolean;
	'remote-auto-shutdown-without-delay'?: boolean;

	'use-host-proxy'?: boolean;
	'without-browser-env-var'?: boolean;

	/* ----- server cli ----- */
	help: boolean;
	version: boolean;
	'locate-shell-integration-path'?: string;

	compatibility: string;

	_: string[];
}

export const IServerEnvironmentService = refineServiceDecorator<IEnvironmentService, IServerEnvironmentService>(IEnvironmentService);

export interface IServerEnvironmentService extends INativeEnvironmentService {
	readonly args: ServerParsedArgs;
}

export class ServerEnvironmentService extends NativeEnvironmentService implements IServerEnvironmentService {
	@memoize
	override get userRoamingDataHome(): URI { return this.appSettingsHome; }
	override get args(): ServerParsedArgs { return super.args as ServerParsedArgs; }
}
