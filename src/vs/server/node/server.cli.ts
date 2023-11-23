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
import { parseArgs, buildHelpMessage, buildVersionMessage, OPTIONS, OptionDescriptions, ErrorReporter } from 'vs/platform/environment/node/argv';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { createWaitMarkerFileSync } from 'vs/platform/environment/node/wait';
import { PipeCommand } from 'vs/workbench/api/node/extHostCLIServer';
import { hasStdinWithoutTty, getStdinFilePath, readFromStdin } from 'vs/platform/environment/node/stdin';

/*
 * Implements a standalone CLI app that opens VS Code from a remote terminal.
 *  - In integrated terminals for remote windows this connects to the remote server though a pipe.
 *    The pipe is passed in env VSCODE_IPC_HOOK_CLI.
 *  - In external terminals for WSL this calls VS Code on the Windows side.
 *    The VS Code desktop executable path is passed in env VSCODE_CLIENT_COMMAND.
 */


interface ProductDescription {
	productName: string;
	version: string;
	commit: string;
	executableName: string;
}

interface RemoteParsedArgs extends NativeParsedArgs { 'gitCredential'?: string; 'openExternal'?: boolean }


const isSupportedForCmd = (optionId: keyof RemoteParsedArgs) => {
	switch (optionId) {
		case 'user-data-dir':
		case 'extensions-dir':
		case 'export-default-configuration':
		case 'install-source':
		case 'enable-smoke-test-driver':
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
		case 'merge':
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
		case 'verbose':
		case 'remote':
		case 'locate-shell-integration-path':
			return true;
		default:
			return false;
	}
};

const cliPipe = process.env['VSCODE_IPC_HOOK_CLI'] as string;
const cliCommand = process.env['VSCODE_CLIENT_COMMAND'] as string;
const cliCommandCwd = process.env['VSCODE_CLIENT_COMMAND_CWD'] as string;
const cliRemoteAuthority = process.env['VSCODE_CLI_AUTHORITY'] as string;
const cliStdInFilePath = process.env['VSCODE_STDIN_FILE_PATH'] as string;

