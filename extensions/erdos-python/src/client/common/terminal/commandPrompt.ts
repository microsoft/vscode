// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as path from 'path';
import { ConfigurationTarget } from 'vscode';
import { IConfigurationService, ICurrentProcess } from '../types';

export function getCommandPromptLocation(currentProcess: ICurrentProcess) {
    // https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/parts/terminal/electron-browser/terminalService.ts#L218
    // Determine the correct System32 path. We want to point to Sysnative
    // when the 32-bit version of VS Code is running on a 64-bit machine.
    // The reason for this is because PowerShell's important PSReadline
    // module doesn't work if this is not the case. See #27915.
    const is32ProcessOn64Windows = currentProcess.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
    const system32Path = path.join(currentProcess.env.windir!, is32ProcessOn64Windows ? 'Sysnative' : 'System32');
    return path.join(system32Path, 'cmd.exe');
}
export async function useCommandPromptAsDefaultShell(
    currentProcess: ICurrentProcess,
    configService: IConfigurationService,
) {
    const cmdPromptLocation = getCommandPromptLocation(currentProcess);
    await configService.updateSectionSetting(
        'terminal',
        'integrated.shell.windows',
        cmdPromptLocation,
        undefined,
        ConfigurationTarget.Global,
    );
}
