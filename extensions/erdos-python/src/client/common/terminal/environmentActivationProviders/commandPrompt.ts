// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { IServiceContainer } from '../../../ioc/types';
import '../../extensions';
import { TerminalShellType } from '../types';
import { ActivationScripts, VenvBaseActivationCommandProvider } from './baseActivationProvider';

// For a given shell the scripts are in order of precedence.
const SCRIPTS: ActivationScripts = {
    // Group 1
    [TerminalShellType.commandPrompt]: ['activate.bat', 'Activate.ps1'],
    // Group 2
    [TerminalShellType.powershell]: ['Activate.ps1', 'activate.bat'],
    [TerminalShellType.powershellCore]: ['Activate.ps1', 'activate.bat'],
};

export function getAllScripts(pathJoin: (...p: string[]) => string): string[] {
    const scripts: string[] = [];
    for (const names of Object.values(SCRIPTS)) {
        for (const name of names) {
            if (!scripts.includes(name)) {
                scripts.push(
                    name,
                    // We also add scripts in subdirs.
                    pathJoin('Scripts', name),
                    pathJoin('scripts', name),
                );
            }
        }
    }
    return scripts;
}

@injectable()
export class CommandPromptAndPowerShell extends VenvBaseActivationCommandProvider {
    protected readonly scripts: ActivationScripts;

    constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
        super(serviceContainer);
        this.scripts = {};
        for (const [key, names] of Object.entries(SCRIPTS)) {
            const shell = key as TerminalShellType;
            const scripts: string[] = [];
            for (const name of names) {
                scripts.push(
                    name,
                    // We also add scripts in subdirs.
                    path.join('Scripts', name),
                    path.join('scripts', name),
                );
            }
            this.scripts[shell] = scripts;
        }
    }

    public async getActivationCommandsForInterpreter(
        pythonPath: string,
        targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        const scriptFile = await this.findScriptFile(pythonPath, targetShell);
        if (!scriptFile) {
            return undefined;
        }

        if (targetShell === TerminalShellType.commandPrompt && scriptFile.endsWith('activate.bat')) {
            return [scriptFile.fileToCommandArgumentForPythonExt()];
        }
        if (
            (targetShell === TerminalShellType.powershell || targetShell === TerminalShellType.powershellCore) &&
            scriptFile.endsWith('Activate.ps1')
        ) {
            return [`& ${scriptFile.fileToCommandArgumentForPythonExt()}`];
        }
        if (targetShell === TerminalShellType.commandPrompt && scriptFile.endsWith('Activate.ps1')) {
            // lets not try to run the powershell file from command prompt (user may not have powershell)
            return [];
        }

        return undefined;
    }
}
