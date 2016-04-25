/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import crypto = require('crypto');
import fs = require('fs');
import path = require('path');
import os = require('os');
import {app} from 'electron';
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import platform = require('vs/base/common/platform');
import uri from 'vs/base/common/uri';
import { assign } from 'vs/base/common/objects';
import types = require('vs/base/common/types');
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';

export interface IProductConfiguration {
	nameShort: string;
	nameLong: string;
	applicationName: string;
	win32AppUserModelId: string;
	win32MutexName: string;
	darwinBundleIdentifier: string;
	dataFolderName: string;
	downloadUrl: string;
	updateUrl?: string;
	quality?: string;
	commit: string;
	date: string;
	extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
	};
	extensionTips: { [id: string]: string; };
	crashReporter: Electron.CrashReporterStartOptions;
	welcomePage: string;
	enableTelemetry: boolean;
	aiConfig: {
		key: string;
		asimovKey: string;
	};
	sendASmile: {
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
	documentationUrl: string;
	releaseNotesUrl: string;
	twitterUrl: string;
	requestFeatureUrl: string;
	reportIssueUrl: string;
	licenseUrl: string;
	privacyStatementUrl: string;
}

export interface IProcessEnvironment {
	[key: string]: string;
}

export interface ICommandLineArguments {
	verboseLogging: boolean;
	debugExtensionHostPort: number;
	debugBrkExtensionHost: boolean;
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

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	serviceId: ServiceIdentifier<any>;
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
	version: string;
	appHome: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;
	mainIPCHandle: string;
	sharedIPCHandle: string;
}

export class EnvService implements IEnvironmentService {

	serviceId = IEnvironmentService;

	private _cliArgs: ICommandLineArguments;
	get cliArgs(): ICommandLineArguments { return this._cliArgs; }

	private _userExtensionsHome: string;
	get userExtensionsHome(): string { return this._userExtensionsHome; }

	private _isTestingFromCli: boolean;
	get isTestingFromCli(): boolean { return this._isTestingFromCli; }

	get isBuilt(): boolean { return !process.env['VSCODE_DEV']; }

	private _product: IProductConfiguration;
	get product(): IProductConfiguration { return this._product; }

	get updateUrl(): string { return this.product.updateUrl; }
	get quality(): string { return this.product.quality; }

	private _userHome: string;
	get userHome(): string { return this._userHome; }

	private _appRoot: string;
	get appRoot(): string { return this._appRoot; }

	private _currentWorkingDirectory: string;
	get currentWorkingDirectory(): string { return this._currentWorkingDirectory; }

	private _version: string;
	get version(): string { return this._version; }

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
		this._appRoot = path.dirname(uri.parse(require.toUrl('')).fsPath);
		this._currentWorkingDirectory = process.env['VSCODE_CWD'] || process.cwd();
		this._version = app.getVersion();
		this._appHome = app.getPath('userData');
		this._appSettingsHome = path.join(this._appHome, 'User');

		// TODO move out of here!
		if (!fs.existsSync(this._appSettingsHome)) {
			fs.mkdirSync(this._appSettingsHome);
		}

		this._appSettingsPath = path.join(this._appSettingsHome, 'settings.json');
		this._appKeybindingsPath = path.join(this._appSettingsHome, 'keybindings.json');

		// Remove the Electron executable
		let [, ...args] = process.argv;

		// Id dev, remove the first argument: it's the app location
		if (!this.isBuilt) {
			[, ...args] = args;
		}

		// Finally, prepend any extra arguments from the 'argv' file
		if (fs.existsSync(path.join(this._appRoot, 'argv'))) {
			const extraargs: string[] = JSON.parse(fs.readFileSync(path.join(this._appRoot, 'argv'), 'utf8'));
			args = [...extraargs, ...args];
		}

		const opts = parseOpts(args);

		const gotoLineMode = !!opts['g'] || !!opts['goto'];

		const debugBrkExtensionHostPort = parseNumber(args, '--debugBrkPluginHost', 5870);
		let debugExtensionHostPort: number;
		let debugBrkExtensionHost: boolean;

		if (debugBrkExtensionHostPort) {
			debugExtensionHostPort = debugBrkExtensionHostPort;
			debugBrkExtensionHost = true;
		} else {
			debugExtensionHostPort = parseNumber(args, '--debugPluginHost', 5870, this.isBuilt ? void 0 : 5870);
		}

		const pathArguments = parsePathArguments(this._currentWorkingDirectory, args, gotoLineMode);

