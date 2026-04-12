/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import { basename } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { isWindows, OS } from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { getSystemShell } from '../../../base/node/shell.js';
import { isLaunchedFromCli } from '../../environment/node/argvHelper.js';
import { Promises } from '../../../base/common/async.js';
import { clamp } from '../../../base/common/numbers.js';
let unixShellEnvPromise = undefined;
/**
 * Resolves the shell environment by spawning a shell. This call will cache
 * the shell spawning so that subsequent invocations use that cached result.
 *
 * Will throw an error if:
 * - we hit a timeout of `MAX_SHELL_RESOLVE_TIME`
 * - any other error from spawning a shell to figure out the environment
 */
export async function getResolvedShellEnv(configurationService, logService, args, env) {
    // Skip if --force-disable-user-env
    if (args['force-disable-user-env']) {
        logService.trace('resolveShellEnv(): skipped (--force-disable-user-env)');
        return {};
    }
    // Skip on windows
    else if (isWindows) {
        logService.trace('resolveShellEnv(): skipped (Windows)');
        return {};
    }
    // Skip if running from CLI already
    else if (isLaunchedFromCli(env) && !args['force-user-env']) {
        logService.trace('resolveShellEnv(): skipped (VSCODE_CLI is set)');
        return {};
    }
    // Otherwise resolve (macOS, Linux)
    else {
        if (isLaunchedFromCli(env)) {
            logService.trace('resolveShellEnv(): running (--force-user-env)');
        }
        else {
            logService.trace('resolveShellEnv(): running (macOS/Linux)');
        }
        // Call this only once and cache the promise for
        // subsequent calls since this operation can be
        // expensive (spawns a process).
        if (!unixShellEnvPromise) {
            unixShellEnvPromise = Promises.withAsyncBody(async (resolve, reject) => {
                const cts = new CancellationTokenSource();
                let timeoutValue = 10000; // default to 10 seconds
                const configuredTimeoutValue = configurationService.getValue('application.shellEnvironmentResolutionTimeout');
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
                    resolve(await doResolveUnixShellEnv(logService, cts.token));
                }
                catch (error) {
                    if (!isCancellationError(error) && !cts.token.isCancellationRequested) {
                        reject(new Error(localize('resolveShellEnvError', "Unable to resolve your shell environment: {0}", toErrorMessage(error))));
                    }
                    else {
                        resolve({});
                    }
                }
                finally {
                    clearTimeout(timeout);
                    cts.dispose();
                }
            });
        }
        return unixShellEnvPromise;
    }
}
async function doResolveUnixShellEnv(logService, token) {
    const runAsNode = process.env['ELECTRON_RUN_AS_NODE'];
    logService.trace('getUnixShellEnvironment#runAsNode', runAsNode);
    const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE'];
    logService.trace('getUnixShellEnvironment#noAttach', noAttach);
    const mark = generateUuid().replace(/-/g, '').substr(0, 12);
    const regex = new RegExp(mark + '({.*})' + mark);
    const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        VSCODE_RESOLVING_ENVIRONMENT: '1'
    };
    logService.trace('getUnixShellEnvironment#env', env);
    const systemShellUnix = await getSystemShell(OS, env);
    logService.trace('getUnixShellEnvironment#shell', systemShellUnix);
    return new Promise((resolve, reject) => {
        if (token.isCancellationRequested) {
            return reject(new CancellationError());
        }
        // handle popular non-POSIX shells
        const name = basename(systemShellUnix);
        let command, shellArgs;
        const extraArgs = '';
        if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
            // Older versions of PowerShell removes double quotes sometimes so we use "double single quotes" which is how
            // you escape single quotes inside of a single quoted string.
            command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
            shellArgs = ['-Login', '-Command'];
        }
        else if (name === 'nu') { // nushell requires ^ before quoted path to treat it as a command
            command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
            shellArgs = ['-i', '-l', '-c'];
        }
        else if (name === 'xonsh') { // #200374: native implementation is shorter
            command = `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`;
            shellArgs = ['-i', '-l', '-c'];
        }
        else {
            command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
            if (name === 'tcsh' || name === 'csh') {
                shellArgs = ['-ic'];
            }
            else {
                shellArgs = ['-i', '-l', '-c'];
            }
        }
        logService.trace('getUnixShellEnvironment#spawn', JSON.stringify(shellArgs), command);
        const child = spawn(systemShellUnix, [...shellArgs, command], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env
        });
        token.onCancellationRequested(() => {
            child.kill();
            return reject(new CancellationError());
        });
        child.on('error', err => {
            logService.error('getUnixShellEnvironment#errorChildProcess', toErrorMessage(err));
            reject(err);
        });
        const buffers = [];
        child.stdout.on('data', b => buffers.push(b));
        const stderr = [];
        child.stderr.on('data', b => stderr.push(b));
        child.on('close', (code, signal) => {
            const raw = Buffer.concat(buffers).toString('utf8');
            logService.trace('getUnixShellEnvironment#raw', raw);
            const stderrStr = Buffer.concat(stderr).toString('utf8');
            if (stderrStr.trim()) {
                logService.trace('getUnixShellEnvironment#stderr', stderrStr);
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
                }
                else {
                    delete env['ELECTRON_RUN_AS_NODE'];
                }
                if (noAttach) {
                    env['ELECTRON_NO_ATTACH_CONSOLE'] = noAttach;
                }
                else {
                    delete env['ELECTRON_NO_ATTACH_CONSOLE'];
                }
                delete env['VSCODE_RESOLVING_ENVIRONMENT'];
                // https://github.com/microsoft/vscode/issues/22593#issuecomment-336050758
                delete env['XDG_RUNTIME_DIR'];
                logService.trace('getUnixShellEnvironment#result', env);
                resolve(env);
            }
            catch (err) {
                logService.error('getUnixShellEnvironment#errorCaught', toErrorMessage(err));
                reject(err);
            }
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGxFbnYuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zaGVsbC9ub2RlL3NoZWxsRW52LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDdEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hGLE9BQU8sRUFBdUIsU0FBUyxFQUFFLEVBQUUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFN0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXpELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV4RCxJQUFJLG1CQUFtQixHQUE0QyxTQUFTLENBQUM7QUFFN0U7Ozs7Ozs7R0FPRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsbUJBQW1CLENBQUMsb0JBQTJDLEVBQUUsVUFBdUIsRUFBRSxJQUFzQixFQUFFLEdBQXdCO0lBRS9KLG1DQUFtQztJQUNuQyxJQUFJLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENB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