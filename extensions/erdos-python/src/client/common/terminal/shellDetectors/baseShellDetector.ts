// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable, unmanaged } from 'inversify';
import { Terminal } from 'vscode';
import { IShellDetector, ShellIdentificationTelemetry, TerminalShellType } from '../types';

/*
When identifying the shell use the following algorithm:
* 1. Identify shell based on the name of the terminal (if there is one already opened and used).
* 2. Identify shell based on the api provided by VSC.
* 2. Identify shell based on the settings in VSC.
* 3. Identify shell based on users environment variables.
* 4. Use default shells (bash for mac and linux, cmd for windows).
*/

// Types of shells can be found here:
// 1. https://wiki.ubuntu.com/ChangingShells
const IS_GITBASH = /(gitbash$)/i;
const IS_BASH = /(bash$)/i;
const IS_WSL = /(wsl$)/i;
const IS_ZSH = /(zsh$)/i;
const IS_KSH = /(ksh$)/i;
const IS_COMMAND = /(cmd$)/i;
const IS_POWERSHELL = /(powershell$)/i;
const IS_POWERSHELL_CORE = /(pwsh$)/i;
const IS_FISH = /(fish$)/i;
const IS_CSHELL = /(csh$)/i;
const IS_TCSHELL = /(tcsh$)/i;
const IS_NUSHELL = /(nu$)/i;
const IS_XONSH = /(xonsh$)/i;

const detectableShells = new Map<TerminalShellType, RegExp>();
detectableShells.set(TerminalShellType.powershell, IS_POWERSHELL);
detectableShells.set(TerminalShellType.gitbash, IS_GITBASH);
detectableShells.set(TerminalShellType.bash, IS_BASH);
detectableShells.set(TerminalShellType.wsl, IS_WSL);
detectableShells.set(TerminalShellType.zsh, IS_ZSH);
detectableShells.set(TerminalShellType.ksh, IS_KSH);
detectableShells.set(TerminalShellType.commandPrompt, IS_COMMAND);
detectableShells.set(TerminalShellType.fish, IS_FISH);
detectableShells.set(TerminalShellType.tcshell, IS_TCSHELL);
detectableShells.set(TerminalShellType.cshell, IS_CSHELL);
detectableShells.set(TerminalShellType.nushell, IS_NUSHELL);
detectableShells.set(TerminalShellType.powershellCore, IS_POWERSHELL_CORE);
detectableShells.set(TerminalShellType.xonsh, IS_XONSH);

@injectable()
export abstract class BaseShellDetector implements IShellDetector {
    constructor(@unmanaged() public readonly priority: number) {}
    public abstract identify(
        telemetryProperties: ShellIdentificationTelemetry,
        terminal?: Terminal,
    ): TerminalShellType | undefined;
    public identifyShellFromShellPath(shellPath: string): TerminalShellType {
        return identifyShellFromShellPath(shellPath);
    }
}

export function identifyShellFromShellPath(shellPath: string): TerminalShellType {
    // Remove .exe extension so shells can be more consistently detected
    // on Windows (including Cygwin).
    const basePath = shellPath.replace(/\.exe$/i, '');

    const shell = Array.from(detectableShells.keys()).reduce((matchedShell, shellToDetect) => {
        if (matchedShell === TerminalShellType.other) {
            const pat = detectableShells.get(shellToDetect);
            if (pat && pat.test(basePath)) {
                return shellToDetect;
            }
        }
        return matchedShell;
    }, TerminalShellType.other);

    return shell;
}