export async function main(desc: ProductDescription, args: string[]): Promise<void> {
	if (!cliPipe && !cliCommand) {
		console.log('Command is only available in WSL or inside a Visual Studio Code terminal.');
		return;
	}

	// take the local options and remove the ones that don't apply
	const options: OptionDescriptions<Required<RemoteParsedArgs>> = { ...OPTIONS, gitCredential: { type: 'string' }, openExternal: { type: 'boolean' } };
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

	const errorReporter: ErrorReporter = {
		onMultipleValues: (id: string, usedValue: string) => {
			console.error(`Option '${id}' can only be defined once. Using value ${usedValue}.`);
		},
		onEmptyValue: (id) => {
			console.error(`Ignoring option '${id}': Value must not be empty.`);
		},
		onUnknownOption: (id: string) => {
			console.error(`Ignoring option '${id}': not supported for ${desc.executableName}.`);
		},
		onDeprecatedOption: (deprecatedOption: string, message: string) => {
			console.warn(`Option '${deprecatedOption}' is deprecated: ${message}`);
		}
	};

	const parsedArgs = parseArgs(args, options, errorReporter);
	const mapFileUri = cliRemoteAuthority ? mapFileToRemoteUri : (uri: string) => uri;

	const verbose = !!parsedArgs['verbose'];

	if (parsedArgs.help) {
		console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, options));
		return;
	}
	if (parsedArgs.version) {
		console.log(buildVersionMessage(desc.version, desc.commit));
		return;
	}
	if (parsedArgs['locate-shell-integration-path']) {
		let file: string;
		switch (parsedArgs['locate-shell-integration-path']) {
			// Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path bash)"`
			case 'bash': file = 'shellIntegration-bash.sh'; break;
			// Usage: `if ($env:TERM_PROGRAM -eq "vscode") { . "$(code --locate-shell-integration-path pwsh)" }`
			case 'pwsh': file = 'shellIntegration.ps1'; break;
			// Usage: `[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"`
			case 'zsh': file = 'shellIntegration-rc.zsh'; break;
			// Usage: `string match -q "$TERM_PROGRAM" "vscode"; and . (code --locate-shell-integration-path fish)`
			case 'fish': file = 'fish_xdg_data/fish/vendor_conf.d/shellIntegration.fish'; break;
			default: throw new Error('Error using --locate-shell-integration-path: Invalid shell type');
		}
		console.log(resolve(__dirname, '../..', 'workbench', 'contrib', 'terminal', 'browser', 'media', file));
		return;
	}
	if (cliPipe) {
		if (parsedArgs['openExternal']) {
			openInBrowser(parsedArgs['_'], verbose);
			return;
		}
	}

	let remote: string | null | undefined = parsedArgs.remote;
	if (remote === 'local' || remote === 'false' || remote === '') {
		remote = null; // null represent a local window
	}

	const folderURIs = (parsedArgs['folder-uri'] || []).map(mapFileUri);
	parsedArgs['folder-uri'] = folderURIs;

	const fileURIs = (parsedArgs['file-uri'] || []).map(mapFileUri);
	parsedArgs['file-uri'] = fileURIs;

	const inputPaths = parsedArgs['_'];
	let hasReadStdinArg = false;
	for (const input of inputPaths) {
		if (input === '-') {
			hasReadStdinArg = true;
		} else {
			translatePath(input, mapFileUri, folderURIs, fileURIs);
		}
	}

	parsedArgs['_'] = [];

	if (hasReadStdinArg && hasStdinWithoutTty()) {
		try {
			let stdinFilePath = cliStdInFilePath;
			if (!stdinFilePath) {
				stdinFilePath = getStdinFilePath();
				await readFromStdin(stdinFilePath, verbose); // throws error if file can not be written
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

			const cp = _cp.fork(join(__dirname, '../../../server-main.js'), cmdLine, { stdio: 'inherit' });
			cp.on('error', err => console.log(err));
			return;
		}

		const newCommandline: string[] = [];
		for (const key in parsedArgs) {
			const val = parsedArgs[key as keyof typeof parsedArgs];
			if (typeof val === 'boolean') {
				if (val) {
					newCommandline.push('--' + key);
				}
			} else if (Array.isArray(val)) {
				for (const entry of val) {
					newCommandline.push(`--${key}=${entry.toString()}`);
				}
			} else if (val) {
				newCommandline.push(`--${key}=${val.toString()}`);
			}
		}
		if (remote !== null) {
			newCommandline.push(`--remote=${remote || cliRemoteAuthority}`);
		}

		const ext = extname(cliCommand);
		if (ext === '.bat' || ext === '.cmd') {
			const processCwd = cliCommandCwd || cwd();
			if (verbose) {
				console.log(`Invoking: cmd.exe /C ${cliCommand} ${newCommandline.join(' ')} in ${processCwd}`);
			}
			_cp.spawn('cmd.exe', ['/C', cliCommand, ...newCommandline], {
				stdio: 'inherit',
				cwd: processCwd
			});
		} else {
			const cliCwd = dirname(cliCommand);
			const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
			newCommandline.unshift('--ms-enable-electron-run-as-node');
			newCommandline.unshift('resources/app/out/cli.js');
			if (verbose) {
				console.log(`Invoking: cd "${cliCwd}" && ELECTRON_RUN_AS_NODE=1 "${cliCommand}" "${newCommandline.join('" "')}"`);
			}
			if (runningInWSL2()) {
				if (verbose) {
					console.log(`Using pipes for output.`);
				}
				const cp = _cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: ['inherit', 'pipe', 'pipe'] });
				cp.stdout.on('data', data => process.stdout.write(data));
				cp.stderr.on('data', data => process.stderr.write(data));
			} else {
				_cp.spawn(cliCommand, newCommandline, { cwd: cliCwd, env, stdio: 'inherit' });
			}
		}
	} else {
		if (parsedArgs.status) {
			sendToPipe({
				type: 'status'
			}, verbose).then((res: string) => {
				console.log(res);
			}).catch(e => {
				console.error('Error when requesting status:', e);
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
			}, verbose).then((res: string) => {
				console.log(res);
			}).catch(e => {
				console.error('Error when invoking the extension management command:', e);
			});
			return;
		}

		let waitMarkerFilePath: string | undefined = undefined;
		if (parsedArgs['wait']) {
			if (!fileURIs.length) {
				console.log('At least one file must be provided to wait for.');
				return;
			}
			waitMarkerFilePath = createWaitMarkerFileSync(verbose);
		}

		sendToPipe({
			type: 'open',
			fileURIs,
			folderURIs,
			diffMode: parsedArgs.diff,
			mergeMode: parsedArgs.merge,
			addMode: parsedArgs.add,
			gotoLineMode: parsedArgs.goto,
			forceReuseWindow: parsedArgs['reuse-window'],
			forceNewWindow: parsedArgs['new-window'],
			waitMarkerFilePath,
			remoteAuthority: remote
		}, verbose).catch(e => {
			console.error('Error when invoking the open command:', e);
		});

		if (waitMarkerFilePath) {
			waitForFileDeleted(waitMarkerFilePath);
		}
	}
}

