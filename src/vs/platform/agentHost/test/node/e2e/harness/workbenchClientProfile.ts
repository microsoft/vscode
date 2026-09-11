/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, execFile, fork, spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { dirname, join, resolve } from '../../../../../../base/common/path.js';
import { compare } from '../../../../../../base/common/strings.js';
import type { ToolDefinition } from '../../../../common/state/sessionState.js';
import { createIsolatedProviderEnvironment } from '../../providerTestEnvironment.js';
import { workbenchClientProfileRunnerSource } from './workbenchClientProfileRunner.js';
import type { WorkbenchClientProfileResult } from './workbenchClientProfileWatchdog.js';

const captureTimeout = 120_000;
const diagnosticLimit = 16_384;
const repositoryRoot = fileURLToPath(new URL('../../../../../../../../', import.meta.url));

/** Captures the real workbench tool profile in an unsigned-in extension-test window, then closes it. */
export async function collectWorkbenchClientTools(): Promise<ToolDefinition[]> {
	const captureRoot = join(repositoryRoot, '.build');
	await mkdir(captureRoot, { recursive: true });
	// Keep the isolated profile short enough for macOS Unix-domain socket paths.
	const directory = await mkdtemp(join(captureRoot, 'cp-'));
	let child: ChildProcess | undefined;
	let diagnostics = '';
	try {
		const home = join(directory, 'h');
		const userData = join(directory, 'u');
		const workspace = join(directory, 'w');
		const extensions = join(directory, 'e');
		const sharedData = join(directory, 'd');
		const scratch = join(directory, 's');
		await Promise.all([home, join(userData, 'User'), workspace, extensions, sharedData, scratch].map(path => mkdir(path, { recursive: true })));
		await writeFile(join(userData, 'User', 'settings.json'), JSON.stringify({
			'workbench.startupEditor': 'none',
			'workbench.browser.enableChatTools': true,
			'chat.agent.enabled': true,
			'chat.notifyWindowOnConfirmation': 'off',
			'chat.notifyWindowOnResponseReceived': 'off',
			'extensions.autoUpdate': false,
			'extensions.autoCheckUpdates': false,
			'telemetry.telemetryLevel': 'off'
		}));

		const selectedExecutable = process.env.INTEGRATION_TEST_ELECTRON_PATH;
		const product: { nameLong: string; nameShort: string; applicationName: string } = JSON.parse(await readFile(join(repositoryRoot, 'product.json'), 'utf8'));
		const executable = selectedExecutable ? resolve(selectedExecutable) : join(repositoryRoot, '.build', 'electron',
			...(process.platform === 'darwin' ? [`${product.nameLong}.app`, 'Contents', 'MacOS', product.nameShort]
				: [process.platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName]));
		const appRoot = selectedExecutable
			? process.platform === 'darwin' ? resolve(dirname(executable), '..', 'Resources', 'app') : join(dirname(executable), 'resources', 'app')
			: repositoryRoot;
		const copilotExtension = selectedExecutable ? await findCopilotExtension(join(appRoot, 'extensions')) : join(repositoryRoot, 'extensions', 'copilot');
		const runner = join(directory, 'workbenchClientProfileRunner.cjs');
		await writeFile(runner, workbenchClientProfileRunnerSource);
		const output = join(directory, 'tools.json');
		const environment = createIsolatedProviderEnvironment(home, Object.fromEntries(
			Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|LANG|LANGUAGE|LC_ALL|LC_CTYPE|LC_MESSAGES|TZ)$/i.test(key))
		));
		Object.assign(environment, {
			VSCODE_CLI: '1',
			VSCODE_SKIP_PRELAUNCH: '1',
			ELECTRON_ENABLE_LOGGING: '1',
			// Copilot otherwise intentionally skips activation in ExtensionMode.Test.
			IS_SCENARIO_AUTOMATION: '1',
			AGENT_HOST_CLIENT_PROFILE_OUTPUT: output,
			GH_CONFIG_DIR: join(home, '.config', 'gh'),
			XDG_CACHE_HOME: join(home, '.cache'),
			XDG_DATA_HOME: join(home, '.local', 'share'),
			XDG_STATE_HOME: join(home, '.local', 'state'),
			TMPDIR: scratch,
			TMP: scratch,
			TEMP: scratch,
			...(selectedExecutable ? {} : { VSCODE_DEV: '1', NODE_ENV: 'development' })
		});
		await promisify(execFile)('git', ['init', '--quiet', '--initial-branch=main'], { cwd: workspace, env: environment, timeout: 10_000 });
		const args = [
			...(selectedExecutable ? [] : [repositoryRoot]),
			workspace,
			`--user-data-dir=${userData}`,
			`--extensions-dir=${extensions}`,
			`--shared-data-dir=${sharedData}`,
			`--extensionDevelopmentPath=${copilotExtension}`,
			`--extensionTestsPath=${runner}`,
			'--enable-proposed-api=GitHub.copilot-chat',
			`--logsPath=${join(directory, 'logs')}`,
			`--crash-reporter-directory=${join(directory, 'crashes')}`,
			'--use-mock-keychain',
			'--use-inmemory-secretstorage',
			'--disable-workspace-trust',
			'--disable-telemetry',
			'--disable-experiments',
			'--disable-updates',
			'--skip-welcome',
			'--skip-release-notes',
			'--no-cached-data',
			'--disable-gpu',
			'--disable-dev-shm-usage'
		];
		// Windows retains taskkill-based teardown; POSIX also survives SIGKILL of the test parent.
		child = process.platform === 'win32'
			? spawn(executable, args, { cwd: repositoryRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
			: fork(fileURLToPath(new URL('./workbenchClientProfileWatchdog.js', import.meta.url)), [executable, ...args], {
				cwd: repositoryRoot, env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, execArgv: [],
				stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: true
			});
		const appendDiagnostics = (data: Buffer) => { diagnostics = (diagnostics + data.toString()).slice(-diagnosticLimit); };
		child.stdout!.on('data', appendDiagnostics);
		child.stderr!.on('data', appendDiagnostics);
		const exitCode = await new Promise<number | null>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error(`Workbench client profile capture timed out after ${captureTimeout}ms.`)), captureTimeout);
			child!.once('error', error => { clearTimeout(timeout); reject(error); });
			child!.once('message', (result: WorkbenchClientProfileResult) => {
				clearTimeout(timeout);
				if (result.type === 'error') {
					reject(new Error(result.message));
				} else {
					resolve(result.code);
				}
			});
			child!.once('close', code => {
				clearTimeout(timeout);
				if (process.platform === 'win32') {
					resolve(code);
				} else {
					reject(new Error(`Workbench client profile watchdog exited unexpectedly with code ${code}.`));
				}
			});
		});
		if (!existsSync(output)) {
			throw new Error(`Workbench exited with code ${exitCode} without writing a client profile.`);
		}
		const result: { tools?: ToolDefinition[]; error?: string } = JSON.parse(await readFile(output, 'utf8'));
		if (exitCode !== 0 || result.error) {
			throw new Error(result.error ?? `Workbench exited with code ${exitCode}.`);
		}
		if (!Array.isArray(result.tools) || !result.tools.length || result.tools.some(tool => typeof tool.name !== 'string' || !tool.name)) {
			throw new Error('The workbench did not return a non-empty ToolDefinition array.');
		}
		// Stabilize the controlled client input, not the captured outbound model request.
		return result.tools.sort((a, b) => compare(a.name, b.name));
	} catch (error) {
		throw new Error(`Cannot capture real workbench client tools: ${error instanceof Error ? error.message : String(error)}\n${diagnostics}`);
	} finally {
		try {
			if (child?.pid) {
				await stopWorkbench(child);
			}
		} finally {
			await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
	}
}

