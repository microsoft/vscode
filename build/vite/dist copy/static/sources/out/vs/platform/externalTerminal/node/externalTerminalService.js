/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import * as cp from 'child_process';
import { memoize } from '../../../base/common/decorators.js';
import { FileAccess } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import * as env from '../../../base/common/platform.js';
import { sanitizeProcessEnvironment } from '../../../base/common/processes.js';
import * as pfs from '../../../base/node/pfs.js';
import * as processes from '../../../base/node/processes.js';
import * as nls from '../../../nls.js';
import { DEFAULT_TERMINAL_OSX } from '../common/externalTerminal.js';
const TERMINAL_TITLE = nls.localize('console.title', "VS Code Console");
class ExternalTerminalService {
    async getDefaultTerminalForPlatforms() {
        return {
            windows: WindowsExternalTerminalService.getDefaultTerminalWindows(),
            linux: await LinuxExternalTerminalService.getDefaultTerminalLinuxReady(),
            osx: DEFAULT_TERMINAL_OSX
        };
    }
}
export class WindowsExternalTerminalService extends ExternalTerminalService {
    static { this.CMD = 'cmd.exe'; }
    openTerminal(configuration, cwd) {
        return this.spawnTerminal(cp, configuration, processes.getWindowsShell(), cwd);
    }
    spawnTerminal(spawner, configuration, command, cwd) {
        const exec = configuration.windowsExec || WindowsExternalTerminalService.getDefaultTerminalWindows();
        // Make the drive letter uppercase on Windows (see #9448)
        if (cwd && cwd[1] === ':') {
            cwd = cwd[0].toUpperCase() + cwd.substr(1);
        }
        // cmder ignores the environment cwd and instead opts to always open in %USERPROFILE%
        // unless otherwise specified
        const basename = path.basename(exec, '.exe').toLowerCase();
        if (basename === 'cmder') {
            spawner.spawn(exec, cwd ? [cwd] : undefined);
            return Promise.resolve(undefined);
        }
        const cmdArgs = ['/c', 'start', '/wait'];
        if (exec.indexOf(' ') >= 0) {
            // The "" argument is the window title. Without this, exec doesn't work when the path
            // contains spaces. #6590
            // Title is Execution Path. #220129
            cmdArgs.push(exec);
        }
        cmdArgs.push(exec);
        // Add starting directory parameter for Windows Terminal (see #90734)
        if (basename === 'wt') {
            cmdArgs.push('-d .');
        }
        return new Promise((c, e) => {
            const env = getSanitizedEnvironment(process);
            const child = spawner.spawn(command, cmdArgs, { cwd, env, detached: true });
            child.on('error', e);
            child.on('exit', () => c());
        });
    }
    async runInTerminal(title, dir, args, envVars, settings) {
        const exec = settings.windowsExec || WindowsExternalTerminalService.getDefaultTerminalWindows();
        const wt = await WindowsExternalTerminalService.getWtExePath();
        return new Promise((resolve, reject) => {
            const title = `"${dir} - ${TERMINAL_TITLE}"`;
            const command = `"${args.join('" "')}" & pause`; // use '|' to only pause on non-zero exit code
            // merge environment variables into a copy of the process.env
            const env = Object.assign({}, getSanitizedEnvironment(process), envVars);
            // delete environment variables that have a null value
            Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);
            const options = {
                cwd: dir,
                env: env,
                windowsVerbatimArguments: true
            };
            let spawnExec;
            let cmdArgs;
            if (path.basename(exec, '.exe') === 'wt') {
                // Handle Windows Terminal specially; -d to set the cwd and run a cmd.exe instance
                // inside it
                spawnExec = exec;
                cmdArgs = ['-d', '.', WindowsExternalTerminalService.CMD, '/c', command];
            }
            else if (wt) {
                // prefer to use the window terminal to spawn if it's available instead
                // of start, since that allows ctrl+c handling (#81322)
                spawnExec = wt;
                cmdArgs = ['-d', '.', exec, '/c', command];
            }
            else {
                spawnExec = WindowsExternalTerminalService.CMD;
                cmdArgs = ['/c', 'start', title, '/wait', exec, '/c', `"${command}"`];
            }
            const cmd = cp.spawn(spawnExec, cmdArgs, options);
            cmd.on('error', err => {
                reject(improveError(err));
            });
            resolve(undefined);
        });
    }
    static getDefaultTerminalWindows() {
        if (!WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS) {
            const isWoW64 = !!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
            WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS = `${process.env.windir ? process.env.windir : 'C:\\Windows'}\\${isWoW64 ? 'Sysnative' : 'System32'}\\cmd.exe`;
        }
        return WindowsExternalTerminalService._DEFAULT_TERMINAL_WINDOWS;
    }
    static async getWtExePath() {
        try {
            return await processes.findExecutable('wt');
        }
        catch {
            return undefined;
        }
    }
}
__decorate([
    memoize
], WindowsExternalTerminalService, "getWtExePath", null);
export class MacExternalTerminalService extends ExternalTerminalService {
    static { this.OSASCRIPT = '/usr/bin/osascript'; } // osascript is the AppleScript interpreter on OS X
    openTerminal(configuration, cwd) {
        return this.spawnTerminal(cp, configuration, cwd);
    }
    runInTerminal(title, dir, args, envVars, settings) {
        const terminalApp = settings.osxExec || DEFAULT_TERMINAL_OSX;
        return new Promise((resolve, reject) => {
            if (terminalApp === DEFAULT_TERMINAL_OSX || terminalApp === 'iTerm.app') {
                // On OS X we launch an AppleScript that creates (or reuses) a Terminal window
                // and then launches the program inside that window.
                const script = terminalApp === DEFAULT_TERMINAL_OSX ? 'TerminalHelper' : 'iTermHelper';
                const scriptpath = FileAccess.asFileUri(`vs/workbench/contrib/externalTerminal/node/${script}.scpt`).fsPath;
                const osaArgs = [
                    scriptpath,
                    '-t', title || TERMINAL_TITLE,
                    '-w', dir,
                ];
                for (const a of args) {
                    osaArgs.push('-a');
                    osaArgs.push(a);
                }
                if (envVars) {
                    // merge environment variables into a copy of the process.env
                    const env = Object.assign({}, getSanitizedEnvironment(process), envVars);
                    for (const key in env) {
                        const value = env[key];
                        if (value === null) {
                            osaArgs.push('-u');
                            osaArgs.push(key);
                        }
                        else {
                            osaArgs.push('-e');
                            osaArgs.push(`${key}=${value}`);
                        }
                    }
                }
                const osa = cp.spawn(MacExternalTerminalService.OSASCRIPT, osaArgs);
                setupSpawnErrorHandling(osa, resolve, reject, terminalApp);
            }
            else if (terminalApp === 'Ghostty.app') {
                // Ghostty uses CLI flags directly instead of AppleScript like Mac Terminal and iTerm
                // Note: -na is required (not just -a) because we need to spawn a new instance that
                // receives our --args. With just -a, if Ghostty is already running, open will
                // activate the existing instance and ignore --args entirely.
                const env = Object.assign({}, getSanitizedEnvironment(process), envVars);
                const openArgs = ['-na', 'Ghostty.app', '--args'];
                openArgs.push('--working-directory=' + dir);
                openArgs.push('--wait-after-command=true');
                openArgs.push('-e', ...args);
                const cmd = cp.spawn('/usr/bin/open', openArgs, { env });
                setupSpawnErrorHandling(cmd, resolve, reject, terminalApp);
            }
            else {
                reject(new Error(nls.localize('mac.terminal.type.not.supported', "'{0}' not supported", terminalApp)));
            }
        });
    }
    spawnTerminal(spawner, configuration, cwd) {
        const terminalApp = configuration.osxExec || DEFAULT_TERMINAL_OSX;
        return new Promise((c, e) => {
            const args = ['-a', terminalApp];
            if (cwd) {
                args.push(cwd);
            }
            const env = getSanitizedEnvironment(process);
            const child = spawner.spawn('/usr/bin/open', args, { cwd, env });
            child.on('error', e);
            child.on('exit', () => c());
        });
    }
}
export class LinuxExternalTerminalService extends ExternalTerminalService {
    static { this.WAIT_MESSAGE = nls.localize('press.any.key', "Press any key to continue..."); }
    openTerminal(configuration, cwd) {
        return this.spawnTerminal(cp, configuration, cwd);
    }
    runInTerminal(title, dir, args, envVars, settings) {
        const execPromise = settings.linuxExec ? Promise.resolve(settings.linuxExec) : LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
        return new Promise((resolve, reject) => {
            execPromise.then(exec => {
                const basename = path.basename(exec).toLowerCase();
                if (basename === 'ghostty') {
                    const ghosttyArgs = [];
                    if (dir) {
                        ghosttyArgs.push(`--working-directory=${dir}`);
                    }
                    ghosttyArgs.push('--wait-after-command=true');
                    if (args.length) {
                        ghosttyArgs.push('-e', ...args);
                    }
                    LinuxExternalTerminalService.spawnTerminalWithEnv(exec, ghosttyArgs, dir, envVars, resolve, reject);
                    return;
                }
                const termArgs = [];
                //termArgs.push('--title');
                //termArgs.push(`"${TERMINAL_TITLE}"`);
                if (exec.indexOf('gnome-terminal') >= 0) {
                    termArgs.push('-x');
                }
                else {
                    termArgs.push('-e');
                }
                termArgs.push('bash');
                termArgs.push('-c');
                const bashCommand = `${quote(args)}; echo; read -p "${LinuxExternalTerminalService.WAIT_MESSAGE}" -n1;`;
                termArgs.push(`''${bashCommand}''`); // wrapping argument in two sets of ' because node is so "friendly" that it removes one set...
                LinuxExternalTerminalService.spawnTerminalWithEnv(exec, termArgs, dir, envVars, resolve, reject);
            });
        });
    }
    static spawnTerminalWithEnv(exec, args, dir, envVars, resolve, reject) {
        const env = Object.assign({}, getSanitizedEnvironment(process), envVars);
        // delete environment variables that have a null value
        Object.keys(env).filter(v => env[v] === null).forEach(key => delete env[key]);
        const cmd = cp.spawn(exec, args, { cwd: dir, env });
        setupSpawnErrorHandling(cmd, resolve, reject, exec);
    }
    static async getDefaultTerminalLinuxReady() {
        if (!LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY) {
            if (!env.isLinux) {
                LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = Promise.resolve('xterm');
            }
            else {
                const isDebian = await pfs.Promises.exists('/etc/debian_version');
                LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY = new Promise(r => {
                    if (isDebian) {
                        r('x-terminal-emulator');
                    }
                    else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
                        r('gnome-terminal');
                    }
                    else if (process.env.DESKTOP_SESSION === 'kde-plasma') {
                        r('konsole');
                    }
                    else if (process.env.COLORTERM) {
                        r(process.env.COLORTERM);
                    }
                    else if (process.env.TERM) {
                        r(process.env.TERM);
                    }
                    else {
                        r('xterm');
                    }
                });
            }
        }
        return LinuxExternalTerminalService._DEFAULT_TERMINAL_LINUX_READY;
    }
    spawnTerminal(spawner, configuration, cwd) {
        const execPromise = configuration.linuxExec ? Promise.resolve(configuration.linuxExec) : LinuxExternalTerminalService.getDefaultTerminalLinuxReady();
        return new Promise((c, e) => {
            execPromise.then(exec => {
                const env = getSanitizedEnvironment(process);
                const basename = path.basename(exec).toLowerCase();
                const args = basename === 'ghostty' && cwd ? [`--working-directory=${cwd}`] : [];
                const child = spawner.spawn(exec, args, { cwd, env });
                child.on('error', e);
                child.on('exit', () => c());
            });
        });
    }
}
function getSanitizedEnvironment(process) {
    const env = { ...process.env };
    sanitizeProcessEnvironment(env);
    return env;
}
/**
 * tries to turn OS errors into more meaningful error messages
 */
