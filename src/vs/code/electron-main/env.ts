/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as crypto from 'crypto';
import * as fs from 'original-fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import * as arrays from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import * as types from 'vs/base/common/types';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import product, { IProductConfiguration } from 'vs/platform/product';
import { parseArgs } from 'vs/code/node/argv';
import pkg from 'vs/platform/package';

export interface IProcessEnvironment {
	[key: string]: string;
}

export interface ICommandLineArguments {
	verboseLogging: boolean;
	debugExtensionHostPort: number;
	debugBrkExtensionHost: boolean;
	debugBrkFileWatcherPort: number;
	logExtensionHostCommunication: boolean;
	disableExtensions: boolean;
	extensionsHomePath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
	programStart: number;
	pathArguments?: string[];
	enablePerformance?: boolean;
	openNewWindow?: boolean;
	openInSameWindow?: boolean;
	gotoLineMode?: boolean;
	diffMode?: boolean;
	locale?: string;
	waitForWindowClose?: boolean;
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('mainEnvironmentService');

export interface IEnvironmentService {
	_serviceBrand: any;
	cliArgs: ICommandLineArguments;
	userExtensionsHome: string;
	isTestingFromCli: boolean;
	isBuilt: boolean;
	product: IProductConfiguration;
	updateUrl: string;
	quality: string;
	userHome: string;
	appRoot: string;
	currentWorkingDirectory: string;
	appHome: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;
	mainIPCHandle: string;
	sharedIPCHandle: string;
}

function getNumericValue(value: string, defaultValue: number, fallback: number = void 0) {
	const numericValue = parseInt(value);

	if (types.isNumber(numericValue)) {
		return numericValue;
	}

	if (value) {
		return defaultValue;
	}

	return fallback;
}

export class EnvService implements IEnvironmentService {

	_serviceBrand: any;

	private _cliArgs: ICommandLineArguments;
	get cliArgs(): ICommandLineArguments { return this._cliArgs; }

	private _userExtensionsHome: string;
	get userExtensionsHome(): string { return this._userExtensionsHome; }

	private _isTestingFromCli: boolean;
	get isTestingFromCli(): boolean { return this._isTestingFromCli; }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }

	get product(): IProductConfiguration { return product; }
	get updateUrl(): string { return product.updateUrl; }
	get quality(): string { return product.quality; }

	private _userHome: string;
	get userHome(): string { return this._userHome; }

	private _appRoot: string;
	get appRoot(): string { return this._appRoot; }

	private _currentWorkingDirectory: string;
	get currentWorkingDirectory(): string { return this._currentWorkingDirectory; }

	private _appHome: string;
	get appHome(): string { return this._appHome; }

	private _appSettingsHome: string;
	get appSettingsHome(): string { return this._appSettingsHome; }

	private _appSettingsPath: string;
	get appSettingsPath(): string { return this._appSettingsPath; }

	private _appKeybindingsPath: string;
	get appKeybindingsPath(): string { return this._appKeybindingsPath; }

	private _mainIPCHandle: string;
	get mainIPCHandle(): string { return this._mainIPCHandle; }

	private _sharedIPCHandle: string;
	get sharedIPCHandle(): string { return this._sharedIPCHandle; }

	constructor() {
		this._appRoot = path.dirname(URI.parse(require.toUrl('')).fsPath);
		this._currentWorkingDirectory = process.env['VSCODE_CWD'] || process.cwd();
		this._appHome = app.getPath('userData');
		this._appSettingsHome = path.join(this._appHome, 'User');
		this._appSettingsPath = path.join(this._appSettingsHome, 'settings.json');
		this._appKeybindingsPath = path.join(this._appSettingsHome, 'keybindings.json');

		// Remove the Electron executable
		let [, ...args] = process.argv;

		// If dev, remove the first non-option argument: it's the app location
		if (!this.isBuilt) {
			const index = arrays.firstIndex(args, a => !/^-/.test(a));

			if (index > -1) {
				args.splice(index, 1);
			}
		}

		// Finally, prepend any extra arguments from the 'argv' file
		if (fs.existsSync(path.join(this._appRoot, 'argv'))) {
			const extraargs: string[] = JSON.parse(fs.readFileSync(path.join(this._appRoot, 'argv'), 'utf8'));
			args = [...extraargs, ...args];
		}

		const argv = parseArgs(args);

		const debugBrkExtensionHostPort = getNumericValue(argv.debugBrkPluginHost, 5870);
		const debugExtensionHostPort = getNumericValue(argv.debugPluginHost, 5870, this.isBuilt ? void 0 : 5870);
		const pathArguments = parsePathArguments(this._currentWorkingDirectory, argv._, argv.goto);
		const timestamp = parseInt(argv.timestamp);
		const debugBrkFileWatcherPort = getNumericValue(argv.debugBrkFileWatcherPort, void 0);

		this._cliArgs = Object.freeze({
			pathArguments: pathArguments,
			programStart: types.isNumber(timestamp) ? timestamp : 0,
			enablePerformance: argv.performance,
			verboseLogging: argv.verbose,
			debugExtensionHostPort: debugBrkExtensionHostPort || debugExtensionHostPort,
			debugBrkExtensionHost: !!debugBrkExtensionHostPort,
			logExtensionHostCommunication: argv.logExtensionHostCommunication,
			debugBrkFileWatcherPort: debugBrkFileWatcherPort,
			openNewWindow: argv['new-window'],
			openInSameWindow: argv['reuse-window'],
			gotoLineMode: argv.goto,
			diffMode: argv.diff && pathArguments.length === 2,
			extensionsHomePath: normalizePath(argv.extensionHomePath),
			extensionDevelopmentPath: normalizePath(argv.extensionDevelopmentPath),
			extensionTestsPath: normalizePath(argv.extensionTestsPath),
			disableExtensions: argv['disable-extensions'],
			locale: argv.locale,
			waitForWindowClose: argv.wait
		});

		this._isTestingFromCli = this.cliArgs.extensionTestsPath && !this.cliArgs.debugBrkExtensionHost;
		this._userHome = path.join(os.homedir(), product.dataFolderName);
		this._userExtensionsHome = this.cliArgs.extensionsHomePath || path.join(this._userHome, 'extensions');

		const prefix = this.getIPCHandleBaseName();
		const suffix = process.platform === 'win32' ? '-sock' : '.sock';

		this._mainIPCHandle = `${ prefix }-${ pkg.version }${ suffix }`;
		this._sharedIPCHandle = `${ prefix }-${ pkg.version }-shared${ suffix }`;
	}

