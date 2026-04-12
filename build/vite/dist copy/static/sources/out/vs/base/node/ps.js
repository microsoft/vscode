/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { exec } from 'child_process';
import { totalmem } from 'os';
import { FileAccess } from '../common/network.js';
import { isWindows } from '../common/platform.js';
export const JS_FILENAME_PATTERN = /[a-zA-Z-]+\.js\b/g;
export function listProcesses(rootPid) {
    return new Promise((resolve, reject) => {
        let rootItem;
        const map = new Map();
        const totalMemory = totalmem();
        function addToTree(pid, ppid, cmd, load, mem) {
            const parent = map.get(ppid);
            if (pid === rootPid || parent) {
                const item = {
                    name: findName(cmd),
                    cmd,
                    pid,
                    ppid,
                    load,
                    mem: isWindows ? mem : (totalMemory * (mem / 100))
                };
                map.set(pid, item);
                if (pid === rootPid) {
                    rootItem = item;
                }
                if (parent) {
                    if (!parent.children) {
                        parent.children = [];
                    }
                    parent.children.push(item);
                    if (parent.children.length > 1) {
                        parent.children = parent.children.sort((a, b) => a.pid - b.pid);
                    }
                }
            }
        }
        function findName(cmd) {
            const UTILITY_NETWORK_HINT = /--utility-sub-type=network/i;
            const WINDOWS_CRASH_REPORTER = /--crashes-directory/i;
            const CONPTY = /conhost\.exe.+--headless/i;
            const TYPE = /--type=([a-zA-Z-]+)/;
            // find windows crash reporter
            if (WINDOWS_CRASH_REPORTER.exec(cmd)) {
                return 'electron-crash-reporter';
            }
            // find conpty process
            if (CONPTY.exec(cmd)) {
                return 'conpty-agent';
            }
            // find "--type=xxxx"
            let matches = TYPE.exec(cmd);
            if (matches && matches.length === 2) {
                if (matches[1] === 'renderer') {
                    return `window`;
                }
                else if (matches[1] === 'utility') {
                    if (UTILITY_NETWORK_HINT.exec(cmd)) {
                        return 'utility-network-service';
                    }
                    return 'utility-process';
                }
                else if (matches[1] === 'extensionHost') {
                    return 'extension-host'; // normalize remote extension host type
                }
                return matches[1];
            }
            if (cmd.indexOf('node ') < 0 && cmd.indexOf('node.exe') < 0) {
                let result = ''; // find all xyz.js
                do {
                    matches = JS_FILENAME_PATTERN.exec(cmd);
                    if (matches) {
                        result += matches + ' ';
                    }
                } while (matches);
                if (result) {
                    return `electron-nodejs (${result.trim()})`;
                }
            }
            return cmd;
        }
        if (process.platform === 'win32') {
            const cleanUNCPrefix = (value) => {
                if (value.indexOf('\\\\?\\') === 0) {
                    return value.substring(4);
                }
                else if (value.indexOf('\\??\\') === 0) {
                    return value.substring(4);
                }
                else if (value.indexOf('"\\\\?\\') === 0) {
                    return '"' + value.substring(5);
                }
                else if (value.indexOf('"\\??\\') === 0) {
                    return '"' + value.substring(5);
                }
                else {
                    return value;
                }
            };
            (import('@vscode/windows-process-tree')).then(windowsProcessTree => {
                windowsProcessTree.getProcessList(rootPid, (processList) => {
                    if (!processList) {
                        reject(new Error(`Root process ${rootPid} not found`));
                        return;
                    }
                    windowsProcessTree.getProcessCpuUsage(processList, (completeProcessList) => {
                        const processItems = new Map();
                        completeProcessList.forEach(process => {
                            const commandLine = cleanUNCPrefix(process.commandLine || '');
                            processItems.set(process.pid, {
                                name: findName(commandLine),
                                cmd: commandLine,
                                pid: process.pid,
                                ppid: process.ppid,
                                load: process.cpu || 0,
                                mem: process.memory || 0
                            });
                        });
                        rootItem = processItems.get(rootPid);
                        if (rootItem) {
                            processItems.forEach(item => {
                                const parent = processItems.get(item.ppid);
                                if (parent) {
                                    if (!parent.children) {
                                        parent.children = [];
                                    }
                                    parent.children.push(item);
                                }
                            });
                            processItems.forEach(item => {
                                if (item.children) {
                                    item.children = item.children.sort((a, b) => a.pid - b.pid);
                                }
                            });
                            resolve(rootItem);
                        }
                        else {
                            reject(new Error(`Root process ${rootPid} not found`));
                        }
                    });
                }, windowsProcessTree.ProcessDataFlag.CommandLine | windowsProcessTree.ProcessDataFlag.Memory);
            });
        }
        // OS X & Linux
        else {
            function calculateLinuxCpuUsage() {
                // Flatten rootItem to get a list of all VSCode processes
                let processes = [rootItem];
                const pids = [];
                while (processes.length) {
                    const process = processes.shift();
                    if (process) {
                        pids.push(process.pid);
                        if (process.children) {
                            processes = processes.concat(process.children);
                        }
                    }
                }
                // The cpu usage value reported on Linux is the average over the process lifetime,
                // recalculate the usage over a one second interval
                // JSON.stringify is needed to escape spaces, https://github.com/nodejs/node/issues/6803
                let cmd = JSON.stringify(FileAccess.asFileUri('vs/base/node/cpuUsage.sh').fsPath);
                cmd += ' ' + pids.join(' ');
                exec(cmd, {}, (err, stdout, stderr) => {
                    if (err || stderr) {
                        reject(err || new Error(stderr.toString()));
                    }
                    else {
                        const cpuUsage = stdout.toString().split('\n');
                        for (let i = 0; i < pids.length; i++) {
                            const processInfo = map.get(pids[i]);
                            processInfo.load = parseFloat(cpuUsage[i]);
                        }
                        if (!rootItem) {
                            reject(new Error(`Root process ${rootPid} not found`));
                            return;
                        }
                        resolve(rootItem);
                    }
                });
            }
            exec('which ps', {}, (err, stdout, stderr) => {
                if (err || stderr) {
                    if (process.platform !== 'linux') {
                        reject(err || new Error(stderr.toString()));
                    }
                    else {
                        const cmd = JSON.stringify(FileAccess.asFileUri('vs/base/node/ps.sh').fsPath);
                        exec(cmd, {}, (err, stdout, stderr) => {
                            if (err || stderr) {
                                reject(err || new Error(stderr.toString()));
                            }
                            else {
                                parsePsOutput(stdout, addToTree);
                                calculateLinuxCpuUsage();
                            }
                        });
                    }
                }
                else {
                    const ps = stdout.toString().trim();
                    const args = '-ax -o pid=,ppid=,pcpu=,pmem=,command=';
                    // Set numeric locale to ensure '.' is used as the decimal separator
                    exec(`${ps} ${args}`, { maxBuffer: 1000 * 1024, env: { LC_NUMERIC: 'en_US.UTF-8' } }, (err, stdout, stderr) => {
                        // Silently ignoring the screen size is bogus error. See https://github.com/microsoft/vscode/issues/98590
                        if (err || (stderr && !stderr.includes('screen size is bogus'))) {
                            reject(err || new Error(stderr.toString()));
                        }
                        else {
                            parsePsOutput(stdout, addToTree);
                            if (process.platform === 'linux') {
                                calculateLinuxCpuUsage();
                            }
                            else {
                                if (!rootItem) {
                                    reject(new Error(`Root process ${rootPid} not found`));
                                }
                                else {
                                    resolve(rootItem);
                                }
                            }
                        }
                    });
                }
            });
        }
    });
}
function parsePsOutput(stdout, addToTree) {
    const PID_CMD = /^\s*([0-9]+)\s+([0-9]+)\s+([0-9]+\.[0-9]+)\s+([0-9]+\.[0-9]+)\s+(.+)$/;
    const lines = stdout.toString().split('\n');
    for (const line of lines) {
        const matches = PID_CMD.exec(line.trim());
        if (matches && matches.length === 6) {
            addToTree(parseInt(matches[1]), parseInt(matches[2]), matches[5], parseFloat(matches[3]), parseFloat(matches[4]));
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL25vZGUvcHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNyQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzlCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVsRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFbEQsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsbUJBQW1CLENBQUM7QUFFdkQsTUFBTSxVQUFVLGFBQWEsQ0FBQyxPQUFlO0lBQzVDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDdEMsSUFBSSxRQUFpQyxDQUFDO1FBQ3RDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO1FBQzNDLE1BQU0sV0FBVyxHQUFHLFFBQVEsRUFBRSxDQUFDO1FBRS9CLFNBQVMsU0FBUyxDQUFDLEdBQVcsRUFBRSxJQUFZLEVBQUUsR0FBVyxFQUFFLElBQVksRUFBRSxHQUFXO1lBQ25GLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0IsSUFBSSxHQUFHLEtBQUssT0FBTyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUMvQixNQUFNLElBQUksR0FBZ0I7b0JBQ3pCLElBQUksRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDO29CQUNuQixHQUFHO29CQUNILEdBQUc7b0JBQ0gsSUFBSTtvQkFDSixJQUFJO29CQUNKLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FB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QUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzVDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7UUFDMUIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMxQyxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JDLFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkgsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDIn0=