// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Terminal } from 'vscode';
import { IPlatformService } from '../../platform/types';
import { ICurrentProcess } from '../../types';
import { OSType } from '../../utils/platform';
import { ShellIdentificationTelemetry, TerminalShellType } from '../types';
import { BaseShellDetector } from './baseShellDetector';

/**
 * Identifies the shell based on the users environment (env variables).
 */
@injectable()
export class UserEnvironmentShellDetector extends BaseShellDetector {
    constructor(
        @inject(ICurrentProcess) private readonly currentProcess: ICurrentProcess,
        @inject(IPlatformService) private readonly platform: IPlatformService,
    ) {
        super(1);
    }
    public getDefaultPlatformShell(): string {
        return getDefaultShell(this.platform, this.currentProcess);
    }
    public identify(
        telemetryProperties: ShellIdentificationTelemetry,
        _terminal?: Terminal,
    ): TerminalShellType | undefined {
        const shellPath = this.getDefaultPlatformShell();
        telemetryProperties.hasShellInEnv = !!shellPath;
        const shell = this.identifyShellFromShellPath(shellPath);

        if (shell !== TerminalShellType.other) {
            telemetryProperties.shellIdentificationSource = 'environment';
        }
        return shell;
    }
}

/*
 The following code is based on VS Code from https://github.com/microsoft/vscode/blob/5c65d9bfa4c56538150d7f3066318e0db2c6151f/src/vs/workbench/contrib/terminal/node/terminal.ts#L12-L55
 This is only a fall back to identify the default shell used by VSC.
 On Windows, determine the default shell.
 On others, default to bash.
*/
function getDefaultShell(platform: IPlatformService, currentProcess: ICurrentProcess): string {
    if (platform.osType === OSType.Windows) {
        return getTerminalDefaultShellWindows(platform, currentProcess);
    }

    return currentProcess.env.SHELL && currentProcess.env.SHELL !== '/bin/false'
        ? currentProcess.env.SHELL
        : '/bin/bash';
}
function getTerminalDefaultShellWindows(platform: IPlatformService, currentProcess: ICurrentProcess): string {
    const isAtLeastWindows10 = parseFloat(platform.osRelease) >= 10;
    const is32ProcessOn64Windows = currentProcess.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
    const powerShellPath = `${currentProcess.env.windir}\\${
        is32ProcessOn64Windows ? 'Sysnative' : 'System32'
    }\\WindowsPowerShell\\v1.0\\powershell.exe`;
    return isAtLeastWindows10 ? powerShellPath : getWindowsShell(currentProcess);
}

function getWindowsShell(currentProcess: ICurrentProcess): string {
    return currentProcess.env.comspec || 'cmd.exe';
}
