/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

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
import { parseArgs, ParsedArgs } from 'vs/platform/environment/node/argv';

export interface IProcessEnvironment {
	[key: string]: string;
}

export interface ICommandLineArguments extends ParsedArgs {
	paths?: string[];
}

export const IEnvService = createDecorator<IEnvService>('mainEnvironmentService');

export interface IEnvService {
	_serviceBrand: any;
	cliArgs: ICommandLineArguments;
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
}

export class EnvService implements IEnvService {

	_serviceBrand: any;

	private _cliArgs: ICommandLineArguments;
	get cliArgs(): ICommandLineArguments { return this._cliArgs; }

	private _userExtensionsHome: string;
	get userExtensionsHome(): string { return this._userExtensionsHome; }

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

	constructor() {
		this._appRoot = path.dirname(URI.parse(require.toUrl('')).fsPath);
		this._currentWorkingDirectory = process.env['VSCODE_CWD'] || process.cwd();
		this._appHome = app.getPath('userData');
		this._appSettingsHome = path.join(this._appHome, 'User');
		this._appSettingsPath = path.join(this._appSettingsHome, 'settings.json');
		this._appKeybindingsPath = path.join(this._appSettingsHome, 'keybindings.json');

		// Remove the Electron executable
		const [, ...args] = process.argv;

		// If dev, remove the first non-option argument: it's the app location
		if (!this.isBuilt) {
			const index = arrays.firstIndex(args, a => !/^-/.test(a));

			if (index > -1) {
				args.splice(index, 1);
			}
		}

		const argv = parseArgs(args);
		const paths = parsePathArguments(this._currentWorkingDirectory, argv._, argv.goto);

		this._cliArgs = Object.freeze({
			_: [],
			paths,
			performance: argv.performance,
			verbose: argv.verbose,
			debugPluginHost: argv.debugPluginHost,
			debugBrkPluginHost: argv.debugBrkPluginHost,
			logExtensionHostCommunication: argv.logExtensionHostCommunication,
			'new-window': argv['new-window'],
			'reuse-window': argv['reuse-window'],
			goto: argv.goto,
			diff: argv.diff && paths.length === 2,
			extensionHomePath: normalizePath(argv.extensionHomePath),
			extensionDevelopmentPath: normalizePath(argv.extensionDevelopmentPath),
			extensionTestsPath: normalizePath(argv.extensionTestsPath),
			'disable-extensions': argv['disable-extensions'],
			locale: argv.locale,
			wait: argv.wait
		});

		this._userHome = path.join(os.homedir(), product.dataFolderName);
		this._userExtensionsHome = this.cliArgs.extensionHomePath || path.join(this._userHome, 'extensions');
	}
}

function parsePathArguments(cwd: string, args: string[], gotoLineMode?: boolean): string[] {
	const result = args.map(arg => {
		let pathCandidate = String(arg);

		let parsedPath: IParsedPath;
		if (gotoLineMode) {
			parsedPath = parseLineAndColumnAware(pathCandidate);
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

export interface IParsedPath {
	path: string;
	line?: number;
	column?: number;
}

export function parseLineAndColumnAware(rawPath: string): IParsedPath {
	const segments = rawPath.split(':'); // C:\file.txt:<line>:<column>

	let path: string;
	let line: number = null;
	let column: number = null;

	segments.forEach(segment => {
		const segmentAsNumber = Number(segment);
		if (!types.isNumber(segmentAsNumber)) {
			path = !!path ? [path, segment].join(':') : segment; // a colon can well be part of a path (e.g. C:\...)
		} else if (line === null) {
			line = segmentAsNumber;
		} else if (column === null) {
			column = segmentAsNumber;
		}
	});

	if (!path) {
		throw new Error('Format for `--goto` should be: `FILE:LINE(:COLUMN)`');
	}

	return {
		path: path,
		line: line !== null ? line : void 0,
		column: column !== null ? column : line !== null ? 1 : void 0 // if we have a line, make sure column is also set
	};
}

function toLineAndColumnPath(parsedPath: IParsedPath): string {
	const segments = [parsedPath.path];

	if (types.isNumber(parsedPath.line)) {
		segments.push(String(parsedPath.line));
	}

	if (types.isNumber(parsedPath.column)) {
		segments.push(String(parsedPath.column));
	}

	return segments.join(':');
}