async function findCopilotExtension(extensionsDirectory: string): Promise<string> {
	for (const entry of await readdir(extensionsDirectory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			const manifestPath = join(extensionsDirectory, entry.name, 'package.json');
			if (existsSync(manifestPath)) {
				const manifest: { publisher?: string; name?: string } = JSON.parse(await readFile(manifestPath, 'utf8'));
				if (`${manifest.publisher}.${manifest.name}`.toLowerCase() === 'github.copilot-chat') {
					return join(extensionsDirectory, entry.name);
				}
			}
		}
	}
	throw new Error(`The selected workbench has no built-in GitHub.copilot-chat extension in ${extensionsDirectory}.`);
}

async function stopWorkbench(child: ChildProcess): Promise<void> {
	if (process.platform === 'win32') {
		if (child.exitCode === null && child.signalCode === null) {
			await promisify(execFile)(join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(child.pid)], { timeout: 10_000 });
		}
	} else {
		try {
			// Kill the dedicated process group, including helpers that outlived the main process.
			process.kill(-child.pid!, 'SIGKILL');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
				throw error;
			}
		}
	}
	if (child.exitCode === null && child.signalCode === null) {
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Workbench did not exit after capture cleanup.')), 10_000);
			child.once('close', () => { clearTimeout(timeout); resolve(); });
		});
	}
}