function improveError(err) {
    if (err.errno === 'ENOENT' && err.path) {
        return new Error(nls.localize('ext.term.app.not.found', "can't find terminal application '{0}'", err.path));
    }
    return err;
}
/**
 * Attaches error handling to a spawned child process for terminal launching.
 */
function setupSpawnErrorHandling(cmd, resolve, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
reject, terminalApp) {
    let stderr = '';
    cmd.on('error', err => {
        reject(improveError(err));
    });
    cmd.stderr?.on('data', (data) => {
        stderr += data.toString();
    });
    cmd.on('exit', (code) => {
        if (code === 0) {
            resolve(undefined);
        }
        else {
            if (stderr) {
                const lines = stderr.split('\n', 1);
                reject(new Error(lines[0]));
            }
            else {
                reject(new Error(nls.localize('terminal.launch.failed', "Launching '{0}' failed with exit code {1}", terminalApp, code)));
            }
        }
    });
}
/**
 * Quote args if necessary and combine into a space separated string.
 */
function quote(args) {
    let r = '';
    for (const a of args) {
        if (a.indexOf(' ') >= 0) {
            r += '"' + a + '"';
        }
        else {
            r += a;
        }
        r += ' ';
    }
    return r;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlcm5hbFRlcm1pbmFsL25vZGUvZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sS0FBSyxHQUFHLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0UsT0FBTyxLQUFLLEdBQUcsTUFBTSwyQkFBMkIsQ0FBQztBQUNqRCxPQUFPLEtBQUssU0FBUyxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sS0FBSyxHQUFHLE1BQU0saUJBQWlCLENBQUM7QUFDdkMsT0FBTyxFQUFFLG9CQUFvQixFQUE2RSxNQUFNLCtCQUErQixDQUFDO0FBR2hKLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGlCQUFpQixDQUFDLENBQUM7QUFFeEUsTUFBZSx1QkFBdUI7SUFHckMsS0FBSyxDQUFDLDhCQUE4QjtRQUNuQyxPQUFPO1lBQ04sT0FBTyxFQUFFLDhCQUE4QixDQUFDLHlCQUF5QixFQUFFO1lBQ25FLEtBQUssRUFBRSxNQUFNLDRCQUE0QixDQUFDLDRCQUE0QixFQUFFO1lBQ3hFLEdBQUcsRUFBRSxvQkFBb0I7U0FDekIsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw4QkFBK0Is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