function runningInWSL2(): boolean {
	if (!!process.env['WSL_DISTRO_NAME']) {
		try {
			return _cp.execSync('uname -r', { encoding: 'utf8' }).includes('-microsoft-');
		} catch (_e) {
			// Ignore
		}
	}
	return false;
}

async function waitForFileDeleted(path: string) {
	while (_fs.existsSync(path)) {
		await new Promise(res => setTimeout(res, 1000));
	}
}

function openInBrowser(args: string[], verbose: boolean) {
	const uris: string[] = [];
	for (const location of args) {
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
		}, verbose).catch(e => {
			console.error('Error when invoking the open external command:', e);
		});
	}
}

function sendToPipe(args: PipeCommand, verbose: boolean): Promise<any> {
	if (verbose) {
		console.log(JSON.stringify(args, null, '  '));
	}
	return new Promise<string>((resolve, reject) => {
		const message = JSON.stringify(args);
		if (!cliPipe) {
			console.log('Message ' + message);
			resolve('');
			return;
		}

		const opts: _http.RequestOptions = {
			socketPath: cliPipe,
			path: '/',
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'accept': 'application/json'
			}
		};

		const req = _http.request(opts, res => {
			if (res.headers['content-type'] !== 'application/json') {
				reject('Error in response: Invalid content type: Expected \'application/json\', is: ' + res.headers['content-type']);
				return;
			}

			const chunks: string[] = [];
			res.setEncoding('utf8');
			res.on('data', chunk => {
				chunks.push(chunk);
			});
			res.on('error', (err) => fatal('Error in response.', err));
			res.on('end', () => {
				const content = chunks.join('');
				try {
					const obj = JSON.parse(content);
					if (res.statusCode === 200) {
						resolve(obj);
					} else {
						reject(obj);
					}
				} catch (e) {
					reject('Error in response: Unable to parse response as JSON: ' + content);
				}
			});
		});

		req.on('error', (err) => fatal('Error in request.', err));
		req.write(message);
		req.end();
	});
}

function asExtensionIdOrVSIX(inputs: string[] | undefined) {
	return inputs?.map(input => /\.vsix$/i.test(input) ? pathToURI(input).href : input);
}

function fatal(message: string, err: any): void {
	console.error('Unable to connect to VS Code server: ' + message);
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
	const url = pathToURI(input);
	const mappedUri = mapFileUri(url.href);
	try {
		const stat = _fs.lstatSync(_fs.realpathSync(input));

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
	return uri.replace(/^file:\/\//, 'vscode-remote://' + cliRemoteAuthority);
}

const [, , productName, version, commit, executableName, ...remainingArgs] = process.argv;
main({ productName, version, commit, executableName }, remainingArgs).then(null, err => {
	console.error(err.message || err.stack || err);
});
