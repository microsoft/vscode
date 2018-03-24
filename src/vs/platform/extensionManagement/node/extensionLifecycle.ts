/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TPromise } from 'vs/base/common/winjs.base';
import { ILogService } from 'vs/platform/log/common/log';
import { fork, ChildProcess } from 'child_process';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { join } from 'vs/base/common/paths';
import { Limiter } from 'vs/base/common/async';
import { fromNodeEventEmitter, anyEvent, mapEvent, debounceEvent } from 'vs/base/common/event';

export class ExtensionsLifecycle extends Disposable {

	private processesLimiter: Limiter<void> = new Limiter(5); // Run max 5 processes in parallel

	constructor(
		@ILogService private logService: ILogService
	) {
		super();
	}

	uninstall(extension: ILocalExtension): TPromise<void> {
		const uninstallScript = this.parseUninstallScript(extension);
		if (uninstallScript) {
			this.logService.info(extension.identifier.id, 'Running Uninstall hook');
			return this.processesLimiter.queue(() =>
				this.runUninstallHook(uninstallScript.uninstallHook, uninstallScript.args, extension)
					.then(() => this.logService.info(extension.identifier.id, 'Finished running uninstall hook'), err => this.logService.error(extension.identifier.id, `Failed to run uninstall hook: ${err}`)));
		}
		return TPromise.as(null);
	}

	private parseUninstallScript(extension: ILocalExtension): { uninstallHook: string, args: string[] } {
		if (extension.manifest && extension.manifest['scripts'] && typeof extension.manifest['scripts']['vscode:uninstall'] === 'string') {
			const uninstallScript = (<string>extension.manifest['scripts']['vscode:uninstall']).split(' ');
			if (uninstallScript.length < 2 || uninstallScript[0] !== 'node' || !uninstallScript[1]) {
				this.logService.warn(extension.identifier.id, 'Uninstall script should be a node script');
				return null;
			}
			return { uninstallHook: join(extension.path, uninstallScript[1]), args: uninstallScript.slice(2) || [] };
		}
		return null;
	}

	private runUninstallHook(lifecycleHook: string, args: string[], extension: ILocalExtension): TPromise<void> {
		return new TPromise((c, e) => {

			const extensionLifecycleProcess = this.start(lifecycleHook, args, extension);
			let timeoutHandler;

			const onexit = (error?: string) => {
				clearTimeout(timeoutHandler);
				timeoutHandler = null;
				if (error) {
					e(error);
				} else {
					c(null);
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

	private start(uninstallHook: string, args: string[], extension: ILocalExtension): ChildProcess {
		const opts = {
			silent: true,
			execArgv: <string[]>undefined
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
