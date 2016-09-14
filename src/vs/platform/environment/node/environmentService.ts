/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IEnvironmentService} from 'vs/platform/environment/common/environment';
import * as crypto from 'crypto';
import * as paths from 'vs/base/node/paths';
import * as os from 'os';
import * as path from 'path';
import {ParsedArgs} from 'vs/platform/environment/node/argv';
import URI from 'vs/base/common/uri';
import { memoize } from 'vs/base/common/decorators';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';

function getUniqueUserId(): string {
	let username: string;
	if (process.platform === 'win32') {
		username = process.env.USERNAME;
	} else {
		username = process.env.USER;
	}

	if (!username) {
		return ''; // fail gracefully if there is no user name
	}

	// use sha256 to ensure the userid value can be used in filenames and are unique
	return crypto.createHash('sha256').update(username).digest('hex').substr(0, 6);
}

function getIPCHandleBaseName(): string {
	let name = pkg.name;

	// Support to run VS Code multiple times as different user
	// by making the socket unique over the logged in user
	let userId = getUniqueUserId();
	if (userId) {
		name += `-${ userId }`;
	}

	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\${ name }`;
	}

	return path.join(os.tmpdir(), name);
}

const IPCHandlePrefix = getIPCHandleBaseName();
const IPCHandleSuffix = process.platform === 'win32' ? '-sock' : '.sock';

export class EnvironmentService implements IEnvironmentService {

	_serviceBrand: any;

	@memoize
	get appRoot(): string { return path.dirname(URI.parse(require.toUrl('')).fsPath); }

	get execPath(): string { return this._execPath; }

	@memoize
	get userHome(): string { return path.join(os.homedir(), product.dataFolderName); }

	@memoize
	get userDataPath(): string { return this.args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform); }

	@memoize
	get appSettingsHome(): string { return path.join(this.userDataPath, 'User'); }

	@memoize
	get appSettingsPath(): string { return path.join(this.appSettingsHome, 'settings.json'); }

	@memoize
	get appKeybindingsPath(): string { return path.join(this.appSettingsHome, 'keybindings.json'); }

	@memoize
	get extensionsPath(): string { return path.normalize(this.args.extensionHomePath || path.join(this.userHome, 'extensions')); }

	get extensionDevelopmentPath(): string { return this.args.extensionDevelopmentPath; }

	get extensionTestsPath(): string { return this.args.extensionTestsPath; }
	get disableExtensions(): boolean { return this.args['disable-extensions'];  }

	@memoize
	get debugExtensionHost(): { port: number; break: boolean; } { return parseExtensionHostPort(this.args, this.isBuilt); }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }
	get verbose(): boolean { return this.args.verbose; }
	get performance(): boolean { return this.args.performance; }
	get logExtensionHostCommunication(): boolean { return this.args.logExtensionHostCommunication; }

	@memoize
	get mainIPCHandle(): string { return `${ IPCHandlePrefix }-${ pkg.version }${ IPCHandleSuffix }`; }

	@memoize
	get sharedIPCHandle(): string { return `${ IPCHandlePrefix }-${ pkg.version }-shared${ IPCHandleSuffix }`; }

	constructor(private args: ParsedArgs, private _execPath: string) {}
}

export function parseExtensionHostPort(args: ParsedArgs, isBuild: boolean): { port: number; break: boolean; } {
	const portStr = args.debugBrkPluginHost || args.debugPluginHost;
	const port = Number(portStr) || (!isBuild ? 5870 : null);
	const brk = port ? Boolean(!!args.debugBrkPluginHost) : false;
	return { port, break: brk };
}