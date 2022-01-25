/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const testWeb = require('@vscode/test-web');

const fs = require('fs');
const path = require('path');

const minimist = require('minimist');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');
const remote = require('gulp-remote-retry-src');
const vfs = require('vinyl-fs');
const opn = require('opn');

const APP_ROOT = path.join(__dirname, '..');
const WEB_DEV_EXTENSIONS_ROOT = path.join(APP_ROOT, '.build', 'builtInWebDevExtensions');

const WEB_PLAYGROUND_VERSION = '0.0.13';

const args = minimist(process.argv.slice(2), {
	boolean: [
		'help',
		'verbose',
		'open-devtools'
	],
	string: [
		'host',
		'port',
		'extension',
		'browserType'
	],
});

if (args.help) {
	console.log(
		'./scripts/code-web.sh|bat [options]\n' +
		' --host           Server host address\n' +
		' --port           Server port\n' +
		' --browserType    The browser type to launch:  `chromium` (default), `firefox`, `webkit` or `none`' +
		' --extension      Path of an extension to include\n' +
		' --open-devtools  Open the dev tools' +
		' --verbose        Print out more information\n' +
		' --help\n' +
		'[Example]\n' +
		' ./scripts/code-web.sh|bat --port 8080'
	);
	process.exit(0);
}

openTestWeb();


async function openTestWeb() {
	await ensureWebDevExtensions();
	const extensionPaths = [WEB_DEV_EXTENSIONS_ROOT];
	const extensions = args['extension'];
	if (Array.isArray(extensions)) {
		extensionPaths.push(...extensions);
	} else if (extensions) {
		extensionPaths.push(extensions);
	}
	const host = args.host || 'localhost';
	const port = args.port || 8080;

	await testWeb.open({
		browserType: args['browserType'] ?? 'none',
		host,
		port,
		folderUri: 'memfs:///sample-folder',
		vsCodeDevPath: APP_ROOT,
		extensionPaths,
		devTools: !!args['open-devtools'],
		hideServerLog: !args['verbose'],
		verbose: !!args['verbose']
	});


	if (!args['browserType']) {
		opn(`http://${host}:${port}/`);
	}
}

async function directoryExists(path) {
	try {
		return (await fs.promises.stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function ensureWebDevExtensions() {

	// Playground (https://github.com/microsoft/vscode-web-playground)
	const webDevPlaygroundRoot = path.join(WEB_DEV_EXTENSIONS_ROOT, 'vscode-web-playground');
	const webDevPlaygroundExists = await directoryExists(webDevPlaygroundRoot);

	let downloadPlayground = false;
	if (webDevPlaygroundExists) {
		try {
			const webDevPlaygroundPackageJson = JSON.parse(((await fs.promises.readFile(path.join(webDevPlaygroundRoot, 'package.json'))).toString()));
			if (webDevPlaygroundPackageJson.version !== WEB_PLAYGROUND_VERSION) {
				downloadPlayground = true;
			}
		} catch (error) {
			downloadPlayground = true;
		}
	} else {
		downloadPlayground = true;
	}

	if (downloadPlayground) {
		if (args.verbose) {
			fancyLog(`${ansiColors.magenta('Web Development extensions')}: Downloading vscode-web-playground to ${webDevPlaygroundRoot}`);
		}
		await new Promise((resolve, reject) => {
			remote(['package.json', 'dist/extension.js', 'dist/extension.js.map'], {
				base: 'https://raw.githubusercontent.com/microsoft/vscode-web-playground/main/'
			}).pipe(vfs.dest(webDevPlaygroundRoot)).on('end', resolve).on('error', reject);
		});
	} else {
		if (args.verbose) {
			fancyLog(`${ansiColors.magenta('Web Development extensions')}: Using existing vscode-web-playground in ${webDevPlaygroundRoot}`);
		}
	}
}
