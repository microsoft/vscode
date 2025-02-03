/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { Limiter } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';
import { ILocalExtension } from '../common/extensionManagement.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';

export class ExtensionsLifecycle extends Disposable {

	private processesLimiter: Limiter<void> = new Limiter(5); // Run max 5 processes in parallel

	constructor(
		@IUserDataProfilesService private userDataProfilesService: IUserDataProfilesService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async postUninstall(extension: ILocalExtension): Promise<void> {
		const script = this.parseScript(extension, 'uninstall');
		if (script) {
			this.logService.info(extension.identifier.id, extension.manifest.version, `Running post uninstall script`);
			await this.processesLimiter.queue(async () => {
				try {
					await this.runLifecycleHook(script.script, 'uninstall', script.args, true, extension);
					this.logService.info(`Finished running post uninstall script`, extension.identifier.id, extension.manifest.version);
				} catch (error) {
					this.logService.error('Failed to run post uninstall script', extension.identifier.id, extension.manifest.version);
					this.logService.error(error);
				}
			});
		}
		try {
			await Promises.rm(this.getExtensionStoragePath(extension));
		} catch (error) {
			this.logService.error('Error while removing extension storage path', extension.identifier.id);
			this.logService.error(error);
		}
	}

	private parseScript(extension: ILocalExtension, type: string): { script: string; args: string[] } | null {
		const scriptKey = `vscode:${type}`;
		if (extension.location.scheme === Schemas.file && extension.manifest && extension.manifest['scripts'] && typeof extension.manifest['scripts'][scriptKey] === 'string') {
			const script = (<string>extension.manifest['scripts'][scriptKey]).split(' ');
			if (script.length < 2 || script[0] !== 'node' || !script[1]) {
				this.logService.warn(extension.identifier.id, extension.manifest.version, `${scriptKey} should be a node script`);
				return null;
			}
			return { script: join(extension.location.fsPath, script[1]), args: script.slice(2) || [] };
		}
		return null;
	}

	private runLifecycleHook(lifecycleHook: string, lifecycleType: string, args: string[], timeout: boolean, extension: ILocalExtension): Promise<void> {
		return new Promise<void>((c, e) => {

			const extensionLifecycleProcess = this.start(lifecycleHook, lifecycleType, args, extension);
			let timeoutHandler: any;

			const onexit = (error?: string) => {
				if (timeoutHandler) {
					clearTimeout(timeoutHandler);
					timeoutHandler = null;
				}
				if (error) {
					e(error);
				} else {
					c(undefined);
				}
			};

			// on error
			extensionLifecycleProcess.on('error', (err) => {
				onexit(toErrorMessage(err) || 'Unknown');
			});

			// on exit
			extensionLifecycleProcess.on('exit', (code: number, signal: string) => {
				onexit(code ? `post-${lifecycleType} process exited with code ${code}` : undefined);
			});

			if (timeout) {
				// timeout: kill process after waiting for 5s
				timeoutHandler = setTimeout(() => {
					timeoutHandler = null;
					extensionLifecycleProcess.kill();
					e('timed out');
				}, 5000);
			}
		});
	}

	private start(uninstallHook: string, lifecycleType: string, args: string[], extension: ILocalExtension): ChildProcess {
		const opts = {
			silent: true,
			execArgv: undefined
		};
		const extensionUninstallProcess = fork(uninstallHook, [`--type=extension-post-${lifecycleType}`, ...args], opts);

		// Catch all output coming from the process
		type Output = { data: string; format: string[] };
		extensionUninstallProcess.stdout!.setEncoding('utf8');
		extensionUninstallProcess.stderr!.setEncoding('utf8');

		const onStdout = Event.fromNodeEventEmitter<string>(extensionUninstallProcess.stdout!, 'data');
		const onStderr = Event.fromNodeEventEmitter<string>(extensionUninstallProcess.stderr!, 'data');

		// Log output
		this._register(onStdout(data => this.logService.info(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
		this._register(onStderr(data => this.logService.error(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));

		const onOutput = Event.any(
			Event.map(onStdout, o => ({ data: `%c${o}`, format: [''] }), this._store),
			Event.map(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }), this._store)
		);
		// Debounce all output, so we can render it in the Chrome console as a group
		const onDebouncedOutput = Event.debounce<Output>(onOutput, (r, o) => {
			return r
				? { data: r.data + o.data, format: [...r.format, ...o.format] }
				: { data: o.data, format: o.format };
		}, 100, undefined, undefined, undefined, this._store);

		// Print out output
		onDebouncedOutput(data => {
			console.group(extension.identifier.id);
			console.log(data.data, ...data.format);
			console.groupEnd();
		});

		return extensionUninstallProcess;
	}

	private getExtensionStoragePath(extension: ILocalExtension): string {
		return join(this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath, extension.identifier.id.toLowerCase());
	}
}
