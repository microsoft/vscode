/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { basename } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { IProcessEnvironment, isWindows, OS } from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { isLaunchedFromCli } from '../../environment/node/argvHelper.js';
import { ILogService } from '../../log/common/log.js';
import { Promises } from '../../../base/common/async.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { clamp } from '../../../base/common/numbers.js';
import { extname } from 'path';
import { getWindowPathExtensions } from '../../../base/node/processes.js';
import { equalsIgnoreCase } from '../../../base/common/strings.js';

let shellEnvPromise: Promise<typeof process.env> | undefined = undefined;

/**
 * Resolves the shell environment by spawning a shell. This call will cache
 * the shell spawning so that subsequent invocations use that cached result.
 *
 * Will throw an error if:
 * - we hit a timeout of `MAX_SHELL_RESOLVE_TIME`
 * - any other error from spawning a shell to figure out the environment
 */
export async function getResolvedShellEnv(configurationService: IConfigurationService, logService: ILogService, args: NativeParsedArgs, env: IProcessEnvironment): Promise<typeof process.env> {

	// Skip if --force-disable-user-env
	if (args['force-disable-user-env']) {
		logService.trace('resolveShellEnv(): skipped (--force-disable-user-env)');

		return {};
	}

	// Skip if running from CLI already
	else if (isLaunchedFromCli(env) && !args['force-user-env']) {
		logService.trace('resolveShellEnv(): skipped (VSCODE_CLI is set)');

		return {};
	}

	// Otherwise resolve
	else {
		if (isLaunchedFromCli(env)) {
			logService.trace('resolveShellEnv(): running (--force-user-env)');
		} else {
			logService.trace('resolveShellEnv(): running');
		}

		// Call this only once and cache the promise for
		// subsequent calls since this operation can be
		// expensive (spawns a process).
		if (!shellEnvPromise) {
			shellEnvPromise = Promises.withAsyncBody<NodeJS.ProcessEnv>(async (resolve, reject) => {
				const cts = new CancellationTokenSource();

				let timeoutValue = 10000; // default to 10 seconds
				const configuredTimeoutValue = configurationService.getValue<unknown>('application.shellEnvironmentResolutionTimeout');
				if (typeof configuredTimeoutValue === 'number') {
					timeoutValue = clamp(configuredTimeoutValue, 1, 120) * 1000 /* convert from seconds */;
				}

				// Give up resolving shell env after some time
				const timeout = setTimeout(() => {
					cts.dispose(true);
					reject(new Error(localize('resolveShellEnvTimeout', "Unable to resolve your shell environment in a reasonable time. Please review your shell configuration and restart.")));
				}, timeoutValue);

				// Resolve shell env and handle errors
				try {
					resolve(await doResolveShellEnv(logService, cts.token));
				} catch (error) {
					if (!isCancellationError(error) && !cts.token.isCancellationRequested) {
						reject(new Error(localize('resolveShellEnvError', "Unable to resolve your shell environment: {0}", toErrorMessage(error))));
					} else {
						resolve({});
					}
				} finally {
					clearTimeout(timeout);
					cts.dispose();
				}
			});
		}

		return shellEnvPromise;
	}
}

async function doResolveShellEnv(logService: ILogService, token: CancellationToken): Promise<typeof process.env> {
	const runAsNode = process.env['ELECTRON_RUN_AS_NODE'];
	logService.trace('doResolveShellEnv#runAsNode', runAsNode);

	const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE'];
	logService.trace('doResolveShellEnv#noAttach', noAttach);

	const mark = generateUuid().replace(/-/g, '').substr(0, 12);
	const regex = new RegExp(mark + '({.*})' + mark);

	const env = {
		...process.env,
		ELECTRON_RUN_AS_NODE: '1',
		ELECTRON_NO_ATTACH_CONSOLE: '1',
		VSCODE_RESOLVING_ENVIRONMENT: '1'
	};

	logService.trace('doResolveShellEnv#env', env);
	const systemShell = await getSystemShell(OS, env); // note: windows always resolves a powershell instance
	logService.trace('doResolveShellEnv#shell', systemShell);

	return new Promise<typeof process.env>((resolve, reject) => {
		if (token.isCancellationRequested) {
			return reject(new CancellationError());
		}

		// handle popular shells
		let name = basename(systemShell);
		// remove any .exe/.cmd/... from the name for matching logic on Windows
		if (isWindows) {
			const nameExt = extname(name);
			if (getWindowPathExtensions().some(e => equalsIgnoreCase(e, nameExt))) {
				name = name.substring(0, name.length - nameExt.length);
			}
		}

		let command: string, shellArgs: Array<string>;
		const extraArgs = '';
		if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
			// Older versions of PowerShell removes double quotes sometimes so we use "double single quotes" which is how
			// you escape single quotes inside of a single quoted string.
			command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
			shellArgs = ['-Login', '-Command'];
		} else if (name === 'nu') { // nushell requires ^ before quoted path to treat it as a command
			command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
			shellArgs = ['-i', '-l', '-c'];
		} else if (name === 'xonsh') { // #200374: native implementation is shorter
			command = `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`;
			shellArgs = ['-i', '-l', '-c'];
		} else {
			command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;

			if (name === 'tcsh' || name === 'csh') {
				shellArgs = ['-ic'];
			} else {
				shellArgs = ['-i', '-l', '-c'];
			}
		}

		logService.trace('doResolveShellEnv#spawn', JSON.stringify(shellArgs), command);

		const child = spawn(systemShell, [...shellArgs, command], {
			detached: !isWindows,
			stdio: ['ignore', 'pipe', 'pipe'],
			env
		});

		token.onCancellationRequested(() => {
			child.kill();

			return reject(new CancellationError());
		});

		child.on('error', err => {
			logService.error('doResolveShellEnv#errorChildProcess', toErrorMessage(err));
			reject(err);
		});

		const buffers: Buffer[] = [];
		child.stdout.on('data', b => buffers.push(b));

		const stderr: Buffer[] = [];
		child.stderr.on('data', b => stderr.push(b));

		child.on('close', (code, signal) => {
			const raw = Buffer.concat(buffers).toString('utf8');
			logService.trace('doResolveShellEnv#raw', raw);

			const stderrStr = Buffer.concat(stderr).toString('utf8');
			if (stderrStr.trim()) {
				logService.trace('doResolveShellEnv#stderr', stderrStr);
			}

			if (code || signal) {
				return reject(new Error(localize('resolveShellEnvExitError', "Unexpected exit code from spawned shell (code {0}, signal {1})", code, signal)));
			}

			const match = regex.exec(raw);
			const rawStripped = match ? match[1] : '{}';

			try {
				const env = JSON.parse(rawStripped);

				if (runAsNode) {
					env['ELECTRON_RUN_AS_NODE'] = runAsNode;
				} else {
					delete env['ELECTRON_RUN_AS_NODE'];
				}

				if (noAttach) {
					env['ELECTRON_NO_ATTACH_CONSOLE'] = noAttach;
				} else {
					delete env['ELECTRON_NO_ATTACH_CONSOLE'];
				}

				delete env['VSCODE_RESOLVING_ENVIRONMENT'];

				// https://github.com/microsoft/vscode/issues/22593#issuecomment-336050758
				delete env['XDG_RUNTIME_DIR'];

				logService.trace('doResolveShellEnv#result', env);
				resolve(env);
			} catch (err) {
				logService.error('doResolveShellEnv#errorCaught', toErrorMessage(err));
				reject(err);
			}
		});
	});
}
