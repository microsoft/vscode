/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection } from '@playwright/mcp';
import { getDevElectronPath, Quality, FileLogger, Logger, MultiLogger } from '../../automation';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as os from 'os';
import { createApp, parseVersion } from './utils';
import * as minimist from 'minimist';
import { McpLogger } from './mcpLogger';

const rootPath = path.join(__dirname, '..', '..', '..');

const [, , ...args] = process.argv;
const opts = minimist(args, {
	string: [
		'browser',
		'build',
		'stable-build',
		'wait-time',
		'test-repo',
		'electronArgs'
	],
	boolean: [
		'verbose',
		'remote',
		'web',
		'headless',
		'tracing'
	],
	default: {
		verbose: false
	}
}) as {
	verbose?: boolean;
	remote?: boolean;
	headless?: boolean;
	web?: boolean;
	tracing?: boolean;
	build?: string;
	'stable-build'?: string;
	browser?: 'chromium' | 'webkit' | 'firefox' | 'chromium-msedge' | 'chromium-chrome' | undefined;
	electronArgs?: string;
};

const testDataPath = path.join(os.tmpdir(), 'vscsmoke');
if (fs.existsSync(testDataPath)) {
	fs.rmSync(testDataPath, { recursive: true, force: true, maxRetries: 10 });
}
fs.mkdirSync(testDataPath, { recursive: true });
process.once('exit', () => {
	try {
		fs.rmSync(testDataPath, { recursive: true, force: true, maxRetries: 10 });
	} catch {
		// noop
	}
});

const testRepoUrl = 'https://github.com/microsoft/vscode-smoketest-express';
const workspacePath = path.join(testDataPath, 'vscode-smoketest-express');
const extensionsPath = path.join(testDataPath, 'extensions-dir');
fs.mkdirSync(extensionsPath, { recursive: true });

const logsRootPath = (() => {
	const logsParentPath = path.join(rootPath, '.build', 'logs');

	let logsName: string;
	if (opts.web) {
		logsName = 'mcp-browser';
	} else if (opts.remote) {
		logsName = 'mcp-remote';
	} else {
		logsName = 'mcp-electron';
	}

	return path.join(logsParentPath, logsName);
})();

const crashesRootPath = (() => {
	const crashesParentPath = path.join(rootPath, '.build', 'crashes');

	let crashesName: string;
	if (opts.web) {
		crashesName = 'mcp-browser';
	} else if (opts.remote) {
		crashesName = 'mcp-remote';
	} else {
		crashesName = 'mcp-electron';
	}

	return path.join(crashesParentPath, crashesName);
})();

const logger = createLogger();
const mcpLogger = new McpLogger();

function createLogger(): Logger {
	const loggers: Logger[] = [];

	loggers.push(mcpLogger);

	// Prepare logs rot path
	fs.rmSync(logsRootPath, { recursive: true, force: true, maxRetries: 3 });
	fs.mkdirSync(logsRootPath, { recursive: true });

	// Always log to log file
	loggers.push(new FileLogger(path.join(logsRootPath, 'smoke-test-runner.log')));

	return new MultiLogger(loggers);
}

async function setupRepository(): Promise<void> {
	if (!fs.existsSync(workspacePath)) {
		logger.log('Cloning test project repository...');
		const res = cp.spawnSync('git', ['clone', testRepoUrl, workspacePath], { stdio: 'inherit' });
		if (!fs.existsSync(workspacePath)) {
			throw new Error(`Clone operation failed: ${res.stderr.toString()}`);
		}
	} else {
		logger.log('Cleaning test project repository...');
		cp.spawnSync('git', ['fetch'], { cwd: workspacePath, stdio: 'inherit' });
		cp.spawnSync('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: workspacePath, stdio: 'inherit' });
		cp.spawnSync('git', ['clean', '-xdf'], { cwd: workspacePath, stdio: 'inherit' });
	}
}

export async function getServer() {
	const testCodePath = getDevElectronPath();
	const electronPath = testCodePath;
	if (!fs.existsSync(electronPath || '')) {
		throw new Error(`Cannot find VSCode at ${electronPath}. Please run VSCode once first (scripts/code.sh, scripts\\code.bat) and try again.`);
	}
	process.env.VSCODE_REPOSITORY = rootPath;
	process.env.VSCODE_DEV = '1';
	process.env.VSCODE_CLI = '1';
	delete process.env.ELECTRON_RUN_AS_NODE;
	const quality = Quality.Dev;
	const userDataDir = path.join(testDataPath, 'd');
	await setupRepository();
	const application = createApp({
		quality,
		version: parseVersion('0.0.0'),
		codePath: opts.build,
		workspacePath,
		userDataDir,
		extensionsPath,
		logger,
		logsPath: path.join(logsRootPath, 'suite_unknown'),
		crashesPath: path.join(crashesRootPath, 'suite_unknown'),
		verbose: opts.verbose,
		remote: opts.remote,
		web: opts.web,
		tracing: opts.tracing,
		headless: opts.headless,
		browser: opts.browser,
		extraArgs: (opts.electronArgs || '').split(' ').map(arg => arg.trim()).filter(arg => !!arg),
	}, opts => ({ ...opts, userDataDir: path.join(opts.userDataDir, 'ø') }));
	await application.start();
	const connection = await createConnection(undefined, () => Promise.resolve(application.code.driver.browserContext));
	mcpLogger.server = connection;
	application.code.driver.browserContext.on('close', () => {
		connection.close();
	});
	return connection;
}
