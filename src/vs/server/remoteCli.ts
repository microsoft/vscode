/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as _fs from 'fs';
import * as _url from 'url';
import * as _cp from 'child_process';
import * as _http from 'http';
import * as _os from 'os';
import { cwd } from 'vs/base/common/process';
import { dirname, extname, resolve, join } from 'vs/base/common/path';
import { parseArgs, buildHelpMessage, buildVersionMessage, OPTIONS, OptionDescriptions } from 'vs/platform/environment/node/argv';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { createWaitMarkerFile } from 'vs/platform/environment/node/wait';
import { PipeCommand } from 'vs/workbench/api/node/extHostCLIServer';
import { hasStdinWithoutTty, getStdinFilePath, readFromStdin } from 'vs/platform/environment/node/stdin';

interface ProductDescription {
	productName: string;
	version: string;
	commit: string;
	executableName: string;
}

interface RemoteParsedArgs extends NativeParsedArgs { 'gitCredential'?: string; 'openExternal'?: boolean; }


const isSupportedForCmd = (optionId: keyof RemoteParsedArgs) => {
	switch (optionId) {
		case 'user-data-dir':
		case 'extensions-dir':
		case 'export-default-configuration':
		case 'install-source':
		case 'driver':
		case 'extensions-download-dir':
		case 'builtin-extensions-dir':
		case 'telemetry':
			return false;
		default:
			return true;
	}
};

const isSupportedForPipe = (optionId: keyof RemoteParsedArgs) => {
	switch (optionId) {
		case 'version':
		case 'help':
		case 'folder-uri':
		case 'file-uri':
		case 'add':
		case 'diff':
		case 'wait':
		case 'goto':
		case 'reuse-window':
		case 'new-window':
		case 'status':
		case 'install-extension':
		case 'uninstall-extension':
		case 'list-extensions':
		case 'force':
		case 'show-versions':
		case 'category':
			return true;
		default:
			return false;
	}
};

const cliPipe = process.env['VSCODE_IPC_HOOK_CLI'] as string;
const cliCommand = process.env['VSCODE_CLIENT_COMMAND'] as string;
const cliCommandCwd = process.env['VSCODE_CLIENT_COMMAND_CWD'] as string;
const remoteAuthority = process.env['VSCODE_CLI_AUTHORITY'] as string;
const cliStdInFilePath = process.env['VSCODE_STDIN_FILE_PATH'] as string;


