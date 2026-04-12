/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import { getDriveLetter } from '../../../../base/common/extpath.js';
import * as platform from '../../../../base/common/platform.js';
function spawnAsPromised(command, args) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        const child = cp.spawn(command, args);
        if (child.pid) {
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }
        child.on('error', err => {
            reject(err);
        });
        child.on('close', code => {
            resolve(stdout);
        });
    });
}
export async function hasChildProcesses(processId) {
    if (processId) {
        // if shell has at least one child process, assume that shell is busy
        if (platform.isWindows) {
            const windowsProcessTree = await import('@vscode/windows-process-tree');
            return new Promise(resolve => {
                windowsProcessTree.getProcessTree(processId, processTree => {
                    resolve(!!processTree && processTree.children.length > 0);
                });
            });
        }
        else {
            return spawnAsPromised('/usr/bin/pgrep', ['-lP', String(processId)]).then(stdout => {
                const r = stdout.trim();
                if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux'; see #43683
                    return false;
                }
                else {
                    return true;
                }
            }, error => {
                return true;
            });
        }
    }
    // fall back to safe side
    return Promise.resolve(true);
}
var ShellType;
(function (ShellType) {
    ShellType[ShellType["cmd"] = 0] = "cmd";
    ShellType[ShellType["powershell"] = 1] = "powershell";
    ShellType[ShellType["bash"] = 2] = "bash";
})(ShellType || (ShellType = {}));
export function prepareCommand(shell, args, argsCanBeInterpretedByShell, cwd, env) {
    shell = shell.trim().toLowerCase();
    // try to determine the shell type
    let shellType;
    if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0) {
        shellType = 1 /* ShellType.powershell */;
    }
    else if (shell.indexOf('cmd.exe') >= 0) {
        shellType = 0 /* ShellType.cmd */;
    }
    else if (shell.indexOf('bash') >= 0) {
        shellType = 2 /* ShellType.bash */;
    }
    else if (platform.isWindows) {
        shellType = 0 /* ShellType.cmd */; // pick a good default for Windows
    }
    else {
        shellType = 2 /* ShellType.bash */; // pick a good default for anything else
    }
    let quote;
    // begin command with a space to avoid polluting shell history
    let command = ' ';
    switch (shellType) {
        case 1 /* ShellType.powershell */:
            quote = (s) => {
                s = s.replace(/\'/g, '\'\'');
                if (s.length > 0 && s.charAt(s.length - 1) === '\\') {
                    return `'${s}\\'`;
                }
                return `'${s}'`;
            };
            if (cwd) {
                const driveLetter = getDriveLetter(cwd);
                if (driveLetter) {
                    command += `${driveLetter}:; `;
                }
                command += `cd ${quote(cwd)}; `;
            }
            if (env) {
                for (const key in env) {
                    const value = env[key];
                    if (value === null) {
                        command += `Remove-Item env:${key}; `;
                    }
                    else {
                        command += `\${env:${key}}='${value}'; `;
                    }
                }
            }
            if (args.length > 0) {
                const arg = args.shift();
                const cmd = argsCanBeInterpretedByShell ? arg : quote(arg);
                command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
                for (const a of args) {
                    command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
                    command += ' ';
                }
            }
            break;
        case 0 /* ShellType.cmd */:
            quote = (s) => {
                // Note: Wrapping in cmd /C "..." complicates the escaping.
                // cmd /C "node -e "console.log(process.argv)" """A^>0"""" # prints "A>0"
                // cmd /C "node -e "console.log(process.argv)" "foo^> bar"" # prints foo> bar
                // Outside of the cmd /C, it could be a simple quoting, but here, the ^ is needed too
                s = s.replace(/\"/g, '""');
                s = s.replace(/([><!^&|])/g, '^$1');
                return (' "'.split('').some(char => s.includes(char)) || s.length === 0) ? `"${s}"` : s;
            };
            if (cwd) {
                const driveLetter = getDriveLetter(cwd);
                if (driveLetter) {
                    command += `${driveLetter}: && `;
                }
                command += `cd ${quote(cwd)} && `;
            }
            if (env) {
                command += 'cmd /C "';
                for (const key in env) {
                    let value = env[key];
                    if (value === null) {
                        command += `set "${key}=" && `;
                    }
                    else {
                        value = value.replace(/[&^|<>]/g, s => `^${s}`);
                        command += `set "${key}=${value}" && `;
                    }
                }
            }
            for (const a of args) {
                command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
                command += ' ';
            }
            if (env) {
                command += '"';
            }
            break;
        case 2 /* ShellType.bash */: {
            quote = (s) => {
                s = s.replace(/(["'\\\$!><#()\[\]*&^| ;{}?`])/g, '\\$1');
                return s.length === 0 ? `""` : s;
            };
            const hardQuote = (s) => {
                return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, '\'\\\'\'')}'` : s;
            };
            if (cwd) {
                command += `cd ${quote(cwd)} ; `;
            }
            if (env) {
                command += '/usr/bin/env';
                for (const key in env) {
                    const value = env[key];
                    if (value === null) {
                        command += ` -u ${hardQuote(key)}`;
                    }
                    else {
                        command += ` ${hardQuote(`${key}=${value}`)}`;
                    }
                }
                command += ' ';
            }
            for (const a of args) {
                command += (a === '<' || a === '>' || argsCanBeInterpretedByShell) ? a : quote(a);
                command += ' ';
            }
            break;
        }
    }
    return command;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvbm9kZS90ZXJtaW5hbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDcEMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BFLE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFFaEUsU0FBUyxlQUFlLENBQUMsT0FBZSxFQUFFLElBQWM7SUFDdkQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN0QyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEIsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZixLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtnQkFDeEMsTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMzQixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRCxLQUFLLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRTtZQUN2QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ3hCLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztB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