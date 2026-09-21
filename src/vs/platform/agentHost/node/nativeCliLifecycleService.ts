/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs, appendFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { FileAccess } from '../../../base/common/network.js';
import { join, isAbsolute } from '../../../base/common/path.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { INativeCliLifecycleConfiguration, INativeCliLifecycleLaunch, INativeCliLifecycleService, NATIVE_CLI_LIFECYCLE_PREFIX, NativeCliLifecycleKind } from '../common/nativeCliLifecycle.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { NativeCodexLifecycleBridge } from './nativeCodexLifecycle.js';

export class NativeCliLifecycleService extends Disposable implements INativeCliLifecycleService {
	declare readonly _serviceBrand: undefined;
	private readonly _bridges = this._register(new DisposableMap<string, NativeCodexLifecycleBridge>());
	/** The host owns the directories it creates; the renderer may never get a chance to. */
	private readonly _directories = new Map<string, string>();

	constructor(@ILogService private readonly _logService: ILogService) {
		super();
		void this._sweepStaleDirectories();
	}

	/** Removes directories orphaned by a crash or a quit with a live CLI. */
	private async _sweepStaleDirectories(): Promise<void> {
		try {
			const entries = await fs.readdir(tmpdir(), { withFileTypes: true });
			await Promise.all(entries
				.filter(entry => entry.isDirectory() && entry.name.startsWith(NATIVE_CLI_LIFECYCLE_PREFIX))
				.map(entry => fs.rm(join(tmpdir(), entry.name), { recursive: true, force: true })));
		} catch (error) {
			this._logService.trace('[NativeCliLifecycleService] Could not sweep stale lifecycle directories', error);
		}
	}

	async releaseNativeCliLifecycle(id: string): Promise<void> {
		this._bridges.deleteAndDispose(id);
		const directory = this._directories.get(id);
		if (directory) {
			this._directories.delete(id);
			await fs.rm(directory, { recursive: true, force: true }).catch(error =>
				this._logService.warn('[NativeCliLifecycleService] Could not remove a lifecycle directory', error));
		}
	}

	async createNativeCliLifecycle(kind: NativeCliLifecycleKind, execPath: string, launch?: INativeCliLifecycleLaunch): Promise<INativeCliLifecycleConfiguration> {
		if (!['copilot', 'claude', 'codex'].includes(kind) || !isAbsolute(execPath)) {
			throw new Error('Invalid native CLI lifecycle configuration');
		}
		const id = generateUuid();
		const directory = await fs.mkdtemp(join(tmpdir(), `${NATIVE_CLI_LIFECYCLE_PREFIX}${id}-`));
		this._directories.set(id, directory);
		try {
			const eventsFile = join(directory, 'events.jsonl');
			await fs.writeFile(eventsFile, '', { mode: 0o600 });
			if (kind === 'codex') {
				if (!launch || !isAbsolute(launch.executable) || !isAbsolute(launch.cwd)) {
					throw new Error('Codex lifecycle tracking requires a native executable and working directory');
				}
				const bridge = new NativeCodexLifecycleBridge(
					event => appendFileSync(eventsFile, `${JSON.stringify(event)}\n`, { mode: 0o600 }),
					() => this._bridges.deleteAndDispose(id),
					this._logService,
				);
				this._bridges.set(id, bridge);
				const { args, env } = await bridge.start(launch);
				return { id, directory, eventsFile, args, env, replaceArgs: true };
			}
			const hook = FileAccess.asFileUri('vs/platform/agentHost/node/nativeCliHook.js').fsPath;
			if (kind === 'claude') {
				const windows = process.platform === 'win32';
				const shell = windows ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '/bin/sh';
				const script = join(directory, 'observe.ps1');
				if (windows) {
					await fs.writeFile(script, `param([string]$NodePath,[string]$HookPath,[string]$EventsPath,[string]$EventName)\n$env:ELECTRON_RUN_AS_NODE='1'\n$env:NODE_OPTIONS=''\n& $NodePath $HookPath $EventsPath $EventName claude\nexit $LASTEXITCODE\n`, { mode: 0o600 });
				}
				const events = { SessionStart: 'start', UserPromptSubmit: 'prompt', Stop: 'stop', StopFailure: 'error', SessionEnd: 'end', PermissionRequest: 'input', Notification: 'input', CwdChanged: 'cwd' };
				const hooks = Object.fromEntries(Object.entries(events).map(([name, event]) => [name, [{
					hooks: [{
						type: 'command', command: shell,
						args: windows
							// `-ExecutionPolicy Bypass` is required: running a `.ps1` from disk is
							// blocked under the default `Restricted` policy and under `AllSigned`.
							? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, execPath, hook, eventsFile, event]
							: ['-c', 'ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS= exec "$@"', 'vscode-cli-observer', execPath, hook, eventsFile, event, 'claude'],
						timeout: 5,
					}],
				}]]));
				await fs.mkdir(join(directory, '.claude-plugin'));
				await fs.mkdir(join(directory, 'hooks'));
				await fs.writeFile(join(directory, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'vscode-session-lifecycle', version: '1.0.0' }), { mode: 0o600 });
				await fs.writeFile(join(directory, 'hooks', 'hooks.json'), JSON.stringify({ hooks }), { mode: 0o600 });
				return { id, directory, eventsFile, args: ['--plugin-dir', directory] };
			}
			const events = { sessionStart: 'start', userPromptSubmitted: 'prompt', agentStop: 'stop', sessionEnd: 'end', notification: 'input' };
			const hooks = Object.fromEntries(Object.entries(events).map(([name, event]) => [name, [{
				type: 'command', exec: execPath, args: [hook, eventsFile, event, 'copilot'],
				env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }, timeoutSec: 5,
			}]]));
			await fs.writeFile(join(directory, 'plugin.json'), JSON.stringify({ name: 'vscode-session-lifecycle', version: '1.0.0', hooks: './hooks.json' }), { mode: 0o600 });
			await fs.writeFile(join(directory, 'hooks.json'), JSON.stringify({ version: 1, hooks }), { mode: 0o600 });
			const logsDirectory = join(directory, 'logs');
			await fs.mkdir(logsDirectory, { mode: 0o700 });
			return { id, directory, eventsFile, logsDirectory, args: ['--plugin-dir', directory, '--log-dir', logsDirectory, '--log-level', 'info'] };
		} catch (error) {
			this._bridges.deleteAndDispose(id);
			this._directories.delete(id);
			await fs.rm(directory, { recursive: true, force: true });
			throw error;
		}
	}

	override dispose(): void {
		this.releaseNativeCliResources();
		super.dispose();
	}

	releaseNativeCliResources(): void {
		for (const directory of this._directories.values()) {
			// Synchronous: an async removal cannot complete during process teardown.
			try {
				rmSync(directory, { recursive: true, force: true });
			} catch (error) {
				this._logService.trace('[NativeCliLifecycleService] Could not remove a lifecycle directory on shutdown', error);
			}
		}
		this._directories.clear();
	}
}