export function main(desc: ProductDescription, args: string[]): void {
	if (!cliPipe && !cliCommand) {
		console.log('Command is only available in WSL or inside a Visual Studio Code terminal.');
		return;
	}

	// take the local options and remove the ones that don't apply
	const options: OptionDescriptions<RemoteParsedArgs> = { ...OPTIONS };
	const isSupported = cliCommand ? isSupportedForCmd : isSupportedForPipe;
	for (const optionId in OPTIONS) {
		const optId = <keyof RemoteParsedArgs>optionId;
		if (!isSupported(optId)) {
			delete options[optId];
		}
	}

	if (cliPipe) {
		options['openExternal'] = { type: 'boolean' };
	}

	const errorReporter = {
		onMultipleValues: (id: string, usedValue: string) => {
			console.error(`Option ${id} can only be defined once. Using value ${usedValue}.`);
		},

		onUnknownOption: (id: string) => {
			console.error(`Ignoring option ${id}: not supported for ${desc.executableName}.`);
		}
	};

	const parsedArgs = parseArgs(args, options, errorReporter);
	const mapFileUri = remoteAuthority ? mapFileToRemoteUri : (uri: string) => uri;

	if (parsedArgs.help) {
		console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, options, true));
		return;
	}
	if (parsedArgs.version) {
		console.log(buildVersionMessage(desc.version, desc.commit));
		return;
	}
	if (cliPipe) {
		if (parsedArgs['openExternal']) {
			openInBrowser(parsedArgs['_']);
			return;
		}
	}


	let folderURIs = (parsedArgs['folder-uri'] || []).map(mapFileUri);
	parsedArgs['folder-uri'] = folderURIs;

	let fileURIs = (parsedArgs['file-uri'] || []).map(mapFileUri);
	parsedArgs['file-uri'] = fileURIs;

	let inputPaths = parsedArgs['_'];
	let hasReadStdinArg = false;
	for (let input of inputPaths) {
		if (input === '-') {
			hasReadStdinArg = true;
		} else {
			translatePath(input, mapFileUri, folderURIs, fileURIs);
		}
	}

	parsedArgs['_'] = [];

	if (hasReadStdinArg && fileURIs.length === 0 && folderURIs.length === 0 && hasStdinWithoutTty()) {
		try {
			let stdinFilePath = cliStdInFilePath;
			if (!stdinFilePath) {
				stdinFilePath = getStdinFilePath();
				readFromStdin(stdinFilePath, !!parsedArgs.verbose); // throws error if file can not be written
			}

			// Make sure to open tmp file
			translatePath(stdinFilePath, mapFileUri, folderURIs, fileURIs);

			// Enable --wait to get all data and ignore adding this to history
			parsedArgs.wait = true;
			parsedArgs['skip-add-to-recently-opened'] = true;

			console.log(`Reading from stdin via: ${stdinFilePath}`);
		} catch (e) {
			console.log(`Failed to create file to read via stdin: ${e.toString()}`);
		}

	}

	if (parsedArgs.extensionDevelopmentPath) {
		parsedArgs.extensionDevelopmentPath = parsedArgs.extensionDevelopmentPath.map(p => mapFileUri(pathToURI(p).href));
	}

	if (parsedArgs.extensionTestsPath) {
		parsedArgs.extensionTestsPath = mapFileUri(pathToURI(parsedArgs['extensionTestsPath']).href);
	}

	const crashReporterDirectory = parsedArgs['crash-reporter-directory'];
	if (crashReporterDirectory !== undefined && !crashReporterDirectory.match(/^([a-zA-Z]:[\\\/])/)) {
		console.log(`The crash reporter directory '${crashReporterDirectory}' must be an absolute Windows path (e.g. c:/crashes)`);
		return;
	}

	if (remoteAuthority) {
		parsedArgs['remote'] = remoteAuthority;
	}

	if (cliCommand) {
		if (parsedArgs['install-extension'] !== undefined || parsedArgs['uninstall-extension'] !== undefined || parsedArgs['list-extensions']) {
			const cmdLine: string[] = [];
			parsedArgs['install-extension']?.forEach(id => cmdLine.push('--install-extension', id));
			parsedArgs['uninstall-extension']?.forEach(id => cmdLine.push('--uninstall-extension', id));
			['list-extensions', 'force', 'show-versions', 'category'].forEach(opt => {
				const value = parsedArgs[<keyof NativeParsedArgs>opt];
				if (value !== undefined) {
					cmdLine.push(`--${opt}=${value}`);
				}
			});
			const cp = _cp.fork(join(__dirname, 'main.js'), cmdLine, { stdio: 'inherit' });
			cp.on('error', err => console.log(err));
			return;
		}


		let newCommandline: string[] = [];
		for (let key in parsedArgs) {
			let val = parsedArgs[key as keyof typeof parsedArgs];
			if (typeof val === 'boolean') {
				if (val) {
					newCommandline.push('--' + key);
				}
			} else if (Array.isArray(val)) {
				for (let entry of val) {
					newCommandline.push(`--${key}=${entry.toString()}`);
				}
			} else if (val) {
				newCommandline.push(`--${key}=${val.toString()}`);
			}
		}

		const ext = extname(cliCommand);
		if (ext === '.bat' || ext === '.cmd') {
			const processCwd = cliCommandCwd || cwd();
			if (parsedArgs['verbose']) {
				console.log(`Invoking: cmd.exe /C ${cliCommand} ${newCommandline.join(' ')} in ${processCwd}`);
			}
			_cp.spawn('cmd.exe', ['/C', cliCommand, ...newCommandline], {
				stdio: 'inherit',
				cwd: processCwd
			});
		} else {
			const cliCwd = dirname(cliCommand);
			const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
			newCommandline.unshift('resources/app/out/cli.js');
			if (parsedArgs['verbose']) {
				console.log(`Invoking: ${cliCommand} ${newCommandline.join(' ')} in ${cliCwd}`);
			}
			_cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: ['inherit'] });
		}
	} else {
		if (args.length === 0) {
			console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, options, true));
			return;
		}
		if (parsedArgs.status) {
			sendToPipe({
				type: 'status'
			}).then((res: string) => {
				console.log(res);
			});
			return;
		}

		if (parsedArgs['install-extension'] !== undefined || parsedArgs['uninstall-extension'] !== undefined || parsedArgs['list-extensions']) {
			sendToPipe({
				type: 'extensionManagement',
				list: parsedArgs['list-extensions'] ? { showVersions: parsedArgs['show-versions'], category: parsedArgs['category'] } : undefined,
				install: asExtensionIdOrVSIX(parsedArgs['install-extension']),
				uninstall: asExtensionIdOrVSIX(parsedArgs['uninstall-extension']),
				force: parsedArgs['force']
			}).then((res: string) => {
				console.log(res);
			});
			return;
		}

		if (!fileURIs.length && !folderURIs.length) {
			console.log('At least one file or folder must be provided.');
			return;
		}

		let waitMarkerFilePath: string | undefined = undefined;
		if (parsedArgs['wait']) {
			if (!fileURIs.length) {
				console.log('At least one file must be provided to wait for.');
				return;
			}
			waitMarkerFilePath = createWaitMarkerFile(parsedArgs.verbose);
		}

		sendToPipe({
			type: 'open',
			fileURIs,
			folderURIs,
			diffMode: parsedArgs.diff,
			addMode: parsedArgs.add,
			gotoLineMode: parsedArgs.goto,
			forceReuseWindow: parsedArgs['reuse-window'],
			forceNewWindow: parsedArgs['new-window'],
			waitMarkerFilePath
		});

		if (waitMarkerFilePath) {
			waitForFileDeleted(waitMarkerFilePath);
		}
	}
}