		this._cliArgs = Object.freeze({
			pathArguments: pathArguments,
			programStart: parseNumber(args, '--timestamp', 0, 0),
			enablePerformance: !!opts['p'],
			verboseLogging: !!opts['verbose'],
			debugExtensionHostPort: debugExtensionHostPort,
			debugBrkExtensionHost: debugBrkExtensionHost,
			logExtensionHostCommunication: !!opts['logExtensionHostCommunication'],
			openNewWindow: !!opts['n'] || !!opts['new-window'],
			openInSameWindow: !!opts['r'] || !!opts['reuse-window'],
			gotoLineMode: gotoLineMode,
			diffMode: (!!opts['d'] || !!opts['diff']) && pathArguments.length === 2,
			extensionsHomePath: normalizePath(parseString(args, '--extensionHomePath')),
			extensionDevelopmentPath: normalizePath(parseString(args, '--extensionDevelopmentPath')),
			extensionTestsPath: normalizePath(parseString(args, '--extensionTestsPath')),
			disableExtensions: !!opts['disableExtensions'] || !!opts['disable-extensions'],
			locale: parseString(args, '--locale'),
			waitForWindowClose: !!opts['w'] || !!opts['wait']
		});

		this._isTestingFromCli = this.cliArgs.extensionTestsPath && !this.cliArgs.debugBrkExtensionHost;

		try {
			this._product = JSON.parse(fs.readFileSync(path.join(this._appRoot, 'product.json'), 'utf8'));
		} catch (error) {
			this._product = Object.create(null);
		}

		if (!this.isBuilt) {
			const nameShort = `${ this._product.nameShort } Dev`;
			const nameLong = `${ this._product.nameLong } Dev`;
			const dataFolderName = `${ this._product.dataFolderName }-dev`;

			this._product = assign(this._product, { nameShort, nameLong, dataFolderName });
		}

		this._userHome = path.join(app.getPath('home'), this._product.dataFolderName);

		// TODO move out of here!
		if (!fs.existsSync(this._userHome)) {
			fs.mkdirSync(this._userHome);
		}

		this._userExtensionsHome = this.cliArgs.extensionsHomePath || path.join(this.userHome, 'extensions');

		// TODO move out of here!
		if (!fs.existsSync(this._userExtensionsHome)) {
			fs.mkdirSync(this._userExtensionsHome);
		}

		this._mainIPCHandle = this.getMainIPCHandle();
		this._sharedIPCHandle = this.getSharedIPCHandle();
	}

	private getMainIPCHandle(): string {
		return this.getIPCHandleName() + (process.platform === 'win32' ? '-sock' : '.sock');
	}

	private getSharedIPCHandle(): string {
		return this.getIPCHandleName() + '-shared' + (process.platform === 'win32' ? '-sock' : '.sock');
	}

	private getIPCHandleName(): string {
		let handleName = app.getName();

		if (!this.isBuilt) {
			handleName += '-dev';
		}

		// Support to run VS Code multiple times as different user
		// by making the socket unique over the logged in user
		let userId = EnvService.getUniqueUserId();
		if (userId) {
			handleName += ('-' + userId);
		}

		if (process.platform === 'win32') {
			return '\\\\.\\pipe\\' + handleName;
		}

		return path.join(os.tmpdir(), handleName);
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

type OptionBag = { [opt: string]: boolean; };

function parseOpts(argv: string[]): OptionBag {
	return argv
		.filter(a => /^-/.test(a))
		.map(a => a.replace(/^-*/, ''))
		.reduce((r, a) => { r[a] = true; return r; }, <OptionBag>{});
}

function parsePathArguments(cwd: string, argv: string[], gotoLineMode?: boolean): string[] {
	return arrays.coalesce(							// no invalid paths
		arrays.distinct(							// no duplicates
			argv.filter(a => !(/^-/.test(a))) 		// arguments without leading "-"
				.map((arg) => {
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

					if (!paths.isValidBasename(path.basename(realPath))) {
						return null; // do not allow invalid file names
					}

					if (gotoLineMode) {
						parsedPath.path = realPath;
						return toLineAndColumnPath(parsedPath);
					}

					return realPath;
				}),
			(element) => {
				return element && (platform.isWindows || platform.isMacintosh) ? element.toLowerCase() : element; // only linux is case sensitive on the fs
			}
		)
	);
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

function parseNumber(argv: string[], key: string, defaultValue?: number, fallbackValue?: number): number {
	let value: number;

	for (let i = 0; i < argv.length; i++) {
		let segments = argv[i].split('=');
		if (segments[0] === key) {
			value = Number(segments[1]) || defaultValue;
			break;
		}
	}

	return types.isNumber(value) ? value : fallbackValue;
}

function parseString(argv: string[], key: string, defaultValue?: string, fallbackValue?: string): string {
	let value: string;

	for (let i = 0; i < argv.length; i++) {
		let segments = argv[i].split('=');
		if (segments[0] === key) {
			value = String(segments[1]) || defaultValue;
			break;
		}
	}

	return types.isString(value) ? strings.trim(value, '"') : fallbackValue;
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