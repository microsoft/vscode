// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import '../../extensions';
import { TerminalShellType } from '../types';
import { ActivationScripts, VenvBaseActivationCommandProvider } from './baseActivationProvider';

// For a given shell the scripts are in order of precedence.
const SCRIPTS: ActivationScripts = {
    [TerminalShellType.nushell]: ['activate.nu'],
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
export class Nushell extends VenvBaseActivationCommandProvider {
    protected readonly scripts = SCRIPTS;

    public async getActivationCommandsForInterpreter(
        pythonPath: string,
        targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        const scriptFile = await this.findScriptFile(pythonPath, targetShell);
        if (!scriptFile) {
            return undefined;
        }
        return [`overlay use ${scriptFile.fileToCommandArgumentForPythonExt()}`];
    }
}