	private getIPCHandleBaseName(): string {
		let name = pkg.name;

		// Support to run VS Code multiple times as different user
		// by making the socket unique over the logged in user
		let userId = EnvService.getUniqueUserId();
		if (userId) {
			name += `-${ userId }`;
		}

		if (process.platform === 'win32') {
			return `\\\\.\\pipe\\${ name }`;
		}

		return path.join(os.tmpdir(), name);
	}

	private static getUniqueUserId(): string {
		let username: string;
		if (platform.isWindows) {
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
}

function parsePathArguments(cwd: string, args: string[], gotoLineMode?: boolean): string[] {
	const result = args.map(arg => {
		if (typeof arg !== 'string') {
			return null; // TODO@Ben workaround for https://github.com/Microsoft/vscode/issues/7498
		}

		let pathCandidate = arg;

		let parsedPath: IParsedPath;
		if (gotoLineMode) {
			parsedPath = parseLineAndColumnAware(arg);
			pathCandidate = parsedPath.path;
		}

		if (pathCandidate) {
			pathCandidate = preparePath(cwd, pathCandidate);
		}

		let realPath: string;
		try {
			realPath = fs.realpathSync(pathCandidate);
		} catch (error) {
			// in case of an error, assume the user wants to create this file
			// if the path is relative, we join it to the cwd
			realPath = path.normalize(path.isAbsolute(pathCandidate) ? pathCandidate : path.join(cwd, pathCandidate));
		}

		const basename = path.basename(realPath);
		if (basename /* can be empty if code is opened on root */ && !paths.isValidBasename(basename)) {
			return null; // do not allow invalid file names
		}

		if (gotoLineMode) {
			parsedPath.path = realPath;
			return toLineAndColumnPath(parsedPath);
		}

		return realPath;
	});

	const caseInsensitive = platform.isWindows || platform.isMacintosh;
	const distinct = arrays.distinct(result, e => e && caseInsensitive ? e.toLowerCase() : e);

	return arrays.coalesce(distinct);
}

function preparePath(cwd: string, p: string): string {

	// Trim trailing quotes
	if (platform.isWindows) {
		p = strings.rtrim(p, '"'); // https://github.com/Microsoft/vscode/issues/1498
	}

	// Trim whitespaces
	p = strings.trim(strings.trim(p, ' '), '\t');

	if (platform.isWindows) {

		// Resolve the path against cwd if it is relative
		p = path.resolve(cwd, p);

		// Trim trailing '.' chars on Windows to prevent invalid file names
		p = strings.rtrim(p, '.');
	}

	return p;
}

function normalizePath(p?: string): string {
	return p ? path.normalize(p) : p;
}

export function getPlatformIdentifier(): string {
	if (process.platform === 'linux') {
		return `linux-${process.arch}`;
	}

	return process.platform;
}

export interface IParsedPath {
	path: string;
	line?: number;
	column?: number;
}

export function parseLineAndColumnAware(rawPath: string): IParsedPath {
	let segments = rawPath.split(':'); // C:\file.txt:<line>:<column>

	let path: string;
	let line: number = null;
	let column: number = null;

	segments.forEach(segment => {
		let segmentAsNumber = Number(segment);
		if (!types.isNumber(segmentAsNumber)) {
			path = !!path ? [path, segment].join(':') : segment; // a colon can well be part of a path (e.g. C:\...)
		} else if (line === null) {
			line = segmentAsNumber;
		} else if (column === null) {
			column = segmentAsNumber;
		}
	});

	return {
		path: path,
		line: line !== null ? line : void 0,
		column: column !== null ? column : line !== null ? 1 : void 0 // if we have a line, make sure column is also set
	};
}

export function toLineAndColumnPath(parsedPath: IParsedPath): string {
	let segments = [parsedPath.path];

	if (types.isNumber(parsedPath.line)) {
		segments.push(String(parsedPath.line));
	}

	if (types.isNumber(parsedPath.column)) {
		segments.push(String(parsedPath.column));
	}

	return segments.join(':');
}