async function waitForFileDeleted(path: string) {
	while (_fs.existsSync(path)) {
		await new Promise(res => setTimeout(res, 1000));
	}
}

function openInBrowser(args: string[]) {
	let uris: string[] = [];
	for (let location of args) {
		try {
			if (/^(http|https|file):\/\//.test(location)) {
				uris.push(_url.parse(location).href);
			} else {
				uris.push(pathToURI(location).href);
			}
		} catch (e) {
			console.log(`Invalid url: ${location}`);
		}
	}
	if (uris.length) {
		sendToPipe({
			type: 'openExternal',
			uris
		});
	}
}

function sendToPipe(args: PipeCommand): Promise<any> {
	return new Promise<string>(resolve => {
		const message = JSON.stringify(args);
		if (!cliPipe) {
			console.log('Message ' + message);
			resolve('');
			return;
		}

		const opts: _http.RequestOptions = {
			socketPath: cliPipe,
			path: '/',
			method: 'POST'
		};

		const req = _http.request(opts, res => {
			const chunks: string[] = [];
			res.setEncoding('utf8');
			res.on('data', chunk => {
				chunks.push(chunk);
			});
			res.on('error', () => fatal('Error in response'));
			res.on('end', () => {
				resolve(chunks.join(''));
			});
		});

		req.on('error', () => fatal('Error in request'));
		req.write(message);
		req.end();
	});
}

function asExtensionIdOrVSIX(inputs: string[] | undefined) {
	return inputs?.map(input => /\.vsix$/i.test(input) ? pathToURI(input).href : input);
}

function fatal(err: any): void {
	console.error('Unable to connect to VS Code server.');
	console.error(err);
	process.exit(1);
}

const preferredCwd = process.env.PWD || cwd(); // prefer process.env.PWD as it does not follow symlinks

function pathToURI(input: string): _url.URL {
	input = input.trim();
	input = resolve(preferredCwd, input);

	return _url.pathToFileURL(input);
}

function translatePath(input: string, mapFileUri: (input: string) => string, folderURIS: string[], fileURIS: string[]) {
	let url = pathToURI(input);
	let mappedUri = mapFileUri(url.href);
	try {
		let stat = _fs.lstatSync(_fs.realpathSync(input));

		if (stat.isFile()) {
			fileURIS.push(mappedUri);
		} else if (stat.isDirectory()) {
			folderURIS.push(mappedUri);
		} else if (input === '/dev/null') {
			// handle /dev/null passed to us by external tools such as `git difftool`
			fileURIS.push(mappedUri);
		}
	} catch (e) {
		if (e.code === 'ENOENT') {
			fileURIS.push(mappedUri);
		} else {
			console.log(`Problem accessing file ${input}. Ignoring file`, e);
		}
	}
}

function mapFileToRemoteUri(uri: string): string {
	return uri.replace(/^file:\/\//, 'vscode-remote://' + remoteAuthority);
}

let [, , productName, version, commit, executableName, ...remainingArgs] = process.argv;
main({ productName, version, commit, executableName }, remainingArgs);

