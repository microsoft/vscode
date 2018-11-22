/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { fork, ChildProcess } from 'child_process';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { posix } from 'path';
import { Limiter } from 'vs/base/common/async';
import { fromNodeEventEmitter, anyEvent, mapEvent, debounceEvent } from 'vs/base/common/event';
import * as objects from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class ExtensionsLifecycle extends Disposable {

	private processesLimiter: Limiter<void> = new Limiter(5); // Run max 5 processes in parallel

	constructor(
		private environmentService: IEnvironmentService,
		private logService: ILogService
	) {
		super();
	}

	postUninstall(extension: ILocalExtension): Promise<void> {
		return this.parseAndRun(extension, 'uninstall');
	}

	postInstall(extension: ILocalExtension): Promise<void> {
		return this.parseAndRun(extension, 'install');
	}

	private async parseAndRun(extension: ILocalExtension, type: string): Promise<void> {
		const script = this.parseScript(extension, type);
		if (script) {
			this.logService.info(extension.identifier.id, `Running ${type} hook`);
			await this.processesLimiter.queue(() =>
				this.runLifecycleHook(script.script, script.args, extension)
					.then(() => this.logService.info(extension.identifier.id, `Finished running ${type} hook`), err => this.logService.error(extension.identifier.id, `Failed to run ${type} hook: ${err}`)));
		}
	}

	private parseScript(extension: ILocalExtension, type: string): { script: string, args: string[] } | null {
		const scriptKey = `vscode:${type}`;
		if (extension.location.scheme === Schemas.file && extension.manifest && extension.manifest['scripts'] && typeof extension.manifest['scripts'][scriptKey] === 'string') {
			const script = (<string>extension.manifest['scripts'][scriptKey]).split(' ');
			if (script.length < 2 || script[0] !== 'node' || !script[1]) {
				this.logService.warn(extension.identifier.id, `${scriptKey} should be a node script`);
				return null;
			}
			return { script: posix.join(extension.location.fsPath, script[1]), args: script.slice(2) || [] };
		}
		return null;
	}

	private runLifecycleHook(lifecycleHook: string, args: string[], extension: ILocalExtension): Thenable<void> {
		const extensionStoragePath = posix.join(this.environmentService.globalStorageHome, extension.identifier.id.toLocaleLowerCase());
		return new Promise<void>((c, e) => {

			const extensionLifecycleProcess = this.start(lifecycleHook, args, extension, extensionStoragePath);
			let timeoutHandler;

			const onexit = (error?: string) => {
				clearTimeout(timeoutHandler);
				timeoutHandler = null;
				if (error) {
					e(error);
				} else {
					c(void 0);
				}
			};

			// on error
			extensionLifecycleProcess.on('error', (err) => {
				if (timeoutHandler) {
					onexit(toErrorMessage(err) || 'Unknown');
				}
			});

			// on exit
			extensionLifecycleProcess.on('exit', (code: number, signal: string) => {
				if (timeoutHandler) {
					onexit(code ? `Process exited with code ${code}` : void 0);
				}
			});

			// timeout: kill process after waiting for 5s
			timeoutHandler = setTimeout(() => {
				timeoutHandler = null;
				extensionLifecycleProcess.kill();
				e('timed out');
			}, 5000);
		});
	}

	private start(uninstallHook: string, args: string[], extension: ILocalExtension, extensionStoragePath: string): ChildProcess {
		const opts = {
			silent: true,
			execArgv: undefined,
			env: objects.mixin(objects.deepClone(process.env), {
				VSCODE_EXTENSION_STORAGE_LOCATION: extensionStoragePath
			})
		};
		const extensionUninstallProcess = fork(uninstallHook, ['--type=extensionUninstall', ...args], opts);

		// Catch all output coming from the process
		type Output = { data: string, format: string[] };
		extensionUninstallProcess.stdout.setEncoding('utf8');
		extensionUninstallProcess.stderr.setEncoding('utf8');
		const onStdout = fromNodeEventEmitter<string>(extensionUninstallProcess.stdout, 'data');
		const onStderr = fromNodeEventEmitter<string>(extensionUninstallProcess.stderr, 'data');
		const onOutput = anyEvent(
			mapEvent(onStdout, o => ({ data: `%c${o}`, format: [''] })),
			mapEvent(onStderr, o => ({ data: `%c${o}`, format: ['color: red'] }))
		);

		// Debounce all output, so we can render it in the Chrome console as a group
		const onDebouncedOutput = debounceEvent<Output>(onOutput, (r, o) => {
			return r
				? { data: r.data + o.data, format: [...r.format, ...o.format] }
				: { data: o.data, format: o.format };
		}, 100);

		// Print out extension host output
		onDebouncedOutput(data => {
			console.group(extension.identifier.id);
			console.log(data.data, ...data.format);
			console.groupEnd();
		});

		return extensionUninstallProcess;
	}
}
