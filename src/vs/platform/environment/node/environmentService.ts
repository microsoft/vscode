/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import * as crypto from 'crypto';
import * as paths from 'vs/base/node/paths';
import * as os from 'os';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { memoize } from 'vs/base/common/decorators';
import pkg from 'vs/platform/node/package';
import product from 'vs/platform/node/product';

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

function getIPCHandlePrefix(): string {
	let name = pkg.name;

	// Support to run VS Code multiple times as different user
	// by making the socket unique over the logged in user
	let userId = getUniqueUserId();
	if (userId) {
		name += `-${userId}`;
	}

	if (process.platform === 'win32') {
		return `\\\\.\\pipe\\${name}`;
	}

	return path.join(os.tmpdir(), name);
}

function getIPCHandleSuffix(): string {
	return process.platform === 'win32' ? '-sock' : '.sock';
}

export class EnvironmentService implements IEnvironmentService {

	_serviceBrand: any;

	get args(): ParsedArgs { return this._args; }

	@memoize
	get appRoot(): string { return path.dirname(URI.parse(require.toUrl('')).fsPath); }

	get execPath(): string { return this._execPath; }

	@memoize
	get userHome(): string { return os.homedir(); }

	@memoize
	get userProductHome(): string { return path.join(this.userHome, product.dataFolderName); }

	@memoize
	get userDataPath(): string { return parseUserDataDir(this._args, process); }

	get appNameLong(): string { return product.nameLong; }

	get appQuality(): string { return product.quality; }

	@memoize
	get appSettingsHome(): string { return path.join(this.userDataPath, 'User'); }

	@memoize
	get appSettingsPath(): string { return path.join(this.appSettingsHome, 'settings.json'); }

	@memoize
	get appKeybindingsPath(): string { return path.join(this.appSettingsHome, 'keybindings.json'); }

	@memoize
	get isExtensionDevelopment(): boolean { return !!this._args.extensionDevelopmentPath; }

	@memoize
	get backupHome(): string { return path.join(this.userDataPath, 'Backups'); }

	@memoize
	get backupWorkspacesPath(): string { return path.join(this.backupHome, 'workspaces.json'); }

	@memoize
	get extensionsPath(): string { return parsePathArg(this._args['extensions-dir'], process) || path.join(this.userProductHome, 'extensions'); }

	@memoize
	get extensionDevelopmentPath(): string { return this._args.extensionDevelopmentPath ? path.normalize(this._args.extensionDevelopmentPath) : this._args.extensionDevelopmentPath; }

	@memoize
	get extensionTestsPath(): string { return this._args.extensionTestsPath ? path.normalize(this._args.extensionTestsPath) : this._args.extensionTestsPath; }

	get disableExtensions(): boolean { return this._args['disable-extensions']; }

	@memoize
	get debugExtensionHost(): { port: number; break: boolean; } { return parseExtensionHostPort(this._args, this.isBuilt); }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }
	get verbose(): boolean { return this._args.verbose; }
	get wait(): boolean { return this._args.wait; }
	get performance(): boolean { return this._args.performance; }
	get logExtensionHostCommunication(): boolean { return this._args.logExtensionHostCommunication; }

	@memoize
	get mainIPCHandle(): string { return `${getIPCHandlePrefix()}-${pkg.version}${getIPCHandleSuffix()}`; }

	@memoize
	get sharedIPCHandle(): string { return `${getIPCHandlePrefix()}-${pkg.version}-shared${getIPCHandleSuffix()}`; }

	@memoize
	get nodeCachedDataDir(): string { return path.join(this.userDataPath, 'CachedData'); }

	constructor(private _args: ParsedArgs, private _execPath: string) { }
}

export function parseExtensionHostPort(args: ParsedArgs, isBuild: boolean): { port: number; break: boolean; } {
	const portStr = args.debugBrkPluginHost || args.debugPluginHost;
	const port = Number(portStr) || (!isBuild ? 5870 : null);
	const brk = port ? Boolean(!!args.debugBrkPluginHost) : false;
	return { port, break: brk };
}

function parsePathArg(arg: string, process: NodeJS.Process): string {
	if (!arg) {
		return undefined;
	}

	// Determine if the arg is relative or absolute, if relative use the original CWD
	// (VSCODE_CWD), not the potentially overridden one (process.cwd()).
	const resolved = path.resolve(arg);

	if (path.normalize(arg) === resolved) {
		return resolved;
	} else {
		return path.resolve(process.env['VSCODE_CWD'] || process.cwd(), arg);
	}
}

export function parseUserDataDir(args: ParsedArgs, process: NodeJS.Process): string {
	return parsePathArg(args['user-data-dir'], process) || path.resolve(paths.getDefaultUserDataPath(process.platform));
}
