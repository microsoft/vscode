/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as _fs from 'fs';
import * as _path from 'path';
import * as _url from 'url';
import * as _cp from 'child_process';
import * as _http from 'http';
import { parseArgs, buildHelpMessage, buildVersionMessage, asArray, createWaitMarkerFile } from 'vs/platform/environment/node/argv';
import { OpenCommandPipeArgs, RunCommandPipeArgs, StatusPipeArgs } from 'vs/workbench/api/node/extHostCLIServer';

interface ProductDescription {
	productName: string;
	version: string;
	commit: string;
	executableName: string;
}

const isSupportedForCmd = (id: string) => {
	switch (id) {
		case 'user-data-dir':
		case 'extensions-dir':
		case 'list-extensions':
		case 'install-extension':
		case 'uninstall-extension':
		case 'show-versions':
		case 'export-default-configuration':
		case 'install-source':
		case 'driver':
			return false;
		default:
			return true;
	}
};

const isSupportedForPipe = (id: string) => {
	switch (id) {
		case 'version':
		case 'help':
		case 'folder-uri':
		case 'file-uri':
		case 'diff':
		case 'wait':
		case 'reuse-window':
		case 'new-window':
		case 'status':
			return true;
		default:
			return false;
	}
};

const cliPipe = process.env['VSCODE_IPC_HOOK_CLI'] as string;
const cliCommand = process.env['VSCODE_CLIENT_COMMAND'] as string;
const cliCommandCwd = process.env['VSCODE_CLIENT_COMMAND_CWD'] as string;
const remoteAuthority = process.env['VSCODE_CLI_AUTHORITY'] as string;


export function main(desc: ProductDescription, args: string[]): void {
	if (!cliPipe && !cliCommand) {
		console.log('Command is only available in WSL or inside a Visual Studio Code terminal.');
		return;
	}

	const parsedArgs = parseArgs(args);

	const isSupported = cliCommand ? isSupportedForCmd : isSupportedForPipe;
	const mapFileUri = remoteAuthority ? mapFileToRemoteUri : (uri: string) => uri;

	if (parsedArgs.help) {
		console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, o => isSupported(o.id), false));
		return;
	}
	if (parsedArgs.version) {
		console.log(buildVersionMessage(desc.version, desc.commit));
		return;
	}
	if (parsedArgs['gitCredential']) {
		getCredential(parsedArgs['gitCredential']);
		return;
	}
	// warn about unsupported arguments
	for (let key in parsedArgs) {
		if (key !== '_' && !isSupported(key) && parsedArgs[key as keyof typeof parsedArgs] !== false) {
			console.error(`Ignoring option ${key}: not supported for ${desc.executableName}.`);
			delete parsedArgs[key as keyof typeof parsedArgs];
		}
	}

	let folderURIs = asArray(parsedArgs['folder-uri']).map(mapFileUri);
	parsedArgs['folder-uri'] = folderURIs;

	let fileURIs = asArray(parsedArgs['file-uri']).map(mapFileUri);
	parsedArgs['file-uri'] = fileURIs;

	let inputPaths = asArray(parsedArgs['_']);
	for (let input of inputPaths) {
		translatePath(input, mapFileUri, folderURIs, fileURIs);
	}

	delete parsedArgs['_'];

	if (parsedArgs.extensionDevelopmentPath) {
		if (Array.isArray(parsedArgs.extensionDevelopmentPath)) {
			parsedArgs.extensionDevelopmentPath = parsedArgs.extensionDevelopmentPath.map(p => mapFileUri(pathToURI(p).href));
		} else {
			parsedArgs.extensionDevelopmentPath = mapFileUri(pathToURI(parsedArgs.extensionDevelopmentPath).href);
		}
	}

	if (parsedArgs.extensionTestsPath) {
		parsedArgs.extensionTestsPath = mapFileUri(pathToURI(parsedArgs['extensionTestsPath']).href);
	}

	if (remoteAuthority) {
		parsedArgs['remote'] = remoteAuthority;
	}

	if (cliCommand) {
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

		const ext = _path.extname(cliCommand);
		if (ext === '.bat' || ext === '.cmd') {
			const cwd = cliCommandCwd || process.cwd();
			if (parsedArgs['verbose']) {
				console.log(`Invoking: cmd.exe /C ${cliCommand} ${newCommandline.join(' ')} in ${cwd}`);
			}
			_cp.spawn('cmd.exe', ['/C', cliCommand, ...newCommandline], {
				stdio: 'inherit',
				cwd
			});
		} else {
			if (parsedArgs['verbose']) {
				console.log(`Invoking: ${cliCommand} ${newCommandline.join(' ')} in ${cwd}`);
			}
			_cp.spawn(cliCommand, newCommandline, {
				stdio: 'inherit',
				cwd
			});
		}
	} else {
		if (args.length === 0) {
			console.log(buildHelpMessage(desc.productName, desc.executableName, desc.version, o => isSupported(o.id), false));
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

function getCredential(cmd: string) {
	const command = ({ get: 'fill', store: 'approve', erase: 'reject' } as { [cmd: string]: 'fill' | 'approve' | 'reject' | undefined })[cmd];
	if (command === undefined) {
		console.log('Expected get, store or erase.');
		return;
	}
	let stdin = '';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', chunk => {
		stdin += chunk;
		if (stdin === '\n' || stdin.indexOf('\n\n', stdin.length - 2) !== -1) {
			process.stdin.pause();
			sendGetCredential(command, stdin)
				.catch(console.error);
		}
	});
	process.stdin.on('end', () => {
		sendGetCredential(command, stdin)
			.catch(console.error);
	});
}

async function sendGetCredential(command: 'fill' | 'approve' | 'reject', stdin: string) {
	const json = await sendToPipe({
		type: 'command',
		command: 'git.credential',
		args: [{ command, stdin }]
	});
	const { stdout, stderr, code } = JSON.parse(json);
	if (stdout) {
		process.stdout.write(stdout);
	}
	if (stderr) {
		process.stderr.write(stderr);
	}
	if (code) {
		process.exit(code);
	}
}

type Args = OpenCommandPipeArgs | StatusPipeArgs | RunCommandPipeArgs;

function sendToPipe(args: Args): Promise<any> {
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

function fatal(err: any): void {
	console.error('Unable to connect to VS Code server.');
	console.error(err);
	process.exit(1);
}

const cwd = process.env.PWD || process.cwd(); // prefer process.env.PWD as it does not follow symlinks

function pathToURI(input: string): _url.URL {
	input = input.trim();
	input = _path.resolve(cwd, input);
	return new _url.URL('file:///' + input);
}

function translatePath(input: string, mapFileUri: (input: string) => string, folderURIS: string[], fileURIS: string[]) {
	let url = pathToURI(input);
	let mappedUri = mapFileUri(url.href);
	try {
		let stat = _fs.lstatSync(input);
		if (stat.isFile()) {
			fileURIS.push(mappedUri);
		} else {
			folderURIS.push(mappedUri);
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

let [, , productName, version, commit, executableName, ...args] = process.argv;
main({ productName, version, commit, executableName }, args);