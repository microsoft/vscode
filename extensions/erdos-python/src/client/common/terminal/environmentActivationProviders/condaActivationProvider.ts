// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import '../../extensions';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { Uri } from 'vscode';
import { traceInfo, traceVerbose, traceWarn } from '../../../logging';

import { IComponentAdapter, ICondaService } from '../../../interpreter/contracts';
import { IPlatformService } from '../../platform/types';
import { IConfigurationService } from '../../types';
import { ITerminalActivationCommandProvider, TerminalShellType } from '../types';

/**
 * Support conda env activation (in the terminal).
 */
@injectable()
export class CondaActivationCommandProvider implements ITerminalActivationCommandProvider {
    constructor(
        @inject(ICondaService) private readonly condaService: ICondaService,
        @inject(IPlatformService) private platform: IPlatformService,
        @inject(IConfigurationService) private configService: IConfigurationService,
        @inject(IComponentAdapter) private pyenvs: IComponentAdapter,
    ) {}

    /**
     * Is the given shell supported for activating a conda env?
     */
    // eslint-disable-next-line class-methods-use-this
    public isShellSupported(): boolean {
        return true;
    }

    /**
     * Return the command needed to activate the conda env.
     */
    public getActivationCommands(
        resource: Uri | undefined,
        targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        const { pythonPath } = this.configService.getSettings(resource);
        return this.getActivationCommandsForInterpreter(pythonPath, targetShell);
    }

    /**
     * Return the command needed to activate the conda env.
     *
     */
    public async getActivationCommandsForInterpreter(
        pythonPath: string,
        targetShell: TerminalShellType,
    ): Promise<string[] | undefined> {
        traceVerbose(`Getting conda activation commands for interpreter ${pythonPath} with shell ${targetShell}`);
        const envInfo = await this.pyenvs.getCondaEnvironment(pythonPath);
        if (!envInfo) {
            traceWarn(`No conda environment found for interpreter ${pythonPath}`);
            return undefined;
        }
        traceVerbose(`Found conda environment: ${JSON.stringify(envInfo)}`);

        const condaEnv = envInfo.name.length > 0 ? envInfo.name : envInfo.path;

        // New version.
        const interpreterPath = await this.condaService.getInterpreterPathForEnvironment(envInfo);
        traceInfo(`Using interpreter path: ${interpreterPath}`);
        const activatePath = await this.condaService.getActivationScriptFromInterpreter(interpreterPath, envInfo.name);
        traceVerbose(`Got activation script: ${activatePath?.path}} with type: ${activatePath?.type}`);
        // eslint-disable-next-line camelcase
        if (activatePath?.path) {
            if (
                this.platform.isWindows &&
                targetShell !== TerminalShellType.bash &&
                targetShell !== TerminalShellType.gitbash
            ) {
                const commands = [activatePath.path, `conda activate ${condaEnv.toCommandArgumentForPythonExt()}`];
                traceInfo(`Using Windows-specific commands: ${commands.join(', ')}`);
                return commands;
            }

            const condaInfo = await this.condaService.getCondaInfo();

            traceVerbose(`Conda shell level: ${condaInfo?.conda_shlvl}`);
            if (
                activatePath.type !== 'global' ||
                // eslint-disable-next-line camelcase
                condaInfo?.conda_shlvl === undefined ||
                condaInfo.conda_shlvl === -1
            ) {
                // activatePath is not the global activate path, or we don't have a shlvl, or it's -1（conda never sourced）.
                // and we need to source the activate path.
                if (activatePath.path === 'activate') {
                    const commands = [
                        `source ${activatePath.path}`,
                        `conda activate ${condaEnv.toCommandArgumentForPythonExt()}`,
                    ];
                    traceInfo(`Using source activate commands: ${commands.join(', ')}`);
                    return commands;
                }
                const command = [`source ${activatePath.path} ${condaEnv.toCommandArgumentForPythonExt()}`];
                traceInfo(`Using single source command: ${command}`);
                return command;
            }
            const command = [`conda activate ${condaEnv.toCommandArgumentForPythonExt()}`];
            traceInfo(`Using direct conda activate command: ${command}`);
            return command;
        }

        switch (targetShell) {
            case TerminalShellType.powershell:
            case TerminalShellType.powershellCore:
                traceVerbose('Using PowerShell-specific activation');
                return _getPowershellCommands(condaEnv);

            // TODO: Do we really special-case fish on Windows?
            case TerminalShellType.fish:
                traceVerbose('Using Fish shell-specific activation');
                return getFishCommands(condaEnv, await this.condaService.getCondaFile());

            default:
                if (this.platform.isWindows) {
                    traceVerbose('Using Windows shell-specific activation fallback option.');
                    return this.getWindowsCommands(condaEnv);
                }
                return getUnixCommands(condaEnv, await this.condaService.getCondaFile());
        }
    }

    public async getWindowsActivateCommand(): Promise<string> {
        let activateCmd = 'activate';

        const condaExePath = await this.condaService.getCondaFile();

        if (condaExePath && path.basename(condaExePath) !== condaExePath) {
            const condaScriptsPath: string = path.dirname(condaExePath);
            // prefix the cmd with the found path, and ensure it's quoted properly
            activateCmd = path.join(condaScriptsPath, activateCmd);
            activateCmd = activateCmd.toCommandArgumentForPythonExt();
        }

        return activateCmd;
    }

    public async getWindowsCommands(condaEnv: string): Promise<string[] | undefined> {
        const activate = await this.getWindowsActivateCommand();
        return [`${activate} ${condaEnv.toCommandArgumentForPythonExt()}`];
    }
}

/**
 * The expectation is for the user to configure Powershell for Conda.
 * Hence we just send the command `conda activate ...`.
 * This configuration is documented on Conda.
 * Extension will not attempt to work around issues by trying to setup shell for user.
 */
export async function _getPowershellCommands(condaEnv: string): Promise<string[] | undefined> {
    return [`conda activate ${condaEnv.toCommandArgumentForPythonExt()}`];
}

async function getFishCommands(condaEnv: string, condaFile: string): Promise<string[] | undefined> {
    // https://github.com/conda/conda/blob/be8c08c083f4d5e05b06bd2689d2cd0d410c2ffe/shell/etc/fish/conf.d/conda.fish#L18-L28
    return [`${condaFile.fileToCommandArgumentForPythonExt()} activate ${condaEnv.toCommandArgumentForPythonExt()}`];
}

async function getUnixCommands(condaEnv: string, condaFile: string): Promise<string[] | undefined> {
    const condaDir = path.dirname(condaFile);
    const activateFile = path.join(condaDir, 'activate');
    return [`source ${activateFile.fileToCommandArgumentForPythonExt()} ${condaEnv.toCommandArgumentForPythonExt()}`];
}
