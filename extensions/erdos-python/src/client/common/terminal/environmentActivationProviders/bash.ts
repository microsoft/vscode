// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import '../../extensions';
import { TerminalShellType } from '../types';
import { ActivationScripts, VenvBaseActivationCommandProvider } from './baseActivationProvider';

// For a given shell the scripts are in order of precedence.
const SCRIPTS: ActivationScripts = {
    // Group 1
    [TerminalShellType.wsl]: ['activate.sh', 'activate'],
    [TerminalShellType.ksh]: ['activate.sh', 'activate'],
    [TerminalShellType.zsh]: ['activate.sh', 'activate'],
    [TerminalShellType.gitbash]: ['activate.sh', 'activate'],
    [TerminalShellType.bash]: ['activate.sh', 'activate'],
    // Group 2
    [TerminalShellType.tcshell]: ['activate.csh'],
    [TerminalShellType.cshell]: ['activate.csh'],
    // Group 3
    [TerminalShellType.fish]: ['activate.fish'],
};

export function getAllScripts(): string[] {
    const scripts: string[] = [];
    for (const names of Object.values(SCRIPTS)) {
        for (const name of names) {
            if (!scripts.includes(name)) {
                scripts.push(name);
            }
        }
    }
    return scripts;
}

@injectable()
export class Bash extends VenvBaseActivationCommandProvider {
    protected readonly scripts = SCRIPTS;

    public async getActivationCommandsForInterpreter(
        pythonPath: string,
        targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        const scriptFile = await this.findScriptFile(pythonPath, targetShell);
        if (!scriptFile) {
            return undefined;
        }
        return [`source ${scriptFile.fileToCommandArgumentForPythonExt()}`];
    }
}
