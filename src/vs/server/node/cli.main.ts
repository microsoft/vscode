/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import type * as http from 'http';
import * as path from 'path';
import { URI } from 'vs/base/common/uri';
import { whenDeleted } from 'vs/base/node/pfs';
import { localize } from 'vs/nls';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { buildHelpMessage, buildVersionMessage, ErrorReporter, OptionDescriptions, OPTIONS as ALL_OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { createWaitMarkerFile } from 'vs/platform/environment/node/wait';
import product from 'vs/platform/product/common/product';
import type { PipeCommand } from 'vs/workbench/api/node/extHostCLIServer';

const OPTIONS_KEYS: (keyof typeof ALL_OPTIONS)[] = [
	'help',

	'diff',
	'add',
	'goto',
	'new-window',
	'reuse-window',
	'folder-uri',
	'file-uri',
	'wait',

	'list-extensions',
	'show-versions',
	'category',
	'install-extension',
	'uninstall-extension',
	'force',

	'version',
	'status',
	'verbose'
];
export interface ServerNativeParsedArgs extends NativeParsedArgs {
	'openExternal'?: string[]
}

export interface ServerCliOptions<T extends ServerNativeParsedArgs> {
	createRequestOptions(): http.RequestOptions
	parseArgs?(args: string[], errorReporter?: ErrorReporter): T
	handleArgs?(args: T): Promise<boolean>
}

async function doMain<T extends ServerNativeParsedArgs = ServerNativeParsedArgs>(processArgv: string[], options: ServerCliOptions<T>): Promise<any> {

	let args: T;

	try {
		const errorReporter: ErrorReporter = {
			onUnknownOption: (id) => {
				console.warn(localize('unknownOption', "Warning: '{0}' is not in the list of known options.", id));
			},
			onMultipleValues: (id, val) => {
				console.warn(localize('multipleValues', "Option '{0}' is defined more than once. Using value '{1}.'", id, val));
			}
		};

		args = options.parseArgs ? options.parseArgs(processArgv.slice(2), errorReporter) : parseArgs(processArgv.slice(2), OPTIONS, errorReporter) as T;
		if (args.goto) {
			args._.forEach(arg => assert(/^(\w:)?[^:]+(:\d*){0,2}$/.test(arg), localize('gotoValidation', "Arguments in `--goto` mode should be in the format of `FILE(:LINE(:CHARACTER))`.")));
		}
	} catch (err) {
		console.error(err.message);
		return;
	}

	// Help
	if (args.help) {
		const executable = `${product.applicationName}`;
		console.log(buildHelpMessage(product.nameLong, executable, product.version, OPTIONS));
	}

	// Version Info
	else if (args.version) {
		console.log(buildVersionMessage(product.version, product.commit));
	}

	// Status
	else if (args.status) {
		console.log(await sendCommand(options.createRequestOptions(), {
			type: 'status'
		}));
	}

	// open external URIs
	else if (args['openExternal']) {
		await sendCommand(options.createRequestOptions(), {
			type: 'openExternal',
			uris: args['openExternal']
		});
	}

	else if (options.handleArgs && await options.handleArgs(args)) {
		return;
	}

	// Extensionst Management
	else if (args['list-extensions'] || args['install-extension'] || args['uninstall-extension']) {
		console.log(await sendCommand(options.createRequestOptions(), {
			type: 'extensionManagement',
			list: args['list-extensions'] ? {
				category: args.category,
				showVersions: args['show-versions']
			} : undefined,
			install: args['install-extension'],
			uninstall: args['uninstall-extension'],
			force: args['force']
		}));
	}

	// Just Code
	else {
		const waitMarkerFilePath = args.wait ? createWaitMarkerFile(args.verbose) : undefined;
		const fileURIs: string[] = [...args['file-uri'] || []];
		const folderURIs: string[] = [...args['folder-uri'] || []];
		const pendingFiles: Promise<void>[] = [];
		for (const arg of args._) {
			if (arg === '-') {
				// don't support reading from stdin yet
				continue;
			}
			const filePath = path.resolve(process.cwd(), arg);
			pendingFiles.push(fs.promises.stat(filePath).then(stat => {
				const uris = stat.isFile() ? fileURIs : folderURIs;
				uris.push(URI.parse(filePath).toString());
			}, e => {
				if (e.code === 'ENOENT') {
					// open a new file
					fileURIs.push(URI.parse(filePath).toString());
				} else {
					console.log(`failed to resolve '${filePath}' path:`, e);
				}
			}));
		}
		await Promise.all(pendingFiles);
		await sendCommand(options.createRequestOptions(), {
			type: 'open',
			fileURIs,
			folderURIs,
			forceNewWindow: args['new-window'],
			diffMode: args.diff,
			addMode: args.add,
			gotoLineMode: args.goto,
			forceReuseWindow: args['reuse-window'],
			waitMarkerFilePath
		});
		if (waitMarkerFilePath) {
			// Complete when wait marker file is deleted
			await whenDeleted(waitMarkerFilePath);
		}
	}
}

export async function sendCommand(options: http.RequestOptions, command: PipeCommand): Promise<string> {
	const http = await import('http');
	while (true) {
		try {
			return await new Promise<string>((resolve, reject) => {
				const req = http.request(options, res => {
					const chunks: string[] = [];
					res.setEncoding('utf8');
					res.on('data', d => chunks.push(d));
					res.on('end', () => {
						const result = chunks.join('');
						if (res.statusCode !== 200) {
							reject(new Error(`Bad status code: ${res.statusCode}: ${result}`));
						} else {
							resolve(result);
						}
					});
				});
				req.on('error', err => reject(err));
				req.write(JSON.stringify(command));
				req.end();
			});
		} catch (e) {
			// Code Server is not running yet, let's try again
			if (e.code !== 'ECONNREFUSED') {
				throw e;
			}
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}
}

export const OPTIONS: OptionDescriptions<ServerNativeParsedArgs> = {
	_: ALL_OPTIONS['_'],
	'openExternal': {
		type: 'string[]'
	}
};
for (const key of OPTIONS_KEYS) {
	Object.assign(OPTIONS, { [key]: ALL_OPTIONS[key] });
}

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

export function main<T extends ServerNativeParsedArgs = ServerNativeParsedArgs>(processArgv: string[], options: ServerCliOptions<T>): void {
	doMain(processArgv, options)
		.then(() => eventuallyExit(0))
		.then(null, err => {
			console.error(err.message || err.stack || err);
			eventuallyExit(1);
		});
}
