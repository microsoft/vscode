/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const testWebLocation = require.resolve('@vscode/test-web');

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const minimist = require('minimist');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');
const remote = require('gulp-remote-retry-src');
const vfs = require('vinyl-fs');
const opn = require('opn');

const APP_ROOT = path.join(__dirname, '..');
const WEB_DEV_EXTENSIONS_ROOT = path.join(APP_ROOT, '.build', 'builtInWebDevExtensions');

const WEB_PLAYGROUND_VERSION = '0.0.13';

async function main() {

	const args = minimist(process.argv.slice(2), {
		boolean: [
			'help',
			'playground'
		],
		string: [
			'host',
			'port',
			'extensionPath',
			'browser',
			'browserType'
		],
	});

	if (args.help) {
		console.log(
			'./scripts/code-web.sh|bat [options]\n' +
			' --playground             Include the vscode-web-playground extension (added by default if no folderPath is provided)\n'
		);
		startServer(['--help']);
		return;
	}

	const serverArgs = [];

	const HOST = args['host'] ?? 'localhost';
	const PORT = args['port'] ?? '8080';

	if (args['host'] === undefined) {
		serverArgs.push('--host', HOST);
	}
	if (args['port'] === undefined) {
		serverArgs.push('--port', PORT);
	}

	if (args['playground'] || args['_'].length === 0) {
		serverArgs.push('--extensionPath', WEB_DEV_EXTENSIONS_ROOT);
		serverArgs.push('--folder-uri', 'memfs:///sample-folder');
		await ensureWebDevExtensions(args['verbose']);
	}

	let openSystemBrowser = false;
	if (!args['browser'] && !args['browserType']) {
		serverArgs.push('--browser', 'none');
		openSystemBrowser = true;
	}

	serverArgs.push('--sourcesPath', APP_ROOT);

	serverArgs.push(...process.argv.slice(2).filter(v => v !== '--playground'));


	startServer(serverArgs);
	if (openSystemBrowser) {
		opn(`http://${HOST}:${PORT}/`);
	}
}

function startServer(runnerArguments) {
	const env = { ...process.env };

	console.log(`Starting @vscode/test-web: ${testWebLocation} ${runnerArguments.join(' ')}`);
	const proc = cp.spawn(process.execPath, [testWebLocation, ...runnerArguments], { env, stdio: 'inherit' });

	proc.on('exit', (code) => process.exit(code));

	process.on('exit', () => proc.kill());
	process.on('SIGINT', () => {
		proc.kill();
		process.exit(128 + 2); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
	});
	process.on('SIGTERM', () => {
		proc.kill();
		process.exit(128 + 15); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
	});
}

async function directoryExists(path) {
	try {
		return (await fs.promises.stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function ensureWebDevExtensions(verbose) {

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
		if (verbose) {
			fancyLog(`${ansiColors.magenta('Web Development extensions')}: Downloading vscode-web-playground to ${webDevPlaygroundRoot}`);
		}
		await new Promise((resolve, reject) => {
			remote(['package.json', 'dist/extension.js', 'dist/extension.js.map'], {
				base: 'https://raw.githubusercontent.com/microsoft/vscode-web-playground/main/'
			}).pipe(vfs.dest(webDevPlaygroundRoot)).on('end', resolve).on('error', reject);
		});
	} else {
		if (verbose) {
			fancyLog(`${ansiColors.magenta('Web Development extensions')}: Using existing vscode-web-playground in ${webDevPlaygroundRoot}`);
		}
	}
}


main();
