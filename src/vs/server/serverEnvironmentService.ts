/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { OPTIONS, OptionDescriptions } from 'vs/platform/environment/node/argv';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';

export const serverOptions: OptionDescriptions<ServerParsedArgs> = {
	'port': { type: 'string' },
	'connectionToken': { type: 'string' },
	'connection-secret': { type: 'string', description: nls.localize('connection-secret', "Path to file that contains the connection token. This will require that all incoming connections know the secret.") },
	'host': { type: 'string' },
	'socket-path': { type: 'string' },
	'driver': { type: 'string' },
	'start-server': { type: 'boolean' },
	'print-startup-performance': { type: 'boolean' },
	'print-ip-address': { type: 'boolean' },
	'disable-websocket-compression': { type: 'boolean' },

	'fileWatcherPolling': { type: 'string' },

	'enable-remote-auto-shutdown': { type: 'boolean' },
	'remote-auto-shutdown-without-delay': { type: 'boolean' },

	'without-browser-env-var': { type: 'boolean' },

	'disable-telemetry': OPTIONS['disable-telemetry'],

	'extensions-dir': OPTIONS['extensions-dir'],
	'extensions-download-dir': OPTIONS['extensions-download-dir'],
	'install-extension': OPTIONS['install-extension'],
	'install-builtin-extension': OPTIONS['install-builtin-extension'],
	'uninstall-extension': OPTIONS['uninstall-extension'],
	'locate-extension': OPTIONS['locate-extension'],
	'list-extensions': OPTIONS['list-extensions'],
	'force': OPTIONS['force'],
	'show-versions': OPTIONS['show-versions'],
	'category': OPTIONS['category'],
	'do-not-sync': OPTIONS['do-not-sync'],

	'force-disable-user-env': OPTIONS['force-disable-user-env'],

	'folder': { type: 'string' },
	'workspace': { type: 'string' },
	'web-user-data-dir': { type: 'string' },
	'use-host-proxy': { type: 'string' },
	'enable-sync': { type: 'boolean' },
	'github-auth': { type: 'string' },
	'log': { type: 'string' },
	'logsPath': { type: 'string' },

	_: OPTIONS['_']
};

export interface ServerParsedArgs {
	port?: string;
	connectionToken?: string;
	/**
	 * A path to a filename which will be read on startup.
	 * Consider placing this file in a folder readable only by the same user (a `chmod 0700` directory).
	 *
	 * The contents of the file will be used as the connectionToken. Use only `[0-9A-Z\-]` as contents in the file.
	 * The file can optionally end in a `\n` which will be ignored.
	 *
	 * This secret must be communicated to any vscode instance via the resolver or embedder API.
	 */
	'connection-secret'?: string;
	host?: string;
	'socket-path'?: string;
	driver?: string;
	'print-startup-performance'?: boolean;
	'print-ip-address'?: boolean;
	'disable-websocket-compression'?: boolean;
	'disable-telemetry'?: boolean;
	fileWatcherPolling?: string;
	'start-server'?: boolean;

	'enable-remote-auto-shutdown'?: boolean;
	'remote-auto-shutdown-without-delay'?: boolean;

	'extensions-dir'?: string;
	'extensions-download-dir'?: string;
	'install-extension'?: string[];
	'install-builtin-extension'?: string[];
	'uninstall-extension'?: string[];
	'list-extensions'?: boolean;
	'locate-extension'?: string[];
	'show-versions'?: boolean;
	'category'?: string;

	'force-disable-user-env'?: boolean;
	'use-host-proxy'?: string;

	'without-browser-env-var'?: boolean;

	force?: boolean; // used by install-extension
	'do-not-sync'?: boolean; // used by install-extension

	'user-data-dir'?: string;
	'builtin-extensions-dir'?: string;

	// web
	workspace: string;
	folder: string;
	'web-user-data-dir'?: string;
	'enable-sync'?: boolean;
	'github-auth'?: string;
	'log'?: string;
	'logsPath'?: string;

	_: string[];
}

export const IServerEnvironmentService = refineServiceDecorator<IEnvironmentService, IServerEnvironmentService>(IEnvironmentService);

export interface IServerEnvironmentService extends INativeEnvironmentService {
	readonly args: ServerParsedArgs;
}

export class ServerEnvironmentService extends NativeEnvironmentService implements IServerEnvironmentService {
	override get args(): ServerParsedArgs { return super.args as ServerParsedArgs; }
}
